# T-SIGNUP-CANCEL — 退出活动报名

> **模块**：signup / cancel
> **关联 API**：`DELETE /api/signups/:id`（或 `POST /api/signups/:id/cancel`，待后端 track 拍板）
> **关联数据模型**：[`docs/spec-v0.2.md`](../../../spec-v0.2.md) §5 Signup
> **状态机**：[`docs/adr/0004-state-machine-for-activity.md`](../../../adr/0004-state-machine-for-activity.md)
> **维护**：@OpenClaw
> **最后更新**：2026-06-05

---

## TC-SIGNUP-CANCEL-001  正常退出未开始的活动
- **优先级**：P0
- **类型**：正向
- **关联**：[#7](https://github.com/YuanshuoDu/pairhub/issues/7) 核心场景 3
- **前置条件**：
  - 用户 `usr_canceler_001` 已报名活动 `act_open_001`（`Signup.status=approved`）
  - 活动状态：`open`（`currentParticipants=4/maxParticipants=6`，退出后变 3）
  - 活动 `startTime` 在未来 1 小时
- **步骤**：
  1. 调用 `DELETE /api/signups/sgn_001`，header `Authorization: Bearer <accessToken>`
  2. 断言响应
- **预期**：
  - HTTP 200
  - 响应 body：`{ "id": "sgn_001", "status": "canceled", "canceledAt": "2026-06-05T..." }`
  - DB `Signup.status = "canceled"`, `canceledAt = now()`
  - DB `Activity.currentParticipants` 减 1（4 → 3）
  - 活动状态保持 `open`（未到 full 状态）
  - 推送给活动创建者"用户 X 退出了活动 Y"（微信订阅消息 / APNs / FCM）
  - 日志记录 `signup.cancel` 事件
- **实际**：<执行时填>
- **备注**：
  - 响应时间 P95 < 500ms（参见 [`performance-baseline.md`](../../performance-baseline.md) §1.3）
  - 软删除（保留 `canceledAt`），便于活动结束后用户查看历史

---

## TC-SIGNUP-CANCEL-002  退出已满活动触发状态从 full → open
- **优先级**：P0
- **类型**：边界 / 状态机
- **关联**：[`docs/adr/0004-state-machine-for-activity.md`](../../../adr/0004-state-machine-for-activity.md) — 状态机迁移白名单
- **前置条件**：
  - 活动 `act_full_001`，`currentParticipants=6/6`，`status=full`
  - 用户 `usr_canceler_002` 是当前 6 人之一
- **步骤**：
  1. 调用 `DELETE /api/signups/sgn_002`
  2. 断言响应 + DB
- **预期**：
  - HTTP 200
  - Signup 状态变为 `canceled`
  - 活动 `currentParticipants` 减 1（6 → 5）
  - **活动状态自动迁移**：`full → open`（白名单允许）
  - 触发**候补名单**通知（如果有 waiting list）
  - 推送给候补用户
- **实际**：<执行时填>
- **备注**：状态机迁移测试关键场景

---

## TC-SIGNUP-CANCEL-003  退出已开始的活  动返回 409
- **优先级**：P0
- **类型**：反向 / 业务规则
- **关联**：状态机 + 业务规则
- **前置条件**：
  - 活动 `act_started_001`，`startTime` 在过去 30 分钟，`status=in_progress`
  - 用户已报名
- **步骤**：
  1. 调用 `DELETE /api/signups/sgn_003`
  2. 断言响应
- **预期**：
  - HTTP 409
  - 错误码 `ACTIVITY_ALREADY_STARTED`，message："活动已开始，无法退出"
  - **不**修改 Signup
  - **不**推送
- **实际**：<执行时填>
- **备注**：业务规则：活动开始后 15 分钟内允许退出（防止误操作），超过 15 分钟锁定
  - 边界：startTime 之后 0-15 分钟 → 允许；> 15 分钟 → 拒绝
  - 完整测试见 TC-SIGNUP-CANCEL-006（边界时间）

---

## TC-SIGNUP-CANCEL-004  取消他人的报名返回 403
- **优先级**：P0
- **类型**：安全
- **关联**：[`security-checklist.md`](../../security-checklist.md) A01（访问控制）
- **前置条件**：
  - 用户 A 已报名活动
  - 用户 B（不同人）登录
- **步骤**：
  1. 用户 B 调用 `DELETE /api/signups/sgn_of_user_A`
  2. 断言响应
- **预期**：
  - HTTP 403
  - 错误码 `FORBIDDEN`，message："只能取消自己的报名"
  - **不**修改任何数据
  - 日志记录 `auth.forbidden` 事件（可能为撞库尝试）
- **实际**：<执行时填>
- **备注**：水平越权测试

---

## TC-SIGNUP-CANCEL-005  重复取消同一报名（幂等性）
- **优先级**：P1
- **类型**：边界 / 幂等
- **关联**：API 幂等性
- **前置条件**：
  - 用户已成功退出（Signup.status=canceled）
- **步骤**：
  1. 再次调用 `DELETE /api/signups/sgn_001`（同 TC-001 退出的）
  2. 断言响应
- **预期（推荐：返回 200 幂等）**：
  - HTTP 200
  - 响应 body `status: "canceled"`（状态没变）
  - **不**触发副作用（不推送、不改 currentParticipants）
- **实际**：<执行时填>
- **备注**：
  - 推荐幂等设计（参考 Stripe、GitHub API）
  - 客户端多次点击不会引发副作用

---

## 跑通后的归档清单

- `docs/screenshots/issue-7/16-cancel-normal.png` — TC-001
- `docs/screenshots/issue-7/17-cancel-full-to-open.png` — TC-002
- `docs/screenshots/issue-7/18-cancel-already-started.png` — TC-003
- `docs/screenshots/issue-7/19-cancel-forbidden.png` — TC-004
- `docs/screenshots/issue-7/20-cancel-replay.png` — TC-005
