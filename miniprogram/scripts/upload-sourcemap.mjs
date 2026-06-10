#!/usr/bin/env node
/**
 * scripts/upload-sourcemap.mjs
 *
 * 微信小程序 Source Map 上传助手 — issue #10 (miniprogram observability)
 *
 * 微信开发者工具的「代码管理 → 上传源码映射」会把 miniprogram_npm/
 * 编译产物的 source map 推到 mp 后台，这样运营在 mp.weixin.qq.com 的
 * 「运维中心 → 性能监控」里看到的崩溃栈是源码行号而不是编译后行号。
 *
 * 这个脚本包装一个开发者工具 (CLI) 上传命令，避免每次手敲一长串参数。
 *
 * 使用方式：
 *   pnpm --dir miniprogram wx:upload-sourcemap                       # 默认 (trial)
 *   pnpm --dir miniprogram wx:upload-sourcemap -- --env release     # 指定环境
 *   pnpm --dir miniprogram wx:upload-sourcemap -- --cli /path/to/cli # 自定义 CLI
 *
 * 前置依赖：
 *   - 安装微信开发者工具（含命令行工具）。macOS 默认路径：
 *     /Applications/wechatwebdevtools.app/Contents/MacOS/cli
 *   - 工具 → 设置 → 安全设置 → 服务端口：开启
 *   - 首次使用需扫码登录（脚本会提示，CLI 会弹独立窗口）。
 *
 * 失败处理：
 *   - 找不到 cli：打印安装指引，exit 2
 *   - cli 调用失败：透传退出码
 *
 * 已知限制：
 *   - 「上传源码映射」是 IDE UI 功能，没有官方 CLI 子命令。本脚本依赖的
 *     `upload-source-map` 是社区 reverse-engineer 的非官方命令，未来
 *     微信若调整需同步更新。详见 docs/ops/wechat-mp-source-map.md。
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:process';

const args = parseArgs(process.argv.slice(2));

const env = args.env ?? 'trial';
const projectPath = args.project ?? './miniprogram';
const cliPath = args.cli ?? defaultCliPath();

console.log('>> WeChat miniprogram source-map upload');
console.log(`   cli       = ${cliPath}`);
console.log(`   project   = ${projectPath}`);
console.log(`   env       = ${env}`);

if (!existsSync(cliPath)) {
  console.error(`\n!! 找不到微信开发者工具 CLI: ${cliPath}`);
  console.error('   macOS  : /Applications/wechatwebdevtools.app/Contents/MacOS/cli');
  console.error('   Windows: C:\\\\Program Files (x86)\\\\Tencent\\\\微信web开发者工具\\\\cli.bat');
  console.error('   Linux  : ./tool/ide.bin (from https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)');
  console.error('\n   安装后重试；或用 --cli /path/to/cli 显式指定。');
  process.exit(2);
}

if (!existsSync(projectPath)) {
  console.error(`\n!! 找不到小程序目录: ${projectPath}`);
  process.exit(2);
}

const cliArgs = [
  '-o', 'upload-source-map',
  '--project', projectPath,
  '--env', env,
];

console.log(`\n>> exec: ${cliPath} ${cliArgs.join(' ')}\n`);
const result = spawnSync(cliPath, cliArgs, { stdio: 'inherit', shell: false });

if (result.error) {
  console.error(`\n!! CLI 调用失败: ${result.error.message}`);
  process.exit(result.status ?? 1);
}
process.exit(result.status ?? 0);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--env') out.env = argv[++i];
    else if (a === '--project') out.project = argv[++i];
    else if (a === '--cli') out.cli = argv[++i];
    else if (a === '-h' || a === '--help') {
      console.log(HELP);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}\n\n${HELP}`);
      process.exit(2);
    }
  }
  return out;
}

function defaultCliPath() {
  switch (platform) {
    case 'darwin':
      return '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
    case 'win32':
      return 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat';
    default:
      return './tool/ide.bin';
  }
}

const HELP = `Usage: pnpm wx:upload-sourcemap [--env trial|develop|release] [--project <path>] [--cli <path>]`;