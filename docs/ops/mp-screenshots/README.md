# 微信小程序审核截图占位

> ⚠️ **这是占位说明**。实际截图待真机跑（M3 W1 体验版发布后）由 运营 + UI 协同完成。
> 跟踪 issue：#29  ·  预计出图时间：M3 W1（iOS / Android 体验版就位后）

## 当前状态

```
docs/ops/mp-screenshots/
├── README.md         ← 本文件
├── 01-login.png      ← 待补
├── 02-home.png       ← 待补
├── 03-list.png       ← 待补
├── 04-detail.png     ← 待补
├── 05-create.png     ← 待补
├── 06-signup-success.png  ← 待补
├── 07-profile.png    ← 待补
└── 08-privacy.png    ← 待补
```

## 截图要求

详见 [`docs/ops/mp-audit-config.md` §4](../mp-audit-config.md#4-审核截图5-8-张--1-段-15s-录屏)。

### 关键约束

1. **必须真机**（微信开发者工具 → 预览 → 扫码用真机访问）
2. 状态栏：时间信号满格，**不显示 debug/调试信息**
3. 内容：用真实数据，不要 placeholder（"张三""清华大学""图书馆二楼自习"）
4. 截图分辨率：建议 iPhone 14 / 小米 14 主流尺寸（1170×2532 / 1200×2672）
5. 每张图 < 2MB，**不要含小程序右上角胶囊按钮被裁掉**
6. UI 必须使用 release 配置（不要 dev tools / 不要 sourcemap 浮窗）

## 出图 SOP（运营 + UI 协同）

### Step 1: 准备测试数据
- 10 个真实活动（5 个 study + 3 个 sports + 2 个 board_game）
- 20 个测试用户（不同学校：NYU / UBC / UCL / 墨大 / 港大 / 港中文 / 南洋理工 / 多伦多大学 / 曼大 / 悉尼大学）
- 测试活动标题覆盖各种场景：周末 / 考试周 / 跨城市 / 首次活动

### Step 2: 准备测试账号
- 微信测试账号：`test-reviewer@studybuddy.app`（小程序后台版本说明里给审核员）
- 已报名 5 个活动 + 2 个历史活动评价
- 个人资料：头像 + 昵称 + 学校 + 学院

### Step 3: 真机跑 + 截图
按 `mp-audit-config.md §4.1` 表格顺序，每张图：
- iOS 端：iPhone 14（iOS 17+）截图
- Android 端：小米 14（HarmonyOS 4 / Android 14）截图
- 文件名加后缀：`01-login-ios.png` `01-login-android.png`

### Step 4: 录屏
- iPhone 14 录屏 15s 路径：首页 → 活动列表 → 详情 → 报名 → 报名成功
- 转 mp4 + 压缩到 < 5MB

### Step 5: 上传到后台
- mp.weixin.qq.com → 版本管理 → 上传体验版
- 审核页 → 填写 5-8 张截图 + 15s 录屏

## 关联

- 主文档：[`docs/ops/mp-audit-config.md`](../mp-audit-config.md)
- iOS TestFlight：issue #30（PR #45 ✅）
- Android 发布：issue #31（待 M3 W1）
- 内容审核（敏感词规避）：issue #26（PR #49 ✅）
