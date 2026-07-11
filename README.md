# Pairhub 🎓

> **30 分钟内找到一起去图书馆 / 打球 / 桌游的搭子。**
>
> 微信小程序 · iOS · Android（Web 端 out of scope by design）

Pairhub is the **留学生搭子活动平台** — a GA-ready product (formerly StudyBuddy, renamed 2026-07-11)
that lets overseas students find companions for studying, sports, board games, and online
sessions without leaving the WeChat ecosystem. Server is open; mobile clients are first-party.
**10 业务模块、5 类活动、5 态状态机、Admin 后台、设计系统 v1 全部就位。**

---

## ⚡ 30-second tour

| | |
|---|---|
| **是什么** | 留学生搭子活动平台：找学习搭子、运动搭子、桌游搭子、线上搭子 |
| **目标用户** | 留学硕士/博士生（学业 + 运动 + 桌游 + 社交 全覆盖） |
| **核心流程** | 浏览活动 → 多维筛选 → 一键报名 → 私聊确认 |
| **5 类活动** | 学习（图书馆/咖啡厅）· 运动（羽毛球/篮球/跑步）· 桌游（UNO/狼人杀）· 线上（开黑/原神）· 其他 |
| **当前状态** | **v1.0.1 (Pairhub rebrand 完成, v1.1 启动中)** — server + iOS + Android + 微信小程序 GA-ready |

---

## 🏗 技术栈

| 层 | 选型 | 关键版本 / 备注 |
|----|------|--------------|
| **微信小程序** | 微信原生 + TypeScript + 纯手写 store | WXML / WXSS / TS / Vite-style imports |
| **iOS / Android** | Flutter 3.24 + Dart 3.5 | Riverpod 2 · Dio 5 · GoRouter 14 · Material 3 |
| **服务端** | Node.js 20 + TypeScript 5 | Fastify 4 · Prisma 5 · Zod · Pino |
| **数据库** | PostgreSQL 16 + Redis 7 | 16-alpine / 7-alpine |
| **鉴权** | 多端 openid 合并 | 微信 openid + Apple ID + Google |
| **地图** | Mapbox（Flutter + 小程序 webview，#35 链路） | WGS-84 国际坐标标准 |
| **推送** | 平台原生 | 微信订阅消息 + APNs + FCM |
| **CI / CD** | GitHub Actions | ghcr.io 镜像 + staging auto-deploy |
| **监控** | Sentry + Prometheus + Grafana Cloud | OpenTelemetry traces |

详细选型记录见 [docs/adr/](./docs/adr/)（6 篇 ADR）。

---

## 📁 目录结构

```
Pairhub/
├── docs/                          # 全员可见的文档
│   ├── spec-v0.2.md               # 需求规约 v0.2（CTO 拍板）
│   ├── architecture-v1.0.md       # 架构总览 v1.0（系统图 / 模块 / 部署 / 关键流程）
│   ├── adr/                       # 架构决策记录（6 篇）
│   │   ├── 0001-flutter-for-mobile.md
│   │   ├── 0002-miniprogram-native.md
│   │   ├── 0003-auth-strategy.md
│   │   ├── 0004-state-machine-for-activity.md
│   │   ├── 0005-data-storage-region.md
│   │   ├── 0006-mapbox-for-global.md
│   │   └── README.md
│   ├── api/                       # API 规范
│   │   ├── v1.md                  # 18 endpoints + 数据模型 + 分页
│   │   ├── conventions.md
│   │   └── wechat.md
│   ├── design/                    # 设计系统 v1（已落 tokens + components）
│   │   ├── system-v1.md           # tokens 规范
│   │   ├── components.md          # 7 组件 spec
│   │   ├── admin-glass.md         # 液态玻璃后台视觉
│   │   ├── mockups/               # HTML 原型
│   │   └── screenshots/           # 设计稿截图
│   ├── devops/                    # CI / 部署 / 监控 / Runbook
│   │   ├── mp-audit-config.md
│   │   ├── seed-large-runbook.md
│   │   ├── wechat-mp-source-map.md
│   │   ├── monitoring/            # Sentry / Grafana / Alert rules
│   │   ├── legal/                 # 隐私 / 服务条款
│   │   └── mp-screenshots/
│   ├── ops/                       # 运维 / 监控
│   ├── server/                    # 后端开发文档
│   │   ├── dev-setup.md
│   │   └── api-style.md
│   ├── test/                      # 测试规范
│   │   ├── test-plan-v1.0.md
│   │   ├── ci-matrix.md
│   │   ├── performance-baseline.md
│   │   ├── security-checklist.md
│   │   └── test-cases/            # 用例存档
│   ├── release/                   # 上线 runbook
│   │   ├── android-cn-apk.md
│   │   ├── android-google-play.md
│   │   ├── android-setup.md
│   │   └── ios-metadata.md
│   ├── admin/playbook.md          # 运营后台操作手册
│   ├── marketing/                 # 营销物料（FAQ 中英 / Landing / 分享卡 / 海报）
│   ├── verification/              # 上线验证报告
│   │   ├── mvp-validation.md
│   │   ├── v1.0.1-optimization-report.md
│   │   └── v1.0/                  # v1.0 GA 验证快照（a11y / console / audit）
│   ├── delivery-standards.md      # PR 交付规范
│   └── github-interaction-rules.md  # 跟 Mavis Agent 协作的元规则
│
├── miniprogram/                   # 微信小程序
│   ├── app.{json,ts,wxss}
│   ├── project.config.json
│   ├── api/                       # request 封装 + auth/activity 模块
│   ├── store/                     # 手写 observable store
│   ├── types/                     # TS 类型
│   ├── utils/                     # 工具（含 monitoring.ts 错误边界）
│   ├── components/                # activity-card / empty-state / loading-skeleton / status-pill / glass-card
│   ├── pages/                     # login / index / activity / create / messages / profile
│   ├── scripts/                   # stylelint plugin + source-map 上传脚本
│   └── styles/                    # tokens.wxss（设计 tokens 源头）
│
├── app/                           # Flutter App（iOS + Android）
│   ├── pubspec.yaml               # SDK floor: Dart >=3.4.0, Flutter >=3.24.0
│   ├── lib/
│   │   ├── main.dart
│   │   ├── core/                  # router / network / storage / theme / config
│   │   ├── features/              # auth / activity / profile / map / admin
│   │   ├── shared/                # models (freezed) + widgets + extensions
│   │   └── design_tokens.dart     # Flutter 端 design tokens
│   ├── test/                      # 4 个测试文件 (smoke / mapbox / design tokens / map view)
│   ├── android/  ios/             # 平台原生目录（已 scaffold）
│   └── assets/                    # 包含 .env 占位
│
├── server/                        # 后端 API
│   ├── src/
│   │   ├── server.ts              # Fastify 入口 + 优雅关闭
│   │   ├── lib/                   # prisma, redis, logger, env (zod, lazy-init), errors, app
│   │   ├── plugins/               # auth, cors, error-handler, rate-limit
│   │   └── modules/               # 10 个业务模块
│   │       ├── health/            # /health, /ready（liveness + readiness）
│   │       ├── auth/              # 微信 + Apple + Google 登录 + JWT
│   │       ├── user/              # 用户 CRUD
│   │       ├── activity/          # 活动 CRUD + 5 态状态机 + 地理
│   │       ├── signup/            # 报名（含事务 / 满员 / 取消）
│   │       ├── review/            # 评价（仅参与可评）
│   │       ├── push/              # 设备注册 / 列表 / 注销
│   │       ├── admin/             # 6 端点 + RBAC + PENDING_REVIEW
│   │       ├── monitoring/        # Prometheus + Sentry + alert
│   │       └── analytics/         # funnel / retention / kpis
│   ├── prisma/                    # schema + seed
│   ├── tests/                     # vitest 单测（health.test.ts 需 Redis，CI excluded）
│   ├── Dockerfile                 # 多阶段构建，镜像 < 300 MB
│   ├── scripts/                   # refactor-env 等运维脚本
│   └── package.json               # pnpm 9, Node 20+
│
├── infra/                         # 编排 & 本地脚本
│   ├── dev-up.sh / dev-down.sh
│   ├── docker-compose.yml         # postgres + redis + app
│   └── scripts/                   # 备份 / 巡检 / 运维任务
│
└── .github/
    ├── ISSUE_TEMPLATE/
    ├── PULL_REQUEST_TEMPLATE.md
    ├── CODEOWNERS
    └── workflows/                 # 6 个 CI workflow（其中 1 个 tag-only release）
        ├── backend-ci.yml         # 服务端：lint + typecheck + test + build + Docker size gate
        ├── flutter-ci.yml         # Flutter：analyze + test + build apk + (iOS smoke)
        ├── miniprogram-ci.yml     # 小程序：JSON / TS 结构校验
        ├── miniprogram-stylelint.yml  # 小程序：WXSS lint
        ├── docs-verification.yml  # 文档：报告结构 + verdict 关键词 + 已知 CI workflow 引用
        └── android-release.yml    # tag 触发：AAB + APK 构建（手动 sign）
```

---

## 🚀 快速开始

```bash
# 1. 克隆 + 启动依赖服务
git clone https://github.com/YuanshuoDu/Pairhub.git
cd Pairhub
./infra/dev-up.sh                 # 起 PostgreSQL + Redis

# 2. 后端
cd server
pnpm install
cp .env.example .env              # 填 JWT_SECRET (>=32 chars)
pnpm prisma migrate dev
pnpm dev
# → http://localhost:3000/health

# 3. 微信小程序
#    用微信开发者工具打开 miniprogram/ 目录
#    在 miniprogram/project.private.config.json 配 appid

# 4. Flutter App
cd app
flutter pub get
dart run build_runner build --delete-conflicting-outputs
flutter run -d <ios-simulator>     # 或 android-emulator

# 5. 跑 CI 那一套（开发期本地）
cd server && pnpm lint && pnpm test
cd miniprogram && pnpm lint:wxss
cd app && flutter analyze && flutter test
```

完整 README：[docs/server/dev-setup.md](./docs/server/dev-setup.md)。

---

## 📊 当前状态

- **版本**: v1.0.1 (Pairhub rebrand 完成于 2026-07-11)
- **main HEAD**: `fa04366 chore(rebrand): product rename (full-history rewrite via git-filter-repo)` — 131 个历史 commit 全部重写,所有 SHA 变了,force-push 推送。**80+ 历史 PR 引用全部失效**,团队需要重新 clone + rebase
- **CI**: 6 个 workflow 全部 path-filtered。**Rebrand 后尚未重新跑 CI 验证**,在 v1.1 启动前需要先跑一遍确认 rebrand 没破坏构建
- **最近一次验证**: [docs/verification/v1.0.1-optimization-report.md](./docs/verification/v1.0.1-optimization-report.md) — 0 P0/P1, 0 regressions vs v1.0(验证基于 rebrand 前的代码;rebrand 改动纯改名,预期不引入新问题)
- **下次发布**: v1.1 — 见下方路线图
- **已知问题**: 4 个 hotfix 待处理(详见 [docs/verification/mvp-validation.md](./docs/verification/mvp-validation.md))

---

## 📈 路线图

| 阶段 | 周 | 关键交付 |
|------|----|---------|
| **M1 基础设施** | W1-W4 | ✅ 架构 v1.0 + 6 ADR + API 规范 + 后端脚手架 + 小程序/Flutter 脚手架 + 登录闭环 + 测试体系 + 设计系统 v1 + docs CI |
| **M2 业务闭环** | W5-W8 | ✅ 10 业务模块（auth/user/activity/signup/review/push/admin/monitoring/analytics/content-safety）+ 50 用户内部测试 + v1.0 GA |
| **M3 正式 + 运营** | W9-W12 | ✅ 微信审核 + iOS/Android release pipeline + 运营后台 + 7×24 监控 + v1.0.1 code-quality sweep |
| **v1.1 计划中** | 之后 | 见 [docs/v1.1-roadmap.md](./docs/v1.1-roadmap.md) — 6 个候选 feature(推荐 feed / 同校 boost / 拼车 / i18n / 支付 / 破冰游戏),按 W2 用户访谈结果重排优先级 |

---

## 📚 关键文档速读

### 必读（按顺序）

1. [docs/spec-v0.2.md](./docs/spec-v0.2.md) — 需求 v0.2（4 用户角色 + 5 活动类型 + 状态机 + DoD）
2. [docs/architecture-v1.0.md](./docs/architecture-v1.0.md) — 架构：系统图 + 模块 + 后端分层
3. [docs/adr/](./docs/adr/) — 6 篇关键决策（Flutter / 小程序原生 / 鉴权 / 状态机 / 存储 / Mapbox）

### 按需查阅

- **后端**: [docs/server/dev-setup.md](./docs/server/dev-setup.md) + [docs/api/v1.md](./docs/api/v1.md)
- **小程序**: [miniprogram/](./miniprogram/) + [docs/api/wechat.md](./docs/api/wechat.md)
- **Flutter**: [app/](./app/) + [docs/design/system-v1.md](./docs/design/system-v1.md)
- **API 端点**: [docs/api/v1.md](./docs/api/v1.md)（18 个 endpoint 的数据契约）
- **数据模型**: [docs/architecture-v1.0.md §3](./docs/architecture-v1.0.md)

### 流程规范

- [docs/delivery-standards.md](./docs/delivery-standards.md) — 每个 PR 必须附的证据（截图 / 日志 / 链接）
- [docs/test/test-plan-v1.0.md](./docs/test/test-plan-v1.0.md) — 测试计划
- [docs/devops/](./docs/devops/) — CI / 部署 / 监控 / Runbook

---

## 🤝 贡献

仓库**唯一**的代码改动路径是 **PR + Review + 证据** 流程。

```bash
# 1. Fork + 克隆
git clone https://github.com/YuanshuoDu/Pairhub.git
cd Pairhub

# 2. 创建功能分支
git checkout -b feat/<your-feature>

# 3. 写代码 + 本地验证（lint / test / build）
#    验证项见 docs/devops/ci-matrix.md

# 4. 提交 + 推送到 fork
git commit -m "feat(<scope>): <what you did>"
git push origin feat/<your-feature>

# 5. 开 PR
gh pr create --base main --head feat/<your-feature>

# 6. PR 描述需包含 3 件事（见 docs/delivery-standards.md §2）：
#    - 改了什么
#    - 怎么验证的（截图 / 日志 / 链接）
#    - 关联的 issue
```

**PR 标题规范**：`[<scope>] <description>`，scope 例：
- `[server]` `[flutter]` `[miniprogram]` `[docs]` `[devops]` `[design]`

---

## 🛡 安全 & 合规

- 所有 PR 通过 `CODEOWNERS` 强制 review
- 鉴权：JWT (HS256, 7d) + refresh token
- 速率限制：Redis global 100/min, login 10/min
- 数据安全：UGC 内容走微信内容安全 API
- 数据加密：传输 HTTPS
- 依赖审计：CI 自动 `pnpm audit`
- GDPR / 数据合规：用户数据导出 + 删除 API（v1.1）

详见 [docs/test/security-checklist.md](./docs/test/security-checklist.md)。

---

## 📜 License

Private / All Rights Reserved.

---

> 最后更新：2026-07-11 (Pairhub rebrand + 文档同步) · 维护者 [@YuanshuoDu](https://github.com/YuanshuoDu)
