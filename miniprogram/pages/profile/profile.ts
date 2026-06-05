/**
 * 个人主页
 */

import { userStore, clearAuth } from '../../store/user';
import { authApi } from '../../api/auth';
import { autoBindUnload } from '../../store/hooks';
import type { User } from '../../types/user';

interface ProfileData {
  userInfo: User | null;
  avatarText: string;
  stats: { published: number; signedUp: number; finished: number; friends: number };
}

Page<ProfileData, Record<string, any>>({
  data: {
    userInfo: null,
    avatarText: '?',
    stats: { published: 0, signedUp: 0, finished: 0, friends: 0 },
  },

  onLoad() {
    // 订阅 userStore 变化
    autoBindUnload(
      userStore as any,
      (state: any) => ({ userInfo: state.user }),
      this as any,
    );
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 });
    }
    this._refresh();
  },

  _refresh() {
    const user = userStore.state.user;
    this.setData({
      userInfo: user,
      avatarText: user?.nickname?.[0]?.toUpperCase() || '?',
      stats: { published: 3, signedUp: 7, finished: 12, friends: 5 },
    });
  },

  onEditTap() {
    if (!this.data.userInfo) {
      this.onLogin();
      return;
    }
    wx.showToast({ title: '编辑资料开发中', icon: 'none' });
  },

  onMenuTap(e: WechatMiniprogram.TouchEvent) {
    const url = e.currentTarget.dataset.url as string;
    wx.showToast({ title: `打开 ${url}`, icon: 'none' });
  },

  onLogin() {
    wx.reLaunch({ url: '/pages/login/login' });
  },

  async onLogout() {
    const res = await new Promise<boolean>((resolve) => {
      wx.showModal({
        title: '提示',
        content: '确定要退出登录吗？',
        success: (r) => resolve(r.confirm),
      });
    });
    if (!res) return;
    try {
      await authApi.logout();
    } finally {
      clearAuth();
      wx.reLaunch({ url: '/pages/login/login' });
    }
  },
});
