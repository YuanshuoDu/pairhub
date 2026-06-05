# Pairhub — API 设计规范 v0.2

> 配套 [spec-v0.2.md §7](../spec-v0.2.md)

## 1. 设计原则

1. **RESTful 资源命名**：复数名词，路径不出现动词
2. **JSON 优先**：所有请求/响应 JSON，UTF-8
3. **无状态**：每个请求带完整鉴权信息
4. **幂等性**：写操作支持 `Idempotency-Key` 头（v0.3 引入）
5. **可缓存**：GET 响应带 ETag（v0.3 引入）

## 2. URL 设计

```
GET    /api/health
GET    /api/activities                       # 列表，支持 ?type=&status=&start_after=&start_before=&lat=&lng=&radius_km=&page=&page_size=
POST   /api/activities
GET    /api/activities/:id
PATCH  /api/activities/:id
DELETE /api/activities/:id

POST   /api/activities/:id/signup
DELETE /api/activities/:id/signup
GET    /api/activities/:id/participants

GET    /api/users/me
GET    /api/users/me/activities?role=creator|participant
GET    /api/users/:id                         # 公开主页

POST   /api/auth/wx-login
POST   /api/auth/phone-login                  # P2
POST   /api/auth/refresh                      # v0.3
```

## 3. 通用请求头

| 头 | 必填 | 说明 |
|---|------|------|
| `Content-Type: application/json` | 写操作 | |
| `Authorization: Bearer <jwt>` | 鉴权接口 | 来自 `/api/auth/wx-login` |
| `X-Request-Id: <uuid>` | 推荐 | 用于日志追踪 |
| `Accept-Language: zh-CN\|en-US` | 可选 | 国际化（M2） |

## 4. 通用响应

### 4.1 成功响应

```json
{
  "data": { /* 资源对象或数组 */ },
  "pagination": {                    // 仅列表
    "page": 1,
    "page_size": 20,
    "total": 137,
    "has_more": true
  }
}
```

### 4.2 错误响应（RFC 7807 Problem Details）

```json
{
  "type": "https://pairhub.example.com/errors/activity-not-found",
  "title": "Activity Not Found",
  "status": 404,
  "detail": "活动 ID abc123 不存在或已删除",
  "instance": "/api/activities/abc123",
  "code": "ACTIVITY_NOT_FOUND"
}
```

### 4.3 错误码对照

| HTTP | code 常量 | 含义 |
|------|-----------|------|
| 400 | `VALIDATION_ERROR` | 请求参数校验失败 |
| 401 | `UNAUTHORIZED` | 缺少或无效 token |
| 403 | `FORBIDDEN` | 权限不足（如非创建者修改） |
| 404 | `*_NOT_FOUND` | 资源不存在 |
| 409 | `CONFLICT` | 资源冲突（如重复报名） |
| 422 | `BUSINESS_RULE_VIOLATION` | 业务规则违反 |
| 429 | `RATE_LIMIT_EXCEEDED` | 限流 |
| 500 | `INTERNAL_ERROR` | 服务器内部错误 |

## 5. 鉴权流程

```
[小程序]              [后端]              [微信服务器]
   │  wx.login()        │                     │
   │ ─────────────────→ │                     │
   │  code              │  code2Session       │
   │ ←────────────────  │ ──────────────────→ │
   │                    │  openid, session_key│
   │                    │ ←────────────────── │
   │                    │                     │
   │                    │  查/建 User         │
   │                    │  签 JWT (HS256)     │
   │  jwt_token         │                     │
   │ ←────────────────  │                     │
```

JWT Payload：
```json
{
  "sub": "user_cuid",
  "openid": "oXyz...",
  "iat": 1780300000,
  "exp": 1780900000
}
```

## 6. 列表筛选参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `type` | enum | 活动类型，单选 |
| `status` | enum | 活动状态，默认 `RECRUITING\|FULL\|STARTED` |
| `start_after` | ISO 8601 | 起始时间下限 |
| `start_before` | ISO 8601 | 起始时间上限 |
| `lat` + `lng` | decimal | 中心点 |
| `radius_km` | float | 半径（1-50），需同时给 lat/lng |
| `keyword` | string | 标题/描述模糊搜索 |
| `tags` | csv | 标签筛选（OR） |
| `sort` | enum | `start_time_asc`(默认) \| `created_desc` \| `distance_asc`（需坐标） |
| `page` | int | 默认 1 |
| `page_size` | int | 默认 20，max 100 |

## 7. 创建活动请求体

```json
{
  "type": "SPORTS",
  "title": "周六下午羽毛球 3v3",
  "description": "新手友好，球馆有空调，求 3-4 个搭子。",
  "location_name": "XX 羽毛球馆",
  "location_addr": "北京市海淀区中关村大街 1 号",
  "location_lat": 39.9842000,
  "location_lng": 116.3074000,
  "start_time": "2026-06-07T14:00:00+08:00",
  "end_time": "2026-06-07T17:00:00+08:00",
  "max_participants": 8,
  "tags": ["羽毛球", "新手友好"]
}
```

## 8. 活动详情响应

```json
{
  "data": {
    "id": "act_abc123",
    "creator": {
      "id": "usr_xyz",
      "nickname": "小明",
      "avatar": "https://...",
      "school": "MIT",
      "bio": "爱打球"
    },
    "type": "SPORTS",
    "title": "周六下午羽毛球 3v3",
    "description": "...",
    "cover_url": null,
    "location": {
      "name": "XX 羽毛球馆",
      "addr": "北京市海淀区中关村大街 1 号",
      "lat": 39.9842,
      "lng": 116.3074,
      "distance_km": 1.2          // 当请求含 lat/lng 时返回
    },
    "start_time": "2026-06-07T14:00:00+08:00",
    "end_time": "2026-06-07T17:00:00+08:00",
    "max_participants": 8,
    "current_count": 3,
    "tags": ["羽毛球", "新手友好"],
    "status": "RECRUITING",
    "participants_preview": [    // 最多 5 个
      { "id": "usr_xyz", "nickname": "小明", "avatar": "..." }
    ],
    "created_at": "2026-06-02T20:00:00Z"
  }
}
```

## 9. 限流

- 全局 IP 限流：100 req/min（Redis 滑动窗口）
- 登录接口 IP 限流：10 req/min
- 创建活动用户限流：20 个/天
- 超限返回 `429 RATE_LIMIT_EXCEEDED`，header 带 `Retry-After: <秒数>`

## 10. 版本与兼容

- URL 前缀 `/api/v1/`（v0.3 引入；v0.2 暂用 `/api/`）
- 兼容性策略：非破坏性增强向后兼容；破坏性变更走 v2
- 客户端强制 `Accept: application/json; version=1`

## 11. OpenAPI

v0.3 引入 `docs/api/openapi.yaml`，CI 自动校验 spec 与实现一致性。
