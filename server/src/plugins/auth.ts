/**
 * Auth plugin.
 *
 * What this plugin does:
 *   1. Registers @fastify/jwt with the secret from env.
 *   2. Decorates the Fastify instance with `authenticate` — a
 *      preHandler hook that verifies the Bearer token and exposes
 *      `req.userId` / `req.userRole` / `req.userStatus` for handlers.
 *   3. Decorates the Fastify instance with `adminOnly` — a preHandler
 *      hook that requires `req.userRole === 'ADMIN'`. Pair with
 *      `authenticate` because it reads the role from `req`.
 *
 * Role / status freshness:
 *   - The access token embeds `role` and `status` at issue time. The
 *     tokens have a 15-minute TTL (see modules/auth/index.ts) so a
 *     ban / role change propagates within 15 minutes at the latest
 *     — acceptable for the M3 launch. Operators that need immediate
 *     effect can rotate the user's refresh token (next refresh will
 *     re-embed the new role).
 *   - This trade-off was chosen over a per-request DB lookup, which
 *     would add a round-trip on every authenticated request.
 */
import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import { getEnv } from '@/lib/env.js';
import { ForbiddenError, UnauthorizedError } from '@/lib/errors.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
    adminOnly: (request: FastifyRequest) => Promise<void>;
  }
}

async function authPlugin(app: FastifyInstance): Promise<void> {
  await app.register(jwt, {
    secret: getEnv().JWT_SECRET,
    sign: {
      expiresIn: '7d',
      // HS256 is the default; keep it explicit so audit logs are clear.
      algorithm: 'HS256',
    },
    verify: {
      algorithms: ['HS256'],
    },
  });

  app.decorate('authenticate', async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw new UnauthorizedError('Token 无效或已过期');
    }
    const payload = req.user as
      | { sub?: string; role?: 'USER' | 'ADMIN'; status?: 'ACTIVE' | 'BANNED' | 'DELETED' }
      | undefined;
    if (!payload?.sub) {
      throw new UnauthorizedError('Token 缺少 sub 字段');
    }
    // Defense-in-depth: a stale access token (issued before the user
    // called DELETE /api/v1/users/me) may still claim `status: 'ACTIVE'`
    // because access tokens are 15-minute TTL and don't refetch from DB.
    // The social-login and refresh endpoints also guard the DELETED case
    // (returning 410 ACCOUNT_DELETED), but for any OTHER authenticated
    // endpoint we surface a 401 USER_DELETED so the client can drop the
    // session and prompt re-login.
    if (payload.status === 'DELETED') {
      throw new UnauthorizedError('账号已注销');
    }
    req.userId = payload.sub;
    req.userRole = payload.role ?? 'USER';
    req.userStatus = payload.status ?? 'ACTIVE';
  });

  /**
   * `adminOnly` preHandler — must be chained AFTER `authenticate` so
   * `req.userRole` is populated. Rejects 401 if the role is missing
   * (no token at all) and 403 if the role is set but not ADMIN.
   */
  app.decorate('adminOnly', async (req: FastifyRequest) => {
    if (!req.userId) {
      throw new UnauthorizedError('需要登录');
    }
    if (req.userRole !== 'ADMIN') {
      throw new ForbiddenError('需要管理员权限');
    }
    if (req.userStatus === 'BANNED') {
      throw new ForbiddenError('账号已封禁');
    }
  });
}

export default fp(authPlugin, { name: 'auth-plugin', dependencies: [] });
