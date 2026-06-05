# Pairhub 🎒

> **让留学生 30 秒内找到一个能一起去图书馆 / 打球 / 开黑的搭子。**

微信小程序 · iOS · Android（Web 套壳）· 三端共用后端

---

## ⚡ 30 秒了解 Pairhub

| | |
|---|---|
| **解决什么** | 留学生找搭子难：想自习找不到人、想打球凑不齐队、想开黑差一个辅助 |
| **谁在用** | 海外留学的硕博新生（学业型 / 运动型 / 娱乐型 / 社交型） |
| **怎么做** | 创建活动 → 浏览筛选 → 一键报名 → 私聊集合 |
| **5 类活动** | 自习（图书馆 / 咖啡厅 / 讨论室）· 运动（羽毛球 / 网球 / 跑步 / 篮球 / 足球）· 桌游（三国杀 / 狼人杀 / UNO）· 开黑（王者 / 原神 / LOL）· 其他 |
| **目标** | 12 周内交付**微信小程序 + iOS + Android** 三端 MVP |

---

## 🧱 技术栈

| 层 | 选型 | 关键库 / 版本 |
|----|------|--------------|
| **微信小程序** | 微信原生 + TypeScript + 自写 store | WXML / WXSS / TS / Vite |
| **iOS / Android** | Flutter 3.24 + Dart 3.5 | Riverpod 2 · Dio 5 · GoRouter 14 · Material 3 |
| **后端** | Node.js 20 + TypeScript 5 | Fastify 4 · Prisma 5 · zod · pino |
| **数据库** | PostgreSQL 16 + Redis 7 | 16-alpine / 7-alpine |
| **鉴权** | 三端 openid 合并 | 微信 openid + Apple ID + Google |
| **地图** | 腾讯地图 SDK | 三端一致 |
| **推送** | 平台原生 | 微信订阅消息 + APNs + FCM |
| **CI / CD** | GitHub Actions | ghcr.io 镜像 + staging auto-deploy |
| **监控** | Sentry + Prometheus + Grafana Cloud | OpenTelemetry traces |

> 详细技术选型与理由见 [docs/adr/](./docs/adr/)（5 篇 ADR）。

---

## 📂 目录结构

```
pairhub/
├── docs/                          # 全员可见的文档
│   ├── spec-v0.1.md               # 需求规格 v0.1
│   ├── architecture-v1.0.md       # 架构设计 v1.0（系统图 / 模块 / 数据模型 / 关键流程）
│   ├── adr/                       # 架构决策记录（5 篇）
│   │   ├── 0001-flutter-for-mobile.md
│   │   ├── 0002-miniprogram-native.md
│   │   ├── 0003-auth-strategy.md
│   │   ├── 0004-state-machine-for-activity.md
│   │   ├── 0005-data-storage-region.md
│   │   └── README.md
│   ├── api/
│   │   ├── v1.md                  # API 规范 v1（18 endpoint + 错误码 + 分页）
│   │   ├── conventions.md
│   │   └── wechat.md
│   ├── design/                    # 设计系统（v1 进行中）
│   ├── devops/                    # CI / 部署 / 监控 / Runbook
│   ├── server/                    # 后端开发文档
│   │   ├── dev-setup.md
│   │   └── api-style.md
│   ├── test/
│   │   ├── test-plan-v1.0.md      # 测试计划 v1.0
│   │   ├── ci-matrix.md           # CI 矩阵
│   │   ├── performance-baseline.md
│   │   ├── security-checklist.md
│   │   └── test-cases/            # 用例库种子
│   └── delivery-standards.md      # 交付评审规范（证据要求）
│
├── miniprogram/                   # 微信小程序
│   ├── app.{json,ts,wxss}
│   ├── project.config.json
│   ├── api/                       # request 封装 + auth/activity 模块
│   ├── store/                     # 自写 observable store
│   ├── types/                     # TS 类型
│   ├── utils/
│   ├── components/                # activity-card / empty-state / loading-skeleton
│   ├── custom-tabbar/             # 5-tab TabBar
│   ├── pages/                     # login / index / activity / create / messages / profile
│   └── images/
│
├── app/                           # Flutter App（iOS + Android）
│   ├── pubspec.yaml               # riverpod, dio, go_router, sign_in_with_apple, google_sign_in, freezed
│   ├── lib/
│   │   ├── main.dart
│   │   ├── core/                  # router / network / storage / theme / auth
│   │   ├── features/              # auth / activity / profile
│   │   └── shared/                # models (freezed) + widgets + extensions
│   ├── assets/
│   ├── ios/  android/             # 平台原生配置
│   └── analysis_options.yaml
│
├── server/                        # 后端 API
│   ├── src/
│   │   ├── server.ts              # Fastify 入口 + 优雅关闭
│   │   ├── lib/                   # prisma, redis, logger, env (zod), errors, app
│   │   ├── plugins/               # auth, cors, error-handler, rate-limit
│   │   ├── modules/
│   │   │   └── health/            # /health, /ready（liveness + readiness）
│   │   ├── modules/auth/          # （M2）微信 + Apple + Google 登录
│   │   ├── modules/user/          # （M2）用户 CRUD
│   │   ├── modules/activity/      # （M2）活动 CRUD + 状态机
│   │   └── modules/signup/        # （M2）报名
│   ├── prisma/
│   │   ├── schema.prisma          # User / Activity / Signup / Review
│   │   └── seed.ts
│   ├── tests/                     # vitest
│   ├── Dockerfile                 # 多阶段构建，< 300MB
│   └── package.json               # pnpm 9, Node 20+
│
├── infra/                         # 部署 & 本地脚本
│   ├── dev-up.sh / dev-down.sh
│   ├── docker-compose.yml         # postgres + redis + app
│   └── scripts/                   # 部署 / 备份 / 健康检查
│
└── .github/
    ├── ISSUE_TEMPLATE/
    ├── PULL_REQUEST_TEMPLATE.md
    ├── CODEOWNERS
    └── workflows/                 # 5 个 CI workflow
        ├── ci.yml                 # 顶层编排
        ├── backend-ci.yml         # 后端：lint + test + build + Docker size gate
        ├── miniprogram-ci.yml     # 小程序：tsc + miniprogram-ci preview
        ├── flutter-ci.yml         # Flutter：analyze + test + build apk
        └── docs-ci.yml            # 文档：链接检查 + 拼写
```

---

## 🚀 快速开始

```bash
# 1. 克隆 + 启动本地依赖
git clone https://github.com/YuanshuoDu/pairhub.git
cd pairhub
./infra/dev-up.sh                 # 启 PostgreSQL + Redis

# 2. 后端
cd server && pnpm install
cp .env.example .env              # 填 JWT_SECRET (≥32 chars)
pnpm prisma migrate dev
pnpm dev
# → http://localhost:3000/health

# 3. 微信小程序
#    用微信开发者工具打开 miniprogram/ 目录
#    填入 miniprogram/project.private.config.json 的 appid

# 4. Flutter App
cd app && flutter pub get
dart run build_runner build --delete-conflicting-outputs
flutter run -d <ios-simulator>    # 或 android-emulator
```

详见 [docs/server/dev-setup.md](./docs/server/dev-setup.md) 与各端 README。

---

## 🗓️ Roadmap（12 周三端 MVP）

| 阶段 | 周 | 关键交付 |
|------|----|---------|
| **M1 基础建设** | W1-W4 | ✅ 架构 v1.0 + 5 ADR + API 规范 v1 · ✅ 后端脚手架 · ✅ 小程序脚手架 · ✅ Flutter 脚手架 · ✅ 测试计划 v1.0 · ✅ CI 矩阵 · ✅ DevOps 基础 · ⏳ 设计系统 v1 |
| **M2 核心闭环 + 内测** | W5-W8 | 业务 API（auth/user/activity/signup）+ 三端核心流程 + 性能优化 + 50 人种子内测 |
| **M3 发布 + 运营** | W9-W12 | 微信审核 + iOS 审核 + Android 分发 + 运营后台 + 7×24 监控 + 数据复盘 |

**当前进度**：M1-W1 收尾中（5 个 PR 待合并），W2 开始实现 M2 业务。

---

## 📚 关键文档导航

### 入门必读（按顺序）

1. [docs/spec-v0.1.md](./docs/spec-v0.1.md) — 需求规格（4 用户画像 + 5 活动类型 + 核心流程）
2. [docs/architecture-v1.0.md](./docs/architecture-v1.0.md) — 架构（系统图 + 数据模型 + 跨端策略）
3. [docs/adr/README.md](./docs/adr/) — 5 个关键决策（Flutter / 小程序原生 / 鉴权 / 状态机 / 存储）

### 开发必查

- 后端：[docs/server/dev-setup.md](./docs/server/dev-setup.md) + [docs/api/v1.md](./docs/api/v1.md)
- 小程序：[miniprogram/](./miniprogram/) + [docs/api/wechat.md](./docs/api/wechat.md)
- Flutter：[app/](./app/) + 即将补充的 [docs/flutter/](./docs/flutter/)
- API 端点：[docs/api/v1.md](./docs/api/v1.md)（18 个 endpoint 完整规范）
- 数据模型：[docs/architecture-v1.0.md#数据模型](./docs/architecture-v1.0.md) § 数据模型

### 流程规范

- [docs/delivery-standards.md](./docs/delivery-standards.md) — **每个 PR 必须附证据**（截图 + 日志 + 链接）
- [docs/test/test-plan-v1.0.md](./docs/test/test-plan-v1.0.md) — 测试策略
- [docs/devops/](./docs/devops/) — CI / 部署 / 监控 / Runbook

---

## 🤝 贡献

仓库是**唯一**代码源，所有改动必须走 **PR + Review + 证据**流程。

```bash
# 1. Fork + 克隆
git clone https://github.com/YuanshuoDu/pairhub.git
cd pairhub

# 2. 创建功能分支
git checkout -b feat/<your-feature>

# 3. 写代码 + 本地验证（lint / test / build）
# 各端验证命令见 docs/devops/ci-matrix.md

# 4. 提交 + 推送到你的 fork
git commit -m "feat(<scope>): <what you did>"
git push origin feat/<your-feature>

# 5. 开 PR
gh pr create --base main --head feat/<your-feature>

# 6. PR 描述必须包含（按 docs/delivery-standards.md §2）：
#    - 改了什么
#    - 怎么验证的（截图 / 日志 / 链接）
#    - 关联的 issue
```

**PR 标题规范**：`[<scope>] <description>`，例：
- `[server] Activity CRUD API`
- `[flutter] Login page UI`
- `[miniprogram] Signup flow`
- `[docs] Update architecture`
- `[devops] Add Sentry`
- `[design] Component library`

---

## 🔒 安全 & 合规

- 所有 PR 走 `CODEOWNERS` 强制 review
- 鉴权：JWT + 刷新 token + 撤销
- 限流：基于 Redis（global 100/min, login 10/min）
- 内容安全：UGC 接入微信内容安全 API
- 数据加密：传输 HTTPS，敏感字段加密
- 第三方依赖：CI 自动 `pnpm audit`
- GDPR / 数据合规：用户数据导出 + 删除 API（v1.1）

详见 [docs/test/security-checklist.md](./docs/test/security-checklist.md)。

---

## 📊 当前 PR 状态

打开的 PR（待 review + 合并）：

| # | 范围 | 状态 |
|---|------|------|
| #10 | 测试计划 v1.0 | 验证中 |
| #12 | 架构 v1.0 + 5 ADR + API 规范 | 待 review |
| #13 | 后端脚手架 | 待 review |
| #14 | Flutter 脚手架 | 待 review |
| #15 | 微信小程序脚手架 | 待 review |
| #16 | README 清理（本 PR） | 待 review |

---

## 📄 License

Private / All Rights Reserved.

---

> 最后更新：2026-06-05 · 由 [Oracle Hermes](https://github.com/oracle) 维护
