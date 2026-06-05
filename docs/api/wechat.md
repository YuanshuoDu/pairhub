# StudyBuddy — 微信生态集成规范

> 配套 [spec-v0.2.md](../spec-v0.2.md)  
> 维护人：**@爱马仕**（@OpenClaw机器人-1896 协助测试）  
> 注意：腾讯系 AI 角色外网受限，所有调用与截图需在境内网络环境完成

## 1. 微信小程序登录

### 1.1 时序

```
1. 小程序调用 wx.login() → 拿到 code
2. 小程序 POST /api/auth/wx-login { code, nickname, avatar }
3. 后端用 code + appid + appsecret 调 https://api.weixin.qq.com/sns/jscode2session
4. 拿到 openid + session_key
5. 查/建 User，签 JWT 返回
6. 小程序存 jwt 到 storage，后续 Authorization: Bearer <jwt>
```

### 1.2 关键点

- **appid/appsecret 仅在后端使用**，前端永不接触
- 首次登录未传 `nickname/avatar` 时，前端需调 `wx.getUserProfile` 弹窗
- session_key 用于解密加密数据（如手机号），**不存数据库**，仅缓存
- `unionid` 需同主体下多个小程序/公众号打通时再用，MVP 可不取

### 1.3 错误处理

| 微信返回 errcode | 含义 | 后端处理 |
|------------------|------|----------|
| 0 | 成功 | 正常 |
| 40029 | code 无效 | 返回 401 INVALID_CODE |
| 45011 | 频率限制 | 返回 429 WX_RATE_LIMITED |
| -1 / 其他 | 系统繁忙 | 重试 1 次，仍失败返回 502 WX_UNAVAILABLE |

## 2. 微信内容安全 API（必接）

### 2.1 接口

- **文本**：`POST https://api.weixin.qq.com/wxa/msg_sec_check?access_token=...`
- **图片**：`POST https://api.weixin.qq.com/wxa/img_sec_check?access_token=...`

### 2.2 接入策略

- **创建活动**：`description` 与 `title` 异步调文本安全，过滤失败则标记 `content_check = BLOCKED`，从列表中隐藏
- **报名留言**：`signup.message` 同上
- **用户 bio**：更新时同步过滤

### 2.3 access_token 缓存

- `access_token` 有效期 2 小时，**必须** Redis 缓存（key: `wx:access_token`，TTL 7000s）
- 多实例部署需分布式锁防雪崩（key: `wx:access_token:lock`，TTL 10s）

## 3. 订阅消息（P1）

- 用户报名成功 / 活动即将开始 / 活动被取消时推订阅消息
- 需用户在小程序内点击 `wx.requestSubscribeMessage` 授权
- 模板消息字段：
  - 活动开始提醒：`{{thing1.DATA}}` 活动名 / `{{date2.DATA}}` 时间 / `{{thing3.DATA}}` 地点
  - 报名成功：`{{thing1.DATA}}` 活动名 / `{{phrase2.DATA}}` 报名结果 / `{{date3.DATA}}` 报名时间

## 4. 腾讯地图

### 4.1 SDK

- 小程序端：[微信小程序 JavaScript SDK](https://lbs.qq.com/qqmap_wx_jssdk/)
- 选点组件：使用 `chooseLocation` 让用户从地图上选点

### 4.2 坐标系

- 微信小程序原生 `wx.getLocation` 返回 **WGS-84**
- 腾讯地图 SDK 返回 **GCJ-02**
- **统一在数据库存储 GCJ-02**（腾讯坐标系），入库前做转换
- 转换工具：`coordtransform.js` 或腾讯 `QQMapWX.render` 的 `fromWgs84ToGcj02`

### 4.3 地理筛选后端

- PostgreSQL + PostGIS：`(location_lat, location_lng)` 用 `POINT` 类型 + GIST 索引
- 简化方案（MVP 首选）：`location_lat DECIMAL, location_lng DECIMAL`，用 Haversine 公式在 SQL 中算距离
  - 见 [server/prisma/queries/activity-search.sql](../../server/prisma/queries/activity-search.sql) （待写）

## 5. 微信支付（P2 - 留空）

押金/分摊功能在 M2 引入，本节后续补充。

## 6. 域名白名单

小程序需要在小程序管理后台配置：

| 域名 | 类型 |
|------|------|
| `api.studybuddy.example.com` | request 合法域名 |
| `apis.map.qq.com` | request 合法域名 |
| `api.weixin.qq.com` | request 合法域名 |

## 7. 待办（@爱马仕）

- [ ] 申请小程序 AppID（@杜元朔 提供主体）
- [ ] 申请腾讯地图开发者 Key
- [ ] 确认内容安全 API 调用配额
- [ ] 调研：是否需要 ICP 备案（取决于部署位置）
- [ ] 调研：海外用户访问备案限制（境外用户可能需 Web H5 fallback）
