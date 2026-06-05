# Pairhub — 测试用例库索引

> 本目录是 Pairhub 的**测试用例 markdown 库**，对应 [`../test-plan-v1.0.md`](../test-plan-v1.0.md) §5。
> 编写规范：每模块 1 个目录，每特性 1 个 .md，至少 5 个用例（详见 [`_template.md`](./_template.md)）。

## 目录

### auth/ — 鉴权
- [`auth/login.test.md`](./auth/login.test.md) — 微信 / Apple / Google 登录（5 用例）

### activity/ — 活动
- [`activity/create.test.md`](./activity/create.test.md) — 创建活动（5 用例）
- [`activity/list.test.md`](./activity/list.test.md) — 活动列表 + 筛选（5 用例）

### signup/ — 报名
- [`signup/cancel.test.md`](./signup/cancel.test.md) — 退出报名（5 用例）

### 待补（M1-W2 ~ M1-W4）
- `auth/refresh-token.test.md`
- `auth/revoke.test.md`
- `activity/detail.test.md`
- `activity/update.test.md`
- `activity/cancel.test.md`（创建者取消）
- `signup/signup.test.md`（报名）
- `signup/list.test.md`（活动参与者列表）
- `user/profile.test.md`
- `user/update.test.md`
- `user/export.test.md`（GDPR 导出）
- `user/delete.test.md`（GDPR 删除）
- `message/send.test.md`
- `message/push.test.md`
- `review/create.test.md`
- `safety/ugc-audit.test.md`
- `safety/rate-limit.test.md`
- `regression/smoke.test.md`

## 编号规范

- 全局 ID：`T-<MODULE>-<NUMBER>`，如 `T-AUTH-LOGIN-001`
- 优先级：P0 / P1 / P2 / P3（对应 [缺陷 SLA](../test-plan-v1.0.md) §6.1）
- 类型：正向 / 反向 / 边界 / 异常 / 性能 / 安全

## 执行

执行由对应端 track 在 PR 套件中跑：
- 后端：vitest + supertest（`server/tests/integration/<test>.test.ts`）
- 小程序：miniprogram-automator（`miniprogram/e2e/<test>.spec.js`）
- Flutter：integration_test（`app/integration_test/<test>_test.dart`）

每个用例的 .md 文档作为**人类可读 / 评审 / 索引**用，执行代码与文档**双向引用**。

## 维护

任何用例变更请 PR 同步更新 .md 文档。文档与代码的同步由 `pnpm test:list-cases` 自动校验（TODO: M2）。
