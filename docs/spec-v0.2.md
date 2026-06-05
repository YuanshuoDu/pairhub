# StudyBuddy — 需求规格 v0.2

> 状态：v0.2 — **架构拍板版**（CTO 已定）  
> 相对 v0.1 变更：补全数据模型字段、API 契约、活动状态机、验收标准、明确弃用项  
> 上游文档：[spec-v0.1.md](./spec-v0.1.md)（保留作历史）  
> 交付铁律：[delivery-standards.md](./delivery-standards.md)

---

## 0. CTO 决策摘要（v0.1 → v0.2 拍板项）

| # | 决策点 | 拍板（v0.2） | 理由 |
|---|--------|------------|------|
| D1 | 主端 | **微信小程序**（手机优先）+ Web H5 fallback (P2) | 决策人指定，零下载成本 |
| D2 | 后端语言 | **Node.js 20 LTS + TypeScript 5.4** | 与 @美国hermes 主力栈一致，生态成熟 |
| D3 | 后端框架 | **Fastify 4.x** | 性能高于 Express，schema-first 校验原生 |
| D4 | ORM | **Prisma 5.x** | 类型安全 + 迁移工具链完整 |
| D5 | 数据库 | **PostgreSQL 16** | JSON 字段、地理空间（PostGIS）原生支持 |
| D6 | 缓存 | **Redis 7** | 活动列表 / 限流 / Session |
| D7 | 部署 | **Docker Compose 本地 + 阿里云 / 腾讯云 P1** | @爱马仕 生态就近 |
| D8 | 包管理 | **pnpm 9** | monorepo 友好，节省磁盘 |
| D9 | 登录 | **微信一键登录（MVP）** + 手机号兜底（P2） | 决策人拍板 |
| D10 | 地图 | **腾讯地图 API**（@爱马仕 生态优先） | 决策人指定 |
| D11 | 学生认证 | **MVP 不做**（仅自报学校字段） | 避免审核成本拖慢 MVP |
| D12 | 支付 | **MVP 不做** | 范围控制 |
| D13 | 内容审核 | **MVP 接入微信内容安全 API**（异步过滤） | 必接，平台合规 |

> D9/D11/D12/D13 已替决策人拍板（"完全允许状态"），后续若调整走 issue 流程。

---

## 1. 核心定位

**StudyBuddy = 留学生搭子活动平台**  
一句话：**让留学生 30 秒内找到一个能一起去图书馆 / 打球 / 开黑的搭子。**

---

## 2. 目标用户

| 画像 | 描述 | 主要场景 |
|------|------|----------|
| A 学业型 | 硕士/博士新生 | 自习、讨论、找同专业同学 |
| B 运动型 | 喜欢打球/跑步 | 周末约球、夜跑 |
| C 娱乐型 | 想玩桌游/开黑 | 周中开黑、周末桌游局 |
| D 社交型 | 想认识新朋友 | 主题局、城市探索 |

---

## 3. MVP 范围与场景优先级

| # | 场景 | 优先级 | 状态 |
|---|------|--------|------|
| 1 | 创建活动（自习/运动/桌游/开黑） | P0 | spec v0.2 |
| 2 | 浏览活动列表（位置/时间/类型筛选） | P0 | spec v0.2 |
| 3 | 报名活动 / 退出活动 | P0 | spec v0.2 |
| 4 | 活动详情页（位置、参与者、人数上限） | P0 | spec v0.2 |
| 5 | 微信登录（手机号 + 微信一键） | P0 | spec v0.2 |
| 6 | 个人主页（我创建/我参加） | P1 | spec v0.2 |
| 7 | 活动私聊群（小程序内） | P2 | 推到 M2 |
| 8 | 评价搭子（双向评分） | P3 | 推到 M3 |
| 9 | 推送通知（订阅消息） | P1 | spec v0.2 |
| 10 | 内容安全过滤 | P0 | spec v0.2 |

---

## 4. 活动类型 v1

| 类型 | 子类 | 关键字段 |
|------|------|----------|
| 自习 | 图书馆/咖啡厅/讨论室 | 地点（lat/lng/addr/place_name）、科目、起止时间、人数 |
| 运动 | 羽毛球/网球/跑步/篮球/足球 | 场地、装备要求、人数、强度等级 |
| 桌游 | 三国杀/狼人杀/UNO | 地点、人数、桌游类型 |
| 开黑 | 王者/原神/吃鸡/LOL | 游戏 ID 段位、组队人数、语音平台 |
| 其他 | 自由文本 | 标题、描述、地点、时间、人数 |

---

## 5. 数据模型 v2（可直接落地为 Prisma schema）

```prisma
// 完整 schema 见 server/prisma/schema.prisma，本节为设计说明

model User {
  id            String   @id @default(cuid())
  openid        String   @unique                 // 微信 openid
  unionid       String?  @unique                 // 微信 unionid（可选）
  nickname      String
  avatar        String?
  school        String?                         // 自报，不做认证
  major         String?
  grade         String?                         // 入学年份
  wechat_id     String?                         // 展示用，需用户授权
  phone         String?  @unique
  bio           String?  @db.VarChar(500)
  status        UserStatus @default(ACTIVE)
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt
  activities    Activity[]   @relation("creator")
  signups       Signup[]
  
  @@index([school, grade])
  @@map("users")
}

enum UserStatus { ACTIVE BANNED }

model Activity {
  id              String   @id @default(cuid())
  creator_id      String
  creator         User     @relation("creator", fields: [creator_id], references: [id])
  type            ActivityType
  title           String   @db.VarChar(100)
  description     String   @db.VarChar(2000)
  cover_url       String?
  location_name   String                            // 简短地点名
  location_addr   String                            // 详细地址
  location_lat    Decimal  @db.Decimal(10, 7)       // 腾讯地图坐标系 (GCJ-02)
  location_lng    Decimal  @db.Decimal(10, 7)
  start_time      DateTime
  end_time        DateTime
  max_participants Int     @default(10)
  current_count   Int      @default(1)              // 含创建者
  tags            String[]                          // 兴趣标签
  status          ActivityStatus @default(RECRUITING)
  content_check   ContentCheckStatus @default(PENDING)
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt
  signups         Signup[]
  
  @@index([status, start_time])
  @@index([type, status, start_time])
  @@index([location_lat, location_lng])              // 地理查询
  @@map("activities")
}

enum ActivityType     { STUDY SPORTS BOARD_GAME ONLINE_GAME OTHER }
enum ActivityStatus   { RECRUITING FULL STARTED ENDED CANCELED }
enum ContentCheckStatus { PENDING PASS BLOCKED }

model Signup {
  id           String   @id @default(cuid())
  activity_id  String
  user_id      String
  activity     Activity @relation(fields: [activity_id], references: [id], onDelete: Cascade)
  user         User     @relation(fields: [user_id], references: [id])
  status       SignupStatus @default(APPROVED)      // MVP 默认自动通过
  message      String?  @db.VarChar(200)            // 报名留言
  signed_at    DateTime @default(now())
  canceled_at  DateTime?
  
  @@unique([activity_id, user_id])
  @@index([user_id, status])
  @@map("signups")
}

enum SignupStatus { PENDING APPROVED REJECTED CANCELED }

// 评价系统（M3 暂存设计）
model Review {
  id           String   @id @default(cuid())
  activity_id  String
  from_user_id String
  to_user_id   String
  rating       Int      // 1-5
  comment      String?  @db.VarChar(500)
  created_at   DateTime @default(now())
  
  @@unique([activity_id, from_user_id, to_user_id])
  @@map("reviews")
}
```

### 5.1 字段约束与默认值

| 表 | 字段 | 约束 | 说明 |
|---|------|------|------|
| User | phone | E.164 格式校验 | 服务端 zod 校验 |
| User | bio | ≤ 500 字 | 微信内容安全 API 过滤 |
| Activity | title | 5-100 字 | 必填 |
| Activity | description | 10-2000 字 | 必填，微信内容安全 API 过滤 |
| Activity | max_participants | 2-100 | 必填 |
| Activity | end_time | > start_time | 必填 |
| Activity | tags | 0-10 个 | 自由文本 |
| Signup | 唯一约束 | (activity_id, user_id) | 防止重复报名 |

---

## 6. 活动状态机

```
                    create
                      ↓
[RECRUITING] ───人数满──→ [FULL]
      │                       │
      │ 时间到               │ 时间到
      ↓                       ↓
   [STARTED]  ←──────────── [STARTED]
      │
      │ end_time 过
      ↓
   [ENDED] ──→ 自动触发评价窗口
      │
  任意时刻 (仅 creator)
      ↓
   [CANCELED]
```

**业务规则**：
- `RECRUITING → FULL`：当前报名数（含创建者）== `max_participants`
- `FULL → RECRUITING`：有人取消报名
- `RECRUITING/FULL → STARTED`：到达 `start_time`（cron 每分钟扫描）
- `STARTED → ENDED`：到达 `end_time`
- `* → CANCELED`：仅创建者本人，时间早于 `start_time` 前 1h 可取消
- 已 `STARTED` 的活动不可再报名或取消报名

---

## 7. API 契约 v0.2

详细规范见 [api/conventions.md](./api/conventions.md) 与 [api/wechat.md](./api/wechat.md)。

### 7.1 端点清单

| Method | Path | 用途 | 鉴权 |
|--------|------|------|------|
| GET | `/api/health` | 健康检查 | 无 |
| GET | `/api/activities` | 活动列表（分页/筛选/排序/地理） | 无 |
| POST | `/api/activities` | 创建活动 | 必 |
| GET | `/api/activities/:id` | 活动详情 | 无 |
| PATCH | `/api/activities/:id` | 修改活动 | 必+creator |
| DELETE | `/api/activities/:id` | 取消活动 | 必+creator |
| POST | `/api/activities/:id/signup` | 报名 | 必 |
| DELETE | `/api/activities/:id/signup` | 取消报名 | 必 |
| GET | `/api/activities/:id/participants` | 参与者列表 | 无 |
| GET | `/api/users/me` | 当前用户 | 必 |
| GET | `/api/users/me/activities?role=creator\|participant` | 我的活动 | 必 |
| POST | `/api/auth/wx-login` | 微信登录 | 无 |
| POST | `/api/auth/phone-login` | 手机号登录（P2） | 无 |

### 7.2 通用约定

- **鉴权**：`Authorization: Bearer <jwt>` （HS256, 7 天过期）
- **分页**：`?page=1&page_size=20`（最大 100），响应 `{ data: [], pagination: { page, page_size, total, has_more } }`
- **错误**：RFC 7807 Problem Details，`{ type, title, status, detail, instance, code }`
- **时间**：所有时间字段 ISO 8601（UTC），前端按本地时区展示
- **地理**：lat/lng 用 GCJ-02（腾讯地图坐标系），存储 Decimal(10,7)
- **限流**：基于 Redis 滑动窗口，默认 100 req/min/IP，登录接口 10 req/min/IP

---

## 8. 验收标准（Definition of Done — DoD）

每条交付必须满足：

### 8.1 后端 PR

- [ ] `pnpm install` 干净环境跑通
- [ ] `pnpm lint` 0 error 0 warning
- [ ] `pnpm test` 全绿（覆盖率 ≥ 70% for new code）
- [ ] `pnpm build` 成功
- [ ] `docker compose up` 启动后 `/api/health` 返回 200
- [ ] 至少 1 个新 endpoint 的真实 curl 请求+响应截图
- [ ] DB 变更附 `pnpm prisma migrate dev` 输出 + Prisma Studio 截图
- [ ] PR body 第一行 `Closes #N`
- [ ] CI Actions 全绿

### 8.2 小程序 PR

- [ ] 微信开发者工具编译无错
- [ ] 真机预览截图（首页 + 核心流程）
- [ ] 控制台无 error
- [ ] 录屏 GIF/MP4 ≤ 30s

### 8.3 文档 PR

- [ ] GitHub 渲染预览截图
- [ ] 内部链接全部可点开
- [ ] 每个结论附引用源

---

## 9. 性能与可扩展性目标

| 指标 | 目标（MVP） | 测量方式 |
|------|------------|----------|
| 首屏列表接口 P95 | < 300ms | k6 压测 100 并发 |
| 创建活动接口 P95 | < 500ms | 同上 |
| 微信登录 P95 | < 800ms | 同上 |
| 系统可用性 | 99% | uptime 监控 |
| 同时在线活动 | 1,000 | 压力测试 |
| 列表筛选复杂度 | 10 万活动 O(log n) | EXPLAIN 检查 |

---

## 10. 风险与缓解

| 风险 | 等级 | 缓解 |
|------|------|------|
| 微信小程序审核被拒 | 中 | 提前在 `docs/research/wechat-ecosystem.md` 中梳理审核要点 |
| UGC 出现违规内容 | 高 | **必须**接入微信内容安全 API（异步） |
| 报名活动人数并发竞争 | 中 | 数据库唯一约束 + Prisma 事务，`current_count` 触发器维护 |
| 地图坐标偏差 | 低 | 统一 GCJ-02，前端选点 SDK 直出 |
| 腾讯系 AI 角色外网受限 | 高 | @爱马仕 / @OpenClaw机器人-1896 任务以**文档/调研**为主，不涉及代码 push |

---

## 11. 里程碑与排期

| 里程碑 | 周期 | 主要交付 |
|--------|------|----------|
| **M1-Week1** | 本周 | spec v0.2、架构图、后端/小程序脚手架、PR 流程跑通 |
| M1-Week2 | 下周 | 登录、创建活动、列表、详情、报名的后端 + 前端 |
| M1-Week3 | +1 周 | 活动状态机、报名满员、地理筛选 |
| M1-Week4 | +1 周 | MVP 内测上线 |
| M2 | 4 周 | 推送通知、群聊、评价 |
| M3 | 6 周 | 推荐系统、IM、打赏 |

---

## 12. 后续迭代（P1+）

- 活动标签 / 兴趣匹配推荐
- 同学校 / 同专业优先展示
- 拼车出行
- 多语言（中/英）
- 押金 / 分摊支付
- 学生认证
- AI 搭子推荐（基于历史评价）

---

## 13. 变更日志

| 版本 | 日期 | 变更 | 作者 |
|------|------|------|------|
| v0.1 | 2026-06-01 | 初稿草拟 | @杜元朔 原始需求 |
| v0.2 | 2026-06-02 | CTO 拍板：补全数据模型、API 契约、状态机、DoD、风险 | @Oracle Hermes |
