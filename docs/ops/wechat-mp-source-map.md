# 微信小程序 Source Map 上传工作流

> Issue #10 — miniprogram observability / 错误边界
>
> **目标**：把生产环境的崩溃栈从编译后行号还原成源码行号，让「运维中心 →
> 监控告警 → 性能监控」里看到的栈可读、可定位。

---

## 1. 为什么需要 source map

StudyBuddy 小程序的 `miniprogram/` 是 TypeScript + 自定义 PostCSS-like WXSS，
由微信开发者工具编译为：

| 源文件                          | 编译产物                     |
| ------------------------------- | ---------------------------- |
| `miniprogram/app.ts`            | `miniprogram/app.js`         |
| `miniprogram/pages/foo/index.ts`| `miniprogram/pages/foo/index.js` |
| `miniprogram/app.wxss`          | `miniprogram/app.wxss`（同）  |

线上崩溃栈拿到的行号是 `app.js` 的，不是 `app.ts` 的，定位成本极高。
微信提供「源码映射」机制：编译时生成的 `.js.map` 跟着版本号传到 mp 后台，
后台在展示崩溃栈时自动反查源码。

**前提**：必须把 `.map` 文件上传到 mp 后台，否则崩溃栈永远是编译后行号。

---

## 2. 上传步骤（开发者工具 UI）

> ⚠️ **当前推荐的人工流程**。CLI 流程见 §3 — 待官方命令稳定后切到 CLI。

1. 打开**微信开发者工具**，加载 `miniprogram/` 项目。
2. 顶部菜单 → **工具 → 构建 npm**（如果用了 npm 依赖；本项目无）。
3. 顶部菜单 → **代码管理 → 上传**（首次会弹窗填版本号 / 项目备注）。
4. 上传完成后，工具会在 `miniprogram/` 下生成 `miniprogram_npm/` 目录以及
   `project.config.json` 里 `miniprogramRoot` 指向的编译产物。
5. **关键步骤**：再次点击 **代码管理 → 上传源码映射**（部分版本叫「上传 sourcemap」）。
   - 会弹窗选择**当前要关联的线上版本**（必须选刚刚上传的那个版本号）。
   - 工具读取 `miniprogram/` 下的 `.map` 文件，批量推到 mp 后台。
6. 等待「上传成功」提示。日志可在 mp 后台「运维中心 → 监控告警 → 性能监控
   → 错误日志」里看到对应版本的栈。

> 💡 每次发版都要重复步骤 3 + 5，源码映射跟版本号一一对应。

---

## 3. 命令行流程（`pnpm wx:upload-sourcemap`）

`miniprogram/scripts/upload-sourcemap.mjs` 包装了开发者工具 CLI，命令：

```bash
pnpm --dir miniprogram wx:upload-sourcemap                       # 上传到 trial 环境
pnpm --dir miniprogram wx:upload-sourcemap -- --env release     # 上传到 release
pnpm --dir miniprogram wx:upload-sourcemap -- --cli /custom/path/to/cli
```

### 3.1 前置依赖

| 系统    | 默认 CLI 路径                                                                  |
| ------- | ------------------------------------------------------------------------------ |
| macOS   | `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`                       |
| Windows | `C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat`                     |
| Linux   | `./tool/ide.bin`（从 [官方下载页](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html) 解压） |

首次使用需要在开发者工具里开启「服务端口」：**设置 → 安全设置 → 服务端口**。

### 3.2 工作原理

脚本调用 `cli -o upload-source-map --project <path> --env <env>`。
- `-o upload-source-map` 是微信开发者工具 1.06+ 的非官方子命令（reverse-engineer），
  官方正式名称曾叫 `upload-sourcemap`；若微信调整，请同步更新脚本并在此处
  注明新命令。
- `--project` 是小程序项目根目录（含 `project.config.json`），默认 `./miniprogram`。
- `--env` 取值 `develop` / `trial` / `release`，决定推到哪个 mp 环境。

### 3.3 失败模式

| 现象                              | 处理                                                                 |
| --------------------------------- | -------------------------------------------------------------------- |
| `找不到微信开发者工具 CLI`        | 按默认路径表检查；或 `--cli <path>` 显式指定。                       |
| `服务端口未开启`                  | 开发者工具 → 设置 → 安全设置 → 服务端口：开启。                      |
| `项目未登录`                      | 首次使用需在开发者工具里手动扫码；CLI 不弹窗。                       |
| `upload-source-map 命令不存在`    | 微信 CLI 更新后子命令改名；查官方 release notes 并同步更新本脚本。 |

---

## 4. 与 `miniprogram/app.ts` 错误边界的协作

source map 只解决**栈可读性**，**事件采集**由以下三处 handler 完成：

| Handler                          | 触发场景                          | 上报目标                        |
| -------------------------------- | --------------------------------- | ------------------------------- |
| `App.onError(error)`             | 同步脚本 throw，未被 catch        | `wx.reportMonitor` + `console`  |
| `wx.onUnhandledRejection(res)`   | 未 catch 的 Promise reject        | `wx.reportMonitor` + `console`  |
| `App.onPageNotFound(res)`        | 打开不存在的页面                  | `wx.reportMonitor` + `console` + `wx.reLaunch` 回首页 |

事件格式统一在 `miniprogram/utils/monitoring.ts` 里定义（`AppErrorEvent`）。
后续接入 server 端 `/api/v1/admin/monitoring/wxapp-error` 时，保持该 shape
即可，handler 改动量为零。

---

## 5. 验证清单

- [ ] 微信开发者工具能正常打开 `miniprogram/` 项目。
- [ ] 工具 → 设置 → 安全设置 → 服务端口：已开启。
- [ ] `pnpm --dir miniprogram wx:upload-sourcemap -- --env trial` 退出码为 0。
- [ ] mp.weixin.qq.com → 运维中心 → 性能监控 → 错误日志，能看到刚才上传的 trial
      版本，且错误栈的行号对应源码（不是编译后行号）。
- [ ] release 发版后重复步骤；CI 流水线可在发版 job 末尾追加
      `pnpm --dir miniprogram wx:upload-sourcemap -- --env release`。

---

## 6. 已知限制 / TODO

- **CLI 是非官方子命令**：微信开发者工具没有正式的 `upload-source-map`
  命令文档，本脚本基于社区经验。若微信正式公开后请更新本文档 + 脚本。
- **缺 server 端采集**：本任务只做了客户端上报 + console。后续接入自家
  Sentry / Prometheus 时，再补 server endpoint（详见
  `.harness/plan-optimization.yaml` 的 issue #10 后续条目）。
- **不自动跑**：当前流程是手动 / 半自动（人工触发 + CLI）。等 mp 后台
  支持 webhook 自动同步后再做全自动。
- **不进 git**：`.map` 文件不进 git；上传依赖开发者工具在本地构建产物里
  抽出来的那一份。如果以后改用 miniprogram-ci / 自建构建，需要把 `.map`
  生成步骤显式加进 CI pipeline。

---

## 7. 相关文件

| 路径                                          | 作用                                          |
| --------------------------------------------- | --------------------------------------------- |
| `miniprogram/app.ts`                          | `onError` / `onPageNotFound` / `onUnhandledRejection` 注册点 |
| `miniprogram/utils/monitoring.ts`             | 结构化事件 + `wx.reportMonitor` 封装          |
| `miniprogram/scripts/upload-sourcemap.mjs`    | 上传 CLI 包装                                 |
| `miniprogram/package.json`                    | `wx:upload-sourcemap` 脚本入口                |
| `.github/workflows/miniprogram-ci.yml`        | 「validate miniprogram scaffold」             |
| `.github/workflows/miniprogram-stylelint.yml` | WXSS lint（与本文档无关）                     |