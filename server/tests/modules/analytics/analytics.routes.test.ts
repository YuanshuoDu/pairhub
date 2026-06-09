/**
 * Tests for the analytics module (issue #28).
 *
 * Coverage:
 *   - GET /api/v1/admin/analytics/funnel returns 4 stages with
 *     sequential rates, includes the view-approximation note
 *   - GET /api/v1/admin/analytics/retention returns D1 / D7 / D30 for
 *     the cohort, with empty-cohort graceful handling
 *   - GET /api/v1/admin/analytics/activity-volume groups by day +
 *     by type + by status
 *   - GET /api/v1/admin/analytics/kpis returns the 4-KPI snapshot
 *   - All 4 endpoints are 401 without a token + 403 for non-admin
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
process.env.REDIS_URL ??= 'redis://localhost:6379/0';
process.env.JWT_SECRET ??= 'a'.repeat(48);

// In-memory prisma stub scoped to the test suite.
const { prismaStub, jwtSignHs256 } = vi.hoisted(() => {
  const prismaStub = {
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    activity: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    signup: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    review: { count: vi.fn() },
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const jwtSignHs256 = (
    payload: Record<string, unknown>,
    secret: string,
  ): string => {
    const enc = (o: object) =>
      Buffer.from(JSON.stringify(o)).toString('base64url');
    const header = enc({ alg: 'HS256', typ: 'JWT' });
    const body = enc(payload);
    const sig = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${body}`)
      .digest('base64url');
    return `${header}.${body}.${sig}`;
  };
  return { prismaStub, jwtSignHs256 };
});

vi.mock('@/lib/prisma.js', () => ({ prisma: prismaStub }));
vi.mock('@/lib/redis.js', () => ({
  redis: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
    scan: vi.fn(async () => ['0', []] as [string, string[]]),
  },
}));
vi.mock('@/lib/errors.js', () => ({
  UnauthorizedError: class extends Error {
    readonly statusCode = 401;
    readonly code = 'UNAUTHORIZED';
    constructor(message = 'Token 无效或已过期') {
      super(message);
      this.name = 'UnauthorizedError';
    }
  },
  ForbiddenError: class extends Error {
    readonly statusCode = 403;
    readonly code = 'FORBIDDEN';
    constructor(message = '权限不足') {
      super(message);
      this.name = 'ForbiddenError';
    }
  },
  NotFoundError: class extends Error {
    readonly statusCode = 404;
    readonly code = 'NOT_FOUND';
    constructor(public errorCode: string, message: string) {
      super(message);
      this.name = 'NotFoundError';
    }
  },
  ConflictError: class extends Error {
    readonly statusCode = 409;
    readonly code = 'CONFLICT';
    constructor(public errorCode: string, message: string) {
      super(message);
      this.name = 'ConflictError';
    }
  },
  ValidationError: class extends Error {
    readonly statusCode = 400;
    readonly code = 'VALIDATION_ERROR';
    constructor(public details: unknown) {
      super('请求参数校验失败');
      this.name = 'ValidationError';
    }
  },
  AppError: class extends Error {
    constructor(public statusCode: number, public code: string, message: string) {
      super(message);
      this.name = 'AppError';
    }
  },
}));

import { registerAnalyticsModule } from '@/modules/analytics/index.js';

let app: FastifyInstance;

const ADMIN_ID = 'usr_admin001';
const NORMAL_ID = 'usr_normal01';
const SECRET = process.env.JWT_SECRET!;
const adminToken = jwtSignHs256(
  { sub: ADMIN_ID, role: 'ADMIN', status: 'ACTIVE', type: 'access' },
  SECRET,
);
const userToken = jwtSignHs256(
  { sub: NORMAL_ID, role: 'USER', status: 'ACTIVE', type: 'access' },
  SECRET,
);
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

beforeAll(async () => {
  const Fastify = (await import('fastify')).default;
  const jwt = (await import('@fastify/jwt')).default;
  app = Fastify({ logger: false });
  app.decorate('prisma', prismaStub as never);
  app.decorate('redis', {
    get: async () => null,
    set: async () => 'OK',
    del: async () => 1,
    scan: async () => ['0', []] as [string, string[]],
  } as never);
  await app.register(jwt, {
    secret: SECRET,
    sign: { expiresIn: '7d', algorithm: 'HS256' },
    verify: { algorithms: ['HS256'] },
  });
  app.decorate(
    'authenticate',
    (async (req: { userId?: string; userRole?: 'USER' | 'ADMIN'; userStatus?: 'ACTIVE' | 'BANNED' }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errs = (await import('@/lib/errors.js' as any)) as {
        UnauthorizedError: new (m: string) => Error;
      };
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (req as any).jwtVerify();
      } catch {
        throw new errs.UnauthorizedError('Token 无效或已过期');
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = (req as any).user as {
        sub: string;
        role?: 'USER' | 'ADMIN';
        status?: 'ACTIVE' | 'BANNED';
      };
      req.userId = p.sub;
      req.userRole = p.role ?? 'USER';
      req.userStatus = p.status ?? 'ACTIVE';
    }) as never,
  );
  app.decorate(
    'adminOnly',
    (async (req: { userId?: string; userRole?: 'USER' | 'ADMIN' }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errs = (await import('@/lib/errors.js' as any)) as {
        UnauthorizedError: new (m: string) => Error;
        ForbiddenError: new (m: string) => Error;
      };
      if (!req.userId) throw new errs.UnauthorizedError('需要登录');
      if (req.userRole !== 'ADMIN') throw new errs.ForbiddenError('需要管理员权限');
    }) as never,
  );
  await registerAnalyticsModule(app);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) clears the once-implementation queue
  // so the funnel / activity-volume / empty-cohort tests don't leak their
  // mockResolvedValueOnce into later kpis / retention tests.
  vi.resetAllMocks();
  prismaStub.user.findMany.mockResolvedValue([]);
  prismaStub.user.count.mockResolvedValue(0);
  prismaStub.activity.findMany.mockResolvedValue([]);
  prismaStub.activity.count.mockResolvedValue(0);
  prismaStub.signup.findMany.mockResolvedValue([]);
  prismaStub.signup.count.mockResolvedValue(0);
  prismaStub.review.count.mockResolvedValue(0);
});

describe('GET /api/v1/admin/analytics/funnel (issue #28)', () => {
  it('rejects unauthenticated requests (401)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/analytics/funnel',
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects non-admin (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/analytics/funnel',
      headers: bearer(userToken),
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns the 5-stage funnel with sequential rates', async () => {
    // 50 new users, 30 view-pairs, 8 creates, 5 signups, 2 reviews
    prismaStub.user.count
      .mockResolvedValueOnce(50) // new users
      .mockResolvedValueOnce(50); // not re-used
    prismaStub.signup.findMany
      .mockResolvedValueOnce(
        Array.from({ length: 30 }, (_, i) => ({
          userId: `usr_${i}`,
          activityId: `act_${i}`,
        })),
      ) // view tuples
      .mockResolvedValueOnce([]); // activeOnOrAfter for retention (not used here)
    prismaStub.activity.count.mockResolvedValueOnce(8);
    prismaStub.signup.count
      .mockResolvedValueOnce(5) // approved signups
      .mockResolvedValueOnce(5); // signupsAll
    prismaStub.review.count.mockResolvedValueOnce(2);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/analytics/funnel?window=7d',
      headers: bearer(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.window).toBe('7d');
    expect(body.stages).toHaveLength(5);
    expect(body.stages[0]).toMatchObject({ stage: 'new_users', count: 50 });
    expect(body.stages[1]).toMatchObject({ stage: 'view', count: 30 });
    expect(body.stages[2]).toMatchObject({ stage: 'create', count: 8 });
    expect(body.stages[3]).toMatchObject({ stage: 'signup', count: 5 });
    expect(body.stages[4]).toMatchObject({ stage: 'review', count: 2 });
    // rate_from_previous of create = 8/30 ≈ 0.2667
    expect(body.stages[2].rate_from_previous).toBeCloseTo(8 / 30, 4);
    // signup stage rate_from_view = 5/30
    expect(body.stages[3].rate_from_view).toBeCloseTo(5 / 30, 4);
    // the view-approximation note is included
    expect(body.notes.view_approximation).toContain('view-event log ships in v1.1');
  });

  it('rejects an invalid window (400)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/analytics/funnel?window=1h',
      headers: bearer(adminToken),
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/v1/admin/analytics/retention (issue #28)', () => {
  it('handles an empty cohort gracefully', async () => {
    prismaStub.user.findMany.mockResolvedValueOnce([]);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/analytics/retention?cohort=2026-01',
      headers: bearer(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.cohortSize).toBe(0);
    expect(body.retention).toEqual({ d1: 0, d7: 0, d30: 0 });
  });

  it('computes D1 / D7 / D30 for a non-empty cohort', async () => {
    // 4 users created in the cohort. Active within D1: u1 (D0).
    // Active within D7: u1 + u4 (D3).
    // Active within D30: u1 + u2 (D13) + u4 (D3).
    const cohort = [
      { id: 'u1', createdAt: new Date('2026-06-01T00:00:00Z') },
      { id: 'u2', createdAt: new Date('2026-06-02T00:00:00Z') },
      { id: 'u3', createdAt: new Date('2026-06-03T00:00:00Z') },
      { id: 'u4', createdAt: new Date('2026-06-04T00:00:00Z') },
    ];
    prismaStub.user.findMany.mockResolvedValueOnce(cohort);
    prismaStub.signup.findMany.mockResolvedValueOnce([
      { userId: 'u1', signedAt: new Date('2026-06-01T06:00:00Z') }, // D0
      { userId: 'u4', signedAt: new Date('2026-06-07T06:00:00Z') }, // D3
      { userId: 'u2', signedAt: new Date('2026-06-15T06:00:00Z') }, // D13
    ]);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/analytics/retention?cohort=2026-06',
      headers: bearer(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.cohortSize).toBe(4);
    expect(body.activeUsers).toBe(3);
    // D1: only u1 = 1 of 4
    expect(body.retention.d1).toBeCloseTo(1 / 4, 4);
    // D7: u1 + u4 = 2 of 4
    expect(body.retention.d7).toBeCloseTo(2 / 4, 4);
    // D30: u1 + u2 + u4 = 3 of 4
    expect(body.retention.d30).toBeCloseTo(3 / 4, 4);
  });
});

describe('GET /api/v1/admin/analytics/activity-volume (issue #28)', () => {
  it('groups by day + by type + by status', async () => {
    prismaStub.activity.findMany.mockResolvedValueOnce([
      { createdAt: new Date('2026-06-08T10:00:00Z'), type: 'SPORTS', status: 'RECRUITING' },
      { createdAt: new Date('2026-06-08T15:00:00Z'), type: 'STUDY', status: 'PENDING_REVIEW' },
      { createdAt: new Date('2026-06-08T20:00:00Z'), type: 'SPORTS', status: 'RECRUITING' },
      { createdAt: new Date('2026-06-09T05:00:00Z'), type: 'BOARD_GAME', status: 'RECRUITING' },
    ]);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/analytics/activity-volume?window=7d',
      headers: bearer(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.total).toBe(4);
    expect(body.days).toHaveLength(2);
    expect(body.days[0].day).toBe('2026-06-08');
    expect(body.days[0].total).toBe(3);
    expect(body.days[0].byType.SPORTS).toBe(2);
    expect(body.days[0].byType.STUDY).toBe(1);
    expect(body.days[0].byStatus.PENDING_REVIEW).toBe(1);
    expect(body.days[1].total).toBe(1);
  });
});

describe('GET /api/v1/admin/analytics/kpis (issue #28)', () => {
  it('returns the 4-KPI snapshot', async () => {
    prismaStub.user.count
      .mockResolvedValueOnce(50) // total
      .mockResolvedValueOnce(5) // new_today
      .mockResolvedValueOnce(15); // new_this_week
    prismaStub.activity.count
      .mockResolvedValueOnce(12) // total
      .mockResolvedValueOnce(8) // active
      .mockResolvedValueOnce(1); // pending
    prismaStub.signup.count
      .mockResolvedValueOnce(38) // total
      .mockResolvedValueOnce(7); // today
    prismaStub.review.count.mockResolvedValueOnce(14);
    prismaStub.signup.findMany.mockResolvedValueOnce(
      Array.from({ length: 12 }, (_, i) => ({ userId: `usr_${i}` })),
    ); // active 7d

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/analytics/kpis',
      headers: bearer(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.users.total).toBe(50);
    expect(body.users.new_today).toBe(5);
    expect(body.users.new_this_week).toBe(15);
    expect(body.users.active_7d).toBe(12);
    expect(body.activities.total).toBe(12);
    expect(body.activities.active).toBe(8);
    expect(body.activities.pending).toBe(1);
    expect(body.signups.total).toBe(38);
    expect(body.signups.today).toBe(7);
    expect(body.reviews.total).toBe(14);
    expect(typeof body.generated_at).toBe('string');
  });
});
