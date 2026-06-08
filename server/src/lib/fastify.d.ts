/**
 * Augment Fastify's type system with our decorators and request
 * properties. Import for side effects from `app.ts`.
 *
 * Decorators added by plugins:
 *   - `app.prisma` — PrismaClient (lib/prisma.ts via server bootstrap)
 *   - `app.redis`  — ioredis (lib/redis.ts via server bootstrap)
 *   - `app.authenticate` — preHandler hook for protected routes
 *   - `app.adminOnly`    — preHandler hook for admin routes (issue #32)
 *
 * Request properties:
 *   - `req.userId`   — set by `app.authenticate` after JWT verification
 *   - `req.userRole` — set by `app.authenticate`; one of `UserRole`
 *   - `req.userStatus` — set by `app.authenticate`; ACTIVE / BANNED
 */
import 'fastify';
import type { FastifyRequest } from 'fastify';
import type { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import type { Redis } from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis;
    /**
     * Fastify preHandler that requires a valid Bearer token.
     * On success populates `req.userId`; on failure throws 401.
     */
    authenticate: (request: FastifyRequest) => Promise<void>;
    /**
     * Fastify preHandler that requires the caller's `userRole === 'ADMIN'`.
     * Reads `req.userRole` set by `app.authenticate`, so always pair with
     * `preHandler: [app.authenticate, app.adminOnly]`. Issue #32.
     */
    adminOnly: (request: FastifyRequest) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      openid?: string;
      role?: UserRole;
      status?: UserStatus;
      iat?: number;
      exp?: number;
    };
    user: {
      sub: string;
      openid?: string;
      role?: UserRole;
      status?: UserStatus;
    };
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
    userRole?: UserRole;
    userStatus?: UserStatus;
  }
}
