# ADR-0001: Flutter 作为 iOS + Android 移动端实现

> **状态**：✅ Accepted
> **日期**：2026-06-05
> **决策人**：@YuanshuoDu（决策人） / @Oracle Hermes（CTO 提报）
> **关联**：[cto-roadmap-v1.0.md §0 D1-D2](../../studybuddy-plan/cto-roadmap-v1.0.md) · [architecture-v1.0.md §2](../architecture-v1.0.md)

## Context（背景）

StudyBuddy 计划 **12 周内交付微信小程序 + iOS + Android 三端 MVP**。移动端是「占大头」的用户入口 — 留学生的活动搭子行为是**地理位置强相关、实时、社交**型，Web 体验无法满足。

候选方案：

| 方案 | 一套代码覆盖 | 性能 | 平台特性 | 团队学习成本 | 工时 |
|------|--------------|------|----------|--------------|------|
| **A. Flutter（Dart）** | iOS + Android | 原生级 | 需插件 | 中 | **2 套代码**（与 MP 分开） |
| B. React Native | iOS + Android | 接近原生 | 需桥接 | 中 | 2 套代码 |
| C. Kotlin Multiplatform Mobile | iOS + Android | 原生 | 强 | 高 | 2 套代码 |
| D. Swift + Kotlin 各写一套 | 各一端 | 原生 | 强 | 低 | 3 套代码（2 native + MP） |
| E. Taro/Uni-app 一套出三端（含 MP） | 全部 | 折损 20-40% | MP 特性受限 | 中 | 1 套代码 |

**约束条件**：
- 后端 **100% 共用**（与本 ADR 独立，见 [architecture-v1.0.md §3](../architecture-v1.0.md)）
- 微信小程序必须**原生**（[ADR-0002](./0002-miniprogram-native.md)），所以 MP 不在本次选型范围
- 12 周窗口期
- 团队现状：主力 @美国hermes 熟悉 Node/TS，**无 Flutter 经验** — 需外招 Flutter 主程

## Decision（决策）

**采用方案 A：Flutter 3.x + Dart 3.x，作为 iOS 与 Android 的实现。**

理由（按权重排序）：

1. **一套代码 → 两端交付**：Flutter 自绘引擎，跨端一致性与性能兼顾（vs RN 的桥接开销）
2. **生态成熟**：Riverpod / Dio / GoRouter 等已是 Flutter 主流栈；Mapbox / FCM / sign_in_with_apple 都有官方 plugin
3. **未来 Web 套壳**（v1.1 候选）：Flutter Web 可以几乎零成本扩到 Web H5，**为 v1.1 增量留口子**
4. **团队友好**：TS / Dart 都是强类型 + 静态分析，@美国hermes 主力能 1 周上手
5. **招人**：国内 Flutter 社区活跃，Boss / 拉勾 / V2EX 渠道 4 周内可招到合适人选

**最终技术栈**：

```
Flutter 3.22+ · Dart 3.4+
├── 状态管理：Riverpod 2.x（hooks_riverpod）
├── 路由：GoRouter 14.x
├── 网络：Dio 5.x + Interceptor（日志/鉴权/重试）
├── 本地存储：shared_preferences（JWT）+ Hive（缓存）
├── 安全存储：flutter_secure_storage（JWT 长期）
├── 地图：mapbox_maps_flutter plugin（Mapbox GL Native）
├── 推送：firebase_messaging（FCM）+ flutter_apns_only（APNs wrapper）
├── 登录：sign_in_with_apple + google_sign_in
├── UI：Material 3 + 自研设计 Token
└── 测试：flutter_test + integration_test
```

## Consequences（影响 / 代价）

### ✅ 收益

- **工时节省**：iOS + Android 一套代码 → 节省约 30% 端上工时
- **一致性**：跨端 UI/交互天然一致，**设计系统落地成本低**
- **未来 Web 化**：v1.1 可直接产出 PWA，**不丢历史投入**
- **类型安全**：Dart 强类型 + null safety，编译期捕获常见错误

### ⚠️ 代价与风险

| 风险 | 缓解 |
|------|------|
| **R1：Flutter 主程招不到** | Boss + 拉勾 + V2EX 同步；最坏情况 @美国hermes 转 Flutter（2 周学习曲线） |
| **R2：原生 SDK 插件维护滞后** | 优先官方 plugin；自研 plugin 留 1 周 buffer |
| **R3：包体积偏大** | MVP 阶段可接受（基础包 ~20MB）；v1.1 评估拆 dynamic feature |
| **R4：iOS 审核 4.3 重复应用** | 强调「位置 / 学校筛选 / 实时搭子」差异化功能 |
| **R5：Android 国内分发** | MVP 走 APK 直链 + 微信扫码下载；Google Play 后期再上 |
| **R6：海外推送通道** | FCM (Android) + APNs (iOS) 覆盖目标用户；如未来需要国内兜底再评估 |

### 🔁 不可逆性评估

- **低不可逆**：代码可逐步替换；如未来必须切原生，可通过 `Platform Channel` 局部替换
- **包结构清晰**：`app/lib/features/{auth,activity,signup,message,profile}/` 模块化，未来拆分 micro-app 容易

### 📋 决策后续

- 招人 JD 由 @杜元朔 拍板后立刻发
- @美国hermes 启动 Flutter 学习（M1-W1 末产出 Hello World demo）
- M1-W3 完成项目脚手架 + 路由 + 网络层
- M1-W4 完成登录页（Apple/Google）+ 首页列表 + 详情页

## Status

- ✅ **Accepted** — 2026-06-05
- 📅 下次 review：M1-W4（端上脚手架完成后）
- 👥 Owner：@Oracle Hermes（CTO）/ Flutter 主程（TBD）

## 备选方案被否决的理由

- ❌ **B. React Native**：桥接开销 + JSI 重构阵痛；TS 支持不如 Flutter；社区重心已向 RN New Architecture 转移，不稳定
- ❌ **C. KMM**：iOS 端需要 Swift 写 UI；学习成本最高；招人最稀缺
- ❌ **D. Swift + Kotlin 双 native**：3 套代码（再加 MP），**12 周不可能交付**
- ❌ **E. Taro/Uni-app**：MP 性能折损 20-40%，与 [ADR-0002 小程序原生](./0002-miniprogram-native.md) 冲突
