/**
 * OpenAPI / Swagger UI smoke tests.
 *
 * Verifies that the docs surface is wired up and that the static spec
 * served at /api/v1/docs/json contains the v1 endpoint inventory.
 * Doesn't try to validate the spec against the running routes (that's
 * a future phase — see docs/api/v1.md §10).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type * as PrismaModule from '@/lib/prisma.js';
import type * as RedisModule from '@/lib/redis.js';

import { buildApp } from '@/lib/app.js';

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

describe('OpenAPI / Swagger UI', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockedPingPrisma.mockResolvedValue(undefined);
    mockedPingRedis.mockResolvedValue(undefined);
    app = await buildApp({ silent: true });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/v1/docs', () => {
    it('serves the swagger UI HTML', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/docs' });
      expect(res.statusCode).toBe(200);
      const ct = res.headers['content-type'] ?? '';
      expect(ct).toMatch(/text\/html/);
      // The Swagger UI bundle always references the petstore CSS class
      // for its topbar — a robust presence check.
      expect(res.body).toMatch(/swagger-ui/);
    });

    it('serves the spec JSON at /api/v1/docs/json', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/docs/json' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        openapi: string;
        info: { title: string; version: string };
        paths: Record<string, unknown>;
        components: { securitySchemes: Record<string, unknown> };
      };
      expect(body.openapi).toBe('3.0.3');
      expect(body.info.title).toBe('StudyBuddy API');
      expect(body.info.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(body.components.securitySchemes).toHaveProperty('bearerAuth');
    });

    it('documents the v1 endpoint inventory', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/docs/json' });
      const body = res.json() as { paths: Record<string, unknown> };
      const required = [
        '/api/v1/health',
        '/api/v1/auth/wx-login',
        '/api/v1/auth/apple-login',
        '/api/v1/auth/google-login',
        '/api/v1/auth/refresh',
        '/api/v1/auth/logout',
        '/api/v1/auth/link-provider',
        '/api/v1/users/me',
        '/api/v1/users/{id}',
        '/api/v1/users/me/activities',
        '/api/v1/activities',
        '/api/v1/activities/{id}',
        '/api/v1/activities/{id}/signup',
        '/api/v1/activities/{id}/participants',
      ];
      for (const path of required) {
        expect(body.paths).toHaveProperty(path);
      }
    });

    it('marks public endpoints with empty security and JWT endpoints with bearerAuth', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/docs/json' });
      const body = res.json() as {
        paths: Record<
          string,
          Record<string, { security?: Array<Record<string, string[]>> }>
        >;
      };

      // /api/v1/health — no security at all
      expect(body.paths['/api/v1/health']!.get!.security).toEqual([]);

      // /api/v1/auth/wx-login — no security (login is anonymous)
      expect(body.paths['/api/v1/auth/wx-login']!.post!.security).toEqual([]);

      // /api/v1/users/me GET — requires bearerAuth
      const meSecurity = body.paths['/api/v1/users/me']!.get!.security;
      expect(meSecurity).toEqual([{ bearerAuth: [] }]);
    });
  });
});
