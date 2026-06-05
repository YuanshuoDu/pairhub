/**
 * Augment Fastify's type system with our decorators and request
 * properties. Import for side effects from `app.ts`.
 *
 * Decorators added by plugins:
 *   - `app.prisma` — PrismaClient (lib/prisma.ts via server bootstrap)
 *   - `app.redis`  — ioredis (lib/redis.ts via server bootstrap)
 *   - `app.authenticate` — preHandler hook for protected routes
 *
 * Request properties:
 *   - `req.userId` — set by `app.authenticate` after JWT verification
 */
import 'fastify';
import type { FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
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
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      openid?: string;
      iat?: number;
      exp?: number;
    };
    user: {
      sub: string;
      openid?: string;
    };
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}
