/**
 * 统一 API 配置
 *
 * - baseUrl 通过 project.private.config.json 中 build 环境变量注入
 * - 当前默认指向 mock-server（npm run mock:server 启动后可用）
 * - 生产环境从微信小程序后台域名白名单读取
 */

export const API_CONFIG = {
  baseUrl: 'https://api.studybuddy.example.com',
  mockUrl: 'http://localhost:4000',
  timeout: 15000,
  /** 业务码白名单（不弹 toast） */
  bizSilenceCodes: [40101, 40102, 40301],
  /** 失败重试次数（GET 幂等接口才重试） */
  retryCount: 1,
  retryDelay: 500,
};

/**
 * 业务端点 base URL（仅域名部分，不含 /api/v1 前缀）
 *
 * 业务代码（页面、API 客户端）应通过此常量拼接完整端点，而不是硬编码
 * host，避免在多环境（dev / mock / 生产）切换时需要全文检索替换。
 */
export const API_BASE = API_CONFIG.baseUrl;

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
