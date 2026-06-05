# Pairhub — 性能基线 v1.0

> **状态**：v1.0
> **作者**：@OpenClaw
> **生效日期**：2026-06-05
> **关联**：
> - 测试计划：[`test-plan-v1.0.md`](./test-plan-v1.0.md) §2
> - 架构：[`../architecture.md`](../architecture.md)
> - 路线图：[`../../pairhub-plan/cto-roadmap-v1.0.md`](../../pairhub-plan/cto-roadmap-v1.0.md) §3 M2 出口

---

## 0. 目的

把"快"翻译成**具体数字 + 测量方法 + 阻断门槛**。每个数字都有：
1. 目标值
2. 测量方法（工具 + 步骤 + 样本量）
3. 阻断场景
4. 持续监控（埋点 → 聚合 → Grafana）

不达标不发布。

---

## 1. 后端 API 性能基线

### 1.1 目标值

| 指标 | 目标 | 软上限（不阻断） | 硬上限（阻断发布） |
|------|------|------------------|---------------------|
| **P50**（中位数） | < 100 ms | 100-200 ms | > 200 ms |
| **P95**（95 分位） | < 300 ms | 300-500 ms | > 500 ms |
| **P99**（99 分位） | < 500 ms | 500-1000 ms | > 1000 ms |
| **错误率** | < 0.1 % | 0.1-1 % | > 1 % |
| **吞吐**（单实例） | ≥ 500 RPS 读 / ≥ 200 RPS 写 | - | - |

### 1.2 测量方法

**工具**：k6（https://k6.io）

**测试脚本**（`server/tests/perf/api.js`）：
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 100 },  // 预热
    { duration: '2m',  target: 500 },  // 升到 500 RPS
    { duration: '5m',  target: 500 },  // 持续 500 RPS
    { duration: '30s', target: 0 },    // 退场
  ],
  thresholds: {
    'http_req_duration:p(50)': ['<100'],
    'http_req_duration:p(95)': ['<300'],
    'http_req_duration:p(99)': ['<500'],
    'http_req_failed':         ['rate<0.001'],
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // 读路径：列表 + 详情
  const list = http.get(`${BASE}/api/activities?type=study&limit=20`);
  check(list, { 'list 200': (r) => r.status === 200 });

  const detail = http.get(`${BASE}/api/activities/${list.json('items.0.id')}`);
  check(detail, { 'detail 200': (r) => r.status === 200 });

  sleep(0.1);
}
```

**CI 触发**：仅 `tag` 触发（详见 [`ci-matrix.md`](./ci-matrix.md) §1）。

**样本量**：每次跑 ≥ 5 分钟，≥ 50,000 请求，结果取 P50/P95/P99。

**环境**：
- 后端：`2 vCPU / 4GB RAM`（与生产同规格）
- DB：`2 vCPU / 4GB RAM / SSD`，数据集 100K User + 50K Activity
- Redis：1 vCPU / 1GB
- 冷启动（无缓存预热）vs 热启动（先 1 分钟预热）各跑一次

### 1.3 关键 endpoint 单独基线

| Endpoint | P50 目标 | P95 目标 | 备注 |
|----------|----------|----------|------|
| `POST /api/auth/wechat` | < 150 ms | < 400 ms | 含远程 jscode2session 调用 |
| `GET /api/activities`（列表+筛选） | < 80 ms | < 250 ms | 走 Redis 缓存 |
| `GET /api/activities/:id` | < 60 ms | < 200 ms | 走 Redis 缓存 |
| `POST /api/activities` | < 200 ms | < 500 ms | 写 DB + 微信内容安全 |
| `POST /api/signups` | < 250 ms | < 600 ms | **事务 + Redis 限流 + 推送**（最重） |
| `DELETE /api/signups/:id` | < 200 ms | < 500 ms | 事务 + 推送 |
| `GET /api/users/me` | < 60 ms | < 200 ms | 缓存 |

### 1.4 监控接入

| 层级 | 工具 | 数据 |
|------|------|------|
| 客户端埋点 | 自研 `tracker.ts` / Sentry Performance | API 调用耗时（首字节、完整） |
| 后端中间件 | Fastify `onResponse` hook + prom-client | `http_request_duration_seconds{path, method, code}` |
| 聚合 | Prometheus → Grafana Cloud | 仪表盘：`/d/api-perf` |
| 告警 | Grafana Alert → Slack `#api-oncall` | P95 > 500ms 持续 5min 触发 |

**Grafana 仪表盘指标**（最小集）：
- P50/P95/P99 趋势（按 endpoint 分）
- 错误率
- RPS
- DB 慢查询（> 200ms）
- Redis 命中率

---

## 2. 微信小程序性能基线

### 2.1 目标值

| 指标 | 目标 | 硬上限 |
|------|------|--------|
| **首屏渲染**（FCP） | < 2 s | > 3 s 阻断 |
| **TTI**（可交互） | < 3 s | > 5 s 阻断 |
| **JS 包大小**（首屏） | < 1.5 MB（压缩后） | > 2 MB 阻断 |
| **API 列表渲染 100 项** | < 500 ms | > 1 s 阻断 |
| **下拉刷新响应** | < 800 ms | > 1.5 s 阻断 |
| **页面切换** | < 300 ms | > 600 ms 阻断 |

### 2.2 测量方法

**工具**：
- `miniprogram-automator` + 自研 `perf.js`（自动化）
- 微信开发者工具 **Performance** 面板（人工）
- 微信后台 **性能分析**（线上真实数据）

**测试场景**（`miniprogram/tests/perf/scenario.js`）：
1. 冷启动 → 登录页渲染完成（首屏）
2. 微信授权 → 首页可点击（TTI）
3. 首页下拉刷新 → 列表渲染完成
4. 点击活动 → 详情页加载完成
5. 创建活动 → 提交按钮可点 → 成功页

**CI 触发**：
- `tag` 触发：miniprogram-automator 跑 `tests/perf/scenario.js`，记录 5 次取中位数
- 周日定时：拉取线上数据生成趋势图

**设备矩阵**（人工验证用）：
- iPhone 12 / iOS 17（高端）
- iPhone XR / iOS 16（中端）
- 小米 11 / Android 12（中端）
- 华为 P30 / Android 9（低端）

### 2.3 监控接入

| 层级 | 工具 | 数据 |
|------|------|------|
| 小程序埋点 | `wx.reportMonitor` + 自研 tracker | 首屏、TTI、API 耗时 |
| 上报 | Sentry Performance + 自建 `/perf` endpoint | 设备型号 / 微信版本 / 网络类型 |
| 聚合 | Grafana | 仪表盘：`/d/minip-pf` |
| 告警 | TTI P95 > 4s 持续 30min → Slack | - |

---

## 3. Flutter App 性能基线

### 3.1 目标值

| 指标 | 目标 | 硬上限 |
|------|------|--------|
| **冷启动**（点击图标 → 首页可交互） | < 2 s | > 3 s 阻断 |
| **热启动**（已驻留后台 → 恢复） | < 500 ms | > 1 s 阻断 |
| **列表滑动 FPS** | ≥ 60 fps（最低不低于 50 fps） | < 50 fps 阻断 |
| **页面切换动画** | ≥ 58 fps | < 55 fps 阻断 |
| **首屏 API 拉取** | < 1 s | > 2 s 阻断 |
| **APK 大小** | < 30 MB | > 50 MB 阻断 |
| **iOS IPA 大小** | < 30 MB | > 50 MB 阻断 |

### 3.2 测量方法

**冷启动**：
- 工具：Flutter DevTools Timeline + `flutter run --profile`
- 步骤：
  1. 完全杀掉 App
  2. `flutter run --profile` 启动
  3. 记录从 `WidgetsBinding.handleBeginFrame` 到第一帧渲染的时间
  4. 取 5 次中位数

**热启动**：
- 工具：DevTools + 自研 `bench.dart`
- 步骤：
  1. App 退到后台 30s
  2. 从最近任务恢复
  3. 记录到 `didChangeAppLifecycleState(resumed)` 触发渲染的时间

**列表 FPS**：
- 工具：DevTools Performance pane + `flutter run --profile` 时开启 "Track widget builds"
- 步骤：
  1. 首页列表灌入 200 条数据
  2. 连续滑动 10s
  3. 统计 build / layout / paint 阶段的耗时

**CI 触发**：`tag` 触发 `flutter test integration_test/ --tags perf`，详见 [`ci-matrix.md`](./ci-matrix.md) §2.3。

**设备矩阵**：
- iOS：iPhone 12（基线）、iPhone SE 2（中低端）
- Android：Pixel 6（基线）、小米 8（低端）

### 3.3 启动时间优化清单（如果未达标）

- [ ] 启用 `--release` + `--split-debug-info`
- [ ] 延迟加载非首屏路由
- [ ] 图片预缓存（`precacheImage`）
- [ ] 字体预加载
- [ ] 移除 debug-only 代码
- [ ] ProGuard / R8 收缩

---

## 4. 地图渲染基线

### 4.1 目标值

| 指标 | 目标 | 硬上限 |
|------|------|--------|
| **地图首次加载** | < 1 s | > 2 s 阻断 |
| **地图 marker 渲染 50 个** | < 500 ms | > 1 s 阻断 |
| **缩放 / 平移 FPS** | ≥ 55 fps | < 45 fps 阻断 |
| **选点 → 确认** | < 800 ms | > 1.5 s 阻断 |

### 4.2 测量方法

**工具**：
- 微信小程序：腾讯地图 SDK + `miniprogram-automator`
- Flutter：`tencent_map_flutter` / `amap_flutter` + DevTools

**测试场景**（`tests/perf/map.js`）：
1. 进入创建活动页 → 选点页加载
2. 拖动地图 5s
3. 放置 50 个 marker
4. 缩放级别 10 → 15
5. 点击空白处 → 选点确认

**基线**：
- 地图 SDK 初始化 < 300 ms
- 50 个 marker 渲染 < 500 ms（用 marker 聚合）
- 缩放/平移稳定 55+ fps

### 4.3 优化手段
- marker 聚合（> 30 个自动聚合）
- 离线瓦片缓存（首屏用本地瓦片）
- 缩放级别限制（默认 12-16）
- 选点用 last-known-location（无需等待 GPS）

---

## 5. 监控接入统一规范

### 5.1 整体架构

```
[App / 小程序]  埋点 SDK（Sentry + 自研 tracker）
       ↓ HTTPS
[后端]  /perf 接收 + /api/errors
       ↓
[消息队列]  Kafka  topic=perf / topic=errors
       ↓
[聚合]  Flink / 自研 aggregator
       ↓
[存储]  Prometheus + ClickHouse / Loki
       ↓
[可视化]  Grafana Cloud  /d/{api-perf, minip-pf, flutter-pf, security}
       ↓
[告警]  Grafana Alert → Slack / 飞书 / PagerDuty
```

### 5.2 选型

| 类别 | 选型 | 理由 |
|------|------|------|
| 错误上报 | **Sentry**（前后端共用） | 开箱即用 + 源码映射 + Release 关联 |
| 性能（前端） | Sentry Performance + 自研 `tracker.ts` | 自研可控，Sentry 兜底 |
| 性能（后端） | **Prometheus + Grafana** | 业界标准 |
| 日志 | **Loki** | 与 Grafana 同源，查询友好 |
| 链路 | OpenTelemetry → Jaeger | W2 接入，先打点后聚合 |
| 在线监控 | **Better Uptime** | 免费层够用 |

### 5.3 必埋点（最小集）

| 事件名 | 触发 | 字段 |
|--------|------|------|
| `app_start` | App 冷启动完成 | `cold_start_ms`, `device`, `os_version`, `app_version` |
| `app_warm_start` | 热启动 | `warm_start_ms` |
| `page_render` | 页面首屏 | `page`, `fcp_ms`, `tti_ms` |
| `api_call` | 任意 API 调用 | `endpoint`, `method`, `status`, `duration_ms`, `ttfb_ms` |
| `map_load` | 地图初始化 | `provider`, `marker_count`, `duration_ms` |
| `signup_success` / `signup_fail` | 报名 | `activity_id`, `duration_ms` |
| `js_error` | 前端崩溃 | `stack`, `device`, `release` |

### 5.4 告警规则

| 规则 | 条件 | 通知 |
|------|------|------|
| API P95 告警 | P95 > 500ms 持续 5min | Slack `#api-oncall` |
| 小程序崩溃率 | > 0.5% 持续 10min | Slack `#fe-oncall` |
| Flutter 崩溃率 | > 0.5% 持续 10min | Slack `#fe-oncall` |
| 启动超时率 | P95 > 4s 持续 30min | Slack `#fe-oncall` |
| 错误日志激增 | 5min 内 > 100 条同类错误 | Slack `#oncall` + PagerDuty |
| 磁盘 / 内存 | DB disk > 80% | PagerDuty |

---

## 6. 性能基线回归（CI 触发）

| 触发 | 跑的基线 | 阻断规则 | 失败响应 |
|------|----------|----------|----------|
| PR | 不跑（避免误报） | - | - |
| main | 不跑 | - | - |
| tag | k6 + Flutter perf + 小程序 perf 全跑 | 任何一项超硬上限 | 卡 tag，强制修 |
| 周日定时 | 全跑 | 仅记录趋势，告警 | 自动建 issue 标 P2 |

**趋势存档**：每周末把 k6 报告 + DevTools 截图归档到 `docs/perf-trend/YYYY-MM-DD/`，用于季度回顾。

---

## 7. 引用

- 测试计划：[`test-plan-v1.0.md`](./test-plan-v1.0.md) §2 覆盖目标
- CI 矩阵：[`ci-matrix.md`](./ci-matrix.md) §2 perf job
- 安全清单：[`security-checklist.md`](./security-checklist.md)（埋点数据脱敏）
- 架构：[`../architecture.md`](../architecture.md) §横切（监控 / 性能）
- CTO 路线图：[`../../pairhub-plan/cto-roadmap-v1.0.md`](../../pairhub-plan/cto-roadmap-v1.0.md) §3 M2 出口"核心接口 P95 < 300ms"
- Issue #24 — 性能基线

---

> **最后更新**：2026-06-05 @OpenClaw · 任何变更请 PR 修改本文档
