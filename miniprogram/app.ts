/**
 * StudyBuddy 小程序 App 入口
 *
 * 职责：
 * - 启动时拉起 systemInfo、userInfo 检查
 * - 注册全局错误监听
 * - 提供 globalData 共享（仅做极少量轻量数据）
 * - 真实状态（user/token）走 store/
 */

import { initStore } from './store/index';
import { userStore, setUser, clearAuth } from './store/user';
import { request } from './api/request';
import { authApi } from './api/auth';
import { ApiError, ErrorCode } from './utils/error';
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

    // 4. 全局未捕获 promise 错误
    wx.onUnhandledRejection((res) => {
      console.error('[onUnhandledRejection]', res.reason);
      const reason = (res as { reason?: unknown }).reason;
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

  onError(error: string) {
    console.error('[App] onError', error);
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
