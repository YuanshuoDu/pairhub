# ADR-0004: 活动生命周期用显式状态机 + Cron 扫描驱动

> **状态**：✅ Accepted
> **日期**：2026-06-05
> **决策人**：@YuanshuoDu（决策人） / @Oracle Hermes（CTO 提报）
> **关联**：[cto-roadmap-v1.0.md §0 Q 状态机](../../studybuddy-plan/cto-roadmap-v1.0.md) · [spec-v0.2.md §6 状态机](../spec-v0.2.md) · [architecture-v1.0.md §5.4](../architecture-v1.0.md)

## Context（背景）

活动有清晰的生命周期：

```
[创建] → [RECRUITING] → [FULL] → [STARTED] → [ENDED] → [可评价]
                  ↘                            ↘
                   [CANCELED]                [CANCELED 不可]
```

**核心问题**：状态怎么推进？

候选实现方式：

| 方案 | 实时性 | 复杂度 | 一致性 | 失败恢复 |
|------|--------|--------|--------|----------|
| **A. 显式状态机 + Cron 扫描** | 准实时（≤ 60s 延迟） | 中 | **强** | 易 |
| B. 业务事件触发（创建/报名时判断 + 定时兜底） | 实时 | 高 | 中 | 难 |
| C. 数据库触发器（trigger） | 实时 | 高 | 强 | 难调试 |
| D. 应用层 polling（每次请求检查时间） | 不确定 | 中 | 弱 | 难 |

**核心需求**：
- 报名导致 `RECRUITING → FULL` 必须**强一致**（并发报名不能超卖）
- 时间触发的 `→ STARTED → ENDED` 允许**准实时**（60s 延迟可接受）
- 状态变更必须**有审计 / 日志**
- 跨端看到的 status **必须一致**

## Decision（决策）

**采用方案 A：显式状态机 + 双层驱动。**

### 1. 状态定义（与 spec-v0.2 §6 一致）

```typescript
// server/src/modules/activity/state-machine.ts
export enum ActivityStatus {
  RECRUITING = 'RECRUITING',
  FULL       = 'FULL',
  STARTED    = 'STARTED',
  ENDED      = 'ENDED',
  CANCELED   = 'CANCELED',
}

export const TRANSITIONS: Record<ActivityStatus, ActivityStatus[]> = {
  RECRUITING: [ActivityStatus.FULL, ActivityStatus.STARTED, ActivityStatus.CANCELED],
  FULL:       [ActivityStatus.RECRUITING, ActivityStatus.STARTED, ActivityStatus.CANCELED],
  STARTED:    [ActivityStatus.ENDED],
  ENDED:      [],
  CANCELED:   [],
};
```

### 2. 双层驱动

#### 2.1 第一层：业务事件触发（实时）

在**写路径**上同步检查并推进状态：

| 事件 | 触发逻辑 | 推进 |
|------|----------|------|
| `signup` 报名成功 | 事务里 `currentCount + 1` | `RECRUITING → FULL`（若满） |
| `cancel-signup` 取消报名 | 事务里 `currentCount - 1` | `FULL → RECRUITING` |
| `create` 创建活动 | 插入时 | `→ RECRUITING` |
| `creator-cancel` 取消活动 | 校验 `start_time - now ≥ 1h` | `* → CANCELED`（仅 RECRUITING / FULL） |

**实现**：`signup.service.ts` 的事务里调用 `activityStateMachine.transition(activity, newStatus)`。

```typescript
// 伪代码
await prisma.$transaction(async (tx) => {
  const activity = await tx.$queryRaw`
    SELECT * FROM activities WHERE id = ${id} FOR UPDATE
  `;
  if (activity.status !== 'RECRUITING' && activity.status !== 'FULL') {
    throw new BusinessError('ACTIVITY_NOT_OPEN', 422);
  }
  if (activity.current_count >= activity.max_participants) {
    throw new BusinessError('ACTIVITY_FULL', 422);
  }
  await tx.signup.create({ ... });
  const newCount = activity.current_count + 1;
  const newStatus = newCount >= activity.max_participants ? 'FULL' : activity.status;
  await tx.activity.update({
    where: { id },
    data: { current_count: newCount, status: newStatus },
  });
});
```

#### 2.2 第二层：Cron Worker 扫描（兜底 + 时间触发）

**位置**：`server/src/jobs/activity-state-cron.ts`

**频率**：每分钟（`node-cron` 或 BullMQ repeatable job）

**职责**：

```typescript
// 每分钟执行一次
async function scanAndUpdateStates() {
  const now = new Date();

  // 1) RECRUITING/FULL → STARTED (start_time <= now)
  await prisma.activity.updateMany({
    where: {
      status: { in: ['RECRUITING', 'FULL'] },
      startTime: { lte: now },
    },
    data: { status: 'STARTED' },
  });

  // 2) STARTED → ENDED (end_time <= now)
  await prisma.activity.updateMany({
    where: {
      status: 'STARTED',
      endTime: { lte: now },
    },
    data: { status: 'ENDED' },
  });

  // 3) ENDED 触发评价窗口开启（M3 实现）
  // - 推送给参与者
  // - 创建 Review 窗口记录
}
```

**多实例安全**：
- Cron 节点**独立部署**（架构 §9），不与 API 节点混部
- 若必须多节点跑，加分布式锁（`redlock`）

### 3. 不可变规则

| 规则 | 说明 |
|------|------|
| ✅ `STARTED` 后不能报名 | 服务端校验；返回 `422 ACTIVITY_NOT_OPEN` |
| ✅ `STARTED` 后不能取消 | 同样返回 `422 ACTIVITY_NOT_CANCELABLE` |
| ✅ `RECRUITING/FULL` 才能取消 | 校验状态 + 校验 `now ≤ start_time - 1h` |
| ✅ `CANCELED` / `ENDED` 是终态 | 状态机不输出任何迁移 |
| ❌ 不允许 `FULL → FULL` 等无意义迁移 | TRANSITIONS 表约束 |

### 4. 状态机实现位置

`server/src/modules/activity/state-machine.ts`

```typescript
export function canTransition(from: ActivityStatus, to: ActivityStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export class ActivityStateMachine {
  static assertTransition(activity: Activity, to: ActivityStatus) {
    if (!canTransition(activity.status, to)) {
      throw new BusinessError(
        `INVALID_TRANSITION_${activity.status}_TO_${to}`,
        422
      );
    }
  }
}
```

### 5. 审计日志

每次状态变更写 `activity_state_log` 表（M2 引入，先用 logger）：

```prisma
model ActivityStateLog {
  id          String   @id @default(cuid())
  activityId  String   @map("activity_id")
  fromStatus  String   @map("from_status")
  toStatus    String   @map("to_status")
  reason      String   // "signup" | "cancel-signup" | "cron-time-elapsed" | "creator-cancel"
  operatorId  String?  @map("operator_id")  // null = cron
  createdAt   DateTime @default(now()) @map("created_at")
  @@index([activityId, createdAt])
}
```

## Consequences（影响 / 代价）

### ✅ 收益

- **强一致**：报名事务 + `FOR UPDATE` 行级锁，**杜绝超卖**
- **可读性**：状态机一张图全团队理解
- **易调试**：所有迁移打 log + audit（M2）
- **易扩展**：加状态（如 `REVIEWING`）只改 TRANSITIONS 表

### ⚠️ 代价与风险

| 风险 | 缓解 |
|------|------|
| **R1：Cron 节点挂掉，状态不推进** | 独立部署 + 健康检查 + 告警；M2 引入 BullMQ repeatable + 失败重试 |
| **R2：跨地域时钟漂移** | 所有时间 UTC 存储 + DB server 同步 NTP |
| **R3：用户量大后 Cron 压力大** | 加索引（status, startTime），已建；M2 评估分片（按 region） |
| **R4：状态机漏迁移路径** | TRANSITIONS 表是单源真理，加状态必须改表 + 单测 |
| **R5：CANCELED 不可逆** | 业务上可接受；如需「恢复」走 admin 后台（M3） |

### 🔁 不可逆性评估

- **中不可逆**：状态一旦 `ENDED` / `CANCELED` 不可能回退（业务正确性需要）
- **TRANSITIONS 表**作为单源真理，**改 schema 必须走 review**

### 📋 决策后续

- M1-W2：实现 `state-machine.ts` + 单测覆盖 100% 迁移路径
- M1-W3：实现 `activity-state-cron.ts`（独立 cron 节点）
- M1-W3：signup 事务里加 `FOR UPDATE`
- M2：加 `ActivityStateLog` 表 + 审计后台

## Status

- ✅ **Accepted** — 2026-06-05
- 📅 下次 review：M1-W3（cron + 事务落地后）
- 👥 Owner：@美国hermes（后端）

## 备选方案被否决的理由

- ❌ **B. 业务事件触发（无 cron）**：时间触发的迁移（`→ STARTED → ENDED`）无法被业务事件覆盖（没人触发），**必须有定时**
- ❌ **C. 数据库触发器**：跨语言调试难；与 Prisma 事务模型冲突；**复杂状态机不适合 trigger**
- ❌ **D. 应用层 polling（每次请求检查时间）**：列表接口 `O(N)` 扫表，**性能不可接受**；且客户端时间不可信
