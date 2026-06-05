/**
 * Pairhub — Fastify app entry
 * 启动：pnpm dev   (tsx watch src/app.ts)
 * 端口：默认 3000，从 env PORT 读取
 */

import 'dotenv/config';
import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';

import { registerHealthRoutes } from './routes/health.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerActivityRoutes } from './routes/activities.js';
import { closePrisma, prisma } from './lib/prisma.js';
import { closeRedis, redis } from './lib/redis.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-in-prod-min-32-chars';
const NODE_ENV = process.env.NODE_ENV ?? 'development';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' } }
          : undefined,
    },
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'reqId',
  });

  // Security & utilities
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: process.env.CORS_ORIGIN ?? true, credentials: true });
  await app.register(cookie);
  await app.register(sensible);

  // Rate limit
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    redis, // uses ioredis client
    keyGenerator: (req) => req.ip,
    errorResponseBuilder: () => ({
      type: 'https://pairhub.example.com/errors/rate-limit',
      title: 'Too Many Requests',
      status: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      detail: '请求过于频繁，请稍后再试',
    }),
  });

  // JWT
  await app.register(jwt, {
    secret: JWT_SECRET,
    sign: { expiresIn: '7d' },
  });

  // Decorate request with prisma + redis for convenience
  app.decorate('prisma', prisma);
  app.decorate('redis', redis);

  // Routes
  await registerHealthRoutes(app);
  await registerAuthRoutes(app);
  await registerActivityRoutes(app);

  // Centralized error handler — RFC 7807 Problem Details
  app.setErrorHandler((err, req, reply) => {
    req.log.error({ err }, 'Request error');

    if (err.validation) {
      return reply.code(400).send({
        type: 'https://pairhub.example.com/errors/validation',
        title: 'Validation Error',
        status: 400,
        detail: err.message,
        code: 'VALIDATION_ERROR',
        errors: err.validation,
      });
    }

    const status = err.statusCode ?? 500;
    return reply.code(status).send({
      type: err.code
        ? `https://pairhub.example.com/errors/${String(err.code).toLowerCase()}`
        : 'https://pairhub.example.com/errors/internal',
      title: err.name ?? 'Internal Server Error',
      status,
      detail: NODE_ENV === 'production' && status >= 500 ? '服务器内部错误' : err.message,
      code: err.code ?? 'INTERNAL_ERROR',
    });
  });

  return app;
}

async function main() {
  const app = await buildApp();

  // Verify DB connection on boot
  try {
    await prisma.$queryRaw`SELECT 1`;
    app.log.info('✅ PostgreSQL connected');
  } catch (e) {
    app.log.error({ err: e }, '❌ PostgreSQL connection failed');
    process.exit(1);
  }

  // Verify Redis connection on boot
  try {
    await redis.ping();
    app.log.info('✅ Redis connected');
  } catch (e) {
    app.log.error({ err: e }, '❌ Redis connection failed');
    process.exit(1);
  }

  await app.listen({ port: PORT, host: HOST });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down gracefully...`);
    try {
      await app.close();
      await closePrisma();
      await closeRedis();
      app.log.info('👋 Bye');
      process.exit(0);
    } catch (e) {
      app.log.error({ err: e }, 'Error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

// Type augmentation
declare module 'fastify' {
  interface FastifyInstance {
    prisma: typeof prisma;
    redis: typeof redis;
  }
}
