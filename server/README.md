# StudyBuddy Backend

> 服务端 — Node 20 + Fastify 4 + Prisma 5 + PostgreSQL 16 + Redis 7  
> 配套：[docs/spec-v0.2.md](../docs/spec-v0.2.md), [docs/api/conventions.md](../docs/api/conventions.md)

## 快速开始

```bash
# 1) 启动依赖（PostgreSQL + Redis）
cd ..
./infra/dev-up.sh          # 用 bash 脚本（仅 PG）
# 或者
docker compose -f infra/docker-compose.yml up -d  # PG + Redis

# 2) 配置环境
cp .env.example .env
# 编辑 .env：填 WX_APPID/WX_SECRET（可选，本地测试可空）

# 3) 安装依赖 + 初始化数据库
pnpm install
pnpm prisma:generate
pnpm prisma:migrate        # 首次会要求命名 migration
pnpm prisma:seed           # 可选：插入 demo 数据

# 4) 启动
pnpm dev                   # http://localhost:3000
```

## 端点

| Method | Path | 用途 |
|--------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/health/ready` | K8s readiness（查 DB + Redis） |
| GET | `/api/activities` | 活动列表（支持分页/筛选/排序） |
| POST | `/api/activities` | 创建活动（需鉴权） |
| GET | `/api/activities/:id` | 活动详情 |
| POST | `/api/activities/:id/signup` | 报名（事务保证） |
| DELETE | `/api/activities/:id/signup` | 取消报名 |
| POST | `/api/auth/wx-login` | 微信登录 |

## 测试

```bash
pnpm test                  # 单元测试
pnpm test:coverage         # 覆盖率报告
pnpm typecheck             # TS 严格类型检查
pnpm lint                  # ESLint
pnpm verify                # typecheck + lint + test
```

## 部署

```bash
docker build -t studybuddy-server:latest .
docker run -p 3000:3000 --env-file .env studybuddy-server:latest
```

或用 `docker compose`（见 `../infra/docker-compose.yml`）。

## 目录

```
server/
├── src/
│   ├── app.ts                  # Fastify 入口
│   ├── routes/
│   │   ├── health.ts           # /api/health, /api/health/ready
│   │   ├── auth.ts             # /api/auth/wx-login
│   │   └── activities.ts       # 活动相关端点
│   └── lib/
│       ├── prisma.ts           # PrismaClient 单例
│       └── redis.ts            # ioredis 单例
├── prisma/
│   ├── schema.prisma           # 数据模型
│   ├── migrations/             # 迁移历史
│   └── seed.ts                 # Demo 数据
├── tests/                      # 单元测试
├── Dockerfile
├── package.json
├── tsconfig.json
└── .env.example
```

## 待办

- [ ] 接入微信内容安全 API（异步过滤）
- [ ] 接入订阅消息推送
- [ ] Cron Worker：活动状态机自动迁移
- [ ] OpenAPI spec 自动生成
- [ ] PostGIS 升级（地理筛选优化）
