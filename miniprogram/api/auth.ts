/**
 * 鉴权 API 客户端
 *
 * 端点（与后端 M2 module 一致 — 实际请求路径已对齐）：
 *   - POST /api/v1/auth/social-login  — 微信 / Apple / Google 三合一登录
 *   - POST /api/v1/auth/logout        — 撤销 refresh_token
 *   - GET  /api/v1/users/me           — 拉取当前用户（路径是 users 复数）
 *
 * 历史问题（PR #51 hotfix）：
 *   早期版本用了 `/auth/wx-login` `/auth/phone-login` 拆分端点 + 单独的
 *   `/user/me`（单数）和 `/auth/sms-code` `/user/bind-phone`，
 *   这些路径在 M2 backend 落地时已统一为单端点 social-login + users 复数域，
 *   前端没跟上，导致**所有登录 / 拉用户信息操作 100% 404**。
 *
 *   本次 PR 修法 — adapter 模式：
 *     保留 wxLogin / phoneLogin / getUserInfo / logout 5 个原方法名 + 签名，
 *     内部把请求路径改成 /social-login + /users/me，并把后端 DTO 适配成
 *     前端 `LoginResult` / `User` 形状。**调用方零改动**。
 *
 *   sendSmsCode / bindPhone 暂时保留为 no-op（返回 ok / 抛错），等待 M3
 *   真实短信验证码流落地后（issue #27 推送 / #28 内测 一起做）替换。
 *
 * TODO(M3): 前后端类型同步（types/user.ts User 字段补齐 school/bio/major
 *   返回 + 删前端 phoneBound 推断），改完后这里的 adapter 可以瘦身。
 */

import { http } from './request';
import { setAuth } from '../store/user';
import type { LoginResult, PhoneLoginPayload, User, WxLoginPayload } from '../types/user';

// ---------------------------------------------------------------------------
// 后端 DTO（与 server/src/modules/auth/index.ts AuthSuccessDTO 对齐）
// ---------------------------------------------------------------------------

interface AuthSuccessDTO {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    nickname: string;
    avatar: string | null;
    school: string | null;
  };
}

// access token TTL 与后端 server/src/modules/auth/index.ts:107-118 同步：
// 15 分钟。前端缓存到 expiresAt，过期前主动 refresh。
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;

/**
 * 把后端 DTO 适配成前端 `LoginResult` 形状。
 *
 * - `token` ← `accessToken`（前端 store 用的字段名）
 * - `expiresAt` ← now + 15min
 * - `user` 字段从前端 User 类型补全（后端暂时只返 id/nickname/avatar/school）
 * - `isNewUser` 暂固定 false，等后端 #32 admin 上线后从 signup 触发流判断
 */
function adaptLoginResult(dto: AuthSuccessDTO): LoginResult {
  return {
    token: dto.accessToken,
    expiresAt: Date.now() + ACCESS_TOKEN_TTL_MS,
    user: {
      id: dto.user.id,
      uid: dto.user.id, // 前端 store 既读 `id` 也读 `uid`，两个都给
      nickname: dto.user.nickname,
      avatar: dto.user.avatar ?? '',
      gender: 'unknown' as User['gender'], // TODO(M3): 后端 User 表加 gender 字段后删除
      school: dto.user.school ?? undefined,
      phoneBound: false, // TODO(M3): 后端 /users/me 返回 phoneBound
      createdAt: new Date().toISOString(), // TODO(M3): 后端 /users/me 返回 createdAt
    },
    isNewUser: false, // TODO(M3): 后端 social-login 返回 isNewUser
  };
}

function adaptUser(dto: AuthSuccessDTO['user']): User {
  return {
    id: dto.id,
    uid: dto.id,
    nickname: dto.nickname,
    avatar: dto.avatar ?? '',
    gender: 'unknown' as User['gender'],
    school: dto.school ?? undefined,
    phoneBound: false,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// authApi — 方法签名保持向后兼容，调用方零改动
// ---------------------------------------------------------------------------

export const authApi = {
  /**
   * 微信一键登录
   *
   * 真实 OAuth 校验由后端做（issue #26 落地后已接微信 jscode2session）。
   * 加密手机号（getPhoneNumber 返回的 encryptedData/iv）留给 M3 一起做。
   */
  async wxLogin(payload: WxLoginPayload): Promise<LoginResult> {
    const dto = await http.post<AuthSuccessDTO>('/api/v1/auth/social-login', {
      provider: 'wechat',
      token: payload.code,
      // phone 解密（M3 #27 接入后展开）
    });
    const result = adaptLoginResult(dto);
    setAuth(result.token, result.expiresAt, result.user);
    return result;
  },

  /**
   * 手机号 + 验证码登录
   *
   * M2 阶段：M2 backend 只支持 social-login 流 + 可选 phone 字段。
   * 真实短信验证码由 M3 接入（issue #27）。
   * 这里把 phone 透传给 social-login 即可，后端按 phone 优先做 identity merge。
   */
  async phoneLogin(payload: PhoneLoginPayload): Promise<LoginResult> {
    const dto = await http.post<AuthSuccessDTO>('/api/v1/auth/social-login', {
      provider: 'wechat',
      token: `phone-unlock:${payload.phone}`, // M3 改用真实 jscode2session
      phone: payload.phone,
    });
    const result = adaptLoginResult(dto);
    setAuth(result.token, result.expiresAt, result.user);
    return result;
  },

  /**
   * 拉取当前登录用户信息
   *
   * 路径是 **/api/v1/users/me**（复数 users），与后端 module 对齐。
   */
  async getUserInfo(): Promise<User> {
    const dto = await http.get<AuthSuccessDTO['user']>('/api/v1/users/me');
    return adaptUser(dto);
  },

  /**
   * 发送短信验证码（M3 stub）
   *
   * M2 阶段：social-login 单端点不需要验证码，直接返回 ok 让前端继续走 phoneLogin。
   * M3 接入腾讯云短信后此方法替换为真实发送（issue #27）。
   */
  async sendSmsCode(_phone: string): Promise<{ ok: true; code?: string }> {
    return { ok: true };
  },

  /**
   * 绑定手机号（M3 stub）
   *
   * M2 阶段：通过 social-login 的可选 phone 字段做绑定，无需单独接口。
   * 调用方（pages/login）应改用 `authApi.wxLogin` 透传 phone。
   * M3 #27 上线后此方法替换为 PATCH /api/v1/users/me/phone 之类。
   */
  async bindPhone(_payload: PhoneLoginPayload): Promise<User> {
    throw new Error(
      '[auth] bindPhone deprecated — 改用 authApi.wxLogin({ phone }) 一步到位绑定',
    );
  },

  /**
   * 退出登录
   *
   * 后端把 refresh_token 从 Redis 撤销（idempotent）。
   * 调用方仍需在 userStore 清掉本地 token / user。
   */
  async logout(): Promise<void> {
    try {
      await http.post<void>('/api/v1/auth/logout');
    } catch {
      /* 静默 — 即使后端失败，本地也清 token */
    }
  },
};

export default authApi;
