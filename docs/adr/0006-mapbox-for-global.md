# ADR-0006: 地图选型 — Mapbox for global

> **状态**：Accepted · 2026-06-05（Flutter + iOS/Android + 微信小程序均决策完毕）
> **决策人**：@杜元朔 · **CTO 提报**：@Oracle Hermes
> **小程序决策**：B. Mapbox webview 套壳（@杜元朔 拍板，Issue #35）

## Context

StudyBuddy 核心场景需要地图：
- 活动创建时选择地点（"咖啡厅、图书馆、球场…"）
- 活动列表按位置/距离筛选
- 活动详情显示地图和导航

v0.2 假设了"以中国留学生为主"，选用了**腾讯地图**。v1.0 重新判断目标用户为**全球范围内的海外留学生**（北美、欧洲、澳洲、东南亚等），腾讯地图不再合适。

## Decision

**Flutter App（iOS / Android）：统一使用 Mapbox GL Native SDK**

| 资源 | 选型 |
|------|------|
| Flutter SDK | [mapbox_maps_flutter](https://pub.dev/packages/mapbox_maps_flutter) |
| 坐标系统 | **WGS-84**（国际标准） |
| API | Mapbox Directions / Geocoding / Static Tiles API |
| Key 管理 | Mapbox secret token（在 .env / secrets 注入） |
| 离线缓存 | Mapbox offline regions（v1.1） |

**为什么是 Mapbox：**
- ✅ 全球覆盖、性能稳定（OpenStreetMap 数据）
- ✅ Flutter 官方 plugin 维护活跃
- ✅ 免费额度 50K 次/月（够 MVP）
- ✅ WGS-84 与 GPS 直接对接（无坐标系转换）
- ❌ 备选 Google Maps：海外要绑定信用卡 + 高峰期费用高
- ❌ 备选 Apple Maps（iOS 原生）：Android 端需另选

## 微信小程序地图（已决策）

v0.2 假设的"小程序用微信 map 组件"在海外主用户场景下不成立。**已决策 B** — 见 [Issue #35](https://github.com/YuanshuoDu/studybuddy/issues/35)（已 closed）。

**选定方案：B. Mapbox webview 套壳**

### 实施要点

1. **小程序用 `<web-view>` 加载 Mapbox GL JS**（H5 页面）
2. **web-view 通信**：
   - 选点前：web-view 加载 H5 页面 + 注入 Mapbox token + 初始中心点
   - 用户在 web-view 内选点 → web-view 调用 `wx.miniProgram.postMessage({data: {lat, lng, place_name}})`
   - 小程序 Page 监听 `bindmessage` 事件接收
3. **地图样式**：Mapbox Streets / Mapbox Light（与 Flutter 端一致）
4. **离线**：web-view 不支持离线地图（v1.1 评估预下载 tiles）

### 理由

- ✅ 与 Flutter 端 Mapbox 一致（同一 Mapbox 账号、同一 token、同一坐标系统）
- ✅ 覆盖全球（含国内外的海外留学生）
- ✅ 维护简单：H5 地图 + 小程序外壳
- ❌ 缺点：web-view 与小程序组件通信受限（用 postMessage 解决）
- ❌ 缺点：web-view 不能与小程序其他组件做无缝覆盖层（如 marker 弹窗），需在 H5 内实现

### 替代方案被否决

- ❌ A. 微信 map 组件：仅国内可用，海外失败
- ❌ C. Mapbox 小程序 SDK：官方未提供，社区方案不稳定
- ❌ D. 高德海外版（AMAP）：与 Mapbox 体系不一致

## 坐标系统统一

- 数据库存储：**WGS-84**（Mapbox 国际标准）
- Flutter / Mapbox：直接用 WGS-84
- 小程序 / webview：Mapbox GL JS 也用 WGS-84
- 后端：不存储多套坐标系，统一 WGS-84

## 数据流

```
用户选点 (Flutter Mapbox)
  ↓ lat/lng (WGS-84)
  ↓ POST /api/v1/activities
后端存储
  ↓ activity.location = { lat, lng, addr, place_name }
  ↓
  Mapbox Geocoding API 反向解析
  ↓ 缓存到数据库
列表筛选
  ↓ 按城市 / bounding box / 距离
  ↓ Mapbox Isochrone API（v1.1）
```

## 隐私

- **不存精确坐标到客户端**：列表用城市级别（精度 ~10km）
- **存精确坐标到服务端**：仅活动详情需要
- **GDPR**：用户可删除自己的位置历史（v1.1 数据导出 + 删除 API）

## Mapbox Key 管理

- 公开 token（URL restricted）：用于前端 SDK 加载地图
- Secret token（server-side）：用于 Geocoding / Directions API 调用
- 存放在 GitHub Secrets（CI / CD）+ AWS Secrets Manager（runtime）

## Consequences

### 优点
- ✅ 全球用户统一体验
- ✅ WGS-84 与 GPS 直连（无需转换）
- ✅ Flutter + 小程序 webview 一致
- ✅ Mapbox 配额 + 性能稳定

### 缺点
- ❌ 国内用户访问 Mapbox 慢（已不在目标范围）
- ❌ 小程序 webview 套壳需要验证 web-view 通信
- ❌ 依赖外部 SaaS（Mapbox 服务中断影响业务）

### 缓解
- Mapbox 服务中断：fallback 到 OpenStreetMap raster tiles
- 小程序地图：待 #35 决策

## 成本估算

- Mapbox 地图加载：50K/月免费（MAU 5K 以内不花钱）
- Geocoding API：100K/月免费
- Directions API：100K/月免费
- 预估 M2 阶段：**$0**（在免费额度内）
- 正式发布：50K+ MAU 后约 $50-200/月

## 验证

- M2-W6：小程序 #35 决策 + Flutter Mapbox 集成 demo
- M2-W7：三端地图一致体验截图
- M2-W8：50 人内测反馈

---

Refs:
- [ADR-0001: Flutter 选型](./0001-flutter-for-mobile.md)
- [ADR-0002: 微信小程序原生](./0002-miniprogram-native.md)
- [ADR-0005: 数据存储地域 → AWS only](./0005-data-storage-region.md)
- [Issue #35: 小程序地图决策（已选 B）](https://github.com/YuanshuoDu/studybuddy/issues/35)
- [Mapbox Flutter](https://docs.mapbox.com/flutter/maps/guides/)
