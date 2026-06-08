/**
 * Tests for the admin module (issue #32).
 *
 * Covers:
 *   - 401 when the token is missing
 *   - 403 when the token is valid but role !== 'ADMIN'
 *   - 403 when an admin is BANNED
 *   - GET /admin/activities defaults to the PENDING_REVIEW queue
 *   - GET /admin/activities accepts a status filter
 *   - POST /admin/activities/:id/approve moves PENDING_REVIEW → RECRUITING
 *   - POST /admin/activities/:id/reject stores the reason and flips to REJECTED
 *   - PATCH /admin/users/:id/status flips ACTIVE → BANNED and blocks self-ban
 *   - GET /admin/dashboard/metrics returns the full count set
 *   - GET /admin/users requires at least one filter (no "list everything")
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
process.env.REDIS_URL ??= 'redis://localhost:6379/0';
process.env.JWT_SECRET ??= 'a'.repeat(48);

// Mint HS256 tokens from outside the vi.hoisted factory so we can use
// `import crypto` at the top of the file (the hoisted factory cannot
// reference top-level imports).
function jwtSignHs256(payload: Record<string, unknown>, secret: string): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const header = enc({ alg: 'HS256', typ: 'JWT' });
  const body = enc(payload);
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

const { prismaStub, redisStub } = vi.hoisted(() => {
  const prismaStub = {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      update: vi.fn(),
    },
    activity: {
      findUnique: vi.fn(),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      update: vi.fn(),
    },
    signup: { count: vi.fn(async () => 0) },
    pushToken: { count: vi.fn(async () => 0) },
  };
  const redisStub = {
    get: vi.fn(async () => null),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
    scan: vi.fn(async () => ['0', []] as [string, string[]]),
  };
  return { prismaStub, redisStub };
});

vi.mock('@/lib/prisma.js', () => ({ prisma: prismaStub }));
vi.mock('@/lib/redis.js', () => ({ redis: redisStub }));
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

import { registerAdminModule } from '@/modules/admin/index.js';

let app: FastifyInstance;

const ADMIN_ID = 'usr_admin001';
const NORMAL_ID = 'usr_normal01';
const BANNED_ADMIN_ID = 'usr_banadmin1';
const TARGET_USER_ID = 'usr_target01';
const SECRET = process.env.JWT_SECRET!;

const adminToken = jwtSignHs256(
  { sub: ADMIN_ID, role: 'ADMIN', status: 'ACTIVE', type: 'access' },
  SECRET,
);
const userToken = jwtSignHs256(
  { sub: NORMAL_ID, role: 'USER', status: 'ACTIVE', type: 'access' },
  SECRET,
);
const bannedAdminToken = jwtSignHs256(
  { sub: BANNED_ADMIN_ID, role: 'ADMIN', status: 'BANNED', type: 'access' },
  SECRET,
);
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

function makeActivity(over: Record<string, unknown> = {}) {
  return {
    id: 'ckact0001',
    type: 'STUDY',
    title: 'Library 4 study',
    description: 'h',
    coverUrl: null,
    locationName: 'Lib',
    locationAddr: '123',
    // Prisma's Decimal serializes to a Decimal in the real client but
    // most call sites just call Number(...) on it for the JSON response.
    // The activity service uses `Math.round(... * 100) / 100` so a
    // plain number is fine for the route handler's smoke path.
    locationLat: 1.23,
    locationLng: 4.56,
    startTime: new Date('2026-06-09T10:00:00Z'),
    endTime: new Date('2026-06-09T12:00:00Z'),
    maxParticipants: 5,
    currentCount: 1,
    tags: [],
    status: 'PENDING_REVIEW',
    moderationNote: null,
    contentCheck: 'PENDING',
    createdAt: new Date('2026-06-08T12:00:00Z'),
    updatedAt: new Date('2026-06-08T12:00:00Z'),
    creator: { id: ADMIN_ID, nickname: 'admin', avatar: null, school: 'MIT' },
    ...over,
  };
}

beforeAll(async () => {
  // Register @fastify/jwt so the authenticate hook can verify the
  // hand-minted tokens. We import the real plugin so the auth path
  // is exercised end-to-end.
  const Fastify = (await import('fastify')).default;
  const jwt = (await import('@fastify/jwt')).default;
  app = Fastify({ logger: false });
  app.decorate('prisma', prismaStub as never);
  app.decorate('redis', redisStub as never);
  await app.register(jwt, {
    secret: SECRET,
    sign: { expiresIn: '7d', algorithm: 'HS256' },
    verify: { algorithms: ['HS256'] },
  });
  app.decorate(
    'authenticate',
    (async (req: { userId?: string; userRole?: 'USER' | 'ADMIN'; userStatus?: 'ACTIVE' | 'BANNED' }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Unauthorized = (await import('@/lib/errors.js' as any)).UnauthorizedError as
        | (new (m: string) => Error)
        | undefined;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (req as any).jwtVerify();
      } catch {
        throw new (Unauthorized ?? Error)('Token 无效或已过期');
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = (req as any).user as
        | { sub: string; role?: 'USER' | 'ADMIN'; status?: 'ACTIVE' | 'BANNED' };
      req.userId = p.sub;
      req.userRole = p.role ?? 'USER';
      req.userStatus = p.status ?? 'ACTIVE';
    }) as never,
  );
  app.decorate(
    'adminOnly',
    (async (req: { userId?: string; userRole?: 'USER' | 'ADMIN'; userStatus?: 'ACTIVE' | 'BANNED' }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errs = (await import('@/lib/errors.js' as any)) as {
        UnauthorizedError: new (m: string) => Error;
        ForbiddenError: new (m: string) => Error;
      };
      if (!req.userId) throw new errs.UnauthorizedError('需要登录');
      if (req.userRole !== 'ADMIN') throw new errs.ForbiddenError('需要管理员权限');
      if (req.userStatus === 'BANNED') throw new errs.ForbiddenError('账号已封禁');
    }) as never,
  );
  await registerAdminModule(app, prismaStub as never);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaStub.user.findMany.mockResolvedValue([]);
  prismaStub.user.count.mockResolvedValue(0);
  prismaStub.activity.findMany.mockResolvedValue([]);
  prismaStub.activity.count.mockResolvedValue(0);
  prismaStub.activity.findUnique.mockResolvedValue(null);
  prismaStub.user.findUnique.mockResolvedValue(null);
});

describe('GET /api/v1/admin/activities (issue #32)', () => {
  it('rejects missing token with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/activities',
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects non-admin with 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/activities',
      headers: bearer(userToken),
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a banned admin with 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/activities',
      headers: bearer(bannedAdminToken),
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns the PENDING_REVIEW queue by default', async () => {
    prismaStub.activity.findMany.mockResolvedValueOnce([makeActivity()]);
    prismaStub.activity.count.mockResolvedValueOnce(1);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/activities',
      headers: bearer(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('ckact0001');
    expect(body.page.total).toBe(1);
    // The default filter must be PENDING_REVIEW.
    expect(prismaStub.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PENDING_REVIEW' } }),
    );
  });

  it('accepts an explicit status filter', async () => {
    prismaStub.activity.findMany.mockResolvedValueOnce([]);
    prismaStub.activity.count.mockResolvedValueOnce(0);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/activities?status=RECRUITING',
      headers: bearer(adminToken),
    });
    expect(res.statusCode).toBe(200);
    expect(prismaStub.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'RECRUITING' } }),
    );
  });
});

describe('POST /api/v1/admin/activities/:id/approve (issue #32)', () => {
  it('moves PENDING_REVIEW → RECRUITING', async () => {
    prismaStub.activity.findUnique.mockResolvedValueOnce(
      makeActivity({ status: 'PENDING_REVIEW' }),
    );
    prismaStub.activity.update.mockResolvedValueOnce(
      makeActivity({ status: 'RECRUITING' }),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/activities/ckact0001/approve',
      headers: bearer(adminToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('RECRUITING');
    expect(prismaStub.activity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ckact0001' },
        data: { status: 'RECRUITING', moderationNote: null },
      }),
    );
  });

  it('refuses to approve an already-ENDED activity (409)', async () => {
    prismaStub.activity.findUnique.mockResolvedValueOnce(
      makeActivity({ status: 'ENDED' }),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/activities/ckact0001/approve',
      headers: bearer(adminToken),
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('POST /api/v1/admin/activities/:id/reject (issue #32)', () => {
  it('moves PENDING_REVIEW → REJECTED and records the reason', async () => {
    prismaStub.activity.findUnique.mockResolvedValueOnce(
      makeActivity({ status: 'PENDING_REVIEW' }),
    );
    prismaStub.activity.update.mockResolvedValueOnce(
      makeActivity({ status: 'REJECTED', moderationNote: 'spam' }),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/activities/ckact0001/reject',
      headers: bearer(adminToken),
      payload: { reason: 'spam' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('REJECTED');
    expect(res.json().data.moderationNote).toBe('spam');
    expect(prismaStub.activity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'REJECTED', moderationNote: 'spam' },
      }),
    );
  });

  it('rejects a request without a reason (400)', async () => {
    prismaStub.activity.findUnique.mockResolvedValueOnce(
      makeActivity({ status: 'PENDING_REVIEW' }),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/activities/ckact0001/reject',
      headers: bearer(adminToken),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/v1/admin/users (issue #32)', () => {
  it('requires at least one filter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/users',
      headers: bearer(adminToken),
    });
    expect(res.statusCode).toBe(400);
  });

  it('searches by nickname substring', async () => {
    prismaStub.user.findMany.mockResolvedValueOnce([
      {
        id: TARGET_USER_ID,
        nickname: 'tom',
        avatar: null,
        school: 'NYU',
        phone: null,
        status: 'ACTIVE',
        role: 'USER',
        createdAt: new Date('2026-06-01T00:00:00Z'),
        updatedAt: new Date('2026-06-01T00:00:00Z'),
      },
    ]);
    prismaStub.user.count.mockResolvedValueOnce(1);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/users?search=tom',
      headers: bearer(adminToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].id).toBe(TARGET_USER_ID);
  });
});

describe('PATCH /api/v1/admin/users/:id/status (issue #32)', () => {
  it('bans a user (ACTIVE → BANNED)', async () => {
    prismaStub.user.findUnique.mockResolvedValueOnce({
      id: TARGET_USER_ID,
      status: 'ACTIVE',
      role: 'USER',
    });
    prismaStub.user.update.mockResolvedValueOnce({
      id: TARGET_USER_ID,
      status: 'BANNED',
      role: 'USER',
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${TARGET_USER_ID}/status`,
      headers: bearer(adminToken),
      payload: { status: 'BANNED', note: 'abuse' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('BANNED');
  });

  it('refuses to ban the calling admin (409)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${ADMIN_ID}/status`,
      headers: bearer(adminToken),
      payload: { status: 'BANNED' },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('GET /api/v1/admin/dashboard/metrics (issue #32)', () => {
  it('returns the full count set', async () => {
    prismaStub.user.count
      .mockResolvedValueOnce(100) // usersTotal
      .mockResolvedValueOnce(3) // usersBanned
      .mockResolvedValueOnce(7) // usersNewToday
      .mockResolvedValueOnce(28); // usersNewThisWeek
    prismaStub.activity.count
      .mockResolvedValueOnce(450) // activitiesTotal
      .mockResolvedValueOnce(12) // activitiesPending
      .mockResolvedValueOnce(80); // activitiesRecruiting
    prismaStub.signup.count
      .mockResolvedValueOnce(900) // signupsTotal
      .mockResolvedValueOnce(45); // signupsToday
    prismaStub.pushToken.count.mockResolvedValueOnce(200);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/dashboard/metrics',
      headers: bearer(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.users.total).toBe(100);
    expect(body.users.banned).toBe(3);
    expect(body.activities.pending).toBe(12);
    expect(body.signups.total).toBe(900);
    expect(body.pushTokens.total).toBe(200);
    expect(typeof body.generatedAt).toBe('string');
  });
});
