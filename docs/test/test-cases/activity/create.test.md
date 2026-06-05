# T-ACTIVITY-CREATE — 创建活动

> **模块**：activity / create
> **关联 API**：`POST /api/activities`
> **关联数据模型**：[`docs/spec-v0.2.md`](../../../spec-v0.2.md) §5 Activity
> **维护**：@OpenClaw
> **最后更新**：2026-06-05

---

## TC-ACTIVITY-CREATE-001  创建自习类活动成功
- **优先级**：P0
- **类型**：正向
- **关联**：[#7](https://github.com/YuanshuoDu/studybuddy/issues/7) 核心场景 1
- **前置条件**：
  - 用户 `usr_creator_001` 已登录（access token 有效）
  - 微信内容安全 API mock 返回 `errcode: 0`（标题 / 描述合规）
  - 活动类型：`study`
- **步骤**：
  1. 调用 `POST /api/activities`，header `Authorization: Bearer <accessToken>`，body：
     ```json
     {
       "type": "study",
       "title": "图书馆一起复习高数",
       "description": "讨论期中考试重点，AA 饮料",
       "location": { "lat": 31.2304, "lng": 121.4737, "addr": "上海市黄浦区...", "placeName": "上海图书馆" },
       "startTime": "2026-06-10T14:00:00+08:00",
       "endTime": "2026-06-10T17:00:00+08:00",
       "maxParticipants": 6,
       "tags": ["高数", "期中", "AA"]
     }
     ```
  2. 断言响应
- **预期**：
  - HTTP 201
  - 响应 body 形如：
    ```json
    {
      "id": "act_...",
      "creatorId": "usr_creator_001",
      "type": "study",
      "title": "图书馆一起复习高数",
      "status": "open",
      "currentParticipants": 1,
      "createdAt": "2026-06-05T..."
    }
    ```
  - DB `Activity` 表新增 1 条
  - **创建者自动加入** `Signup` 表（`status=approved`，`role=creator`）
  - 初始 `currentParticipants = 1`（含创建者）
  - 日志记录 `activity.create` 事件
- **实际**：<执行时填>
- **备注**：响应时间 < 500ms（参见 [`performance-baseline.md`](../../performance-baseline.md) §1.3）

---

## TC-ACTIVITY-CREATE-002  必填字段缺失返回 400
- **优先级**：P0
- **类型**：反向
- **关联**：[`security-checklist.md`](../../security-checklist.md) A03（输入校验）
- **前置条件**：
  - 用户已登录
- **步骤**：
  1. 调用 `POST /api/activities`，body（缺少 `title`）：
     ```json
     {
       "type": "study",
       "startTime": "2026-06-10T14:00:00+08:00",
       "endTime": "2026-06-10T17:00:00+08:00",
       "maxParticipants": 6
     }
     ```
  2. 断言响应
- **预期**：
  - HTTP 400
  - 错误码 `VALIDATION_ERROR`
  - 响应 body `errors: [{ "field": "title", "message": "title is required" }]`
  - **不**创建 Activity
  - **不**调用微信内容安全
- **实际**：<执行时填>
- **备注**：zod schema 校验，所有必填字段：`type, title, startTime, endTime, maxParticipants, location`

---

## TC-ACTIVITY-CREATE-003  时间逻辑错误（endTime < startTime）返回 400
- **优先级**：P1
- **类型**：边界
- **关联**：状态机 ADR [`docs/adr/0004-state-machine-for-activity.md`](../../../adr/0004-state-machine-for-activity.md)
- **前置条件**：
  - 用户已登录
- **步骤**：
  1. 调用 `POST /api/activities`，body：
     ```json
     { "type": "study", "title": "...", "startTime": "2026-06-10T17:00:00+08:00", "endTime": "2026-06-10T14:00:00+08:00", ... }
     ```
- **预期**：
  - HTTP 400
  - 错误码 `VALIDATION_ERROR`，message 包含 "endTime must be after startTime"
  - 不创建
- **实际**：<执行时填>
- **备注**：边界用例，确保时间逻辑在校验层就拒绝

---

## TC-ACTIVITY-CREATE-004  UGC 命中违规关键词返回 422
- **优先级**：P0
- **类型**：安全 / 反向
- **关联**：[`security-checklist.md`](../../security-checklist.md) §4 + 微信生态 [`docs/api/wechat.md`](../../../api/wechat.md)
- **前置条件**：
  - 用户已登录
  - nock 拦截 `https://api.weixin.qq.com/wxa/msg_sec_check` 返回 `{"errcode": 87014, "errmsg": "risky content"}`
- **步骤**：
  1. 调用 `POST /api/activities`，body `title: "加微信 xxx-xxxx 私聊"`（含违规）
  2. 断言响应
- **预期**：
  - HTTP 422
  - 错误码 `CONTENT_BLOCKED`
  - 响应 body 提示用户"内容含违规信息，请修改"
  - **不**创建 Activity
  - 日志记录 `content.blocked` 事件（含 userId、违规关键词类别）
- **实际**：<执行时填>
- **备注**：
  - fail-closed：微信 API 调用失败时也必须拒绝（见 [`security-checklist.md`](../../security-checklist.md) §4.4）
  - 类似用例：TC-SAFETY-UGC-001（在 `safety/ugc-audit.test.md` 中）

---

## TC-ACTIVITY-CREATE-005  未登录用户调用返回 401
- **优先级**：P0
- **类型**：安全
- **关联**：[`security-checklist.md`](../../security-checklist.md) A01（访问控制）
- **前置条件**：
  - 无 access token
- **步骤**：
  1. 调用 `POST /api/activities`，**无** Authorization header，body 同 TC-001
  2. 断言响应
- **预期**：
  - HTTP 401
  - 错误码 `UNAUTHORIZED`
  - 不创建
- **实际**：<执行时填>
- **备注**：基础鉴权测试，每个端点的反向用例都应有 TC-XXX-005 这种"未登录"覆盖

---

## 跑通后的归档清单

- `docs/screenshots/issue-7/06-create-activity-success.png` — TC-001
- `docs/screenshots/issue-7/07-create-missing-field.png` — TC-002
- `docs/screenshots/issue-7/08-create-time-invalid.png` — TC-003
- `docs/screenshots/issue-7/09-create-content-blocked.png` — TC-004
- `docs/screenshots/issue-7/10-create-unauthorized.png` — TC-005
