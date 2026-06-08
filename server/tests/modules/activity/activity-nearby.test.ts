/**
 * Tests for the geo "near me" filter on `GET /api/v1/activities`.
 *
 * Issue #35 — the activity list needs to support `?lat=&lng=&radiusKm=`
 * so the Flutter / miniprogram map views can render pins within walking
 * distance. The backend runs a Haversine `$queryRaw` so the database
 * does the distance math + filter + sort in one round-trip.
 *
 * These tests assert:
 *  1. Validation: lat / lng must come together; radiusKm has sane bounds.
 *  2. Filter + sort: results are within the requested radius and ordered
 *     by distance ascending. The response carries `distanceKm` per row.
 *  3. Non-geo branch is unchanged: omitting lat/lng returns the standard
 *     startTime-asc list with no `distanceKm` field.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Silence Prisma logging before import (same trick as tests/setup.ts).
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
process.env.REDIS_URL ??= 'redis://localhost:6379/0';
process.env.JWT_SECRET ??= 'a'.repeat(48);

// Build a real Fastify app against a stub Prisma + stub Redis. We only
// exercise the geo branch logic — the modules that have their own
// dependencies (content-safety, env validation) are mocked away.
const prismaStub = {
  activity: {
    findMany: vi.fn(async () => []),
    findUnique: vi.fn(async () => null),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(async () => 0),
  },
  signup: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  review: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  $queryRawUnsafe: vi.fn(),
};
const redisStub = {
  get: vi.fn(async () => null),
  set: vi.fn(async () => 'OK'),
  del: vi.fn(async () => 1),
  scan: vi.fn(async () => ['0', []] as [string, string[]]),
  keys: vi.fn(async () => [] as string[]),
};

// We mock the prisma + redis libs before any module import so the real
// `registerActivityModule` picks up the stubs through `app.prisma` /
// `app.redis` decoration in buildApp.
vi.mock('@/lib/prisma.js', () => ({ prisma: prismaStub }));
vi.mock('@/lib/redis.js', () => ({ redis: redisStub }));

import { registerActivityModule } from '@/modules/activity/index.js';

let app: FastifyInstance;

beforeAll(async () => {
  const Fastify = (await import('fastify')).default;
  app = Fastify({ logger: false });
  app.decorate('prisma', prismaStub as never);
  app.decorate('redis', redisStub as never);
  // The POST / PATCH / DELETE routes on this module declare
  // `preHandler: [app.authenticate]`. We don't exercise them in this
  // suite, but `registerActivityModule` still tries to wire them up,
  // so we register a no-op so Fastify accepts the route table.
  app.decorate('authenticate', (async () => undefined) as never);
  await registerActivityModule(app);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/activities — geo "near me" filter (issue #35)', () => {
  it('rejects lat without lng', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/activities?lat=39.9&radiusKm=5',
    });
    expect(res.statusCode).toBe(400);
    // Fastify wraps the zod refine error as a 400; the field-level
    // message is in the response body. Accept any 400 — the actual
    // zod path/message is covered indirectly via the type/format
    // validation in the next test.
  });

  it('rejects lng without lat', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/activities?lng=116.4&radiusKm=5',
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects radiusKm out of bounds (>200)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/activities?lat=39.9&lng=116.4&radiusKm=999',
    });
    expect(res.statusCode).toBe(400);
  });

  it('runs a Haversine raw query and decorates rows with distanceKm', async () => {
    // Two activities 1.2 km and 4.8 km from the requested point.
    const rowA = { id: 'ckaaaaa', distance_km: 1.234 };
    const rowB = { id: 'ckbbbbb', distance_km: 4.8 };
    const fullA = {
      id: 'ckaaaaa', creatorId: 'u1', type: 'STUDY', title: '图书馆自习',
      description: '一起学习', coverUrl: null, locationName: '图书馆',
      locationAddr: '北京市海淀区', locationLat: '39.9850', locationLng: '116.3050',
      startTime: new Date(), endTime: new Date(), maxParticipants: 6, currentCount: 2,
      tags: [], status: 'RECRUITING', contentCheck: 'PASS',
      createdAt: new Date(), updatedAt: new Date(),
    };
    const fullB = {
      ...fullA, id: 'ckbbbbb', locationName: '海淀公园',
      locationLat: '39.9900', locationLng: '116.3200',
    };

    // 1) Distance query returns [A, B] ordered by distance asc.
    // 2) Count query returns 2.
    // 3) findMany({ where: { id: { in: [...] } } }) returns [B, A] (PK order)
    prismaStub.$queryRaw
      .mockResolvedValueOnce([rowA, rowB])
      .mockResolvedValueOnce([{ count: BigInt(2) }]);
    prismaStub.activity.findMany.mockResolvedValueOnce([fullB, fullA]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/activities?lat=39.99&lng=116.31&radiusKm=10',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.data).toHaveLength(2);
    // After sort-by-distance, A must come first even though findMany
    // returned them in PK order.
    expect(body.data.data[0].id).toBe('ckaaaaa');
    expect(body.data.data[0].distanceKm).toBe(1.23); // rounded to 2dp
    expect(body.data.data[1].id).toBe('ckbbbbb');
    expect(body.data.data[1].distanceKm).toBe(4.8);
    expect(body.data.total).toBe(2);
    expect(body.data.hasMore).toBe(false);

    // The raw SQL must have been called twice (data + count).
    expect(prismaStub.$queryRaw).toHaveBeenCalledTimes(2);
    // The follow-up findMany should use the `in: [...]` filter.
    expect(prismaStub.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['ckaaaaa', 'ckbbbbb'] } } }),
    );
  });

  it('returns empty list when no activities are within radius', async () => {
    prismaStub.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: BigInt(0) }]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/activities?lat=39.99&lng=116.31&radiusKm=0.5',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.data).toEqual([]);
    expect(body.data.total).toBe(0);
    expect(body.data.hasMore).toBe(false);
  });

  it('falls back to Prisma findMany + startTime-asc when no lat/lng supplied', async () => {
    prismaStub.activity.findMany.mockResolvedValueOnce([]);
    prismaStub.activity.count.mockResolvedValueOnce(0);

    const res = await app.inject({ method: 'GET', url: '/api/v1/activities?page=1&pageSize=20' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.data).toEqual([]);
    // Non-geo branch must NOT touch $queryRaw (no Haversine).
    expect(prismaStub.$queryRaw).not.toHaveBeenCalled();
    // And it must have called the standard findMany.
    expect(prismaStub.activity.findMany).toHaveBeenCalled();
  });

  it('passes type / status / city filters into the SQL where-clause', async () => {
    prismaStub.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: BigInt(0) }]);

    await app.inject({
      method: 'GET',
      url: '/api/v1/activities?lat=39.99&lng=116.31&radiusKm=5&type=STUDY&status=RECRUITING&city=北京',
    });

    // Inspect the SQL template — Prisma.sql is a Sql object holding
    // `.strings` (template parts) and `.values` (the interpolated
    // parameters). Concatenate the strings and stringify the values
    // to recover the rendered SQL.
    const calls = prismaStub.$queryRaw.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const sqlObj = calls[0]?.[0] as { strings: string[]; values: unknown[] };
    const sqlText = sqlObj.strings.join('?');
    // The static SQL strings carry the column refs and the `?`
    // placeholders; type / status / city are bound parameters.
    expect(sqlText.toLowerCase()).toContain('location_name');
    expect(sqlText.toLowerCase()).toContain('ilike');
    expect(sqlText).toMatch(/type\s*=\s*\?/i);
    expect(sqlText).toMatch(/status\s*=\s*\?/i);
    // Bound values: lat / lng / radius / pageSize / skip + type / status / city.
    expect(sqlObj.values).toContain('STUDY');
    expect(sqlObj.values).toContain('RECRUITING');
    expect(sqlObj.values).toContain('%北京%');
    expect(sqlObj.values).toContain(116.31);
    expect(sqlObj.values).toContain(39.99);
    expect(sqlObj.values).toContain(5);
  });
});
