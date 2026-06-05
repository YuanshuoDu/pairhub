# T-AUTH-LOGIN — 登录

> **模块**：auth / login
> **关联 API**：
> - `POST /api/auth/wechat` — 微信小程序登录
> - `POST /api/auth/apple` — Apple Sign-In（iOS）
> - `POST /api/auth/google` — Google Sign-In（Android）
> - `POST /api/auth/refresh` — 刷新 access token
>
> **维护**：@OpenClaw
> **最后更新**：2026-06-05
> **关联 Issue**：[#7](https://github.com/YuanshuoDu/pairhub/issues/7)

---

## TC-AUTH-LOGIN-001  微信 code 换 openid 成功（首次注册）
- **优先级**：P0
- **类型**：正向
- **关联**：[`test-plan-v1.0.md`](../../test-plan-v1.0.md) §2.1
- **前置条件**：
  - 微信 AppID / Secret 已配置（`WECHAT_APPID` / `WECHAT_SECRET`）
  - 测试用 `code = "valid_code_001"`（mock 微信返回 `openid=ox_test_001`, `unionid=un_test_001`, `session_key=sk_test_001`）
  - 用户 `ox_test_001` 在 DB 中不存在
  - Redis 限流计数器已清空
- **步骤**：
  1. 调用 `POST /api/auth/wechat`，body：`{ code: "valid_code_001", nickname: "测试用户", avatar: "https://..." }`
  2. 用 nock 拦截 `https://api.weixin.qq.com/sns/jscode2session` 返回 `{"openid":"ox_test_001","session_key":"sk_test_001"}`
  3. 断言响应
- **预期**：
  - HTTP 200
  - 响应 body 形如：
    ```json
    {
      "accessToken": "eyJ...",
      "refreshToken": "rt_...",
      "expiresIn": 900,
      "user": { "id": "usr_...", "openid": "ox_test_001", "isNew": true, "nickname": "测试用户" }
    }
    ```
  - DB `User` 表新增 1 条（`openid=ox_test_001`）
  - DB `RefreshToken` 表新增 1 条（`userId`, `tokenHash`）
  - 日志记录 `auth.login.success` 事件
- **实际**：<执行时填>
- **备注**：
  - nock 拦截示例：
    ```js
    nock('https://api.weixin.qq.com').post('/sns/jscode2session').reply(200, { openid: 'ox_test_001', session_key: 'sk_test_001' });
    ```
  - 跑通后归档截图到 `docs/screenshots/issue-7/01-login-wechat-success.png`

---

## TC-AUTH-LOGIN-002  微信已注册用户再次登录
- **优先级**：P0
- **类型**：正向
- **关联**：[`security-checklist.md`](../../security-checklist.md) A07
- **前置条件**：
  - DB 已存在用户 `ox_test_002`（来自上一次登录）
  - 微信 mock 返回相同 `openid`
- **步骤**：
  1. 调用 `POST /api/auth/wechat`，body：`{ code: "valid_code_002" }`
  2. 断言响应
- **预期**：
  - HTTP 200
  - 响应 body `user.isNew = false`
  - **不**新增 User 行
  - **不**覆盖 nickname / avatar（用户主动调用 `PATCH /api/users/me` 才更新）
  - 签发新 access + refresh token
- **实际**：<执行时填>
- **备注**：回归测试，防止"每次登录都新建用户"漏洞

---

## TC-AUTH-LOGIN-003  无效 code 返回 401
- **优先级**：P0
- **类型**：反向
- **关联**：[`security-checklist.md`](../../security-checklist.md) A07
- **前置条件**：
  - nock 拦截微信 `/sns/jscode2session` 返回 `{"errcode": 40029, "errmsg": "invalid code"}`
- **步骤**：
  1. 调用 `POST /api/auth/wechat`，body：`{ code: "invalid_xxx" }`
  2. 断言响应
- **预期**：
  - HTTP 401
  - 响应 body 形如：
    ```json
    { "type": "about:blank", "title": "Invalid code", "status": 401, "code": "AUTH_INVALID_CODE" }
    ```
  - **不**创建 User / RefreshToken
  - 日志记录 `auth.login.fail` 事件（含 reason / ip）
- **实际**：<执行时填>
- **备注**：防止用无效 code 试探

---

## TC-AUTH-LOGIN-004  登录限流：6 次失败锁定 15 分钟
- **优先级**：P0
- **类型**：安全 / 异常
- **关联**：[`security-checklist.md`](../../security-checklist.md) A07（credential stuffing 防御）
- **前置条件**：
  - 清除 Redis 中该 IP 的限流计数
- **步骤**：
  1. 用同一 IP（`192.0.2.1`）连续调用 `POST /api/auth/wechat` 6 次，每次都返回 invalid code
  2. 第 7 次调用
- **预期**：
  - 前 5 次返回 401（如 TC-003）
  - 第 6 次返回 429（rate limit），响应头含 `Retry-After: 900`
  - 第 7 次仍 429
  - 15 分钟后恢复
  - 日志记录 `rate_limit.exceeded` 事件
- **实际**：<执行时填>
- **备注**：
  - 配置：`max: 5, timeWindow: '15 minutes'`
  - Redis key：`ratelimit:login:192.0.2.1`
  - 不同 IP 互不影响

---

## TC-AUTH-LOGIN-005  refresh token 一次性使用
- **优先级**：P0
- **类型**：安全
- **关联**：[`security-checklist.md`](../../security-checklist.md) §3.2
- **前置条件**：
  - 用户 `ox_test_005` 已登录，获得 refresh token `rt_initial`
- **步骤**：
  1. 第 1 次调用 `POST /api/auth/refresh`，body：`{ refreshToken: "rt_initial" }`
  2. 收到新 access + 新 refresh `rt_new`
  3. 第 2 次**再用** `rt_initial` 调用 `POST /api/auth/refresh`
- **预期**：
  - 第 1 次：HTTP 200，返回新 token 对
  - 第 2 次：HTTP 401，错误码 `AUTH_REFRESH_REUSED`
  - **副作用**：该用户**所有** refresh token 标记为 revoked（防 token 重放攻击）
  - 用户必须重新走完整登录流程
  - 日志记录 `auth.token.revoked` 事件（reason=reused）
- **实际**：<执行时填>
- **备注**：
  - 关键安全测试，必须在 W1 单测 + 集成都覆盖
  - 实现要点：`RefreshToken.usedAt` 非空时连带整个 userId 标记 revoked

---

## 跑通后的归档清单

执行上述 5 个用例后，截图归档：
- `docs/screenshots/issue-7/01-login-wechat-success.png` — TC-001
- `docs/screenshots/issue-7/02-login-existing-user.png` — TC-002
- `docs/screenshots/issue-7/03-login-invalid-code.png` — TC-003
- `docs/screenshots/issue-7/04-login-rate-limit.png` — TC-004
- `docs/screenshots/issue-7/05-refresh-reuse-revoke.png` — TC-005
