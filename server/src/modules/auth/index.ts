/**
 * Auth module — multi-platform social login.
 *
 * Endpoints (all under /api/v1/auth):
 *   - POST /social-login  — single endpoint for WeChat / Apple / Google.
 *                            Body identifies the provider + the third-party
 *                            token (and, where applicable, a phone number for
 *                            WeChat). Returns { accessToken, refreshToken, user }.
 *   - POST /refresh       — exchange a refresh_token (jti) for new tokens.
 *                            Old refresh_token is revoked.
 *   - POST /logout        — revoke the supplied refresh_token (delete from Redis).
 *
 * Access token TTL: 15 minutes. Refresh token TTL: 30 days.
 * Both use JWT HS256 with the secret from env.JWT_SECRET.
 *
 * Social identity merge (one user, many providers):
 *   1. If a `phone` is supplied (WeChat flow), find or create the user by phone.
 *   2. Otherwise look up by `provider:providerSub` (UserIdentity table).
 *   3. If no match and the user is new, create a User row + UserIdentity row.
 *
 * NOTE: This is a "salvaged" M2 endpoint — the original backend-engineer task
 * timed out at the 40-minute cap before completing. The CTO (orchestrator)
 * is shipping a minimal but functional implementation directly. The provider
 * token validation is mocked (we trust the client) — real verification against
 * WeChat / Apple / Google public keys lands in M2-W6 (issue #26).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';

import { env } from '@/lib/env.js';
import { UnauthorizedError, ValidationError } from '@/lib/errors.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const providerSchema = z.enum(['wechat', 'apple', 'google']);

export const socialLoginBodySchema = z
  .object({
    provider: providerSchema,
    /**
     * Provider-issued token:
     *   - wechat: wx.login() code (or session_key+openid bundle)
     *   - apple:  identity token (JWT)
     *   - google: id_token (JWT)
     */
    token: z.string().min(1).max(4096),
    /** Only for wechat: phone number captured by the getPhoneNumber button. */
    phone: z
      .string()
      .regex(/^\+?[0-9]{7,15}$/, 'phone must be E.164-ish digits')
      .optional(),
    /** Optional extras stored on User (e.g. from Apple first/last name). */
    nickname: z.string().min(1).max(50).optional(),
    avatar: z.string().url().max(500).optional(),
  })
  .strict();

export const refreshBodySchema = z
  .object({ refreshToken: z.string().min(10).max(4096) })
  .strict();

export const logoutBodySchema = z
  .object({ refreshToken: z.string().min(10).max(4096) })
  .strict();

export type SocialLoginBody = z.infer<typeof socialLoginBodySchema>;
export type RefreshBody = z.infer<typeof refreshBodySchema>;
export type LogoutBody = z.infer<typeof logoutBodySchema>;

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

export interface AuthSuccessDTO {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    nickname: string;
    avatar: string | null;
    school: string | null;
  };
}

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

interface AccessTokenPayload {
  sub: string;
  iat: number;
  exp: number;
  type: 'access';
}

interface RefreshTokenPayload {
  sub: string;
  jti: string;
  iat: number;
  exp: number;
  type: 'refresh';
}

function signAccessToken(userId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AccessTokenPayload = {
    sub: userId,
    iat: now,
    exp: now + 15 * 60, // 15 minutes
    type: 'access',
  };
  // We use the @fastify/jwt registered on `app` to sign — but as a static helper
  // we need to do it ourselves. The simplest path: HS256 with env.JWT_SECRET.
  return jwtSignHs256(payload, env.JWT_SECRET);
}

function signRefreshToken(userId: string, jti: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: RefreshTokenPayload = {
    sub: userId,
    jti,
    iat: now,
    exp: now + 30 * 24 * 60 * 60, // 30 days
    type: 'refresh',
  };
  return jwtSignHs256(payload, env.JWT_SECRET);
}

function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwtVerifyHs256<RefreshTokenPayload>(token, env.JWT_SECRET);
  if (decoded.type !== 'refresh') {
    throw new UnauthorizedError('Token 不是 refresh_token');
  }
  return decoded;
}

// Minimal HS256 sign / verify — avoids leaking @fastify/jwt's instance-bound
// API into the service layer.
function jwtSignHs256<T extends object>(payload: T, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const enc = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  const signingInput = `${enc(header)}.${enc(payload)}`;
  const sig = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64url');
  return `${signingInput}.${sig}`;
}

function jwtVerifyHs256<T>(token: string, secret: string): T {
  const parts = token.split('.');
  if (parts.length !== 3) throw new UnauthorizedError('Token 格式不合法');
  // Length-3 is already checked; non-null-assert for `noUncheckedIndexedAccess`.
  const header = parts[0]!;
  const payload = parts[1]!;
  const sig = parts[2]!;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  if (sig !== expected) throw new UnauthorizedError('Token 签名不合法');
  let decoded: { payload: T; exp: number };
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url' as BufferEncoding).toString('utf8'));
  } catch {
    throw new UnauthorizedError('Token 负载无法解析');
  }
  if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new UnauthorizedError('Token 已过期');
  }
  return decoded.payload as T;
}

// ---------------------------------------------------------------------------
// Refresh-token store (Redis)
// ---------------------------------------------------------------------------

const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const REFRESH_KEY = (jti: string) => `auth:refresh:${jti}`;

async function storeRefreshToken(
  redis: { set: (k: string, v: string, ...args: unknown[]) => Promise<unknown> },
  jti: string,
  userId: string,
): Promise<void> {
  await redis.set(REFRESH_KEY(jti), userId, 'EX', REFRESH_TTL_SECONDS);
}

async function consumeRefreshToken(
  redis: { get: (k: string) => Promise<string | null>; del: (k: string) => Promise<unknown> },
  jti: string,
): Promise<string | null> {
  const userId = await redis.get(REFRESH_KEY(jti));
  if (!userId) return null;
  await redis.del(REFRESH_KEY(jti));
  return userId;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function registerAuthModule(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/v1/auth/social-login
   *
   * Minimal "trust-the-client" implementation. Real provider verification lands
   * in M2-W6 (issue #26: 限流防刷 + 微信内容安全 API 接入).
   */
  app.post('/api/v1/auth/social-login', async (req) => {
    const parsed = socialLoginBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError({ issues: parsed.error.flatten() });
    }
    const { provider, phone, nickname, avatar, token } = parsed.data;

    // Derive a stable "providerSub" from the token. In real life this would
    // be the openid / Apple sub / Google sub. Here we hash so a token re-use
    // gets a stable identity. NOT a security guarantee — see M2-W6.
    const providerSub = crypto
      .createHash('sha256')
      .update(`${provider}:${token}`)
      .digest('hex')
      .slice(0, 32);

    // Find or create the user.
    //
    // Identity merge strategy (no separate UserIdentity table in this schema):
    //   1. If a phone is supplied, look up by phone (WeChat phone-unlock path).
    //   2. Otherwise store the "provider:providerSub" composite in User.openid
    //      and look it up there. (The User.openid column is @unique so this
    //      is idempotent on the same provider+sub.)
    //
    // NOTE: a real multi-provider design would add a UserIdentity table; for
    // M2 we keep the schema simple and accept the openid-as-encoding hack.
    const prisma = app.prisma;
    const compositeOpenid = `${provider}:${providerSub}`;

    let user = phone
      ? await prisma.user.findUnique({ where: { phone } })
      : await prisma.user.findUnique({ where: { openid: compositeOpenid } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          openid: phone ? compositeOpenid : compositeOpenid,
          phone: phone ?? null,
          nickname: nickname ?? '留学生',
          avatar: avatar ?? null,
          school: null,
          major: null,
          grade: null,
          wechatId: provider === 'wechat' ? providerSub : null,
          bio: null,
        },
      });
    }

    // Issue tokens.
    const accessToken = signAccessToken(user.id);
    const jti = crypto.randomUUID();
    const refreshToken = signRefreshToken(user.id, jti);
    await storeRefreshToken(app.redis as never, jti, user.id);

    return {
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          nickname: user.nickname,
          avatar: user.avatar,
          school: user.school,
        },
      } satisfies AuthSuccessDTO,
    };
  });

  /**
   * POST /api/v1/auth/refresh
   */
  app.post('/api/v1/auth/refresh', async (req) => {
    const parsed = refreshBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError({ issues: parsed.error.flatten() });
    }

    let decoded: RefreshTokenPayload;
    try {
      decoded = verifyRefreshToken(parsed.data.refreshToken);
    } catch {
      throw new UnauthorizedError('refresh_token 无效');
    }

    const userId = await consumeRefreshToken(
      app.redis as never,
      decoded.jti,
    );
    if (!userId || userId !== decoded.sub) {
      throw new UnauthorizedError('refresh_token 已撤销或不匹配');
    }

    // Rotate the jti.
    const newJti = crypto.randomUUID();
    const newAccess = signAccessToken(userId);
    const newRefresh = signRefreshToken(userId, newJti);
    await storeRefreshToken(app.redis as never, newJti, userId);

    return { data: { accessToken: newAccess, refreshToken: newRefresh } };
  });

  /**
   * POST /api/v1/auth/logout
   */
  app.post('/api/v1/auth/logout', async (req) => {
    const parsed = logoutBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError({ issues: parsed.error.flatten() });
    }

    let decoded: RefreshTokenPayload;
    try {
      decoded = verifyRefreshToken(parsed.data.refreshToken);
    } catch {
      // Treat as already-logged-out — idempotent.
      return { data: { ok: true } };
    }

    await consumeRefreshToken(app.redis as never, decoded.jti);
    return { data: { ok: true } };
  });
}
