# StudyBuddy — 测试计划 v1.0

> **状态**：v1.0（已与 CTO 路线图对齐）
> **作者**：@OpenClaw（高级测试工程师 / QA Engineer）
> **生效日期**：2026-06-05
> **目标读者**：架构 / 后端 / 小程序 / Flutter / DevOps / CTO
> **关联文档**：
> - 需求：[`docs/spec-v0.2.md`](../spec-v0.2.md)
> - 架构：[`docs/architecture.md`](../architecture.md)
> - API 规范：[`docs/api/conventions.md`](../api/conventions.md)、[`docs/api/v1.md`](../api/v1.md)
> - 交付证据要求：[`docs/delivery-standards.md`](../delivery-standards.md) §2.3
> - 路线图：[`studybuddy-plan/cto-roadmap-v1.0.md`](../../studybuddy-plan/cto-roadmap-v1.0.md) §4.5
> **关联 Issue**：[#7](https://github.com/YuanshuoDu/studybuddy/issues/7) MVP 测试计划 v0.1（v0.1 已合并到本 v1.0）

---

## 0. 文档目的

本计划定义 StudyBuddy（小程序 + Flutter iOS/Android + 后端 Fastify）三端 MVP 的**测试策略、覆盖目标、工具栈、用例库结构、缺陷管理流程、用例模板**，作为 W1 起所有 PR / 验收 / 发布的质量基线。

任何与本计划不一致的做法都必须**先更新本文件再写代码**，避免后期返工。

---

## 1. 测试策略

| 层级 | 目的 | 速度 | 覆盖范围 | 触发时机 | 失败时影响 |
|------|------|------|----------|----------|------------|
| **单元测试** | 验证函数/类/方法正确性 | < 1s/case | 业务逻辑、纯函数、util | 每次 commit / PR | 卡 PR |
| **集成测试** | 验证模块协作（DB、Redis、外部 SDK 包装层） | < 5s/case | API endpoint、事务、缓存、限流 | PR 套件 + main 推送 | 卡 PR / 卡 main |
| **E2E（端到端）** | 验证用户关键旅程跨端闭环 | < 60s/journey | 登录 → 创建/报名/退出、消息、评价 | tag 触发 / 灰度前 | 卡发布 |
| **性能测试** | 验证响应延迟、启动速度、帧率 | k6 / Lighthouse / 自研 | API P50/P95/P99、App 冷热启动、列表 FPS、地图渲染 | tag 触发 + 每周回归 | 卡发布 / 触发性能告警 |
| **安全测试** | 验证 OWASP Top 10 防御 + 隐私合规 | OWASP ZAP / 人工 review | 注入、XSS、CSRF、鉴权、数据脱敏、UGC 审核 | tag 触发 + 每次重大改动 | 卡发布 / 触发 P0 |
| **兼容性测试** | 验证多端/多 OS 体验 | 真机/云真机 | iOS 15+/Android 8+/微信 8.0+ | 内测周 | 灰度前修复 P1 |
| **可访问性测试（a11y）** | 验证色弱/无障碍 | axe-core / 人工 | 色彩对比、屏幕阅读器、动态字体 | 内测周 | 灰度前修复 P2 |

**核心原则**：
- **Test the risk, not the code.** 把测试预算花在"出问题用户会骂街"的路径上（报名事务、状态机、限流），不要给 getter 凑覆盖率。
- **Independent re-derivation.** 测试断言由 QA 独立写，**禁止直接复制实现方的 expected 值**。
- **Stable, fast, deterministic.** 不用 `setTimeout` 等待，mock 时钟；不依赖真实网络，用 nock / wiremock；DB 用 transactional rollback。
- **Pyramid discipline.** 70% 单元 + 20% 集成 + 10% E2E（详见 §3）。

---

## 2. 测试覆盖目标（量化）

### 2.1 后端（Node.js + Fastify + Prisma）

| 指标 | 目标 | 度量方式 | 阻断门槛 |
|------|------|----------|----------|
| 行覆盖率 | **≥ 80%** | `vitest run --coverage`（c8/istanbul） | < 80% 阻断 PR |
| 分支覆盖率 | ≥ 70% | 同上 | < 70% 阻断 PR |
| 关键路径函数覆盖 | **100%** | 手工标注 `// @critical` 后统计 | < 100% 阻断 PR |
| 关键路径 | 报名事务、登录态、状态机迁移、内容安全、限流、GDPR 删除/导出 | 代码 review 标注 + 单测 | 任一缺失阻断 PR |
| API endpoint | 每个 endpoint 至少 3 个用例：成功 / 参数错误 / 权限不足 | `tests/modules/<m>/<ep>.test.ts` | 缺失阻断 PR |
| 错误码覆盖 | RFC 7807 全 4xx/5xx 至少 1 个测试 | 自动化 | 缺失阻断 PR |

**"关键路径"白名单**（任何 PR 改动以下文件必须附带新测试）：
- `src/modules/auth/*`（登录、JWT 刷新、撤销）
- `src/modules/activity/state-machine.ts`（状态迁移）
- `src/modules/signup/transaction.ts`（报名/退出事务）
- `src/modules/message/push.ts`（推送）
- `src/plugins/rate-limit.ts`（限流）
- `src/plugins/wechat-content-security.ts`（UGC 审核）
- `src/modules/user/gdpr.ts`（数据导出/删除）

### 2.2 微信小程序

| 指标 | 目标 | 度量方式 | 阻断门槛 |
|------|------|----------|----------|
| 核心流程 E2E | **100%** | miniprogram-automator 跑通 | < 100% 阻断发布 |
| 核心流程定义 | 登录、创建活动、列表筛选、详情、报名、退出、消息接收、评价 | 见 [`docs/test/test-cases/`](./) | 缺失阻断 PR |
| 页面渲染回归 | 100% 一级页面（首页/详情/创建/个人/登录） | UI 截图 diff | 差异 > 5% 阻断 PR |
| 网络异常分支 | 100% 覆盖（断网、token 过期、502/503） | mock 注入 | 缺失阻断 PR |
| 行覆盖率（业务代码） | ≥ 60% | jest --coverage | < 60% 阻断 PR |
| 提审前烟测 | 真机 30 个步骤全过 | 人工 + 录屏 | 任一失败阻断提审 |

### 2.3 Flutter（iOS + Android）

| 指标 | 目标 | 度量方式 | 阻断门槛 |
|------|------|----------|----------|
| 核心流程单元测试 | **100%** 覆盖 domain layer + state notifier | `flutter test --coverage` | < 100% 阻断 PR |
| 关键 E2E | 登录、创建、列表、报名、退出、消息、评价 | `integration_test` 跑通 | 任一失败阻断发布 |
| 平台分支 | 100% 关键代码走通 iOS+Android | 真机/CI 模拟器矩阵 | 任一平台失败阻断发布 |
| 性能 | 冷启动 < 2s / 热启动 < 500ms / 列表 60fps | 自动埋点 + 人工 | 超阈值阻断发布 |

---

## 3. 测试金字塔

```
                  ┌──────────────┐
                  │   E2E (10%)  │   用户旅程：miniprogram-automator / integration_test
                  │  慢 / 脆 / 贵 │   频率：tag 触发 + 内测
                  ├──────────────┤
                  │ 集成 (20%)   │   API endpoint + 事务 + 缓存
                  │  中速 / 真 DB │   频率：PR 套件 + main
                  ├──────────────┤
                  │  单元 (70%)  │   函数 / 类 / state notifier
                  │  快 / 多 / 纯 │   频率：每次 commit
                  └──────────────┘
```

**预算分配**（每个新 feature 投入 1 单位测试时间）：
- 0.7 单位：单元测试
- 0.2 单位：集成测试（包含 1-2 个 endpoint 覆盖）
- 0.1 单位：E2E（仅当涉及核心旅程）

**反例禁止**：
- ❌ 给 getter / setter 写 5 个单测凑覆盖率
- ❌ 跳过单元测试只写 E2E
- ❌ E2E 测实现细节（某个 internal state 值）

---

## 4. 工具栈

### 4.1 后端（`server/`）

| 用途 | 工具 | 选型理由 |
|------|------|----------|
| 单元 / 集成测试 | **vitest 1.x** | 与 Vite 同源，启动 < 1s，原生支持 TS、ESM、watch |
| HTTP 断言 | **supertest** | 直接注入到 Fastify `inject()` 之外的完整 HTTP 栈 |
| Mock 外部 HTTP | **nock** | 拦截 `https` 请求，模拟微信 API、地图 API |
| Mock DB | **prisma-mock** 或真实 PG + transactional rollback | 报名事务必须用真 PG，单测可用 mock |
| 覆盖率 | **@vitest/coverage-v8** | 速度优于 istanbul |
| Mock Redis | **ioredis-mock** | 限流测试 |
| 性能（k6） | **k6** cloud run 或 self-hosted | PR 阶段不跑，tag 触发 |
| 安全扫描 | **OWASP ZAP baseline** + `pnpm audit` | 详见 [`security-checklist.md`](./security-checklist.md) |
| 桩 / 工厂 | 自研 `tests/factories/*.ts` | faker.js 生成用户 / 活动 |

**安装命令**（由后端 track 执行）：
```bash
pnpm add -D vitest @vitest/coverage-v8 supertest nock @types/supertest @types/nock prisma-mock ioredis-mock @faker-js/faker
```

**运行命令**：
```bash
pnpm test                # 单元 + 集成（默认）
pnpm test:unit           # 仅单元
pnpm test:integration    # 需 docker compose up postgres redis
pnpm test:coverage       # 覆盖率
pnpm test:watch          # watch 模式
```

### 4.2 微信小程序（`miniprogram/`）

| 用途 | 工具 | 选型理由 |
|------|------|----------|
| 单元 / 集成测试 | **jest 29 + @types/jest** | 小程序官方推荐 |
| 模拟器驱动 | **miniprogram-automator** | 微信官方，可跑真实小程序 |
| E2E 框架 | **miniprogram-automator + jest-circus** | 官方 E2E |
| 截图 diff | **jest-image-snapshot** | UI 回归 |
| Mock 网络 | **miniprogram-api-mock** 或自研 | 拦截 wx.request |

**运行命令**：
```bash
pnpm test                # jest 单元
pnpm test:e2e            # automator 跑真机
pnpm test:visual         # 截图回归
```

### 4.3 Flutter（`app/`）

| 用途 | 工具 | 选型理由 |
|------|------|----------|
| 单元 / Widget 测试 | **flutter test** | 官方 |
| E2E | **integration_test**（官方包） | 跑真机 / 模拟器 |
| Mock | **mocktail** | 不依赖代码生成，类型安全 |
| Golden（UI 截图） | flutter test --update-goldens | 跨设备回归 |
| 性能 | **flutter run --profile** + DevTools timeline | 帧率 / 启动时间 |

**运行命令**：
```bash
flutter test                              # 单元 + Widget
flutter test --coverage                   # 覆盖率
flutter test integration_test/            # E2E
flutter run --profile                     # 性能 trace
```

---

## 5. 测试用例库结构

按业务模块组织，每模块一个目录，目录内每个特性一个 markdown：

```
docs/test/test-cases/
├── README.md                    # 本文件索引
├── _template.md                 # 用例模板（参考 §7）
├── auth/
│   ├── login.test.md            # 微信登录 / Apple / Google
│   ├── refresh-token.test.md    # 刷新 token
│   └── revoke.test.md           # 撤销 token
├── activity/
│   ├── create.test.md
│   ├── list.test.md
│   ├── detail.test.md
│   ├── update.test.md
│   └── cancel.test.md
├── signup/
│   ├── signup.test.md           # 报名
│   ├── cancel.test.md           # 退出
│   └── list.test.md             # 活动参与者
├── user/
│   ├── profile.test.md
│   ├── update.test.md
│   ├── export.test.md           # GDPR 导出
│   └── delete.test.md           # GDPR 删除
├── message/
│   ├── send.test.md             # 群消息
│   └── push.test.md             # 推送触达
├── review/
│   ├── create.test.md
│   └── rate.test.md
├── safety/
│   ├── ugc-audit.test.md        # 微信内容安全
│   └── rate-limit.test.md       # 防刷
└── regression/
    └── smoke.test.md            # 提审前烟测
```

**命名规范**：
- `<module>/<feature>.test.md`（小写 + 连字符）
- 每个 .md 至少 5 个用例（M1 出口标准）
- 编号 `T-<MODULE>-<NUMBER>`，全局唯一（用 `pnpm test:list-cases` 自动校验）

---

## 6. 缺陷管理

### 6.1 Severity 等级

| 等级 | 含义 | 例子 | 修复 SLA | Owner |
|------|------|------|----------|-------|
| **P0** | 核心流程完全不可用；数据丢失/泄漏/损坏；安全漏洞 | 登录失败、报名事务死锁、JWT secret 泄漏、SQL 注入 | **24 小时**响应 + 修复 | 后端主程 + CTO |
| **P1** | 核心流程降级；影响 > 20% 用户；无降级方案 | 列表加载慢 3 倍、推送延迟 > 5min、地图选点崩溃（iOS 17） | **72 小时** | 端负责人 |
| **P2** | 非核心功能不可用；影响 < 20% 用户 | 个人主页头像不显示、深色模式色错、消息分页错乱 | **1 周** | 端负责人 |
| **P3** | 文案错别字、UI 微调、轻微体验问题 | 按钮文案、间距 2px 偏差、emoji 渲染 | **2 周**（可与下迭代合并） | PR 阶段随手修 |

**提单模板**（Issue title 格式）：
```
[BUG][P1][miniprogram] 列表页下拉刷新后白屏
```

**必填字段**（Issue body）：
1. **复现步骤**（精确到点击序列、输入数据、App 版本）
2. **期望 vs 实际**（截图 / 录屏 / 日志）
3. **环境**（设备、OS 版本、构建号、commit SHA）
4. **影响范围**（受影响用户占比、是否所有用户）
5. **建议修复方向**（可选）

### 6.2 Bug 流转

```
Triage(24h) → Assigned → In Progress → Code Review → QA Verify → Closed
                              ↓
                       Won't Fix (CTO 拍板) → 文档化
```

- 任何 P0/P1 必须**当日进 WIP**，不允许停留在 Triage > 24h。
- 修完后必须附**回归测试**（单测 + E2E 至少 1 个）+ 截图。

### 6.3 Bug 看板

GitHub Project `StudyBuddy Kanban`：
- `Triage` — 等待评估 severity
- `P0-WIP` / `P1-WIP` / `P2-WIP` / `P3-Backlog` — 按等级分列
- `In Review`
- `QA Verify`
- `Closed` / `Won't Fix`

---

## 7. 测试用例模板

每个 `.test.md` 必须遵循以下结构。完整示例见 [`test-cases/_template.md`](./test-cases/_template.md) 与 [`auth/login.test.md`](./test-cases/auth/login.test.md)。

```markdown
# T-AUTH-LOGIN — 登录

> **模块**：auth / login
> **关联**：API `POST /api/auth/wechat`、`POST /api/auth/apple`、`POST /api/auth/google`
> **维护**：@OpenClaw

## TC-AUTH-LOGIN-001  微信 code 换 openid 成功
- **优先级**：P0
- **前置条件**：
  - 微信 AppID/Secret 已配置（`WECHAT_APPID` / `WECHAT_SECRET`）
  - 测试用户 `test-user-001` 未注册
- **步骤**：
  1. 调用 `POST /api/auth/wechat` body `{ code: "valid_code_001" }`
  2. 断言响应
- **预期**：
  - HTTP 200
  - 响应 body `{ accessToken, refreshToken, user: { id, openid, isNew: true } }`
  - DB `User` 表新增 1 条记录
- **实际**：<执行时填>
- **备注**：
  - 用 nock 拦截 `https://api.weixin.qq.com/sns/jscode2session`
  - 跑通后归档截图到 `docs/screenshots/issue-7/`

---

## TC-AUTH-LOGIN-002  ...
```

**字段说明**：
- **前置条件**：环境、数据、依赖服务的状态
- **步骤**：可重复执行的操作序列（按编号）
- **预期**：明确断言（HTTP 状态、DB 状态、UI 状态、副作用）
- **实际**：执行后填写（CI 自动跑时由脚本写入）
- **备注**：测试数据、工具命令、依赖版本、已知边界

---

## 8. 与交付规范的衔接

| 交付规范要求 | 本计划的对应 |
|--------------|-------------|
| §2.1 后端 API 改动：本机 `pnpm test` 全绿 | §4.1 命令 + §2.1 覆盖目标 |
| §2.1 至少 1 个新/改 endpoint 真实请求截图 | §6.2 修完附 curl 截图 |
| §2.2 小程序 UI 改动：真机预览截图 | §4.2 miniprogram-automator 自动截图 |
| §2.3 文档输出：GitHub 渲染截图 | 本 PR 已附 |
| §2.3 内部链接全部可点 | §0 关联文档全部用相对路径 |
| §2.3 目录树截图 | 本 PR 已附 |
| §5 截图归档到 `docs/screenshots/issue-<id>/` | 本 PR 在 `docs/screenshots/issue-7/` |

---

## 9. 退出标准（M1 出口）

W4 末必须达成：

- [ ] 后端 90% endpoint 有自动化测试（行覆盖 ≥ 80%）
- [ ] CI 全绿（lint + test + build）
- [ ] 核心旅程 E2E：小程序 + Flutter 各 5 个用例跑通
- [ ] 性能基线 API P95 < 300ms（详见 [`performance-baseline.md`](./performance-baseline.md)）
- [ ] 缺陷看板无未关闭 P0
- [ ] 性能 / 安全清单文档评审通过（详见 [security-checklist.md](./security-checklist.md)）

---

## 10. 引用清单

- [`docs/spec-v0.2.md`](../spec-v0.2.md) — 需求规格
- [`docs/architecture.md`](../architecture.md) — 5 层架构图
- [`docs/api/conventions.md`](../api/conventions.md) — RESTful API 约定
- [`docs/api/v1.md`](../api/v1.md) — API v1 规范（由架构 track 输出）
- [`docs/delivery-standards.md`](../delivery-standards.md) — 交付证据要求
- [`docs/test/ci-matrix.md`](./ci-matrix.md) — CI 矩阵（PR / main / tag）
- [`docs/test/performance-baseline.md`](./performance-baseline.md) — 性能基线
- [`docs/test/security-checklist.md`](./security-checklist.md) — 安全清单
- [`studybuddy-plan/cto-roadmap-v1.0.md`](../../studybuddy-plan/cto-roadmap-v1.0.md) — CTO 路线图 §4.5
- Issue #7 — MVP 测试计划 v0.1（已合入本 v1.0）
- Issue #21 — API 自动化测试覆盖 ≥ 80%
- Issue #22 — 小程序 E2E（miniprogram-automator）
- Issue #23 — Flutter E2E（integration_test）
- Issue #24 — 性能基线（启动 < 2s、列表 60fps）

---

> **最后更新**：2026-06-05 @OpenClaw · 任何变更请 PR 修改本文档
