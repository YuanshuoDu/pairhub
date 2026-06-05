/**
 * 统一 API 配置
 *
 * - baseUrl 通过 project.private.config.json 中 build 环境变量注入
 * - 当前默认指向 mock-server（npm run mock:server 启动后可用）
 * - 生产环境从微信小程序后台域名白名单读取
 */

export const API_CONFIG = {
  baseUrl: 'https://api.pairhub.example.com',
  mockUrl: 'http://localhost:4000',
  timeout: 15000,
  /** 业务码白名单（不弹 toast） */
  bizSilenceCodes: [40101, 40102, 40301],
  /** 失败重试次数（GET 幂等接口才重试） */
  retryCount: 1,
  retryDelay: 500,
};

/** 是否 mock 模式 */
export const isMockMode = (): boolean => {
  try {
    return wx.getStorageSync('sb_mock_mode') === true;
  } catch {
    return false;
  }
};

/** 切换 mock 模式（仅 dev 用） */
export function setMockMode(enabled: boolean): void {
  try {
    if (enabled) wx.setStorageSync('sb_mock_mode', true);
    else wx.removeStorageSync('sb_mock_mode');
  } catch {
    /* noop */
  }
}
