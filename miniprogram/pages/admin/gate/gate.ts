/**
 * Admin 入口页（issue #32 前端 / docs/design/admin-glass.md §6.1）
 *
 * 流程：
 *   1. onLoad 调 GET /api/v1/users/me 读当前 user.role
 *   2. role === 'ADMIN' → 立即 redirect 到 /pages/admin/dashboard
 *   3. 否则：渲染「需要管理员授权」玻璃卡，附带可复制的 SQL 提示
 *      （与 docs/admin/playbook.md §1 一致）
 *
 * 设计：
 *   - 4 色 mesh 背景（4 个绝对定位 view + filter: blur + mix-blend-mode）
 *   - 玻璃面板承载角色信息 + SQL hint
 *   - 复制按钮：wx.setClipboardData
 *   - 暗色为默认（与 design brief §1 一致）
 *
 * 暗色检测：取 wx.getSystemInfoSync().theme === 'dark'；再叠加 miniprogram
 * 编译时常量 `__ADMIN_DARK_DEFAULT`（由调用方在 app.json window 配置，
 * 我们这里写死 true，因为 brief §1 指定 dark 为默认）。
 *
 * 减动效：getSystemInfoSync() 在低电量模式（iOS）/ 弱机（Android）下用
 * model / pixelRatio 近似判断，加 .reduce-motion class 关闭 mesh drift。
 */

import { authApi } from '../../../api/auth';
import { userStore } from '../../../store/user';
import { ApiError } from '../../../utils/error';
import { logger } from '../../../utils/logger';

const SQL_HINT = `-- One-time: grant admin to an existing user (replace id).
UPDATE users
SET    role = 'ADMIN', updated_at = NOW()
WHERE  id = 'usr_replace_with_real_id';`;

interface GateData {
  /** 当前登录用户的角色（来自 /users/me），null = 未知/未登录 */
  role: 'ADMIN' | 'USER' | null;
  /** 当前用户昵称（仅展示） */
  nickname: string;
  /** 进入时正在做 /users/me 探测 */
  checking: boolean;
  /** /users/me 探测失败原因 */
  errorMsg: string;
  /** 复制按钮最近一次状态（idle / copied / failed） */
  copyState: 'idle' | 'copied' | 'failed';
  /** 是否在减动效模式（低电量 / 弱机） */
  reduceMotion: boolean;
  /** 主题 — brief §1：dark 是默认 */
  theme: 'dark' | 'light';
  /** /users/me 调用是否已完成（用来区分"刚开始查"和"查完是 USER"） */
  resolved: boolean;
  /** SQL hint（注入到 WXML 渲染） */
  sqlHint: string;
}

interface GateCustom {
  _meTimer?: number;
  _bootstrap: () => Promise<void>;
  onCopySql: () => void;
  onRefresh: () => void;
  onExit: () => void;
}

Page<GateData, GateCustom>({
  data: {
    role: null,
    nickname: '',
    checking: true,
    errorMsg: '',
    copyState: 'idle',
    reduceMotion: false,
    theme: 'dark',
    resolved: false,
    sqlHint: SQL_HINT,
  },

  onLoad() {
    // 1. 决定主题（brief §1：dark 是默认；不在 iOS / Android 上做系统跟随 —
    //    设计语言锁了"dark 是默认；light 是 parity"）
    this.setData({ theme: 'dark' });

    // 2. 决定是否减动效
    try {
      const sys = wx.getSystemInfoSync();
      const lowPower =
        // iOS Low Power Mode：baseLibrary >= 2.20.3 才有该字段
        // @ts-expect-error 系统字段，类型不全
        sys.batteryLevel !== undefined && sys.batteryLevel <= 0.2;
      const weakDevice = (sys.platform === 'android' && sys.model?.includes('vivo Y')) ||
        sys.platform === 'devtools';
      this.setData({ reduceMotion: !!(lowPower || weakDevice) });
    } catch {
      this.setData({ reduceMotion: false });
    }

    // 3. 探测当前用户
    this._bootstrap();
  },

  onUnload() {
    if (this._meTimer) {
      clearTimeout(this._meTimer);
    }
  },

  async _bootstrap() {
    // 没登录 → 直接展示 SQL hint
    if (!userStore.state.token || !userStore.state.user) {
      this.setData({
        checking: false,
        resolved: true,
        role: null,
        errorMsg: '请先在首页登录后再进入 Admin',
      });
      return;
    }

    this.setData({ checking: true, errorMsg: '' });
    try {
      const me = await authApi.getUserInfo();
      const role = (me as unknown as { role?: 'ADMIN' | 'USER' }).role ?? 'USER';
      this.setData({
        role,
        nickname: me.nickname || '',
        checking: false,
        resolved: true,
      });
      if (role === 'ADMIN') {
        // 短暂展示 "✓ 检测到管理员" 再跳，给一点反馈
        this._meTimer = setTimeout(() => {
          wx.redirectTo({ url: '/pages/admin/dashboard/dashboard' });
        }, 600) as unknown as number;
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.userMessage : '探测失败';
      logger.warn('[admin/gate] getUserInfo failed', msg);
      this.setData({
        checking: false,
        resolved: true,
        errorMsg: msg,
        role: null,
      });
    }
  },

  onCopySql() {
    wx.setClipboardData({
      data: SQL_HINT,
      success: () => {
        this.setData({ copyState: 'copied' });
        wx.showToast({ title: 'SQL 已复制', icon: 'success' });
        setTimeout(() => this.setData({ copyState: 'idle' }), 1500);
      },
      fail: () => {
        this.setData({ copyState: 'failed' });
        wx.showToast({ title: '复制失败', icon: 'none' });
        setTimeout(() => this.setData({ copyState: 'idle' }), 1500);
      },
    });
  },

  onRefresh() {
    this._bootstrap();
  },

  onExit() {
    wx.reLaunch({ url: '/pages/index/index' });
  },
});
