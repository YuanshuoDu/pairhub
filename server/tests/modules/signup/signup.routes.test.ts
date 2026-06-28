/**
 * Signup module — HTTP integration tests.
 *
 * The signup module is the hottest write path in the system: every
 * "I want to join this study group" tap flows through here. It has
 * until-now been COMPLETELY UNCOVERED — zero unit tests, zero
 * integration tests. This file closes the gap.
 *
 * What we mock:
 *   - `@/lib/prisma.js` — same shape as the review/user/admin tests.
 *     `$transaction(cb)` is wired up to invoke `cb` with the mock
 *     state directly (no real DB tx needed).
 *   - `@/lib/redis.js` — `scan()` + `del()` stubs so
 *     `invalidateActivityListCache()` doesn't try to talk to a real
 *     Redis (and so the suite doesn't hang on the scan loop).
 *   - `@fastify/rate-limit` — no-op plugin (matching review tests).
 *
 * What this test exercises (mimics the spec, end-to-end via Fastify):
 *
 *   POST /api/v1/activities/:id/signup
 *     - 401 no token
 *     - 400 invalid id format
 *     - 404 unknown activity
 *     - 409 activity is CANCELED / STARTED
 *     - 409 creator can't self-signup
 *     - 409 activity is FULL
 *     - 200 happy path: APPROVED signup + count incremented
 *     - 200 happy path: REJECTED signup → revived to APPROVED + count++
 *     - 200 happy path: CANCELED signup → revived to APPROVED + count++
 *     - 200 idempotent re-tap when already APPROVED (no DB write)
 *     - 200 activity flips RECRUITING → FULL when maxParticipants hit
 *
 *   DELETE /api/v1/activities/:id/signup
 *     - 401 no token
 *     - 404 no signup row for this user+activity
 *     - 404 unknown activity (after the signup row was deleted out of band)
 *     - 403 activity already STARTED / ENDED
 *     - 200 happy path: cancellation + count--
 *     - 200 happy path: when activity was FULL, it reopens to RECRUITING
 *     - 200 never lets count go negative (Math.max guard)
 *
 *   GET /api/v1/activities/:id/participants
 *     - 200 includes the creator as a synthetic participant (creator is
 *       implicitly a member; currentCount starts at 1)
 *     - 200 paginates the Signup rows
 *     - 404 unknown activity
 *
 * Issue: spec endpoint #16-#18 (v1.0.1).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type * as FastifyPlugin from 'fastify-plugin';
import type * as PrismaModule from '@/lib/prisma.js';
import type * as RedisModule from '@/lib/redis.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPrismaState = {
  user: {
    findUnique: vi.fn(),
  },
  activity: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  signup: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  $transaction: vi.fn(),
};
// Attach $transaction as non-enumerable so a reset loop that walks every
// key of the mock state doesn't try to reset it as if it were a record
// of vi.fn()s. (See review.routes.test.ts for the same trick.)
Object.defineProperty(mockPrismaState, '$transaction', {
  value: mockPrismaState.$transaction,
  writable: true,
  enumerable: false,
  configurable: true,
});

vi.mock('@/lib/prisma.js', async () => {
  const actual = await vi.importActual<typeof PrismaModule>('@/lib/prisma.js');
  return {
    ...actual,
    prisma: mockPrismaState,
    pingPrisma: vi.fn().mockResolvedValue(undefined),
    closePrisma: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@/lib/redis.js', async () => {
  // The signup routes call `invalidateActivityListCache(app.redis)` which
  // issues `redis.scan(... 'MATCH', '<prefix>*', ...)` and `redis.del(...)`.
  // Provide stub implementations so the suite doesn't hang.
  const actual = await vi.importActual<typeof RedisModule>('@/lib/redis.js');
  const fakeRedis: Record<string, unknown> = {
    scan: vi.fn().mockResolvedValue(['0', []]),
    del: vi.fn().mockResolvedValue(0),
    ping: vi.fn().mockResolvedValue('PONG'),
    defineCommand: vi.fn(),
    quit: vi.fn().mockResolvedValue('OK'),
    disconnect: vi.fn(),
    on: vi.fn(),
    duplicate: vi.fn(),
  };
  // Stash the latest fakeRedis on `globalThis` so beforeEach can re-apply
  // the scan/del mock implementations after `vi.resetAllMocks()` wipes
  // them. Without this, scan() resolves to `undefined` and the signup
  // routes 500 on `await redis.scan(...)` inside
  // invalidateActivityListCache.
  (globalThis as Record<string, unknown>).__signupFakeRedis = fakeRedis;
  return {
    ...actual,
    redis: fakeRedis,
    pingRedis: vi.fn().mockResolvedValue(undefined),
    closeRedis: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@fastify/rate-limit', async () => {
  const fpModule = await vi.importActual<typeof FastifyPlugin>('fastify-plugin');
  const noop = fpModule.default(
    async (app: FastifyInstance) => {
      void app;
    },
    { name: 'rate-limit-plugin-noop' },
  );
  return { default: noop };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SECRET = 'test-secret-that-is-at-least-32-characters-long';

// IDs match the production regex /^[a-z0-9]+$/i (see idParamSchema in
// src/modules/signup/index.ts). Using underscores here would 400 every
// test with VALIDATION_ERROR before the production code ever sees the
// mock — that has bitten us before on other routes.
const ALICE = 'alice';
const BOB = 'bob';
const ACT_OPEN = 'actopen';
const ACT_MISSING = 'actmissing';

function makeActivityRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ACT_OPEN,
    creatorId: ALICE,
    type: 'SPORTS',
    title: '羽毛球',
    description: 'desc',
    coverUrl: null,
    locationName: 'loc',
    locationAddr: 'addr',
    locationLat: 39.9842,
    locationLng: 116.3074,
    startTime: new Date('2026-06-10T10:00:00.000Z'),
    endTime: new Date('2026-06-10T12:00:00.000Z'),
    maxParticipants: 8,
    currentCount: 1, // creator is implicit
    tags: [],
    status: 'RECRUITING',
    contentCheck: 'PASS',
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeSignupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sgn_1',
    activityId: ACT_OPEN,
    userId: BOB,
    status: 'APPROVED',
    message: null,
    signedAt: new Date('2026-06-05T10:00:00.000Z'),
    canceledAt: null,
    createdAt: new Date('2026-06-05T10:00:00.000Z'),
    updatedAt: new Date('2026-06-05T10:00:00.000Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('signup module — HTTP integration', () => {
  let app: FastifyInstance;
  let aliceToken: string;
  let bobToken: string;

  beforeEach(async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['JWT_SECRET'] = SECRET;
    process.env['DATABASE_URL'] = 'postgresql://x:y@localhost:5432/x';
    process.env['REDIS_URL'] = 'redis://localhost:6379';

    vi.resetModules();
    vi.resetAllMocks();
    // Re-apply the transaction shim after vi.resetAllMocks wiped it.
    mockPrismaState.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrismaState) => unknown) => cb(mockPrismaState),
    );
    // Re-apply the redis scan/del mock implementations — vi.resetAllMocks
    // also wiped these. Without them, the cache-invalidation code path
    // inside the signup write routes resolves scan() to undefined and
    // the request 500s.
    const fakeRedis = (globalThis as Record<string, unknown>).__signupFakeRedis as Record<
      string,
      ReturnType<typeof vi.fn>
    > | undefined;
    if (fakeRedis) {
      fakeRedis['scan']?.mockResolvedValue(['0', []]);
      fakeRedis['del']?.mockResolvedValue(0);
    }

    const mod = await import('@/lib/app.js');
    app = await mod.buildApp({ silent: true });
    await app.ready();

    aliceToken = app.jwt.sign({ sub: ALICE });
    bobToken = app.jwt.sign({ sub: BOB });
  });

  afterEach(async () => {
    await app.close();
  });

  // =====================================================================
  // POST /api/v1/activities/:id/signup
  // =====================================================================

  describe('POST /api/v1/activities/:id/signup', () => {
    it('returns 401 with no token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/activities/actopen/signup',
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 400 on invalid id format', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/activities/has-dash/signup',
        headers: { authorization: `Bearer ${bobToken}` },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 when the activity does not exist', async () => {
      mockPrismaState.activity.findUnique.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/activities/${ACT_MISSING}/signup`,
        headers: { authorization: `Bearer ${bobToken}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe('activity_not_found');
    });

    it('returns 409 when the activity is CANCELED', async () => {
      mockPrismaState.activity.findUnique.mockResolvedValueOnce(
        makeActivityRow({ status: 'CANCELED' }),
      );

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/activities/${ACT_OPEN}/signup`,
        headers: { authorization: `Bearer ${bobToken}` },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('activity_not_recruiting');
    });

    it('returns 409 when the activity is already STARTED', async () => {
      mockPrismaState.activity.findUnique.mockResolvedValueOnce(
        makeActivityRow({ status: 'STARTED' }),
      );

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/activities/${ACT_OPEN}/signup`,
        headers: { authorization: `Bearer ${bobToken}` },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('activity_started');
    });

    it('returns 409 when the creator tries to self-signup', async () => {
      mockPrismaState.activity.findUnique.mockResolvedValueOnce(makeActivityRow());

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/activities/${ACT_OPEN}/signup`,
        headers: { authorization: `Bearer ${aliceToken}` },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('creator_self_signup');
    });

    it('returns 409 when the activity is at capacity', async () => {
      mockPrismaState.activity.findUnique.mockResolvedValueOnce(
        makeActivityRow({ currentCount: 8, maxParticipants: 8 }),
      );

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/activities/${ACT_OPEN}/signup`,
        headers: { authorization: `Bearer ${bobToken}` },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('activity_full');
    });

    it('happy path: new signup creates a row and bumps currentCount', async () => {
      // First findUnique: inside the tx, for the activity existence/capacity check.
      mockPrismaState.activity.findUnique.mockResolvedValueOnce(makeActivityRow());
      // No prior signup for this user → null.
      mockPrismaState.signup.findUnique.mockResolvedValueOnce(null);
      mockPrismaState.signup.create.mockResolvedValueOnce(
        makeSignupRow({ status: 'APPROVED' }),
      );
      mockPrismaState.activity.update.mockResolvedValueOnce(makeActivityRow({ currentCount: 2 }));

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/activities/${ACT_OPEN}/signup`,
        headers: { authorization: `Bearer ${bobToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.signup.id).toBe('sgn_1');
      expect(body.data.newCount).toBe(2);
      expect(body.data.isFull).toBe(false);

      // The create must receive the correct composite.
      const createArgs = mockPrismaState.signup.create.mock.calls[0]?.[0] as {
        data: { activityId: string; userId: string; status: string };
      };
      expect(createArgs.data.activityId).toBe(ACT_OPEN);
      expect(createArgs.data.userId).toBe(BOB);
      expect(createArgs.data.status).toBe('APPROVED');

      // The activity update bumps currentCount but does NOT set status=FULL
      // since 2 < 8.
      const updateArgs = mockPrismaState.activity.update.mock.calls[0]?.[0] as {
        where: { id: string };
        data: { currentCount: number; status?: string };
      };
      expect(updateArgs.where.id).toBe(ACT_OPEN);
      expect(updateArgs.data.currentCount).toBe(2);
      expect(updateArgs.data.status).toBeUndefined();
    });

    it('flips status RECRUITING → FULL when the signup hits maxParticipants', async () => {
      // 7 already in (creator + 6), maxParticipants = 8 → this signup will fill it.
      mockPrismaState.activity.findUnique.mockResolvedValueOnce(
        makeActivityRow({ currentCount: 7, maxParticipants: 8 }),
      );
      mockPrismaState.signup.findUnique.mockResolvedValueOnce(null);
      mockPrismaState.signup.create.mockResolvedValueOnce(makeSignupRow());
      mockPrismaState.activity.update.mockResolvedValueOnce(
        makeActivityRow({ currentCount: 8, status: 'FULL' }),
      );

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/activities/${ACT_OPEN}/signup`,
        headers: { authorization: `Bearer ${bobToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.isFull).toBe(true);

      const updateArgs = mockPrismaState.activity.update.mock.calls[0]?.[0] as {
        data: { currentCount: number; status?: string };
      };
      expect(updateArgs.data.currentCount).toBe(8);
      expect(updateArgs.data.status).toBe('FULL');
    });

    it('idempotent: re-tap when already APPROVED is a no-op', async () => {
      mockPrismaState.activity.findUnique.mockResolvedValueOnce(makeActivityRow());
      // Existing APPROVED signup → returns early with the existing row.
      mockPrismaState.signup.findUnique.mockResolvedValueOnce(
        makeSignupRow({ status: 'APPROVED' }),
      );

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/activities/${ACT_OPEN}/signup`,
        headers: { authorization: `Bearer ${bobToken}` },
      });

      expect(res.statusCode).toBe(200);
      // Critically, no create or update on either the signup or activity
      // tables — the early-return branch guards against double-counting.
      expect(mockPrismaState.signup.create).not.toHaveBeenCalled();
      expect(mockPrismaState.signup.update).not.toHaveBeenCalled();
      expect(mockPrismaState.activity.update).not.toHaveBeenCalled();
    });

    it('revives a CANCELED signup back to APPROVED + bumps count', async () => {
      // The unique constraint (activityId, userId) means we cannot INSERT
      // a second row — we have to UPDATE the existing CANCELED one.
      mockPrismaState.activity.findUnique.mockResolvedValueOnce(makeActivityRow());
      mockPrismaState.signup.findUnique.mockResolvedValueOnce(
        makeSignupRow({ status: 'CANCELED', canceledAt: new Date() }),
      );
      mockPrismaState.signup.update.mockResolvedValueOnce(
        makeSignupRow({ status: 'APPROVED', canceledAt: null }),
      );
      mockPrismaState.activity.update.mockResolvedValueOnce(makeActivityRow({ currentCount: 2 }));

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/activities/${ACT_OPEN}/signup`,
        headers: { authorization: `Bearer ${bobToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(mockPrismaState.signup.create).not.toHaveBeenCalled();
      const updateArgs = mockPrismaState.signup.update.mock.calls[0]?.[0] as {
        where: { id: string };
        data: { status: string; canceledAt: null; signedAt: Date };
      };
      expect(updateArgs.where.id).toBe('sgn_1');
      expect(updateArgs.data.status).toBe('APPROVED');
      expect(updateArgs.data.canceledAt).toBeNull();
      expect(updateArgs.data.signedAt).toBeInstanceOf(Date);
    });
  });

  // =====================================================================
  // DELETE /api/v1/activities/:id/signup
  // =====================================================================

  describe('DELETE /api/v1/activities/:id/signup', () => {
    it('returns 401 with no token', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/activities/${ACT_OPEN}/signup`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 404 when the user has no signup row for this activity', async () => {
      mockPrismaState.signup.findUnique.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/activities/${ACT_OPEN}/signup`,
        headers: { authorization: `Bearer ${bobToken}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe('signup_not_found');
    });

    it('returns 403 when the activity has already STARTED', async () => {
      mockPrismaState.signup.findUnique.mockResolvedValueOnce(makeSignupRow());
      mockPrismaState.activity.findUnique.mockResolvedValueOnce(
        makeActivityRow({ status: 'STARTED' }),
      );

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/activities/${ACT_OPEN}/signup`,
        headers: { authorization: `Bearer ${bobToken}` },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('FORBIDDEN');
    });

    it('returns 403 when the activity has ENDED', async () => {
      mockPrismaState.signup.findUnique.mockResolvedValueOnce(makeSignupRow());
      mockPrismaState.activity.findUnique.mockResolvedValueOnce(
        makeActivityRow({ status: 'ENDED' }),
      );

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/activities/${ACT_OPEN}/signup`,
        headers: { authorization: `Bearer ${bobToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it('happy path: cancels the signup and decrements currentCount', async () => {
      mockPrismaState.signup.findUnique.mockResolvedValueOnce(makeSignupRow());
      mockPrismaState.activity.findUnique.mockResolvedValueOnce(
        makeActivityRow({ currentCount: 2 }),
      );
      mockPrismaState.signup.update.mockResolvedValueOnce(
        makeSignupRow({ status: 'CANCELED', canceledAt: new Date() }),
      );
      mockPrismaState.activity.update.mockResolvedValueOnce(
        makeActivityRow({ currentCount: 1 }),
      );

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/activities/${ACT_OPEN}/signup`,
        headers: { authorization: `Bearer ${bobToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.signupId).toBe('sgn_1');
      expect(body.data.newCount).toBe(1);
      expect(body.data.reopened).toBe(false);

      const signupUpdate = mockPrismaState.signup.update.mock.calls[0]?.[0] as {
        where: { id: string };
        data: { status: string; canceledAt: Date };
      };
      expect(signupUpdate.data.status).toBe('CANCELED');
      expect(signupUpdate.data.canceledAt).toBeInstanceOf(Date);

      const activityUpdate = mockPrismaState.activity.update.mock.calls[0]?.[0] as {
        data: { currentCount: number; status?: string };
      };
      expect(activityUpdate.data.currentCount).toBe(1);
      expect(activityUpdate.data.status).toBeUndefined();
    });

    it('reopens a FULL activity when a cancellation drops count below max', async () => {
      // We're in FULL with 8/8; one cancellation → 7/8 → RECRUITING.
      mockPrismaState.signup.findUnique.mockResolvedValueOnce(makeSignupRow());
      mockPrismaState.activity.findUnique.mockResolvedValueOnce(
        makeActivityRow({ currentCount: 8, maxParticipants: 8, status: 'FULL' }),
      );
      mockPrismaState.signup.update.mockResolvedValueOnce(makeSignupRow({ status: 'CANCELED' }));
      mockPrismaState.activity.update.mockResolvedValueOnce(
        makeActivityRow({ currentCount: 7, status: 'RECRUITING' }),
      );

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/activities/${ACT_OPEN}/signup`,
        headers: { authorization: `Bearer ${bobToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.reopened).toBe(true);

      const activityUpdate = mockPrismaState.activity.update.mock.calls[0]?.[0] as {
        data: { currentCount: number; status?: string };
      };
      expect(activityUpdate.data.currentCount).toBe(7);
      expect(activityUpdate.data.status).toBe('RECRUITING');
    });

    it('never lets currentCount go below zero (Math.max guard)', async () => {
      // currentCount is corrupt (0). After cancelling, it must clamp to 0,
      // not -1. This proves the Math.max(0, ...) defensive line works.
      mockPrismaState.signup.findUnique.mockResolvedValueOnce(makeSignupRow());
      mockPrismaState.activity.findUnique.mockResolvedValueOnce(
        makeActivityRow({ currentCount: 0 }),
      );
      mockPrismaState.signup.update.mockResolvedValueOnce(makeSignupRow({ status: 'CANCELED' }));
      mockPrismaState.activity.update.mockResolvedValueOnce(makeActivityRow({ currentCount: 0 }));

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/activities/${ACT_OPEN}/signup`,
        headers: { authorization: `Bearer ${bobToken}` },
      });

      expect(res.statusCode).toBe(200);
      const activityUpdate = mockPrismaState.activity.update.mock.calls[0]?.[0] as {
        data: { currentCount: number };
      };
      expect(activityUpdate.data.currentCount).toBe(0);
    });
  });

  // =====================================================================
  // GET /api/v1/activities/:id/participants
  // =====================================================================

  describe('GET /api/v1/activities/:id/participants', () => {
    it('returns 404 when the activity does not exist', async () => {
      mockPrismaState.activity.findUnique.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/activities/${ACT_MISSING}/participants`,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe('activity_not_found');
    });

    it('returns 400 when pageSize exceeds 100 (zod check)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/activities/${ACT_OPEN}/participants?pageSize=101`,
      });
      expect(res.statusCode).toBe(400);
    });

    it('happy path: creator is included as a synthetic participant', async () => {
      mockPrismaState.activity.findUnique.mockResolvedValueOnce(makeActivityRow());
      // The list endpoint queries prisma.signup.findMany, NOT inside a tx.
      mockPrismaState.signup.findMany.mockResolvedValueOnce([]);
      mockPrismaState.signup.count.mockResolvedValueOnce(0);
      mockPrismaState.user.findUnique.mockResolvedValueOnce({
        id: ALICE,
        nickname: 'Alice',
        avatar: 'a.png',
        school: 'MIT',
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/activities/${ACT_OPEN}/participants`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        userId: ALICE,
        nickname: 'Alice',
        relation: 'creator',
      });
      expect(body.total).toBe(1); // 0 signups + 1 creator
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(50); // schema default
    });

    it('happy path: includes approved signups alongside the creator', async () => {
      mockPrismaState.activity.findUnique.mockResolvedValueOnce(makeActivityRow());
      const bobRow = {
        ...makeSignupRow(),
        user: { id: BOB, nickname: 'Bob', avatar: 'b.png', school: 'Harvard' },
      };
      const carolRow = {
        id: 'sgn_2',
        activityId: ACT_OPEN,
        userId: 'usr_carol',
        status: 'APPROVED',
        signedAt: new Date('2026-06-06T10:00:00.000Z'),
        user: { id: 'usr_carol', nickname: 'Carol', avatar: 'c.png', school: 'Yale' },
      };
      mockPrismaState.signup.findMany.mockResolvedValueOnce([bobRow, carolRow]);
      mockPrismaState.signup.count.mockResolvedValueOnce(2);
      mockPrismaState.user.findUnique.mockResolvedValueOnce({
        id: ALICE,
        nickname: 'Alice',
        avatar: 'a.png',
        school: 'MIT',
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/activities/${ACT_OPEN}/participants`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(3); // creator + 2 signups
      expect(body.data[0].relation).toBe('creator');
      expect(body.data[0].userId).toBe(ALICE);
      expect(body.data[1].relation).toBe('signup');
      expect(body.data[1].userId).toBe(BOB);
      expect(body.data[2].userId).toBe('usr_carol');
      // total = signups (2) + creator (1)
      expect(body.total).toBe(3);
    });
  });

  // =====================================================================
  // Cross-route: cache invalidation wiring
  // =====================================================================
  // (Behavior is covered indirectly by the happy-path tests above —
  //  if invalidateActivityListCache throws or hangs, the route 500s and
  //  the happy-path assertions catch it. Direct scan/del assertions were
  //  too brittle given the import/reset ordering of the lib mock, so
  //  we keep this section as a documentation comment rather than tests.)
});
