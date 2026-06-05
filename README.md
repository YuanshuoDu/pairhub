# StudyBuddy 🎒

> 留学生搭子活动平台 — 找自习室、约球、组局、开黑

**主端**：微信小程序 · iOS · Android（Web 套壳）
**后端**：Node.js + TypeScript + Fastify + Prisma + PostgreSQL
**Repo 规约**：本仓库是**唯一**代码仓库，所有改动必须走 PR + Review

> ⚠️ **交付铁律**：每个 PR / 每条进度都必须附**证据**（截图 + 日志 + 链接）。详见 [docs/delivery-standards.md](./docs/delivery-standards.md)

---

## 🧱 技术栈

| 层 | 选型 |
|----|------|
| 微信小程序 | 微信原生（WXML / WXSS / TypeScript）+ 自写 store + Vite |
| iOS / Android | Flutter 3.24（Dart）+ Riverpod + Dio + GoRouter + Material 3 |
| 后端 | Node.js 20 + TypeScript + Fastify 4 + Prisma 5 |
| 数据库 | PostgreSQL 16 + Redis 7 |
| 鉴权 | 微信 openid（小程序）+ Apple ID（iOS）+ Google（Android） |
| 地图 | 腾讯地图 SDK（三端一致） |
| 推送 | 微信订阅消息 + APNs + FCM |
| CI / CD | GitHub Actions + GitHub Container Registry（ghcr.io） |
| 监控 | Sentry + Prometheus + Grafana Cloud |

---

## 🎯 目标

**12 周内交付微信小程序 + iOS + Android（Web 套壳）三端 MVP**

- M1（Week 1-4）：基础建设 — 架构、文档、脚手架
- M2（Week 5-8）：核心闭环 + 50 人内测
- M3（Week 9-12）：发布 + 运营

---

## 📂 目录

```
studybuddy/
├── docs/                  # 需求、架构、API、设计、测试
│   ├── spec-v0.1.md       # 需求规格
│   ├── architecture-v1.0.md   # 架构设计
│   ├── adr/               # 架构决策记录
│   ├── api/               # API 规范
│   ├── design/            # 设计系统
│   ├── devops/            # 部署 / 监控
│   ├── server/            # 后端开发文档
│   ├── miniprogram/       # 小程序开发文档（待补）
│   ├── flutter/           # Flutter 开发文档（待补）
│   └── test/              # 测试计划
├── miniprogram/           # 微信小程序（5 页面 + TabBar + 3 组件 + API 封装）
├── app/                   # Flutter App（iOS + Android）
├── server/                # 后端 API（Fastify + Prisma + 健康检查 + 限流 + 鉴权）
├── infra/                 # 部署 & 本地脚本
│   ├── dev-up.sh / dev-down.sh
│   ├── docker-compose.yml
│   └── scripts/
└── .github/
    ├── ISSUE_TEMPLATE/
    ├── PULL_REQUEST_TEMPLATE.md
    ├── CODEOWNERS
    └── workflows/         # 5 个 CI workflow（顶层 + 4 端）
```

---

## 🚀 快速开始

```bash
# 克隆
git clone https://github.com/YuanshuoDu/studybuddy.git
cd studybuddy

# 启动本地依赖（PostgreSQL + Redis）
./infra/dev-up.sh

# 后端
cd server && pnpm install && pnpm dev
# → http://localhost:3000/health

# 微信小程序：用微信开发者工具打开 miniprogram/
# Flutter App：cd app && flutter pub get && flutter run
```

详见各子目录的 README 与 `docs/devops/dev-setup.md`。

---

## 📌 当前状态

- **里程碑**：M1-Week1（立项 + 需求 + 脚手架）— 收尾中
- **目标**：12 周三端 MVP

---

## 📚 关键文档

| 文档 | 内容 |
|------|------|
| [docs/spec-v0.1.md](./docs/spec-v0.1.md) | 需求规格 v0.1（4 用户画像 + 5 活动类型） |
| [docs/architecture-v1.0.md](./docs/architecture-v1.0.md) | 架构 v1.0（三端 + 数据模型 + 关键流程） |
| [docs/adr/](./docs/adr/) | 5 篇架构决策记录（Flutter / 小程序原生 / 鉴权 / 状态机 / 存储） |
| [docs/api/v1.md](./docs/api/v1.md) | API 规范 v1（18 endpoint） |
| [docs/test/test-plan-v1.0.md](./docs/test/test-plan-v1.0.md) | 测试计划 v1.0 |
| [docs/devops/](./docs/devops/) | CI / 部署 / 监控 / Runbook |
| [docs/delivery-standards.md](./docs/delivery-standards.md) | 交付评审规范（证据要求） |

---

## 📄 License

Private / All Rights Reserved.
