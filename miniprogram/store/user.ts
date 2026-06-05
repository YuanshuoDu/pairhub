/**
 * 用户 store：token + userInfo
 *
 * 持久化：写到本地缓存，启动时恢复
 */

import { createStore } from './createStore';
import { safeJsonParse } from '../utils/index';
import type { User } from '../types/user';

const STORAGE_KEY_TOKEN = 'sb_token';
const STORAGE_KEY_USER = 'sb_user';
const STORAGE_KEY_EXPIRES = 'sb_token_expires';

export interface UserState {
  token: string | null;
  /** token 过期时间戳（ms），0 表示不过期 */
  expiresAt: number;
  user: User | null;
}

const initial: UserState = {
  token: null,
  expiresAt: 0,
  user: null,
};

export const userStore = createStore<UserState>(initial);

/** 启动时调用：恢复本地数据 */
export function hydrateUserStore(): void {
  try {
    const token = wx.getStorageSync(STORAGE_KEY_TOKEN) || null;
    const userJson = wx.getStorageSync(STORAGE_KEY_USER);
    const expiresAt: number = wx.getStorageSync(STORAGE_KEY_EXPIRES) || 0;
    const user: User | null = userJson ? safeJsonParse<User | null>(userJson, null) : null;
    userStore.setState({ token, expiresAt, user });
  } catch (e) {
    console.warn('[userStore] hydrate failed', e);
  }
}

/** 持久化写入 */
function persist(state: UserState): void {
  try {
    if (state.token) {
      wx.setStorageSync(STORAGE_KEY_TOKEN, state.token);
      wx.setStorageSync(STORAGE_KEY_EXPIRES, state.expiresAt || 0);
    } else {
      wx.removeStorageSync(STORAGE_KEY_TOKEN);
      wx.removeStorageSync(STORAGE_KEY_EXPIRES);
    }
    if (state.user) {
      wx.setStorageSync(STORAGE_KEY_USER, JSON.stringify(state.user));
    } else {
      wx.removeStorageSync(STORAGE_KEY_USER);
    }
  } catch (e) {
    console.warn('[userStore] persist failed', e);
  }
}

/** 登录后写入 */
userStore.subscribe((next) => {
  persist(next);
});

/** Action: 设置登录态 */
export function setAuth(token: string, expiresAt: number, user: User): void {
  userStore.setState({ token, expiresAt, user });
}

/** Action: 更新 userInfo */
export function setUser(user: User): void {
  userStore.setState({ user });
}

/** Action: 清除登录态（登出 / token 失效） */
export function clearAuth(): void {
  userStore.setState({ token: null, expiresAt: 0, user: null });
}

/** Selector: 是否已登录 */
export function isLoggedIn(state: UserState = userStore.state): boolean {
  if (!state.token || !state.user) return false;
  if (state.expiresAt && state.expiresAt < Date.now()) return false;
  return true;
}
