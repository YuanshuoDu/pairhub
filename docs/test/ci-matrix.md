# StudyBuddy — CI 测试矩阵 v1.0

> **状态**：v1.0
> **作者**：@OpenClaw
> **生效日期**：2026-06-05
> **关联**：
> - 测试计划：[`test-plan-v1.0.md`](./test-plan-v1.0.md)
> - 交付规范：[`../delivery-standards.md`](../delivery-standards.md)
> - 路线图：[`../../studybuddy-plan/cto-roadmap-v1.0.md`](../../studybuddy-plan/cto-roadmap-v1.0.md) §4.5、§4.6

---

## 0. 目的

定义 GitHub Actions 上 PR / main / tag 三种触发场景下，**后端 / 小程序 / Flutter** 三端分别跑哪些测试、用什么工具、超时多少、失败怎么办。

与 DevOps track（`@美国hermes`）输出的 `.github/workflows/*.yml` 1:1 对应；本文是**逻辑规范**，workflow 文件是**实现细节**。

---

## 1. 触发矩阵

| 触发场景 | 后端 | 小程序 | Flutter | Docs | 时长预算 | 失败处理 |
|----------|------|--------|---------|------|----------|----------|
| **PR 推送 / 更新** | lint + unit test + build (tsc + Docker) | tsc + miniprogram-ci preview | flutter analyze + flutter test | markdown-link-check | **≤ 12 min** | 自动重试 1 次 → 仍失败卡 PR |
| **Push 到 main** | PR 套件 + **integration test**（起 PG/Redis） | PR 套件 + miniprogram-ci preview 上传 | PR 套件 + `flutter build apk --debug` | 同上 | **≤ 25 min** | 失败卡 main 推送（不阻断已合入，但需当天修） |
| **Tag 推送（v*）** | 上述 + **E2E**（miniprogram-automator + integration_test 端到端）+ **性能基线**（k6）+ **安全扫描**（OWASP ZAP + npm audit） | 上述 + **真机 E2E**（体验版）+ 性能跑分 | 上述 + **`flutter build apk --release` + `flutter build ios --release --no-codesign`** + 性能 trace | 文档构建 | **≤ 60 min** | 失败**禁止发布**，必须修 + 重打 tag |
| **每周日 02:00 UTC** | 完整 E2E + 性能基线回归 | 同上 | 同上 | - | - | 失败自动建 issue，severity = 性能/P1 |

**所有 job 必须并行**（除非有依赖），避免串行累计超时。

---

## 2. 各端测试 job 详细定义

### 2.1 后端（`server/`）

| Job 名 | 工具 | 步骤 | 触发 | 超时 | 关键环境变量 |
|--------|------|------|------|------|--------------|
| `backend-lint` | eslint + prettier | `pnpm install --frozen-lockfile && pnpm lint` | PR + main + tag | 3 min | - |
| `backend-unit` | vitest | `pnpm test:unit` | PR + main + tag | 5 min | `NODE_ENV=test` |
| `backend-build` | tsc + esbuild | `pnpm build && pnpm prisma generate` | PR + main + tag | 5 min | - |
| `backend-docker` | docker buildx | `docker build -t studybuddy-api:test .`（仅 build，不推） | PR + main + tag | 8 min | - |
| `backend-integration` | vitest + supertest + 真 PG + 真 Redis | `docker compose -f docker-compose.test.yml up -d && pnpm test:integration && docker compose down` | **main + tag** | 10 min | `DATABASE_URL=postgres://...`, `REDIS_URL=redis://...` |
| `backend-e2e` | vitest E2E（miniprogram-automator 驱动真小程序 → 后端） | 同上 + automator | **tag** | 20 min | `WECHAT_APPID`（E2E 专用） |
| `backend-perf` | k6 | `k6 run --out json=perf.json tests/perf/api.js`，P95 > 300ms 失败 | **tag + 周** | 10 min | - |
| `backend-security` | OWASP ZAP baseline + `pnpm audit --prod` | `docker run zaproxy/zap-stable zap-baseline.py -t http://api:3000` + audit | **tag** | 15 min | - |
| `backend-coverage` | @vitest/coverage-v8 | `pnpm test:coverage`，行覆盖 < 80% 失败 | **PR + main + tag** | 5 min | `CODECOV_TOKEN`（可选） |

**workflow 片段**（参考，DevOps track 落地）：
```yaml
backend-test:
  name: Backend Unit + Coverage
  runs-on: ubuntu-latest
  timeout-minutes: 8
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v3
      with: { version: 9 }
    - uses: actions/setup-node@v4
      with: { node-version: 20, cache: pnpm }
    - run: pnpm install --frozen-lockfile
    - run: pnpm lint
    - run: pnpm test:coverage
    - uses: actions/upload-artifact@v4
      if: always()
      with: { name: coverage-backend, path: coverage/ }
    - uses: actions/github-script@v7
      if: failure()
      with: |
        github.rest.issues.create({...})
```

### 2.2 微信小程序（`miniprogram/`）

| Job 名 | 工具 | 步骤 | 触发 | 超时 | 关键环境变量 |
|--------|------|------|------|------|--------------|
| `mp-lint` | eslint + tsc | `pnpm lint && pnpm tsc --noEmit` | PR + main + tag | 3 min | - |
| `mp-unit` | jest | `pnpm test --coverage` | PR + main + tag | 5 min | - |
| `mp-build` | miniprogram-ci | `npx miniprogram-ci build --pp dist --pkp private.key --appid $WECHAT_APPID` | PR + main + tag | 5 min | `WECHAT_APPID` |
| `mp-preview` | miniprogram-ci | 上传**体验版**（仅 main + tag） | **main + tag** | 5 min | `WECHAT_APPID`, `WECHAT_ROBOT` (二维码) |
| `mp-e2e` | miniprogram-automator + jest | `pnpm test:e2e`（跑真小程序：登录/创建/列表/报名） | **tag** | 25 min | `WECHAT_AUTOMATOR_TOKEN` |
| `mp-perf` | 自研 perf.js + Lighthouse 兼容 | 启动 < 2s、TTI < 3s，否则失败 | **tag** | 10 min | - |

**真机 / 模拟器**：
- CI 上 miniprogram-automator 跑在 `wxadoc/automator-cli:latest` Docker 镜像 + 微信开发者工具 CLI
- 真机验证（iPhone 12 / 小米 11）由 W7 内测前人工跑

### 2.3 Flutter（`app/`）

| Job 名 | 工具 | 步骤 | 触发 | 超时 | 关键环境变量 |
|--------|------|------|------|------|--------------|
| `flutter-analyze` | `flutter analyze` | - | PR + main + tag | 4 min | - |
| `flutter-test` | `flutter test --coverage` | 含 widget test + 黄金测试 | PR + main + tag | 8 min | - |
| `flutter-build-android` | `flutter build apk --debug` | - | PR + main + tag | 15 min | `ANDROID_KEYSTORE` (PR 阶段用 debug) |
| `flutter-build-ios` | `flutter build ios --debug --no-codesign` | macOS runner | PR + main + tag | 15 min | - |
| `flutter-integration` | `flutter test integration_test/` | 跑真机/模拟器，**macOS runner** | **main + tag** | 25 min | - |
| `flutter-perf` | `flutter run --profile` + DevTools timeline | 冷启动 < 2s、热启动 < 500ms、列表 60fps | **tag** | 15 min | - |
| `flutter-build-release` | `flutter build apk --release` + `flutter build ios --release` | - | **tag** | 20 min | `ANDROID_KEYSTORE`, `IOS_CERT` |

**Runner 要求**：
- Android 任务用 `ubuntu-latest`
- iOS + macOS 任务用 `macos-14`（Apple Silicon）

### 2.4 Docs

| Job 名 | 工具 | 步骤 | 触发 | 超时 |
|--------|------|------|------|------|
| `docs-link-check` | `lycheeverse/lychee-action` | 检查所有内部链接 | PR + main + tag | 3 min |
| `docs-spell-check` | `crate-ci/typos` | - | PR + main + tag | 2 min |
| `docs-render-check` | GitHub Pages preview | 可选 | tag | 5 min |

---

## 3. 失败处理流程

```
[Job 失败]
  ↓
[GitHub Actions 自动重试 1 次]（仅 flaky 类：网络超时、依赖下载失败）
  ↓
  ├─ 重试成功 → 绿 → 通过
  └─ 重试失败 →
      ↓
      [卡 PR / 卡 main / 卡 tag]
      ↓
      [自动评论到 PR + 自动建 issue（标 P1，标签 flaky-test 或 ci-failure）]
      ↓
      [对应端 Owner 当天响应]
```

**重试规则**：
- 仅在 job 日志显示**网络/超时/资源拉取**类错误时自动重试
- 测试断言失败（`expect(...)` 不通过）**不重试**，直接卡
- 每次重试间隔 30s，避免压垮依赖服务
- 重试配置（DevOps track 实现）：
  ```yaml
  jobs:
    backend-test:
      strategy:
        matrix: { node: [20] }
        retry:  # 官方 retry
          max: 1
          conditions:
            - job.result == 'failure'
            && contains(needs.backend-test.outputs.error, 'ETIMEDOUT')
  ```

**自动 issue 模板**（失败时建）：
```markdown
## CI Failure: ${{ matrix.job }} on ${{ github.ref_name }}

- 触发 commit: ${{ github.sha }}
- 运行 URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
- 错误摘要: ...

@<owner-of-the-touching-team> 请修复
```

---

## 4. 状态徽章 / 看板

README.md 顶部展示：
```markdown
[![Backend CI](https://github.com/YuanshuoDu/studybuddy/actions/workflows/backend-ci.yml/badge.svg)](...)
[![MiniProgram CI](...)](...)
[![Flutter CI](...)](...)
[![Docs CI](...)](...)
```

**Slack / 飞书通知**（DevOps track 接入）：
- PR 失败 → 推到 `#studybuddy-ci` 频道
- main 失败 → 推到 `#studybuddy-oncall`
- tag 失败 → 推到 `#studybuddy-release` + @CTO

---

## 5. 各端 CI 工具一览

| 端 | CI 平台 | 配置文件 | 备注 |
|----|---------|----------|------|
| 后端 | **GitHub Actions** | `.github/workflows/backend-ci.yml` | ubuntu-latest，Node 20 |
| 小程序 | **miniprogram-ci**（官方）+ GitHub Actions 调度 | `.github/workflows/miniprogram-ci.yml` | 复用 GitHub Actions runner，调官方 miniprogram-ci CLI |
| Flutter | **GitHub Actions** | `.github/workflows/flutter-ci.yml` | Android 用 ubuntu，iOS 用 macos-14 |
| Docs | **GitHub Actions** | `.github/workflows/docs-ci.yml` | lychee + typos |
| 顶层编排 | GitHub Actions | `.github/workflows/ci.yml` | 上述 4 个 job 并行触发 |

> **为什么不引入 Jenkins / GitLab CI**：仓库已在 GitHub，Actions 限额 2000 min/月对 MVP 充足；统一 secrets 管理；M1 不需要自托管。

---

## 6. 必装 GitHub Secrets（占位）

DevOps track 需在仓库 Settings → Secrets 配置：

| Secret 名 | 用途 | 端 |
|-----------|------|----|
| `WECHAT_APPID` | 微信小程序 AppID | 小程序 / 后端（多端共用时） |
| `WECHAT_SECRET` | 微信小程序 Secret | 后端 |
| `WECHAT_AUTOMATOR_TOKEN` | automator 真机扫码 token | 小程序 E2E |
| `WECHAT_PRIVATE_KEY` | miniprogram-ci 私钥 | 小程序 build |
| `APPLE_CLIENT_ID` | Apple Sign-In | 后端 |
| `GOOGLE_CLIENT_ID` | Google Sign-In | 后端 |
| `CODECOV_TOKEN` | 覆盖率上传（可选） | 全端 |
| `DOCKER_REGISTRY_TOKEN` | 镜像推送（tag 触发时） | 后端 / Flutter Android |
| `SENTRY_DSN_BACKEND` | 后端错误上报 | 后端 |
| `SENTRY_DSN_FLUTTER` | App 错误上报 | Flutter |
| `SENTRY_DSN_MINIPROGRAM` | 小程序错误上报 | 小程序 |

详细列表见 DevOps track 输出的 `docs/devops/secrets.md`。

---

## 7. M1 出口时的 CI 标准

W4 末必须满足：

- [ ] PR 推送触发三端并行 + 全绿
- [ ] main 推送触发集成测试 + 全绿
- [ ] 一次 v0.1.0-rc1 tag 走通 E2E + 性能 + 安全
- [ ] 失败自动重试 + 自动建 issue 验证
- [ ] README 徽章全亮
- [ ] Slack 通知测试通过

---

## 8. 引用

- 测试计划：[`test-plan-v1.0.md`](./test-plan-v1.0.md) §4 工具栈
- 性能基线：[`performance-baseline.md`](./performance-baseline.md) §0 性能门禁
- 安全清单：[`security-checklist.md`](./security-checklist.md) §CI 集成
- 交付规范：[`../delivery-standards.md`](../delivery-standards.md) §2.1 CI 截图
- CTO 路线图：[`../../studybuddy-plan/cto-roadmap-v1.0.md`](../../studybuddy-plan/cto-roadmap-v1.0.md) §4.6 DevOps Track

---

> **最后更新**：2026-06-05 @OpenClaw · DevOps track 实现时如有出入请同步更新本文件
