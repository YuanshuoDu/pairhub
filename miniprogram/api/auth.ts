/**
 * 鉴权 API
 *
 * - wxLogin：微信 code 换 openid + JWT
 * - phoneLogin：手机号 + 短信验证码登录
 * - getUserInfo：拉取当前用户信息
 * - bindPhone：绑定手机号
 * - sendSmsCode：发送短信验证码
 */

import { http } from './request';
import { setAuth } from '../store/user';
import type { LoginResult, PhoneLoginPayload, User, WxLoginPayload } from '../types/user';

export const authApi = {
  /** 微信一键登录：前端 wx.login() 拿到 code 传过来 */
  async wxLogin(payload: WxLoginPayload): Promise<LoginResult> {
    const res = await http.post<LoginResult>('/api/v1/auth/wx-login', payload);
    setAuth(res.token, res.expiresAt, res.user);
    return res;
  },

  /** 手机号 + 短信验证码登录 */
  async phoneLogin(payload: PhoneLoginPayload): Promise<LoginResult> {
    const res = await http.post<LoginResult>('/api/v1/auth/phone-login', payload);
    setAuth(res.token, res.expiresAt, res.user);
    return res;
  },

  /** 拉取当前登录用户信息 */
  async getUserInfo(): Promise<User> {
    return http.get<User>('/api/v1/user/me');
  },

  /** 发送短信验证码（mock 直接返回 ok） */
  async sendSmsCode(phone: string): Promise<{ ok: true; code?: string }> {
    return http.post('/api/v1/auth/sms-code', { phone });
  },

  /** 绑定手机号（用于 wxLogin 后引导） */
  async bindPhone(payload: PhoneLoginPayload): Promise<User> {
    return http.post<User>('/api/v1/user/bind-phone', payload);
  },

  /** 退出登录（可选，后端清 token） */
  async logout(): Promise<void> {
    try {
      await http.post<void>('/api/v1/auth/logout');
    } catch {
      /* 静默 */
    }
  },
};
