/**
 * Review module — HTTP integration tests.
 *
 * We mock `@/lib/prisma.js` at the module level so we never touch a real
 * database. This lets us drive the full Fastify route stack (preHandler
 * → service → serializer) without docker-compose.
 *
 * What this test exercises:
 *   - The full Fastify route stack
 *   - Auth via `app.authenticate` (401 for missing/bad token)
 *   - Zod validation failures (400)
 *   - The 4 reject scenarios from the task spec:
 *       1. activity not ended   → 409 ACTIVITY_NOT_REVIEWABLE
 *       2. not a participant    → 403 FORBIDDEN
 *       3. self-review          → 400 SELF_REVIEW
 *       4. duplicate review     → 409 REVIEW_ALREADY_EXISTS
 *   - 2-way rating happy path (creator ↔ participant)
 *   - Public list endpoint privacy (fromUser → nickname+avatar only)
 *
 * Issue: #24 — review API: 双向评分
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type * as FastifyPlugin from 'fastify-plugin';

// ---------------------------------------------------------------------------
// Mocks — replace prisma BEFORE importing the app builder
// ---------------------------------------------------------------------------

const mockPrismaState = {
  user: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findMany: vi.fn(),
  },
  activity: {
    findUnique: vi.fn(),
  },
  signup: {
    findUnique: vi.fn(),
  },
  review: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn(),
};

vi.mock('@/lib/prisma.js', async () => {
  // Avoid `vi.importActual` so the real PrismaClient is never constructed
  // (it would otherwise open a Postgres connection on every test).
  // The mock object is set up so that $transaction(fn) just invokes fn
  // with the same mockPrismaState (no real DB transaction needed).
  const $transaction = vi.fn(async (cb: (tx: typeof mockPrismaState) => unknown) =>
    cb(mockPrismaState),
  );
  // Attach as a non-enumerable so the for-of reset loop in beforeEach
  // doesn't try to reset it (it expects each value to be a record of
  // vi.fn()s, not a top-level function).
  Object.defineProperty(mockPrismaState, '$transaction', {
    value: $transaction,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  return {
    prisma: mockPrismaState,
    pingPrisma: vi.fn().mockResolvedValue(undefined),
    closePrisma: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@fastify/rate-limit', async () => {
  // Replace the rate-limit plugin with a no-op so the suite doesn't
  // try to talk to Redis. The original plugin's RedisStore hangs when
  // its `rateLimit` Lua command can't be reached, and our fake redis
  // (lib/redis.js mock) doesn't implement the full ioredis surface.
  const fpModule = await vi.importActual<typeof FastifyPlugin>('fastify-plugin');
  const noop = fpModule.default(
    async (app: FastifyInstance) => {
      // No-op: the production plugin wraps each request in a rate
      // limit check; for unit tests we skip it entirely.
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

const ALICE = { id: 'usr_alice', nickname: 'Alice', avatar: 'a.png' };
const BOB = { id: 'usr_bob', nickname: 'Bob', avatar: 'b.png' };

const ENDED_ACTIVITY = {
  id: 'act_1',
  creatorId: ALICE.id,
  status: 'ENDED',
};

function makeReviewRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rv_1',
    activityId: 'act_1',
    fromUserId: ALICE.id,
    toUserId: BOB.id,
    rating: 5,
    comment: 'great',
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    fromUser: ALICE,
    ...overrides,
  };
}

// Reset every vi.fn() in the mock state — both the `vi.fn()` leaves
// (which are functions, not objects) and any nested mock objects. The
// previous custom helper only matched `typeof v === 'object'` and
// silently skipped the actual vi.fn() leaves, causing test pollution
// between cases. `vi.resetAllMocks` is the documented Vitest helper
// for this and clears both call history and any per-test
// mockResolvedValue / mockImplementation set up in the previous it().
function resetMocks(): void {
  vi.resetAllMocks();
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('review module — HTTP integration', () => {
  let app: FastifyInstance;
  let aliceToken: string;
  let bobToken: string;

  beforeEach(async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['JWT_SECRET'] = SECRET;
    process.env['DATABASE_URL'] = 'postgresql://x:y@localhost:5432/x';
    process.env['REDIS_URL'] = 'redis://localhost:6379';

    vi.resetModules();
    resetMocks();
    // vi.resetAllMocks wiped the $transaction mock implementation that
    // the vi.mock factory installed. Re-apply it here so the review
    // service's prisma.$transaction(cb) call still routes the callback
    // back through the mock prisma state.
    mockPrismaState.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrismaState) => unknown) => cb(mockPrismaState),
    );

    const mod = await import('@/lib/app.js');
    app = await mod.buildApp({ silent: true });
    await app.ready();

    aliceToken = app.jwt.sign({ sub: ALICE.id });
    bobToken = app.jwt.sign({ sub: BOB.id });
  });

  afterEach(async () => {
    await app.close();
  });

  // --------------------------------------------------------------------
  // POST /api/v1/activities/:id/reviews
  // --------------------------------------------------------------------

  describe('POST /api/v1/activities/:id/reviews', () => {
    it('401 with no token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/activities/act_1/reviews',
        payload: { toUserId: BOB.id, rating: 5 },
      });
      expect(res.statusCode).toBe(401);
    });

    it('400 on zod failure (rating out of range)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/activities/act_1/reviews',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: { toUserId: BOB.id, rating: 6 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('VALIDATION_ERROR');
    });

    it('happy path: creator rates a participant (201)', async () => {
      // alice is the creator of the activity; bob is an approved participant.
      mockPrismaState.activity.findUnique.mockResolvedValue(ENDED_ACTIVITY);
      // alice has no signup row (she's the creator) → null; bob's is APPROVED.
      mockPrismaState.signup.findUnique.mockImplementation(async (args: { where: { activityId_userId: { userId: string } } }) => {
        if (args.where.activityId_userId.userId === BOB.id) return { status: 'APPROVED' };
        return null;
      });
      mockPrismaState.review.findUnique.mockResolvedValue(null);
      mockPrismaState.review.create.mockResolvedValue(makeReviewRow());
      mockPrismaState.user.findUniqueOrThrow.mockResolvedValue(ALICE);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/activities/act_1/reviews',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: { toUserId: BOB.id, rating: 5, comment: 'great' },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.id).toBe('rv_1');
      expect(body.data.rating).toBe(5);
      expect(body.data.from).toEqual({ id: ALICE.id, nickname: 'Alice', avatar: 'a.png' });
      expect(body.data.toUserId).toBe(BOB.id);
    });

    it('happy path: 2-way rating (alice rates bob, then bob rates alice)', async () => {
      // ---- alice → bob ----
      mockPrismaState.activity.findUnique.mockResolvedValue(ENDED_ACTIVITY);
      mockPrismaState.signup.findUnique.mockImplementation(async (args: { where: { activityId_userId: { userId: string } } }) => {
        if (args.where.activityId_userId.userId === BOB.id) return { status: 'APPROVED' };
        return null;
      });
      mockPrismaState.review.findUnique.mockResolvedValue(null);
      mockPrismaState.review.create.mockResolvedValue(makeReviewRow({ fromUserId: ALICE.id, toUserId: BOB.id }));
      mockPrismaState.user.findUniqueOrThrow.mockResolvedValue(ALICE);

      const r1 = await app.inject({
        method: 'POST',
        url: '/api/v1/activities/act_1/reviews',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: { toUserId: BOB.id, rating: 5 },
      });
      expect(r1.statusCode).toBe(201);

      // ---- bob → alice ----
      // Reset, then return bob→alice row. Re-apply $transaction since
      // resetMocks() wipes its mock implementation along with the rest.
      resetMocks();
      mockPrismaState.$transaction.mockImplementation(
        async (cb: (tx: typeof mockPrismaState) => unknown) => cb(mockPrismaState),
      );
      mockPrismaState.activity.findUnique.mockResolvedValue(ENDED_ACTIVITY);
      mockPrismaState.signup.findUnique.mockImplementation(async (args: { where: { activityId_userId: { userId: string } } }) => {
        // bob is not the creator, but has an APPROVED signup; alice is the creator
        if (args.where.activityId_userId.userId === BOB.id) return { status: 'APPROVED' };
        return null;
      });
      mockPrismaState.review.findUnique.mockResolvedValue(null);
      mockPrismaState.review.create.mockResolvedValue(
        makeReviewRow({
          id: 'rv_2',
          fromUserId: BOB.id,
          toUserId: ALICE.id,
          fromUser: BOB,
          // createReview returns created.rating/created.comment from the
          // row, not from the request input. Mirror the bob → alice
          // payload here so the route's 201 body matches what the
          // caller sent.
          rating: 4,
          comment: 'good organizer',
        }),
      );
      mockPrismaState.user.findUniqueOrThrow.mockResolvedValue(BOB);

      const r2 = await app.inject({
        method: 'POST',
        url: '/api/v1/activities/act_1/reviews',
        headers: { authorization: `Bearer ${bobToken}` },
        payload: { toUserId: ALICE.id, rating: 4, comment: 'good organizer' },
      });
      expect(r2.statusCode).toBe(201);
      expect(r2.json().data.from).toEqual({ id: BOB.id, nickname: 'Bob', avatar: 'b.png' });
      expect(r2.json().data.rating).toBe(4);
    });

    // ---- 4 reject scenarios ----

    it('reject #1: 409 ACTIVITY_NOT_REVIEWABLE (status = RECRUITING)', async () => {
      mockPrismaState.activity.findUnique.mockResolvedValue({ ...ENDED_ACTIVITY, status: 'RECRUITING' });
      mockPrismaState.signup.findUnique.mockImplementation(async (args: { where: { activityId_userId: { userId: string } } }) => {
        if (args.where.activityId_userId.userId === BOB.id) return { status: 'APPROVED' };
        return null;
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/activities/act_1/reviews',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: { toUserId: BOB.id, rating: 5 },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('ACTIVITY_NOT_REVIEWABLE');
      expect(mockPrismaState.review.create).not.toHaveBeenCalled();
    });

    it('reject #2: 403 FORBIDDEN (fromUser is not a participant)', async () => {
      mockPrismaState.activity.findUnique.mockResolvedValue({ ...ENDED_ACTIVITY, creatorId: 'someone-else' });
      mockPrismaState.signup.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/activities/act_1/reviews',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: { toUserId: BOB.id, rating: 5 },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('FORBIDDEN');
    });

    it('reject #2b: 403 FORBIDDEN (toUser is not a participant)', async () => {
      // alice is the creator; bob is an unknown user
      mockPrismaState.activity.findUnique.mockResolvedValue(ENDED_ACTIVITY);
      mockPrismaState.signup.findUnique.mockImplementation(async (args: { where: { activityId_userId: { userId: string } } }) => {
        if (args.where.activityId_userId.userId === BOB.id) return null;
        return null;
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/activities/act_1/reviews',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: { toUserId: 'usr_ghost', rating: 5 },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('FORBIDDEN');
    });

    it('reject #3: 400 SELF_REVIEW', async () => {
      // alice tries to rate herself
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/activities/act_1/reviews',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: { toUserId: ALICE.id, rating: 5 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('SELF_REVIEW');
      expect(mockPrismaState.review.create).not.toHaveBeenCalled();
    });

    it('reject #4: 409 REVIEW_ALREADY_EXISTS', async () => {
      mockPrismaState.activity.findUnique.mockResolvedValue(ENDED_ACTIVITY);
      mockPrismaState.signup.findUnique.mockImplementation(async (args: { where: { activityId_userId: { userId: string } } }) => {
        if (args.where.activityId_userId.userId === BOB.id) return { status: 'APPROVED' };
        return null;
      });
      mockPrismaState.review.findUnique.mockResolvedValue({ id: 'rv_existing' });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/activities/act_1/reviews',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: { toUserId: BOB.id, rating: 5 },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('REVIEW_ALREADY_EXISTS');
    });

    it('404 ACTIVITY_NOT_FOUND', async () => {
      mockPrismaState.activity.findUnique.mockResolvedValue(null);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/activities/act_missing/reviews',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: { toUserId: BOB.id, rating: 5 },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe('ACTIVITY_NOT_FOUND');
    });
  });

  // --------------------------------------------------------------------
  // GET /api/v1/users/:id/reviews
  // --------------------------------------------------------------------

  describe('GET /api/v1/users/:id/reviews', () => {
    // The list endpoint does a batched `prisma.user.findMany` to hydrate
    // reviewer display info. Stub it here so the route returns 200
    // instead of 500'ing on `undefined.map`. The 404 / 400 cases below
    // short-circuit before findMany is called.
    beforeEach(() => {
      mockPrismaState.user.findMany.mockResolvedValue([
        { id: ALICE.id, nickname: 'Alice', avatar: 'a.png' },
        { id: BOB.id, nickname: 'Bob', avatar: 'b.png' },
      ]);
    });

    it('public: no auth required', async () => {
      mockPrismaState.user.findUnique.mockResolvedValue({ id: BOB.id });
      mockPrismaState.review.findMany.mockResolvedValue([makeReviewRow()]);
      mockPrismaState.review.count.mockResolvedValue(1);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${BOB.id}/reviews`,
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns paginated list newest-first with fromUser projected to {id, nickname, avatar}', async () => {
      const items = [
        makeReviewRow({
          id: 'rv_2',
          createdAt: new Date('2026-06-02'),
          fromUserId: BOB.id,
          toUserId: ALICE.id,
          fromUser: BOB,
        }),
        makeReviewRow({
          id: 'rv_1',
          createdAt: new Date('2026-06-01'),
          fromUserId: ALICE.id,
          toUserId: BOB.id,
          fromUser: ALICE,
        }),
      ];
      mockPrismaState.user.findUnique.mockResolvedValue({ id: BOB.id });
      // listUserReviews does a batched `prisma.user.findMany` to hydrate
      // reviewer display info. Re-stub in the test body too — the
      // outer beforeEach's vi.resetAllMocks() can wipe the nested
      // describe's beforeEach when vi.resetModules() re-imports the
      // app between tests.
      mockPrismaState.user.findMany.mockResolvedValue([
        { id: ALICE.id, nickname: 'Alice', avatar: 'a.png' },
        { id: BOB.id, nickname: 'Bob', avatar: 'b.png' },
      ]);
      mockPrismaState.review.findMany.mockResolvedValue(items);
      mockPrismaState.review.count.mockResolvedValue(2);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${BOB.id}/reviews?page=1&pageSize=20`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(2);
      expect(body.data[0].id).toBe('rv_2');
      expect(body.data[0].from).toEqual({ id: BOB.id, nickname: 'Bob', avatar: 'b.png' });
      expect(body.data[1].from).toEqual({ id: ALICE.id, nickname: 'Alice', avatar: 'a.png' });
      // privacy: no phone / openid in the fromUser payload
      expect(body.data[0].from).not.toHaveProperty('phone');
      expect(body.data[0].from).not.toHaveProperty('openid');
      expect(body.pagination).toEqual({
        page: 1,
        page_size: 20,
        total: 2,
        has_more: false,
      });
    });

    it('has_more = true when there are more pages', async () => {
      mockPrismaState.user.findUnique.mockResolvedValue({ id: BOB.id });
      mockPrismaState.review.findMany.mockResolvedValue([makeReviewRow()]);
      mockPrismaState.review.count.mockResolvedValue(5);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${BOB.id}/reviews?page=1&pageSize=2`,
      });
      expect(res.json().pagination.has_more).toBe(true);
    });

    it('404 USER_NOT_FOUND for an unknown user id', async () => {
      mockPrismaState.user.findUnique.mockResolvedValue(null);
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/users/usr_ghost/reviews`,
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe('USER_NOT_FOUND');
    });

    it('400 on invalid pageSize', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${BOB.id}/reviews?pageSize=200`,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('VALIDATION_ERROR');
    });
  });
});
