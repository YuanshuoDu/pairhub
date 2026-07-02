/**
 * User module — HTTP integration tests.
 *
 * We mock `@/lib/prisma.js` and `@/lib/redis.js` at the module level
 * (same trick the health tests use) so we never touch a real database.
 * The mock Prisma is a plain object with vi.fn()s; we configure the
 * stubs per-test inside `beforeEach`.
 *
 * What this test exercises:
 *   - The full Fastify route stack (preHandler → service → serializer)
 *   - Auth via `app.authenticate` (401 for missing/bad token, 200 for good)
 *   - 403 / 404 from the service bubbling up as RFC 7807 bodies
 *   - Zod validation failures from the route
 *
 * What this test does NOT exercise:
 *   - Real Postgres / Redis (use `pnpm test:integration` against a docker
 *     stack for that — out of scope for the unit-test pipeline)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type * as FastifyPlugin from 'fastify-plugin';
import type * as PrismaModule from '@/lib/prisma.js';
import type * as RedisModule from '@/lib/redis.js';

// ---------------------------------------------------------------------------
// Mocks — replace prisma + redis BEFORE importing the app builder
// ---------------------------------------------------------------------------

const mockPrismaState = {
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  activity: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
};

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
  const actual = await vi.importActual<typeof RedisModule>('@/lib/redis.js');
  // The @fastify/rate-limit plugin calls redis.defineCommand() during
  // registration to compile the rate-limit Lua script into a method on
  // the client. A plain `vi.fn()` for `defineCommand` leaves the
  // `rateLimit` method undefined, and the RedisStore will throw
  // `this.redis.rateLimit is not a function` on the first request.
  //
  // We register a stub that mimics ioredis.defineCommand by attaching a
  // vi.fn() to the client with the command name. The Lua script itself
  // doesn't run in unit tests, so we just need the call to resolve with
  // a plausible [count, ttl] tuple.
  const fakeRedis: Record<string, unknown> = {
    ping: vi.fn().mockResolvedValue('PONG'),
    defineCommand: vi.fn().mockImplementation(function (
      this: Record<string, unknown>,
      name: string,
    ) {
      this[name] = vi.fn().mockResolvedValue([1, 60_000]);
    }),
    quit: vi.fn().mockResolvedValue('OK'),
    disconnect: vi.fn(),
    on: vi.fn(),
    duplicate: vi.fn(),
  };
  return {
    ...actual,
    redis: fakeRedis,
    pingRedis: vi.fn().mockResolvedValue(undefined),
    closeRedis: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@fastify/rate-limit', async () => {
  // Replace the rate-limit plugin with a no-op so the suite doesn't
  // try to talk to a real Redis. Even with the fake-redis defineCommand
  // stub above, the plugin's RedisStore hangs the first request when
  // its `rateLimit` Lua command can't fully resolve in the mock. The
  // review routes test uses the same trick.
  const fpModule = await vi.importActual<typeof FastifyPlugin>('fastify-plugin');
  const noop = fpModule.default(
    async (app: FastifyInstance) => {
      // No-op: skip rate-limit entirely in unit tests.
      void app;
    },
    { name: 'rate-limit-plugin-noop' },
  );
  return { default: noop };
});

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const SECRET = 'test-secret-that-is-at-least-32-characters-long';

function makeUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'usr_alice',
    openid: 'openid_alice',
    unionid: null,
    nickname: 'Alice',
    avatar: 'https://cdn.example.com/a.png',
    school: 'MIT',
    major: 'CS',
    grade: null,
    wechatId: null,
    phone: null,
    bio: 'hi',
    status: 'ACTIVE',
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-02T00:00:00.000Z'),
    ...overrides,
  };
}

function makeActivityRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'act_1',
    creatorId: 'usr_alice',
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
    currentCount: 2,
    tags: [],
    status: 'RECRUITING',
    contentCheck: 'PASS',
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('user module — HTTP integration', () => {
  let app: FastifyInstance;
  let aliceToken: string;
  let bobToken: string;

  beforeEach(async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['JWT_SECRET'] = SECRET;
    process.env['DATABASE_URL'] = 'postgresql://x:y@localhost:5432/x';
    process.env['REDIS_URL'] = 'redis://localhost:6379';

    vi.resetModules();
    // Wipe every vi.fn() in the mock state — covers anything added in
    // later it() bodies, not just the four we knew about when the test
    // was first written. See the matching note in review.routes.test.ts.
    vi.resetAllMocks();

    // Build a fresh app per test so module state doesn't leak.
    const mod = await import('@/lib/app.js');
    app = await mod.buildApp({ silent: true });
    await app.ready();

    aliceToken = app.jwt.sign({ sub: 'usr_alice' });
    bobToken = app.jwt.sign({ sub: 'usr_bob' });
  });

  afterEach(async () => {
    await app.close();
  });

  // =====================================================================
  // GET /api/v1/users/me
  // =====================================================================

  describe('GET /api/v1/users/me', () => {
    it('returns 401 with no token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/users/me' });
      expect(res.statusCode).toBe(401);
    });

    it('returns 401 with a bad token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: { authorization: 'Bearer not-a-real-jwt' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns the full user DTO on success', async () => {
      mockPrismaState.user.findUnique.mockResolvedValue(makeUserRow());

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${aliceToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.id).toBe('usr_alice');
      expect(body.data.bio).toBe('hi');
      expect(body.data.lastActiveAt).toBe('2026-06-02T00:00:00.000Z');
    });

    it('returns 404 for unknown user (token sub has no row)', async () => {
      mockPrismaState.user.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe('USER_NOT_FOUND');
    });
  });

  // =====================================================================
  // PATCH /api/v1/users/me
  // =====================================================================

  describe('PATCH /api/v1/users/me', () => {
    it('returns 401 with no token', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me',
        payload: { nickname: 'X' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('updates fields and returns the new profile', async () => {
      mockPrismaState.user.update.mockResolvedValue(
        makeUserRow({ nickname: 'Alice2', bio: 'updated' }),
      );

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: { nickname: 'Alice2', bio: 'updated' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.nickname).toBe('Alice2');
      expect(body.data.bio).toBe('updated');
    });

    it('rejects an empty body (zod refine)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('VALIDATION_ERROR');
    });

    it('rejects a bio over 500 chars', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: { bio: 'a'.repeat(501) },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('VALIDATION_ERROR');
    });

    it('rejects a nickname over 50 chars', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: { nickname: 'a'.repeat(51) },
      });
      expect(res.statusCode).toBe(400);
    });

    it('forbids updating email/phone (strict schema)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: { email: 'a@b.c' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // =====================================================================
  // GET /api/v1/users/:id
  // =====================================================================

  describe('GET /api/v1/users/:id', () => {
    it('returns 404 for an unknown user', async () => {
      mockPrismaState.user.findUnique.mockResolvedValue(null);
      const res = await app.inject({ method: 'GET', url: '/api/v1/users/usr_ghost' });
      expect(res.statusCode).toBe(404);
    });

    it('returns public fields for an anonymous viewer (no bio)', async () => {
      mockPrismaState.user.findUnique.mockResolvedValue(makeUserRow());

      const res = await app.inject({ method: 'GET', url: '/api/v1/users/usr_alice' });
      expect(res.statusCode).toBe(200);
      const dto = res.json().data;
      expect(dto.id).toBe('usr_alice');
      expect(dto.bio).toBeUndefined();
      expect(dto.email).toBeUndefined();
    });

    it('returns public fields when viewed by another user', async () => {
      mockPrismaState.user.findUnique.mockResolvedValue(makeUserRow());

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/usr_alice',
        headers: { authorization: `Bearer ${bobToken}` },
      });
      expect(res.statusCode).toBe(200);
      const dto = res.json().data;
      expect(dto.bio).toBeUndefined();
    });

    it('returns private fields when the user views their own profile', async () => {
      mockPrismaState.user.findUnique.mockResolvedValue(makeUserRow());

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/usr_alice',
        headers: { authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(200);
      const dto = res.json().data;
      expect(dto.bio).toBe('hi');
      expect(dto.lastActiveAt).toBeDefined();
    });

    it('returns 401 for an invalid token (does not silently fall through to public)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/usr_alice',
        headers: { authorization: 'Bearer broken' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('hides banned users from strangers but lets them see themselves', async () => {
      mockPrismaState.user.findUnique.mockResolvedValue(makeUserRow({ status: 'BANNED' }));

      const stranger = await app.inject({
        method: 'GET',
        url: '/api/v1/users/usr_alice',
        headers: { authorization: `Bearer ${bobToken}` },
      });
      expect(stranger.statusCode).toBe(404);

      const self = await app.inject({
        method: 'GET',
        url: '/api/v1/users/usr_alice',
        headers: { authorization: `Bearer ${aliceToken}` },
      });
      expect(self.statusCode).toBe(200);
    });
  });

  // =====================================================================
  // GET /api/v1/users/me/activities
  // =====================================================================

  describe('GET /api/v1/users/me/activities', () => {
    it('returns 401 with no token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/users/me/activities' });
      expect(res.statusCode).toBe(401);
    });

    it('returns the paginated list of created activities', async () => {
      // listMyActivities now does an early findUnique on the requesting
      // user to enforce soft-delete (status === 'DELETED' → 404) before
      // hitting the activities tables. Mock that lookup first.
      mockPrismaState.user.findUnique.mockResolvedValueOnce(makeUserRow());
      mockPrismaState.activity.findMany.mockResolvedValue([makeActivityRow()]);
      mockPrismaState.activity.count.mockResolvedValue(1);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me/activities?type=created&page=1&pageSize=10',
        headers: { authorization: `Bearer ${aliceToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].relation).toBe('created');
      expect(body.total).toBe(1);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(10);
    });

    it('returns 400 for an unknown type', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me/activities?type=foo',
        headers: { authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // =====================================================================
  // End-to-end CRUD consistency (mock-based)
  // =====================================================================

  describe('end-to-end CRUD consistency', () => {
    it('create -> update -> read returns consistent data', async () => {
      // 1. Read /me: empty
      mockPrismaState.user.findUnique.mockResolvedValueOnce(makeUserRow({ nickname: 'Newbie' }));
      const me1 = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${aliceToken}` },
      });
      expect(me1.json().data.nickname).toBe('Newbie');

      // 2. Update /me
      mockPrismaState.user.update.mockResolvedValueOnce(
        makeUserRow({ nickname: 'Newbie2', school: 'Stanford' }),
      );
      const upd = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: { nickname: 'Newbie2', school: 'Stanford' },
      });
      expect(upd.json().data.nickname).toBe('Newbie2');
      expect(upd.json().data.school).toBe('Stanford');

      // 3. Read /users/:id (public) reflects the update
      mockPrismaState.user.findUnique.mockResolvedValueOnce(
        makeUserRow({ nickname: 'Newbie2', school: 'Stanford' }),
      );
      const pub = await app.inject({ method: 'GET', url: '/api/v1/users/usr_alice' });
      const dto = pub.json().data;
      expect(dto.nickname).toBe('Newbie2');
      expect(dto.school).toBe('Stanford');
      // bio is private and must NOT leak via the public endpoint
      expect(dto.bio).toBeUndefined();
    });
  });

  // =====================================================================
  // DELETE /api/v1/users/me  (spec endpoint #10 — soft delete)
  // =====================================================================

  describe('DELETE /api/v1/users/me', () => {
    it('returns 401 with no token', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/users/me' });
      expect(res.statusCode).toBe(401);
    });

    it('soft-deletes the requesting user and returns the recorded timestamp', async () => {
      mockPrismaState.user.findUnique.mockResolvedValueOnce(
        makeUserRow({ id: 'usr_alice', status: 'ACTIVE', deletedAt: null }),
      );
      mockPrismaState.user.update.mockResolvedValueOnce(
        makeUserRow({ id: 'usr_alice', status: 'DELETED', deletedAt: new Date() }),
      );

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${aliceToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // The route returns the SERVER's `now`, not whatever Prisma stored
      // (which we don't read back). That's deliberate so the client sees
      // exactly what the server thinks it recorded.
      expect(body.data.deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      // The same `now` must have been passed into the update call.
      const updateArgs = mockPrismaState.user.update.mock.calls[0]?.[0] as {
        where: { id: string };
        data: { status: string; deletedAt: Date };
      };
      expect(updateArgs.where.id).toBe('usr_alice');
      expect(updateArgs.data.status).toBe('DELETED');
      expect(updateArgs.data.deletedAt).toBeInstanceOf(Date);
      // Response timestamp and update payload must match exactly.
      expect(body.data.deletedAt).toBe(updateArgs.data.deletedAt.toISOString());
    });

    it('is idempotent: a second DELETE on an already-deleted user does not bump deletedAt', async () => {
      const originalDeletedAt = new Date('2026-06-01T10:00:00.000Z');
      mockPrismaState.user.findUnique.mockResolvedValueOnce(
        makeUserRow({ id: 'usr_alice', status: 'DELETED', deletedAt: originalDeletedAt }),
      );

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${aliceToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // Must return the ORIGINAL timestamp, not now().
      expect(body.data.deletedAt).toBe('2026-06-01T10:00:00.000Z');
      // Critically, the update must NOT have been called — we don't want
      // an idempotent click to bump the audit timestamp.
      expect(mockPrismaState.user.update).not.toHaveBeenCalled();
    });

    it('returns 404 when the user no longer exists', async () => {
      mockPrismaState.user.findUnique.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${aliceToken}` },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.code).toBe('USER_NOT_FOUND');
    });

    it('GET /me returns 404 right after delete (defense-in-depth)', async () => {
      // After soft-delete, the very next /me call should fail with 404.
      mockPrismaState.user.findUnique.mockResolvedValueOnce(
        makeUserRow({ status: 'DELETED' }),
      );

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${aliceToken}` },
      });

      expect(res.statusCode).toBe(404);
      // We deliberately surface USER_NOT_FOUND (not USER_DELETED) so
      // probing the endpoint doesn't reveal "you used to exist".
    });
  });
});
