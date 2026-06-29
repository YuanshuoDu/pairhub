/**
 * Auth module — HTTP integration tests.
 *
 * v1.0.1 spec endpoints: #2 (social-login), #5 (refresh), and the
 * auxiliary POST /api/v1/auth/logout. The auth module was previously
 * UNCOVERED — no route integration tests. (The JWT helpers
 * `signAccessToken` / `signRefreshToken` / `verifyRefreshToken` have
 * their own pure-unit suite in `auth.helpers.test.ts`.)
 *
 * What we mock:
 *   - `@/lib/prisma.js` — fake `prisma.user.*` methods.
 *   - `@/lib/redis.js` — stub `set` / `get` / `del` so the refresh-token
 *     store can be exercised (with an in-memory Map).
 *   - `@fastify/rate-limit` — no-op so we don't try to talk to real Redis.
 *
 * How redis state is bridged:
 *   The mock factory stashes its fake-redis object AND the underlying
 *   closure-backed Map on globalThis. Tests that need to drive redis
 *   state (refresh, logout) mutate the Map directly and assert via
 *   `vi.fn` mock.calls. We DON'T depend on `vi.fn().mockImplementation`
 *   closures (which proved fragile across `vi.resetAllMocks` in
 *   beforeEach — see the `store` / `mock.calls` discrepancy that
 *   earlier surfaced during this work).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type * as FastifyPlugin from 'fastify-plugin';
import type * as PrismaModule from '@/lib/prisma.js';
import type * as RedisModule from '@/lib/redis.js';

import { signRefreshToken } from '@/modules/auth/index.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPrismaState = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
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
  // Build the store and redis client OUTSIDE the mock factory closure
  // so the mockImpl we re-apply in beforeEach can find them via a
  // module-level reference (closed over once at module load time).
  const store = new Map<string, string>();
  const fakeRedis: Record<string, unknown> = {
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    ping: vi.fn().mockResolvedValue('PONG'),
    defineCommand: vi.fn(),
    quit: vi.fn().mockResolvedValue('OK'),
    disconnect: vi.fn(),
    on: vi.fn(),
    duplicate: vi.fn(),
  };
  // Initial impl setup so the FIRST import of @/lib/redis.js works
  // without waiting for beforeEach (buildApp registers routes that
  // may indirectly touch redis at registration time).
  (fakeRedis['set'] as ReturnType<typeof vi.fn>).mockImplementation(
    async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    },
  );
  (fakeRedis['get'] as ReturnType<typeof vi.fn>).mockImplementation(
    async (k: string) => store.get(k) ?? null,
  );
  (fakeRedis['del'] as ReturnType<typeof vi.fn>).mockImplementation(
    async (k: string) => {
      store.delete(k);
    },
  );
  // Stash for beforeEach re-apply and for tests to read mock.calls.
  (globalThis as Record<string, unknown>).__authFakeRedis = fakeRedis;
  (globalThis as Record<string, unknown>).__authFakeRedisStore = store;
  (globalThis as Record<string, unknown>).__authFakeRedisImpls = {
    set: async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    },
    get: async (k: string) => store.get(k) ?? null,
    del: async (k: string) => {
      store.delete(k);
    },
  };
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
const ALICE = 'alice';

function makeUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ALICE,
    openid: 'wechat:abcdef1234567890abcdef1234567890ab',
    unionid: null,
    nickname: 'Alice',
    avatar: 'https://cdn.example.com/a.png',
    school: 'MIT',
    major: 'CS',
    grade: null,
    wechatId: 'abcdef1234567890abcdef1234567890ab',
    phone: '+8613800001111',
    bio: null,
    status: 'ACTIVE',
    role: 'USER',
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

/** Pull the redis mock + backing store out of the globalThis stash. */
function fakeRedisPair(): {
  mock: { get: { mock: { calls: unknown[][] } }; set: { mock: { calls: unknown[][] } }; del: { mock: { calls: unknown[][] } } };
  store: Map<string, string>;
} {
  const mock = (globalThis as Record<string, unknown>).__authFakeRedis as unknown as {
    get: { mock: { calls: unknown[][] } };
    set: { mock: { calls: unknown[][] } };
    del: { mock: { calls: unknown[][] } };
  };
  const store = (globalThis as Record<string, unknown>).__authFakeRedisStore as Map<
    string,
    string
  >;
  return { mock, store };
}

// ---------------------------------------------------------------------------
// Suite — HTTP routes
// ---------------------------------------------------------------------------

describe('auth module — HTTP integration', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['JWT_SECRET'] = SECRET;
    process.env['DATABASE_URL'] = 'postgresql://x:y@localhost:5432/x';
    process.env['REDIS_URL'] = 'redis://localhost:6379';

    vi.resetModules();
    vi.resetAllMocks();

    // The redis mock factory created vi.fn() shells but the inline
    // implementations are wiped by vi.resetAllMocks() above. Re-apply
    // them so redis.set / get / del still route through the closure-
    // backed Map. We use a stashed impl pack on globalThis rather than
    // re-reading the closure — the closure over `store` works for the
    // very first call after `vi.resetAllMocks` (the implementation runs
    // with whatever `store` was bound at mock-factory run time) but the
    // impl-store chain proved fragile across multiple `vi.resetModules`
    // rounds in earlier debugging. The pinned impl pack below resolves
    // it definitively: the impl captures the CURRENT factory's `store`
    // Map object, which is the same Map we test against.
    const fakeRedis = (globalThis as Record<string, unknown>).__authFakeRedis as
      | Record<string, ReturnType<typeof vi.fn>>
      | undefined;
    const impls = (globalThis as Record<string, unknown>).__authFakeRedisImpls as
      | { set: (k: string, v: string) => Promise<unknown>; get: (k: string) => Promise<unknown>; del: (k: string) => Promise<unknown> }
      | undefined;
    if (fakeRedis && impls) {
      fakeRedis['set']?.mockImplementation(impls.set);
      fakeRedis['get']?.mockImplementation(impls.get);
      fakeRedis['del']?.mockImplementation(impls.del);
    }

    const mod = await import('@/lib/app.js');
    app = await mod.buildApp({ silent: true });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // =====================================================================
  // POST /api/v1/auth/social-login
  // =====================================================================

  describe('POST /api/v1/auth/social-login', () => {
    it('returns 400 when provider is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/social-login',
        payload: { token: 'fake' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when phone does not match the E.164-ish pattern', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/social-login',
        payload: { provider: 'wechat', token: 't', phone: 'abc-not-a-phone' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('happy path: new user is created and tokens are issued', async () => {
      mockPrismaState.user.findUnique.mockResolvedValueOnce(null);
      mockPrismaState.user.create.mockResolvedValueOnce(makeUserRow());

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/social-login',
        payload: { provider: 'wechat', token: 'fresh-wx-code' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json().data;
      expect(body.accessToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
      expect(body.refreshToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
      expect(body.user.id).toBe(ALICE);

      // The route must have called create with the composite openid
      // (`wechat:<sha256-prefix>`), phone=null (no phone in body), and
      // the nickname hard-coded to '留学生' when none is supplied. We
      // don't assert `status` here because Prisma applies the
      // `@default(UserStatus.ACTIVE)` server-side; the mock layer just
      // receives whatever the route passes.
      const createArgs = mockPrismaState.user.create.mock.calls[0]?.[0] as {
        data: { openid: string; phone: string | null; nickname: string };
      };
      expect(createArgs.data.openid).toMatch(/^wechat:/);
      expect(createArgs.data.phone).toBeNull();
      expect(createArgs.data.nickname).toBe('留学生');
    });

    it('happy path: existing user (matched by openid) is reused — no INSERT', async () => {
      mockPrismaState.user.findUnique.mockResolvedValueOnce(makeUserRow());

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/social-login',
        payload: { provider: 'wechat', token: 'returning-user' },
      });

      expect(res.statusCode).toBe(200);
      expect(mockPrismaState.user.create).not.toHaveBeenCalled();
    });

    it('phone-unlock path: matches an existing user by phone instead of openid', async () => {
      mockPrismaState.user.findUnique.mockResolvedValueOnce(makeUserRow());

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/social-login',
        payload: {
          provider: 'wechat',
          token: 'different-wx-code-after-reinstall',
          phone: '+8613800001111',
        },
      });

      expect(res.statusCode).toBe(200);
      const findArgs = mockPrismaState.user.findUnique.mock.calls[0]?.[0] as {
        where: { phone?: string; openid?: string };
      };
      expect(findArgs.where.phone).toBe('+8613800001111');
      expect(findArgs.where.openid).toBeUndefined();
      expect(mockPrismaState.user.create).not.toHaveBeenCalled();
    });

    it('returns 410 ACCOUNT_DELETED when the existing user is soft-deleted', async () => {
      mockPrismaState.user.findUnique.mockResolvedValueOnce(
        makeUserRow({ status: 'DELETED', deletedAt: new Date() }),
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/social-login',
        payload: { provider: 'wechat', token: 'returning-deleted-user' },
      });

      expect(res.statusCode).toBe(410);
      expect(res.json().code).toBe('ACCOUNT_DELETED');
      expect(mockPrismaState.user.create).not.toHaveBeenCalled();
    });
  });

  // =====================================================================
  // POST /api/v1/auth/refresh
  // =====================================================================

  describe('POST /api/v1/auth/refresh', () => {
    it('returns 400 when refreshToken is missing from the body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 401 when the refresh_token signature is invalid', async () => {
      // 18-char string clears the zod min(10) so we reach the verify path.
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: 'this-is-not-a-jwt' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 401 when the jti is not in Redis (revoked or never existed)', async () => {
      const token = signRefreshToken(ALICE, 'jti-not-in-redis');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: token },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('UNAUTHORIZED');
    });

    it('happy path: rotates jti, issues new tokens, and persists the new jti in Redis', async () => {
      const oldJti = 'old-jti-rotate-1';
      const token = signRefreshToken(ALICE, oldJti);

      // Pre-seed the OLD jti directly on the underlying Map so that
      // consumeRefreshToken's `get` returns 'alice' for it. We avoid
      // going through the vi.fn() mock — its mockImplementation was
      // getting wiped by vi.resetAllMocks and we want a clean assertion
      // path for this test.
      const { mock, store } = fakeRedisPair();
      store.set(`auth:refresh:${oldJti}`, ALICE);

      // The route calls prisma.user.findUnique to pick up live role/status.
      mockPrismaState.user.findUnique.mockResolvedValueOnce(
        makeUserRow({ id: ALICE, role: 'ADMIN', status: 'ACTIVE' }),
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: token },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json().data;
      expect(body.accessToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
      expect(body.refreshToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);

      // Must have called redis.del on the old jti (consumeRefreshToken).
      const delCalls = mock.del.mock.calls;
      expect(delCalls.some((c) => c[0] === `auth:refresh:${oldJti}`)).toBe(true);

      // Must have called redis.set on SOME auth:refresh:* key with ALICE
      // as the value (storeRefreshToken after rotation). We can't
      // predict the exact jti because crypto.randomUUID() isn't stable
      // across the MockImpl boundary; asserting on a key prefix + value
      // gives us deterministic coverage without coupling to UUID math.
      const setCalls = mock.set.mock.calls;
      const refreshSet = setCalls.find(
        (c) =>
          (c[0] as string).startsWith('auth:refresh:') && c[1] === ALICE,
      );
      expect(refreshSet).toBeDefined();
    });

    it('returns 410 ACCOUNT_DELETED when the refreshed user is soft-deleted', async () => {
      const jti = 'jti-deleted-user';
      const token = signRefreshToken(ALICE, jti);

      const { store } = fakeRedisPair();
      store.set(`auth:refresh:${jti}`, ALICE);

      mockPrismaState.user.findUnique.mockResolvedValueOnce(
        makeUserRow({ id: ALICE, status: 'DELETED' }),
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: token },
      });

      expect(res.statusCode).toBe(410);
      expect(res.json().code).toBe('ACCOUNT_DELETED');
    });
  });

  // =====================================================================
  // POST /api/v1/auth/logout
  // =====================================================================

  describe('POST /api/v1/auth/logout', () => {
    it('returns 400 when refreshToken is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 200 even with a garbage refreshToken (idempotent)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        payload: { refreshToken: 'not.a.valid.jwt' },
      });
      // The logout route treats malformed tokens as already-logged-out.
      expect(res.statusCode).toBe(200);
      expect(res.json().data.ok).toBe(true);
    });

    it('happy path: consumes the jti so it can no longer mint new access tokens', async () => {
      const jti = 'jti-being-logged-out';
      const token = signRefreshToken(ALICE, jti);

      const { store } = fakeRedisPair();
      store.set(`auth:refresh:${jti}`, ALICE);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        payload: { refreshToken: token },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.ok).toBe(true);
      // The jti is gone from the store — a follow-up refresh with this
      // same token would now return 401 UNAUTHORIZED.
      expect(store.get(`auth:refresh:${jti}`)).toBeUndefined();
    });
  });
});
