# ADR-0002: 微信小程序采用微信原生（不混 Taro/Uni-app）

> **状态**：✅ Accepted
> **日期**：2026-06-05
> **决策人**：@YuanshuoDu（决策人） / @Oracle Hermes（CTO 提报） / @爱马仕（腾讯生态负责人）
> **关联**：[cto-roadmap-v1.0.md §0 D3](../../studybuddy-plan/cto-roadmap-v1.0.md) · [architecture-v1.0.md §2](../architecture-v1.0.md) · [ADR-0001](./0001-flutter-for-mobile.md)

## Context（背景）

StudyBuddy 的**主端是微信小程序**（决策人指定）— 留学生群体在国内外的微信渗透率最高，零下载成本。

**为什么不能直接用 Flutter Web 套壳做小程序？**

- 微信小程序必须是 **`.wxml` + `.wxss` + `.js`** 包结构；Flutter Web 只能以「H5 网页」形式塞进 `web-view` 组件
- `web-view` 是 H5 体验，**微信小程序原生能力（登录 / 支付 / 订阅 / 分享 / 内容安全）全部不可用**
- 唯一可行的「一套代码出三端（含 MP）」是 **Taro / Uni-app** 这类**编译时跨端框架**

候选方案：

| 方案 | 性能 | 微信生态深 | 学习成本 | 招人 |
|------|------|------------|----------|------|
| **A. 微信原生（WXML/WXSS/TS）** | 最佳 | **深** | 低 | 易 |
| B. Taro 3.x（React） | 中（折损 20-30%） | 中 | 中 | 中 |
| C. Taro 3.x（Vue 3） | 中 | 中 | 中 | 中 |
| D. Uni-app（Vue） | 中 | 中 | 中 | 中 |
| E. Chameleon / mpvue | 中 | 中 | 中 | 难 |

**约束条件**：
- 主端体验 > 工时节省（决策人明确指示）
- 与 [ADR-0001 Flutter](./0001-flutter-for-mobile.md) **互不污染** — 两套代码独立演进
- 12 周窗口
- 微信小程序生态：登录 / 支付 / 订阅消息 / 内容安全 / 分享 — **原生调用**；地图：Mapbox webview（待 [Issue #35](https://github.com/YuanshuoDu/studybuddy/issues/35) 决策）

## Decision（决策）

**采用方案 A：微信原生 + TypeScript + Vite 构建，**作为微信小程序的实现。

理由（按权重排序）：

1. **微信生态深集成**：登录、支付、订阅消息、内容安全、地图、分享 — 全部走原生 API，**无任何适配层**
2. **性能最佳**：WXML/WXSS 经微信运行时编译 + 渲染管线优化，**比 Taro/Uni-app 编译产物快 20-40%**
3. **审核通过率高**：原生小程序更符合微信审核的「原生体验」导向
4. **招人**：微信小程序开发在国内前端市场体量大，1 周内可招到合适人选
5. **与 Flutter 隔离**：两套代码独立演进，**互不污染**，Flutter 升级不会影响 MP

**最终技术栈**：

```
微信原生 + Vite
├── 语言：TypeScript 5.4（强类型）
├── 框架：微信原生 Page（不混 React/Vue）
├── 编译：Vite 5.x（miniprogram-vite-plugin）
├── 状态管理：Mobx-miniprogram（或自研 EventBus）
├── 网络：wx.request 封装 + Interceptor（日志/鉴权/重试）
├── 路由：微信原生 Page（不做 router 抽象）
├── 地图：Mapbox webview（GL JS，待 Issue #35 决策）
├── 登录：wx.login + wx.getUserProfile
├── 推送：wx.requestSubscribeMessage
├── 分享：onShareAppMessage / onShareTimeline
├── UI：自研设计 Token + 微信设计规范
└── 测试：miniprogram-automator
```

## Consequences（影响 / 代价）

### ✅ 收益

- **性能最佳**：列表滑动 60fps，启动 < 1s
- **生态深**：所有微信能力零成本调用
- **审核友好**：原生体验，**降低 4.3/4.2 拒审风险**
- **招人容易**：微信小程序开发市场大

### ⚠️ 代价与风险

| 风险 | 缓解 |
|------|------|
| **R1：MP 与 Flutter 业务实现需对齐** | 共享后端 API + 等价用例库（[架构 §6](../architecture-v1.0.md)） |
| **R2：i18n 实现** | 资源文件 key 统一，三端各维护一份 |
| **R3：设计 Token 双端对齐** | UI/UX track 出 Figma Variables，MP / Flutter 各取所需 |
| **R4：未来抽 H5 业务** | 暂不抽；如需，**单独走 ADR** |
| **R5：包大小限制** | MP 主包 ≤ 2MB，超出走分包加载（v1.1 评估） |

### 🔁 不可逆性评估

- **中不可逆**：业务代码迁移成本中等（MP 代码不能直接复用到 Flutter）；但后端共用，**核心成本是 UI 适配**
- **代码组织**：`miniprogram/src/pages/{index,activity,create,profile,login}/` 模块清晰

### 📋 决策后续

- @爱马仕 在 M1-W2 完成脚手架 + 登录页 + TabBar
- M1-W4 完成首页 + 详情 + 创建 + 报名
- M2-W5 完成评价 + 消息 + 地图
- i18n：MVP 中英双语，文案 key 统一

## Status

- ✅ **Accepted** — 2026-06-05
- 📅 下次 review：M1-W4（端上脚手架完成后）
- 👥 Owner：@爱马仕（MP 主程） / @Oracle Hermes（CTO）

## 备选方案被否决的理由

- ❌ **B/C. Taro 3.x（React / Vue）**：编译时跨端，性能折损 20-30%；生态适配滞后（如某些 wx API 需 polyfill）；与 [ADR-0001 Flutter](./0001-flutter-for-mobile.md) 同时存在两套跨端框架，**认知负担大**
- ❌ **D. Uni-app**：Vue 生态 + 编译器黑盒；iOS/Android 端体验差；与 Flutter 重复
- ❌ **E. Chameleon / mpvue**：社区已停滞，**生产风险高**
