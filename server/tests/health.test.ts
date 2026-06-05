/**
 * Health endpoint smoke tests.
 *
 * These tests exercise the Fastify instance in-process (no real DB
 * or Redis required) by injecting mock `pingPrisma` / `pingRedis`
 * implementations. The goal is to verify the route + error handler
 * contract, not the database driver.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type * as PrismaModule from '@/lib/prisma.js';
import type * as RedisModule from '@/lib/redis.js';

import { buildApp } from '@/lib/app.js';

// Mock the ping helpers so we don't need a live DB / Redis.
vi.mock('@/lib/prisma.js', async () => {
  const actual = await vi.importActual<typeof PrismaModule>('@/lib/prisma.js');
  return {
    ...actual,
    pingPrisma: vi.fn(),
    closePrisma: vi.fn(),
  };
});

vi.mock('@/lib/redis.js', async () => {
  const actual = await vi.importActual<typeof RedisModule>('@/lib/redis.js');
  return {
    ...actual,
    pingRedis: vi.fn(),
    closeRedis: vi.fn(),
  };
});

import { pingPrisma } from '@/lib/prisma.js';
import { pingRedis } from '@/lib/redis.js';

const mockedPingPrisma = vi.mocked(pingPrisma);
const mockedPingRedis = vi.mocked(pingRedis);

describe('health endpoints', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockedPingPrisma.mockReset();
    mockedPingRedis.mockReset();
    app = await buildApp({ silent: true });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /health (liveness)', () => {
    it.each(['/health', '/api/health'])('returns 200 at %s', async (path) => {
      const res = await app.inject({ method: 'GET', url: path });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('ok');
      expect(body.service).toBe('studybuddy-server');
      expect(typeof body.timestamp).toBe('string');
    });

    it('does not touch Postgres or Redis', async () => {
      await app.inject({ method: 'GET', url: '/health' });
      expect(mockedPingPrisma).not.toHaveBeenCalled();
      expect(mockedPingRedis).not.toHaveBeenCalled();
    });
  });

  describe('GET /ready (readiness)', () => {
    it.each(['/ready', '/api/ready', '/api/health/ready'])(
      'returns 200 with both checks ok at %s',
      async (path) => {
        mockedPingPrisma.mockResolvedValue(undefined);
        mockedPingRedis.mockResolvedValue(undefined);

        const res = await app.inject({ method: 'GET', url: path });
        expect(res.statusCode).toBe(200);

        const body = res.json();
        expect(body.status).toBe('ready');
        expect(body.checks.postgres.status).toBe('ok');
        expect(body.checks.redis.status).toBe('ok');
        expect(typeof body.checks.postgres.latency_ms).toBe('number');
      },
    );

    it('returns 503 when Postgres is unreachable', async () => {
      mockedPingPrisma.mockRejectedValue(new Error('connection refused'));
      mockedPingRedis.mockResolvedValue(undefined);

      const res = await app.inject({ method: 'GET', url: '/ready' });
      expect(res.statusCode).toBe(503);

      const body = res.json();
      expect(body.status).toBe('degraded');
      expect(body.checks.postgres.status).toBe('fail');
      expect(body.checks.postgres.error).toBe('connection refused');
      expect(body.checks.redis.status).toBe('ok');
    });

    it('returns 503 when Redis is unreachable', async () => {
      mockedPingPrisma.mockResolvedValue(undefined);
      mockedPingRedis.mockRejectedValue(new Error('ETIMEDOUT'));

      const res = await app.inject({ method: 'GET', url: '/ready' });
      expect(res.statusCode).toBe(503);

      const body = res.json();
      expect(body.status).toBe('degraded');
      expect(body.checks.postgres.status).toBe('ok');
      expect(body.checks.redis.status).toBe('fail');
      expect(body.checks.redis.error).toBe('ETIMEDOUT');
    });
  });

  describe('404 handling', () => {
    it('returns a structured 404 for unknown routes', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
      expect(res.statusCode).toBe(404);
      // Fastify's default 404 has a code/message; we just want to make
      // sure the response is JSON (not HTML).
      const ct = res.headers['content-type'] ?? '';
      expect(ct).toContain('application/json');
    });
  });
});
