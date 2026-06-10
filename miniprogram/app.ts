/**
 * StudyBuddy 小程序 App 入口
 *
 * 职责：
 * - 启动时拉起 systemInfo、userInfo 检查
 * - 注册全局错误监听（onError / onUnhandledRejection / onPageNotFound）
 * - 提供 globalData 共享（仅做极少量轻量数据）
 * - 真实状态（user/token）走 store/
 *
 * 全局错误边界 (issue #10 — miniprogram observability):
 * - onError              捕获同步脚本错误 → 上报 wx.reportMonitor + console
 * - onUnhandledRejection 捕获未 catch 的 Promise reject → 同上
 * - onPageNotFound       处理打开不存在的页面（链接过期 / 深链失效）→ 重定向首页
 * 真正的服务端上报 / Sentry 接入留待 server 侧实现；这里只把事件喂到
 * 微信原生的 wx.reportMonitor + console（vConsole / 体验版都能看到），
 * 保证 prod 崩溃有 stack trace 可查。
 */

import { initStore } from './store/index';
import { userStore, setUser, clearAuth } from './store/user';
import { request } from './api/request';
import { authApi } from './api/auth';
import { ApiError, ErrorCode } from './utils/error';
import { reportAppError, reportUnhandledRejection } from './utils/monitoring';
import type { SystemInfo } from './types/system';

// globalData 必须保持轻量；复杂状态走 store
interface GlobalData {
  systemInfo: SystemInfo | null;
  /** 是否首次启动（用于引导页 / 弹窗） */
  isFirstLaunch: boolean;
  /** 当前环境 */
  envVersion: 'develop' | 'trial' | 'release';
}

App({
  globalData: {
    systemInfo: null,
    isFirstLaunch: true,
    envVersion: 'develop',
  } as GlobalData,

  onLaunch(options) {
    // 1. 初始化 store（恢复本地持久化数据）
    initStore();

    // 2. 采集 systemInfo
    const sys = wx.getSystemInfoSync();
    const safeArea = sys.safeArea ?? { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
    (this.globalData as GlobalData).systemInfo = {
      ...sys,
      safeArea,
      statusBarHeight: sys.statusBarHeight ?? 20,
      navBarHeight: (sys.platform === 'ios' ? 44 : 48),
      pixelRatio: sys.pixelRatio ?? 2,
    };

    // 3. 探测环境
    const accountInfo = wx.getAccountInfoSync();
    (this.globalData as GlobalData).envVersion = accountInfo.miniProgram.envVersion as GlobalData['envVersion'];

    // 4. 全局未捕获 promise 错误 — 走 monitoring 助手 + 业务错误归一
    wx.onUnhandledRejection((res) => {
      const reason = (res as { reason?: unknown }).reason;
      try {
        wx.reportMonitor('studybuddy_unhandled_rejection', 1);
      } catch {
        /* swallow */
      }
      reportUnhandledRejection(reason, { source: 'wx.onUnhandledRejection' });
      if (reason instanceof ApiError) {
        this._handleApiError(reason);
      }
    });

    // 5. 静默登录：本地有 token 就尝试静默刷新 userInfo，失败则保持未登录态
    this._silentLogin();

    console.log('[App] onLaunch', { scene: options.scene, envVersion: this.globalData.envVersion });
  },

  onShow(options) {
    (this.globalData as GlobalData).isFirstLaunch = false;
    console.log('[App] onShow', options);
  },

  onHide() {
    console.log('[App] onHide');
  },

  /**
   * 同步脚本错误 — WeChat 会把未捕获的 throw 喂到这里，error 形如
   * "MiniProgramError\nCannot read property 'x' of undefined\n    at ..."
   * 我们尽量解析出 message + stack，然后走 reportAppError 上报。
   */
  onError(error: string) {
    // 1) 微信原生性能监控 — 运营后台「性能监控」可见
    try {
      wx.reportMonitor('studybuddy_script_error', 1);
    } catch {
      /* reportMonitor 自身不可用时 swallow */
    }
    // 2) 结构化日志 + vConsole 可见
    reportAppError(error, { source: 'App.onError' });
  },

  /**
   * 打开不存在的页面 — 触发场景：分享卡片上的 path 已过期 / 公众号菜单
   * 链接被改 / push 通知 path 拼错。不弹原生错误，重定向首页 + 上报。
   */
  onPageNotFound(res: WechatMiniprogram.OnPageNotFoundListenerResult) {
    console.warn('[App] onPageNotFound', res);
    try {
      wx.reportMonitor('studybuddy_page_not_found', 1);
    } catch {
      /* swallow */
    }
    reportAppError(`PageNotFound: ${res.path}`, { source: 'App.onPageNotFound' });
    // 静默回首页，避免用户看到空白 / 原生错误弹窗
    wx.reLaunch({ url: '/pages/index/index' });
  },

  /** 静默登录：仅在本地有 token 时校验；不存在则让用户走登录页 */
  async _silentLogin() {
    const token = userStore.state.token;
    if (!token) return;
    try {
      const user = await authApi.getUserInfo();
      setUser(user);
    } catch (err) {
      if (err instanceof ApiError && err.code === ErrorCode.TOKEN_INVALID) {
        clearAuth();
      }
    }
  },

  _handleApiError(err: ApiError) {
    if (err.code === ErrorCode.TOKEN_INVALID || err.code === ErrorCode.TOKEN_EXPIRED) {
      clearAuth();
      wx.showToast({ title: '请重新登录', icon: 'none' });
      // 跳到登录页（防重入）
      const pages = getCurrentPages();
      const current = pages[pages.length - 1];
      if (current && current.route !== 'pages/login/login') {
        wx.reLaunch({ url: '/pages/login/login' });
      }
    }
  },
});

// 让 request 拿到 app 实例（用于统一错误处理）
export { request };