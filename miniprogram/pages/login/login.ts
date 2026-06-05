/**
 * 登录页
 *
 * - 默认显示微信一键登录（更顺滑）
 * - 备选：手机号 + 验证码登录
 * - 登录成功后写 store + 跳转首页
 */

import { authApi } from '../../api/auth';
import { setMockMode } from '../../api/config';
import { isLoggedIn } from '../../store/user';
import { ApiError } from '../../utils/error';
import { logger } from '../../utils/logger';

type TabId = 'wx' | 'phone';

interface LoginData {
  activeTab: TabId;
  tabs: { id: TabId; label: string }[];
  phone: string;
  code: string;
  smsCountdown: number;
  loading: boolean;
}

interface LoginCustom {
  _smsTimer?: ReturnType<typeof setInterval> | null;
  _startCountdown: () => void;
  onTabChange: (e: WechatMiniprogram.TouchEvent) => void;
  onSwitchToWx: () => void;
  onPhoneInput: (e: WechatMiniprogram.Input) => void;
  onCodeInput: (e: WechatMiniprogram.Input) => void;
  onSendCode: () => Promise<void>;
  onWxLogin: () => Promise<void>;
  onPhoneLogin: () => Promise<void>;
  onAgreementTap: () => void;
  onPrivacyTap: () => void;
  onContactTap: () => void;
}

Page<LoginData, LoginCustom>({
  data: {
    activeTab: 'wx',
    tabs: [
      { id: 'wx', label: '微信登录' },
      { id: 'phone', label: '手机号登录' },
    ],
    phone: '',
    code: '',
    smsCountdown: 0,
    loading: false,
  },

  onLoad() {
    // 已登录直接跳走
    if (isLoggedIn()) {
      wx.reLaunch({ url: '/pages/index/index' });
    }
    // Dev 模式：默认开启 mock
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      setMockMode(true);
    }
  },

  onUnload() {
    if (this._smsTimer) {
      clearInterval(this._smsTimer);
    }
  },

  onTabChange(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as TabId;
    if (id === this.data.activeTab) return;
    this.setData({ activeTab: id });
  },

  onSwitchToWx() {
    this.setData({ activeTab: 'wx' });
  },

  onPhoneInput(e: WechatMiniprogram.Input) {
    this.setData({ phone: e.detail.value.replace(/\D/g, '').slice(0, 11) });
  },

  onCodeInput(e: WechatMiniprogram.Input) {
    this.setData({ code: e.detail.value.replace(/\D/g, '').slice(0, 6) });
  },

  async onSendCode() {
    if (this.data.smsCountdown > 0) return;
    if (!/^1[3-9]\d{9}$/.test(this.data.phone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }
    try {
      await authApi.sendSmsCode(this.data.phone);
      wx.showToast({ title: '验证码已发送', icon: 'none' });
      this._startCountdown();
    } catch (err) {
      const msg = err instanceof ApiError ? err.userMessage : '发送失败';
      wx.showToast({ title: msg, icon: 'none' });
    }
  },

  _startCountdown() {
    let n = 60;
    this.setData({ smsCountdown: n });
    this._smsTimer = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(this._smsTimer!);
        this.setData({ smsCountdown: 0 });
      } else {
        this.setData({ smsCountdown: n });
      }
    }, 1000);
  },

  async onWxLogin() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const { code } = await wx.login();
      if (!code) throw new Error('wx.login 未返回 code');
      const res = await authApi.wxLogin({ code });
      logger.log('[wxLogin] success', res.user.nickname);
      wx.showToast({ title: '登录成功', icon: 'success' });
      // 跳到首页
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/index/index' });
      }, 600);
    } catch (err) {
      const msg = err instanceof ApiError ? err.userMessage : '登录失败';
      wx.showToast({ title: msg, icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async onPhoneLogin() {
    if (this.data.loading) return;
    if (!/^1[3-9]\d{9}$/.test(this.data.phone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }
    if (!/^\d{6}$/.test(this.data.code)) {
      wx.showToast({ title: '请输入6位验证码', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      await authApi.phoneLogin({ phone: this.data.phone, code: this.data.code });
      wx.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/index/index' });
      }, 600);
    } catch (err) {
      const msg = err instanceof ApiError ? err.userMessage : '登录失败';
      wx.showToast({ title: msg, icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onAgreementTap() {
    wx.navigateTo({ url: '/pages/login/agreement?type=tos' });
  },

  onPrivacyTap() {
    wx.navigateTo({ url: '/pages/login/agreement?type=privacy' });
  },

  onContactTap() {
    wx.showModal({ title: '联系客服', content: '微信：pairhub-support\n工作时间 9:00 - 21:00', showCancel: false });
  },
});
