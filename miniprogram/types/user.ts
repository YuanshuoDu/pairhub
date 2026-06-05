/**
 * 用户相关类型
 */
import type { Gender } from './common';

export interface User {
  id: string;
  /** 微信 openid（敏感，后端不返回原始值） */
  openid?: string;
  /** 业务 userId（前端展示用） */
  uid: string;
  /** 昵称 */
  nickname: string;
  /** 头像 */
  avatar: string;
  /** 性别 */
  gender: Gender;
  /** 学校 */
  school?: string;
  /** 专业 / 年级 */
  major?: string;
  /** 个性签名 */
  bio?: string;
  /** 手机号（脱敏） */
  phone?: string;
  /** 是否已绑定手机 */
  phoneBound: boolean;
  /** 注册时间 ISO */
  createdAt: string;
}

/** 登录返回：JWT + 用户信息 */
export interface LoginResult {
  token: string;
  /** token 过期时间戳（ms） */
  expiresAt: number;
  user: User;
  /** 是否新用户（引导补全资料） */
  isNewUser: boolean;
}

/** 微信 code 换取 openid 时的前端入参 */
export interface WxLoginPayload {
  code: string;
  /** 加密的手机号数据（getPhoneNumber 返回） */
  encryptedData?: string;
  iv?: string;
}

/** 手机号 + 短信验证码登录入参 */
export interface PhoneLoginPayload {
  phone: string;
  code: string;
}
