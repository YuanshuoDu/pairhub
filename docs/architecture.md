# StudyBuddy — 系统架构 v0.1

> 配套 [spec-v0.2.md](./spec-v0.2.md)  
> 在线版：[architecture.html](./architecture.html) （深色 SVG，可直接浏览器打开）  
> 导出 PNG/SVG 见 `docs/architecture.{png,svg}`（待生成）

## 1. 整体架构

5 层 + 1 横向（CI/CD）：

| 层 | 组件 | 职责 |
|---|------|------|
| 客户端 | 微信小程序 | UI 渲染、用户交互、调用 wx.login/地图选点 |
| 网关 | Fastify API Gateway | 路由分发、限流、CORS、JWT 校验 |
| 应用 | Auth / Activity / User Service | 业务逻辑 |
| 数据 | PostgreSQL + Redis | 持久化 + 缓存 |
| 异步 | Cron Worker | 活动状态机扫描（每分钟） |
| 横切 | GitHub Actions | CI/CD 自动化 |

## 2. 关键决策（链接 spec-v0.2 §0）

| 维度 | 选型 | 备选 |
|------|------|------|
| 前端 | 微信小程序 (WXML + TS) | Web H5 / RN / Flutter |
| 后端 | Node 20 + Fastify 4 + Prisma 5 | Go + Gin / Python + FastAPI |
| DB | PostgreSQL 16 | MySQL 8 / SQLite (开发) |
| 缓存 | Redis 7 | Memcached |
| 鉴权 | JWT (HS256) | OAuth2 / Session |
| 地图 | 腾讯地图 (GCJ-02) | 高德 / 百度 |
| CI/CD | GitHub Actions | GitLab CI / Jenkins |
| 部署 | Docker Compose → 腾讯云 (M2 阿里云) | Vercel / Railway |

## 3. 数据流

### 3.1 创建活动

```
小程序 → POST /api/activities (JWT)
  → API Gateway 限流 + 鉴权
  → Activity Service
    → 调微信内容安全 API (async)
    → Prisma.create(activity) 写 PG
    → 当前人数 +1 (Prisma 事务)
  → 201 + activity JSON
  → 小程序更新列表
```

### 3.2 微信登录

```
wx.login() → code
  → POST /api/auth/wx-login { code }
  → Auth Service
    → 调 https://api.weixin.qq.com/sns/jscode2session
    → 拿到 openid + session_key
    → upsert User
    → 签 JWT
  → 200 { token, user }
  → storage.setItem('jwt', token)
```

### 3.3 活动状态机

```
Cron 每分钟扫描 activities 表
  → start_time ≤ now 且 status = RECRUITING|FULL → 改为 STARTED
  → end_time ≤ now 且 status = STARTED → 改为 ENDED
  → ENDED 触发评价窗口开启 (M3)
```

## 4. 安全设计

- **传输**：全程 HTTPS / WSS，TLS 1.3
- **存储**：DB 密码、AppSecret 仅入 env，源代码不出现
- **鉴权**：JWT 7 天过期 + 刷新令牌 (v0.3)，敏感接口强制二次验证
- **限流**：Redis 滑动窗口，登录 10/min/IP，全局 100/min/IP
- **内容安全**：微信内容安全 API 异步过滤 UGC
- **数据隔离**：活动列表筛选按 status，违规内容（BLOCKED）不入列表

## 5. 部署拓扑

```
                   ┌────────────────┐
                   │  Cloudflare    │
                   │  CDN + WAF     │
                   └────────┬───────┘
                            │ HTTPS
              ┌─────────────▼─────────────┐
              │   腾讯云 CLB (负载均衡)   │
              └─────────────┬─────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   ┌────▼────┐         ┌────▼────┐         ┌────▼────┐
   │ Node #1 │         │ Node #2 │         │ Node #3 │
   │Fastify  │         │Fastify  │         │Cron Only│
   └────┬────┘         └────┬────┘         └────┬────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
              ┌─────────────▼─────────────┐
              │   PostgreSQL 主从         │
              │   Master ←→ Replica      │
              └───────────────────────────┘
              ┌───────────────────────────┐
              │   Redis 哨兵 / Cluster    │
              └───────────────────────────┘
```

## 6. 性能与可扩展

| 项 | MVP | 后续 |
|---|-----|------|
| 节点数 | 2 应用 + 1 cron | 横向扩展到 10+ |
| DB | 单实例 | 主从 + 读写分离 |
| 缓存 | 单 Redis | Redis Cluster |
| 静态资源 | 对象存储 (COS) | 同左 |
| 监控 | 自建 Prometheus + Grafana | 接入腾讯云监控 |

## 7. 目录结构

```
studybuddy/
├── server/                # 后端
│   ├── src/
│   │   ├── app.ts         # Fastify 入口
│   │   ├── routes/        # 路由
│   │   ├── services/      # 业务逻辑
│   │   ├── plugins/       # Fastify 插件
│   │   ├── lib/           # 工具
│   │   └── types/         # TS 类型
│   ├── prisma/
│   │   ├── schema.prisma  # 数据模型
│   │   ├── migrations/    # 迁移历史
│   │   └── seed.ts        # 种子数据
│   ├── tests/             # 测试
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── miniprogram/           # 微信小程序
│   ├── pages/
│   ├── components/
│   ├── app.ts
│   ├── app.json
│   └── project.config.json
├── docs/
│   ├── spec-v0.2.md
│   ├── architecture.md / .html
│   ├── api/
│   ├── research/
│   └── test/
├── infra/
│   ├── dev-up.sh
│   ├── docker-compose.yml
│   └── deploy/
├── .github/
│   ├── workflows/
│   ├── ISSUE_TEMPLATE/
│   └── CODEOWNERS
└── README.md
```

## 8. 演进路线

| 版本 | 范围 | 关键变化 |
|------|------|----------|
| v0.1 | 本周 | spec + 架构 + 脚手架 |
| v0.2 | 2 周内 | MVP 接口 (活动+登录+报名) |
| v0.3 | 1 月 | OpenAPI 规范 + 监控 + OpenTelemetry |
| v1.0 | 2 月 | 生产部署 + 监控告警 + 灾备 |
| v2.0 | 季度 | 推荐系统 + IM + 支付 |

## 9. 开放问题

- [ ] 是否引入消息队列（BullMQ）处理异步任务？(v0.2 评估)
- [ ] 是否引入 OpenTelemetry？(v0.3 评估)
- [ ] 海外用户访问方案（小程序限制）？(P1 调研)
- [ ] 国际化 i18n 策略？(M2)
