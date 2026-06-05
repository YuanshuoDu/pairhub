# T-ACTIVITY-LIST — 活动列表

> **模块**：activity / list
> **关联 API**：`GET /api/activities`
> **关联数据模型**：[`docs/spec-v0.2.md`](../../../spec-v0.2.md) §5 Activity
> **维护**：@OpenClaw
> **最后更新**：2026-06-05

---

## TC-ACTIVITY-LIST-001  默认列表返回第一页（按时间倒序）
- **优先级**：P0
- **类型**：正向
- **关联**：[#7](https://github.com/YuanshuoDu/pairhub/issues/7) 核心场景 2
- **前置条件**：
  - DB 已有 50 条 Activity 种子数据（seed.ts 生成）
  - 时间分布：近 30 天
  - 不同 `type` 混合：`study: 20, sport: 15, boardgame: 10, gaming: 5`
- **步骤**：
  1. 调用 `GET /api/activities?limit=20`
  2. 断言响应
- **预期**：
  - HTTP 200
  - 响应 body：
    ```json
    {
      "items": [
        { "id": "act_...", "title": "...", "type": "study", "startTime": "...", "currentParticipants": 3, "maxParticipants": 6, "status": "open" },
        ...
      ],
      "total": 50,
      "page": 1,
      "limit": 20,
      "hasMore": true
    }
    ```
  - 列表按 `startTime DESC` 排序
  - 默认不返回 `description`（详情页才返回，节省流量）
  - 响应时间 P95 < 250ms（参见 [`performance-baseline.md`](../../performance-baseline.md) §1.3）
- **实际**：<执行时填>
- **备注**：列表走 Redis 缓存（key: `activities:list:default`），TTL 60s

---

## TC-ACTIVITY-LIST-002  按 type 筛选
- **优先级**：P0
- **类型**：正向
- **关联**：[`docs/api/v1.md`](../../../api/v1.md) 筛选约定
- **前置条件**：同 TC-001
- **步骤**：
  1. 调用 `GET /api/activities?type=sport&limit=20`
  2. 断言响应
- **预期**：
  - HTTP 200
  - 所有 `items[].type === "sport"`
  - 数量 ≤ 15（种子里 sport 共 15 条）
- **实际**：<执行时填>
- **备注**：筛选参数：`type, status, startTimeFrom, startTimeTo, locationRadius`

---

## TC-ACTIVITY-LIST-003  关键词搜索（title / description 模糊匹配）
- **优先级**：P1
- **类型**：正向
- **前置条件**：
  - 种子里有几条 title 含"图书馆" / "羽毛球"
- **步骤**：
  1. 调用 `GET /api/activities?q=图书馆`
  2. 断言响应
- **预期**：
  - HTTP 200
  - 返回的 items 中 title 或 description 包含"图书馆"（PostgreSQL `ILIKE` 匹配）
  - 大小写不敏感
- **实际**：<执行时填>
- **备注**：
  - 用 Prisma `where: { title: { contains: q, mode: 'insensitive' } }`
  - 防止 SQL 注入（A03）

---

## TC-ACTIVITY-LIST-004  分页正确：page=2 返回下 20 条
- **优先级**：P0
- **类型**：边界
- **前置条件**：
  - DB 至少 25 条
- **步骤**：
  1. 调用 `GET /api/activities?page=2&limit=20`
  2. 断言响应
- **预期**：
  - HTTP 200
  - `page=2, limit=20, total=50, hasMore=false`
  - 返回 5 条（50 - 20 = 30，第 2 页取 21-40 应为 20 条；25 总数时返回 5）
  - **不**与 page=1 重复
- **实际**：<执行时填>
- **备注**：分页 offset = (page-1) * limit

---

## TC-ACTIVITY-LIST-005  空结果集返回 items=[] 不报错
- **优先级**：P1
- **类型**：边界
- **前置条件**：
  - DB 中无 type=gaming AND startTime>2027-01-01 的活动
- **步骤**：
  1. 调用 `GET /api/activities?type=gaming&startTimeFrom=2027-01-01T00:00:00Z`
  2. 断言响应
- **预期**：
  - HTTP 200
  - `items: []`
  - `total: 0, hasMore: false`
  - **不**返回 404
- **实际**：<执行时填>
- **备注**：常见错误：把空集当 404。正确做法：200 + 空数组 + 客户端自行处理"无结果"UI

---

## 跑通后的归档清单

- `docs/screenshots/issue-7/11-list-default.png` — TC-001
- `docs/screenshots/issue-7/12-list-filter-type.png` — TC-002
- `docs/screenshots/issue-7/13-list-search.png` — TC-003
- `docs/screenshots/issue-7/14-list-pagination.png` — TC-004
- `docs/screenshots/issue-7/15-list-empty.png` — TC-005
