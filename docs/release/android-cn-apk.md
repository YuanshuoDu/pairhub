# 国内 APK 直发 + 国内市场分发 runbook (issue #31)

> **先 APK 直发 + 自有下载页**，目标用户所在地（学校/中超/留学中介）拉
> 新。等用户量起来后，按 ROI 选择性上国内市场（华为/小米/OPPO/vivo/
> 应用宝/360 等）。

> **为什么先不上 Google Play 中国版**？Google Play 在大陆**没有**官方
> 站点（2017 年后被墙），国内 Android 用户拿不到。直接走 APK 直发
> + 国内市场是覆盖大陆 90%+ 用户的唯一路径。

## TL;DR

```bash
# 1. one-time: 签名 keystore（同 Google Play 的 .jks，可复用）
# 2. one-time: 写 app/android/key.properties
cp app/android/key.properties.example app/android/key.properties
$EDITOR app/android/key.properties

# 3. 构建 universal APK
cd app/
bundle install
bundle exec fastlane android build_apk_cn
# → build/app/outputs/flutter-apk/app-release.apk
# (~ 60-80 MB universal，3 个 ABI 打包在一起)

# 4. 上传到自有下载页（pairhub.app/download）
# （走 docs/ops/marketing 网站的 v1.1 流程，先用 GitHub release 当 fallback）

# 5. 在国内大学 / 中超 / 留学中介 的社群发下载链接 + 海报
```

## APK vs AAB

| | AAB (Google Play) | APK (国内) |
| --- | --- | --- |
| 包含 ABI | 按需下载（Play 服务端拆） | 全 ABI 打包（universal） |
| 文件大小 | 25-30 MB / ABI | 60-80 MB（3 ABI: armv7 + arm64 + x86_64） |
| 签名校验 | Play 强制 + Google 重新签 | 仅开发者签名（用户首次安装需"允许未知来源"） |
| 用户感知 | 透明 | 第一次会弹"未知来源"提示（v8+ 默认禁止） |
| 分发 | 仅 Play Store | 任意（APK mirror、自有下载页、国内市场） |

国内 APK 用 universal 单包：用户不用选 ABI，运营商镜像/网盘分享也
简单。文件大小是 trade-off：60-80 MB 对 4G/WiFi 用户不是问题。

## one-time setup

### 1. 签名 keystore

**和 Google Play 共用同一个 `.jks`**（同一个 applicationId
`com.pairhub.app`，签名一致可以让用户后续从 Google Play 装的版本
和你直发的版本互认）。

参见 `docs/release/android-google-play.md#6-签名-keystore` 的
keytool 命令。**不要**为了"国内分发"重新生成 keystore。

### 2. 隐私政策 + 用户协议

国内上架**必须**有这两份，且必须中文 + 在应用内**首启弹窗**展示。

- 已有：`docs/ops/legal/privacy-policy.zh.md`（5,653 字节）
- 已有：`docs/ops/legal/terms-of-service.zh.md`（4,818 字节）
- 首启弹窗：`app/lib/features/onboarding/consent_screen.dart`（v1.1 计划）

> 工信部 + 各国版署要求：首启必须**强制**用户阅读 + 同意才能进入应用
> 主界面。不同意应允许退出（不强制同意）。

### 3. ICP 备案

大陆境内的 server 域名 `pairhub.app` 走海外 DNS 解析，**不需要**
ICP 备案（你的 API server 在 AWS Frankfurt，DNS 在 Cloudflare）。但
如果你做 v1.1 国内落地页（pairhub.cn / pairhub.com.cn），那
个域名**必须**做 ICP 备案，工信部审批，10-30 天。

短期内用 GitHub Pages / Vercel 海外托管 + QR code 引导 → 微信小
程序，绕开 ICP。

## per-release flow

### 1. 构建 universal APK

```bash
cd app/
bundle install
bundle exec fastlane android build_apk_cn
# → build/app/outputs/flutter-apk/app-release.apk
```

APK 大小 sanity check：

```bash
ls -lh build/app/outputs/flutter-apk/app-release.apk
# 预期：60-80 MB（universal，3 个 ABI）
# 如果 < 30 MB：abiFilters 可能错了，universal 模式没启用
```

### 2. APK 自检

```bash
$ANDROID_HOME/build-tools/34.0.0/aapt2 dump badging \
  build/app/outputs/flutter-apk/app-release.apk
# 验证：
#   package: name='com.pairhub.app' versionCode='1' versionName='0.1.0'
#   sdkVersion:'21' targetSdkVersion:'34'
#   native-code: 'arm64-v8a' 'armeabi-v7a' 'x86_64'
#   application-label:'Pairhub'
#   uses-permission: name='android.permission.INTERNET'
```

安装到真机做最后一轮 sanity：

```bash
adb install -r build/app/outputs/flutter-apk/app-release.apk
adb shell am start -n com.pairhub.app/.MainActivity
# 验证：
#   - 启动无 crash（关键 ProGuard 测试）
#   - 地图瓦片能加载（关键 Mapbox 测试）
#   - 位置权限弹窗正常
#   - 一键登录 / 手机号登录 路径打通
#   - 创建活动 + 报名闭环
```

### 3. 上传到自有下载页

v1.0 用 GitHub Release 当临时分发通道（最快）：

```bash
gh release create v1.0.0 \
  build/app/outputs/flutter-apk/app-release.apk \
  --title "Pairhub v1.0.0 (国内 APK 直发)" \
  --notes-file .harness/release-notes-1.0.0.md
# → https://github.com/YuanshuoDu/pairhub/releases/tag/v1.0.0
```

下载链接 = `https://github.com/YuanshuoDu/pairhub/releases/download/v1.0.0/app-release.apk`

二维码（用任何 QR 生成器，把上面这个 URL 喂进去）贴到：
- 微信群 / 朋友圈
- 海报
- 留学中介 / 中超

### 4. （v1.1）自有下载页

`https://pairhub.app/download`（CN 域名）落地页：
- 大号下载按钮（"Android 下载" + "iOS TestFlight" + "微信小程序"）
- 截图轮播
- FAQ 折叠
- 二维码（带版本号）

v1.0 阶段 GitHub Release 够用，v1.1 再做下载页。

## 国内市场上架（v1.1 计划）

按 ROI 排序，**先把 GitHub APK 直发跑通 + 用户量到 5k+ 再上市场**。
硬性成本（每家都要）：
- 公司营业执照（已开 / 待开）
- 软件著作权登记（¥300-800，30-60 天，加急 ¥1500 / 15 天）
- 法人身份证 + 银行账户（收款）
- 应用图标 + 截图 + 隐私政策 URL + 用户协议 URL
- 客服电话 / 邮箱
- "应用来源"声明（自研 / 委托 / 代理）

| 市场 | 上架费 | 结算 | 用户占比 | 备注 |
| --- | --- | --- | --- | --- |
| 华为应用市场 | 免费 | 70%/30% 分 | 25-30% | 审核 1-3 天 |
| 小米应用商店 | 免费 | 70%/30% 分 | 15-20% | 审核 1-2 天 |
| OPPO 软件商店 | 免费 | 70%/30% 分 | 10-15% | 审核 1-2 天 |
| vivo 应用商店 | 免费 | 70%/30% 分 | 10-15% | 审核 1-2 天 |
| 应用宝（腾讯） | 免费 | 70%/30% 分 | 10-15% | 审核 3-5 天，最严 |
| 360 手机助手 | 免费 | 70%/30% 分 | 5% | 审核 2-3 天 |
| 百度手机助手 | 免费 | 70%/30% 分 | 3% | 审核 1-3 天 |

**审核雷区**（v1.0 内容容易踩）：
- "评价 / 评分" 字眼 → 改成 "反馈 / 心愿"
- "用户生成内容" → 描述里强调"已接入内容安全审核 API"
- "位置" → 说明"仅在用户主动开启时使用"
- "通知" → 写明通知场景 + 提供关闭入口
- 强制注册 → 提供"游客模式"或"手机号验证码 + 一键登录"二选一

## APK 签名 + 升级

### 升级路径

用户从 v1.0 (APK 直发) 升级到 v1.1 (APK 直发 / 国内市场)：

```bash
adb install -r app-release.apk
# -r 标志 = 保留数据升级（仅当签名一致时）
```

如果**签名不一致**（不同 .jks 签的），用户必须先卸载 v1.0 → 失去
所有本地数据（草稿活动、未同步的设置等）。**这是为什么我们和
Google Play 共用同一个 .jks** —— 同 applicationId 同签名 = 升级无感。

### 校验签名一致性

```bash
# 导出 v1.0 APK 的证书指纹
$ANDROID_HOME/build-tools/34.0.0/apksigner verify --print-certs \
  app-release-v1.0.apk | grep SHA-256
# 导出 v1.1 APK 的证书指纹
$ANDROID_HOME/build-tools/34.0.0/apksigner verify --print-certs \
  app-release-v1.1.apk | grep SHA-256
# 两个 SHA-256 必须一致
```

## 安装教学（给到最终用户）

最终用户多半是留学生 / 学生家长，未必熟悉"允许未知来源"。

### 教学文案（中英）

**中文**：

> **下载后无法安装？**
>
> 1. 打开手机"设置" → "应用" → "特殊应用权限" → "安装未知应用"
> 2. 找到你刚下载 APK 用的浏览器 / 文件管理器
> 3. 打开"允许安装未知应用"
> 4. 重新点击 APK 文件
>
> 看不到"特殊应用权限"菜单？每个手机品牌叫法不同：
> - 华为：设置 → 安全 → 更多安全设置 → 安装未知应用
> - 小米：设置 → 隐私保护 → 特殊权限 → 安装未知应用
> - OPPO：设置 → 安全 → 安装未知应用

**English**：

> **Can't install after download?**
>
> 1. Settings → Apps → Special app access → Install unknown apps
> 2. Find the browser / file manager you used to download the APK
> 3. Toggle "Allow from this source" on
> 4. Re-tap the APK file
>
> Different phone brands use different wording for this menu. The
> path above works on stock Android 11+.

## 国内 5 大常见问题（v1.0 直发版本预期会踩）

1. **"下载完找不到文件"** → 默认下载目录是 `Download/`，但部分手机
   把 APK 放在 `Download/Pairhub/`，加进 FAQ
2. **"提示病毒风险"** → MIUI / EMUI 默认有"病毒扫描"，APK 第一次
   安装会弹"该应用可能存在风险"。需要在 FAQ 写明"Pairhub 是开源
   软件，源码在 github.com/YuanshuoDu/pairhub"
3. **"安装时提示"应用未安装""** → 通常是签名 / ABI 不匹配。检查
   `abiFilters` 是否包含目标设备的 ABI
4. **"位置权限获取不到"** → 国内手机（特别是华为）的"模糊位置"必须
   关闭才能获取精确位置，FAQ 写明
5. **"推送收不到"** → TPNS 需要应用在前台时由用户**主动开启**通知
   权限；后台推送依赖厂商白名单（华为/小米要单独申请），v1.0 不走
   TPNS 推送（用 FCM 海外 + WeChat 模板）

## Cost / 时间预算

| 项 | 一次性 | 每次发版 |
| --- | --- | --- |
| 软件著作权登记 | ¥300-800，30-60 天 | - |
| ICP 备案（自有域名） | ¥0，10-30 天 | - |
| 国内市场上架 | ¥0 | 30-60 min / 市场（提包 + 等待审核） |
| GitHub Release 资产 | ¥0 | 5 min |
| 客服 / FAQ 维护 | - | 30 min / 周 |

## 推荐的 v1.0 阶段策略

**只发 GitHub Release + 微信群/朋友圈**。等 1-2 周看：
- 安装量 < 500：当前文案 / 渠道不奏效，迭代文案（不是上市场）
- 500-5000：加 Vercel 落地页（`pairhub.app/download`）
- 5000+：开始上华为/小米两个最大的市场
- 10000+：上剩下 4-5 个市场
