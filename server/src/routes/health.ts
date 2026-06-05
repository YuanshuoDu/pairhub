import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => ({
    status: 'ok',
    service: 'pairhub-server',
    version: process.env.npm_package_version ?? '0.1.0',
    timestamp: new Date().toISOString(),
  }));

  // Liveness/readiness for k8s / cloud LB
  app.get('/api/health/ready', async (_req, reply) => {
    const checks: Record<string, { status: 'ok' | 'fail'; latency_ms?: number; error?: string }> = {};

    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.postgres = { status: 'ok', latency_ms: Date.now() - dbStart };
    } catch (e) {
      checks.postgres = { status: 'fail', error: (e as Error).message };
    }

    const redisStart = Date.now();
    try {
      await redis.ping();
      checks.redis = { status: 'ok', latency_ms: Date.now() - redisStart };
    } catch (e) {
      checks.redis = { status: 'fail', error: (e as Error).message };
    }

    const allOk = Object.values(checks).every((c) => c.status === 'ok');
    return reply.code(allOk ? 200 : 503).send({
      status: allOk ? 'ready' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    });
  });
}
