# ADR-0003: 多端登录合并到同一 User（微信 + Apple + Google openid/sub 合并）

> **状态**：✅ Accepted
> **日期**：2026-06-05
> **决策人**：@YuanshuoDu（决策人） / @Oracle Hermes（CTO 提报）
> **关联**：[cto-roadmap-v1.0.md §0 Q1](../../studybuddy-plan/cto-roadmap-v1.0.md) · [architecture-v1.0.md §5.1](../architecture-v1.0.md) · [api/v1.md §3](../api/v1.md)

## Context（背景）

StudyBuddy 有三端，每端使用平台原生登录方式：

| 端 | 平台 | 登录方式 | 拿到的 ID |
|----|------|----------|-----------|
| 微信小程序 | 微信 | `wx.login` → `code` → `jscode2session` | `openid` (+ `unionid`) |
| iOS App | Apple | Sign in with Apple | `sub` (用户唯一 ID) |
| Android App | Google | Google Sign-In | `sub` (用户唯一 ID) |

**核心问题**：

同一个留学生，可能在小程序上用微信登录了一次，又在朋友的 iPhone 上用 Apple ID 登录了一次 — 物理上是**同一个人**，但默认会变成两个 `User` 记录。

**这会导致**：
- 我创建的活动 + 我报名的活动出现两份
- 收到的评价/消息分裂
- 用户体验割裂（看到「数据不见了」）

候选方案：

| 方案 | 用户体验 | 实现复杂度 | 安全 |
|------|----------|------------|------|
| **A. 多 openid/sub 合并到同一 User** | ✅ 优 | 中 | 中 |
| B. 各端独立账号，登录时切换 | ❌ 差 | 低 | 高 |
| C. 仅微信开放注册，其它端走微信扫码登录 | ⚠️ 中 | 中 | 高 |
| D. 强制手机号注册，三端同号 | ❌ 转化率低 | 中 | 高 |

**约束条件**：
- 三端**后端 100% 共用**（架构核心原则）
- 12 周 MVP 窗口
- 留学生场景：海外用户可能没有微信，**不能强制微信**

## Decision（决策）

**采用方案 A：多 openid/sub 合并到同一 User。**

设计要点：

### 1. User 表扩展三个独立字段

```prisma
model User {
  id            String   @id @default(cuid())
  // 三端登录标识，各端可独立唯一
  wechatOpenid  String?  @unique @map("wechat_openid")
  appleSub      String?  @unique @map("apple_sub")
  googleSub     String?  @unique @map("google_sub")
  primaryProvider AuthProvider @default(WECHAT) @map("primary_provider")
  // ... 资料字段
}

enum AuthProvider { WECHAT APPLE GOOGLE }
```

### 2. 三个独立的登录端点

```
POST /api/auth/wx-login     { code, nickname?, avatar? }
POST /api/auth/apple-login  { id_token, fullName?, email? }
POST /api/auth/google-login { id_token }
```

**统一响应**：`{ token: <JWT>, user: { id, nickname, avatar, providers: [...] } }`

### 3. 合并策略

#### 3.1 自动合并（同人识别）

| 场景 | 合并方式 |
|------|----------|
| Apple / Google 登录拿到 email，DB 已有同 email 的微信用户 | **自动合并**，新 openid/sub 写入对应字段 |
| Sign in with Apple 开启「隐藏邮箱」 | 走手动合并流程（见下） |
| 用户在「设置」页手动「绑定更多登录方式」 | 手动合并 |

#### 3.2 手动合并（兜底）

```
POST /api/auth/link-provider
Headers: Authorization: Bearer <existing_jwt>
Body: { provider: "APPLE" | "GOOGLE" | "WECHAT", credential: { id_token | code } }
→ 200 { user }
```

**前置校验**：
- Apple / Google：必须验证 `id_token` 真实有效（签名、iss、aud、exp）
- 微信：调 `jscode2session` 拿 openid
- 校验目标 `openid/sub` **未被其他 User 占用**
- 占用了则返回 `409 PROVIDER_ALREADY_LINKED`，**不允许合并冲突账号**

### 4. JWT Payload

```json
{
  "sub": "user_cuid",
  "providers": ["WECHAT", "APPLE"],
  "primary": "WECHAT",
  "iat": 1780300000,
  "exp": 1780900000
}
```

- `sub` = 内部 userId，**所有业务以 sub 为准**
- `providers` = 该 User 已绑定的登录方式列表（用于客户端判断「能否在另一端用同账号登录」）
- `primary` = 主登录方式（用于 UI 默认头像/昵称来源）

### 5. 关键边界

| 边界 | 处理 |
|------|------|
| 解绑登录方式 | 至少保留一种，**禁止解绑到 0**（`422 LAST_PROVIDER`） |
| openid 注销换账号 | 软删除（`deletedAt`）+ 30 天后硬删除，openid 释放 |
| 邮箱冲突 | 邮箱仅作匹配信号，**不作为合并唯一条件**（防撞库） |
| Apple 隐藏邮箱 | 邮箱字段为 `null`，走手动合并 |

## Consequences（影响 / 代价）

### ✅ 收益

- **用户体验最佳**：跨端无缝 — 我在 iPhone 创建的活动，在 Android 也能看到「我报名的」
- **数据完整**：评价、消息、参与者列表**自然合并**
- **降低流失**：海外用户没有微信也能注册，**覆盖完整人群**

### ⚠️ 代价与风险

| 风险 | 缓解 |
|------|------|
| **R1：账号合并误判** | 邮箱匹配需校验 ID Token 真实性；冲突返回 409，不静默合并 |
| **R2：Apple 隐藏邮箱无法自动合并** | 提供手动「绑定更多」入口，UI 友好提示 |
| **R3：解绑失控导致账号丢失** | 至少保留一种登录方式 |
| **R4：openid 撞库** | DB 唯一约束 + 每次合并前查重 |
| **R5：海外 Apple/Google 稳定性** | 走 Apple JWKS + Google `google-auth-library`，缓存公钥 24h |
| **R6：合规风险** | 海外用户走 AWS 地域（[ADR-0005](./0005-data-storage-region.md)），email 不作为 ID |

### 🔁 不可逆性评估

- **低不可逆**：合并策略可改（v1.1 可引入手机号合并），DB schema 留口子
- **关键 schema 字段**：`wechatOpenid` / `appleSub` / `googleSub` 已独立索引，**未来加手机号合并也只加一列**

### 📋 决策后续

- M1-W2：后端实现 3 个登录端点 + JWT 签发
- M1-W3：实现 `POST /api/auth/link-provider`（手动合并）
- M1-W4：客户端落地（小程序 `wx.login`、Flutter `sign_in_with_apple` + `google_sign_in`）
- 写 ADR-0003 配套迁移脚本：M2 之前的存量微信用户加 `wechatOpenid` 字段（**本次直接新增，不存在迁移**）

## Status

- ✅ **Accepted** — 2026-06-05
- 📅 下次 review：M1-W2（3 个登录端点实现后）
- 👥 Owner：@美国hermes（后端） / @爱马仕（小程序） / Flutter 主程（App）

## 备选方案被否决的理由

- ❌ **B. 各端独立账号**：体验割裂，**违反「同一用户看到完整数据」原则**
- ❌ **C. 强制微信扫码登录（iOS/Android 端）**：海外留学生无微信，**直接流失 30%+ 用户**
- ❌ **D. 强制手机号注册**：留学生换号 / 双卡 / 海外号段，**转化率至少掉 50%**

## 安全 / 合规交叉引用

- [architecture-v1.0.md §8 安全与合规](../architecture-v1.0.md)
- [api/v1.md §3 鉴权使用规则](../api/v1.md)
- ADR-0005：[数据存储地域（国内+海外双地域）](./0005-data-storage-region.md)
