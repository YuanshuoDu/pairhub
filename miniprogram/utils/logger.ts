/**
 * 简单日志工具
 *
 * - 开发环境打 console
 * - 生产环境静默
 * - 统一前缀，便于检索
 */

const PREFIX = '[StudyBuddy]';

function enabled(): boolean {
  try {
    const account = wx.getAccountInfoSync();
    return account.miniProgram.envVersion !== 'release';
  } catch {
    return true;
  }
}

export const logger = {
  log(...args: unknown[]): void {
    if (enabled()) console.log(PREFIX, ...args);
  },
  warn(...args: unknown[]): void {
    if (enabled()) console.warn(PREFIX, ...args);
  },
  error(...args: unknown[]): void {
    if (enabled()) console.error(PREFIX, ...args);
  },
  info(...args: unknown[]): void {
    if (enabled()) console.info(PREFIX, ...args);
  },
};
