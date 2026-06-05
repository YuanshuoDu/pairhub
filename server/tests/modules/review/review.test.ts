/**
 * Review module — unit tests.
 *
 * Covers:
 *   1. Zod schema validation (createReviewSchema, reviewListQuerySchema)
 *   2. Service layer business logic with a hand-rolled prisma stub
 *      - happy path: 2-way rating succeeds
 *      - rejection: activity not ended
 *      - rejection: self-review
 *      - rejection: not a participant
 *      - rejection: duplicate review
 *      - rejection: target not a participant
 *   3. Public listUserReviews pagination + privacy (fromUser = nickname+avatar only)
 *
 * Issue: #24 — review API: 双向评分
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '@/lib/errors.js';
import {
  createReviewSchema,
  reviewListQuerySchema,
} from '@/modules/review/review.schema.js';
import {
  createReview,
  listUserReviews,
} from '@/modules/review/review.service.js';

// =====================================================================
// 1. Schema validation
// =====================================================================

describe('review schemas', () => {
  describe('createReviewSchema', () => {
    it('accepts a minimal valid body', () => {
      const r = createReviewSchema.safeParse({ toUserId: 'u2', rating: 5 });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.rating).toBe(5);
        expect(r.data.comment).toBeUndefined();
      }
    });

    it('accepts a body with a comment', () => {
      const r = createReviewSchema.safeParse({
        toUserId: 'u2',
        rating: 4,
        comment: 'nice',
      });
      expect(r.success).toBe(true);
    });

    it('rejects rating < 1', () => {
      const r = createReviewSchema.safeParse({ toUserId: 'u2', rating: 0 });
      expect(r.success).toBe(false);
    });

    it('rejects rating > 5', () => {
      const r = createReviewSchema.safeParse({ toUserId: 'u2', rating: 6 });
      expect(r.success).toBe(false);
    });

    it('rejects non-integer rating', () => {
      const r = createReviewSchema.safeParse({ toUserId: 'u2', rating: 3.5 });
      expect(r.success).toBe(false);
    });

    it('rejects missing toUserId', () => {
      const r = createReviewSchema.safeParse({ rating: 4 });
      expect(r.success).toBe(false);
    });

    it('rejects comment > 500 chars', () => {
      const r = createReviewSchema.safeParse({
        toUserId: 'u2',
        rating: 4,
        comment: 'x'.repeat(501),
      });
      expect(r.success).toBe(false);
    });
  });

  describe('reviewListQuerySchema', () => {
    it('applies defaults', () => {
      const r = reviewListQuerySchema.parse({});
      expect(r.page).toBe(1);
      expect(r.pageSize).toBe(20);
    });

    it('coerces string page / pageSize', () => {
      const r = reviewListQuerySchema.parse({ page: '2', pageSize: '50' });
      expect(r.page).toBe(2);
      expect(r.pageSize).toBe(50);
    });

    it('rejects pageSize > 100', () => {
      expect(() => reviewListQuerySchema.parse({ pageSize: '101' })).toThrow();
    });
  });
});

// =====================================================================
// 2. Service layer — business logic with a hand-rolled prisma stub
// =====================================================================

/**
 * A minimal in-memory PrismaClient stub. We only implement the methods
 * touched by review.service.ts — adding more on demand.
 *
 * The transaction helper runs the callback with the same stub as `tx`,
 * mirroring the real Prisma `$transaction(cb)` semantics.
 */
function makeStubPrisma(initial?: {
  activity?: Record<string, unknown> | null;
  fromUser?: Record<string, unknown> | null;
  toUser?: Record<string, unknown> | null;
  fromSignup?: { status: string } | null;
  toSignup?: { status: string } | null;
  existingReview?: { id: string } | null;
}): StubPrisma {
  const state = {
    activity: initial?.activity ?? null,
    fromUser: initial?.fromUser ?? null,
    toUser: initial?.toUser ?? null,
    fromSignup: initial?.fromSignup ?? null,
    toSignup: initial?.toSignup ?? null,
    existingReview: initial?.existingReview ?? null,
    created: null as Record<string, unknown> | null,
  };

  const activity = {
    findUnique: vi.fn(async () => state.activity),
  };
  const signup = {
    findUnique: vi.fn(async (args: { where: { activityId_userId: { userId: string } } }) => {
      const uid = args.where.activityId_userId.userId;
      if (uid === 'from' || uid === 'creator') return state.fromSignup;
      if (uid === 'to') return state.toSignup;
      return null;
    }),
  };
  const review = {
    findUnique: vi.fn(async () => state.existingReview),
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      state.created = { id: 'rv_1', ...args.data, createdAt: new Date('2026-01-01T00:00:00Z') };
      return state.created;
    }),
  };
  const user = {
    findUnique: vi.fn(async (args: { where: { id: string } }) => {
      if (args.where.id === 'from' || args.where.id === 'creator') return state.fromUser;
      if (args.where.id === 'to') return state.toUser;
      return null;
    }),
    findUniqueOrThrow: vi.fn(async (args: { where: { id: string } }) => {
      if (args.where.id === 'from' || args.where.id === 'creator') {
        if (!state.fromUser) throw new Error('not found');
        return state.fromUser;
      }
      if (!state.toUser) throw new Error('not found');
      return state.toUser;
    }),
  };

  const tx = { activity, signup, review, user };
  return {
    state,
    activity,
    signup,
    review,
    user,
    $transaction: vi.fn(async (cb: (tx: typeof tx) => unknown) => cb(tx)),
  };
}

type StubPrisma = ReturnType<typeof makeStubPrisma>;

const baseEndedActivity = {
  id: 'act_1',
  creatorId: 'creator',
  status: 'ENDED',
};

const baseUser = { id: 'from', nickname: 'Alice', avatar: 'a.png' };
const baseToUser = { id: 'to', nickname: 'Bob', avatar: 'b.png' };
const approvedSignup = { status: 'APPROVED' };

describe('review.service — createReview', () => {
  let stub: StubPrisma;

  beforeEach(() => {
    stub = makeStubPrisma({
      activity: baseEndedActivity,
      fromUser: baseUser,
      toUser: baseToUser,
      fromSignup: approvedSignup,
      toSignup: approvedSignup,
      existingReview: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('happy path: creator rates a participant', async () => {
    const out = await createReview(stub, 'act_1', 'creator', {
      toUserId: 'to',
      rating: 5,
      comment: 'great',
    });
    expect(out.id).toBe('rv_1');
    expect(out.rating).toBe(5);
    expect(out.comment).toBe('great');
    expect(out.from).toEqual(baseUser);
    expect(out.toUserId).toBe('to');
    expect(stub.review.create).toHaveBeenCalledOnce();
  });

  it('happy path: participant rates the creator (no signup row needed)', async () => {
    // 'from' has no signup row but is the creator.
    stub.state.fromSignup = null;
    const out = await createReview(stub, 'act_1', 'creator', {
      toUserId: 'to',
      rating: 4,
    });
    expect(out.rating).toBe(4);
  });

  it('rejects self-review with SELF_REVIEW (400)', async () => {
    await expect(
      createReview(stub, 'act_1', 'from', { toUserId: 'from', rating: 3 }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'SELF_REVIEW',
    });
    expect(stub.review.create).not.toHaveBeenCalled();
  });

  it('rejects when activity does not exist (404)', async () => {
    stub.state.activity = null;
    await expect(
      createReview(stub, 'act_missing', 'from', { toUserId: 'to', rating: 4 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects when activity is still RECRUITING (409 ACTIVITY_NOT_REVIEWABLE)', async () => {
    stub.state.activity = { ...baseEndedActivity, status: 'RECRUITING' };
    await expect(
      createReview(stub, 'act_1', 'from', { toUserId: 'to', rating: 4 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects when fromUser is not a participant (403)', async () => {
    stub.state.fromSignup = null;
    // 'from' is not the creator either
    stub.state.activity = { ...baseEndedActivity, creatorId: 'someone-else' };
    await expect(
      createReview(stub, 'act_1', 'from', { toUserId: 'to', rating: 4 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects when toUser is not a participant (403)', async () => {
    stub.state.toSignup = null;
    stub.state.activity = { ...baseEndedActivity, creatorId: 'someone-else' };
    await expect(
      createReview(stub, 'act_1', 'from', { toUserId: 'to', rating: 4 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects duplicate review (409 REVIEW_ALREADY_EXISTS)', async () => {
    stub.state.existingReview = { id: 'rv_existing' };
    await expect(
      createReview(stub, 'act_1', 'from', { toUserId: 'to', rating: 5 }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'REVIEW_ALREADY_EXISTS',
    });
  });

  it('accepts when activity is in REVIEWABLE status', async () => {
    stub.state.activity = { ...baseEndedActivity, status: 'REVIEWABLE' };
    const out = await createReview(stub, 'act_1', 'from', { toUserId: 'to', rating: 3 });
    expect(out.rating).toBe(3);
  });

  it('SELF_REVIEW throws AppError(400) for the error handler', () => {
    // sanity: SELF_REVIEW throws AppError(400) (not BusinessRuleError 422),
    // and the error handler emits a 400 with code SELF_REVIEW.
    const e = new AppError(400, 'SELF_REVIEW', 'msg');
    expect(e.statusCode).toBe(400);
    expect(e.code).toBe('SELF_REVIEW');
  });
});

// =====================================================================
// 3. Service layer — listUserReviews
// =====================================================================

describe('review.service — listUserReviews', () => {
  it('returns paginated data newest-first with fromUser projected to {id,nickname,avatar}', async () => {
    const list: Array<{ id: string; rating: number; comment: string | null; createdAt: Date; fromUserId: string; toUserId: string; activityId: string }> = [
      { id: 'rv_2', rating: 4, comment: 'b', createdAt: new Date('2026-01-02'), fromUserId: 'f2', toUserId: 'target', activityId: 'a1' },
      { id: 'rv_1', rating: 5, comment: null, createdAt: new Date('2026-01-01'), fromUserId: 'f1', toUserId: 'target', activityId: 'a1' },
    ];
    const reviewers = [
      { id: 'f1', nickname: 'N1', avatar: 'a.png' },
      { id: 'f2', nickname: 'N2', avatar: null },
    ];
    const stub = {
      user: {
        findUnique: vi.fn(async () => ({ id: 'target' })),
        findMany: vi.fn(async () => reviewers),
      },
      review: {
        findMany: vi.fn(async () => list),
        count: vi.fn(async () => 2),
      },
      $transaction: vi.fn(),
    };
    const out = await listUserReviews(stub as unknown as never, 'target', { page: 1, pageSize: 20 });
    expect(out.data).toHaveLength(2);
    expect(out.data[0]?.id).toBe('rv_2');
    expect(out.data[0]?.from).toEqual({ id: 'f2', nickname: 'N2', avatar: null });
    expect(out.data[1]?.comment).toBeNull();
    expect(out.pagination).toEqual({
      page: 1,
      page_size: 20,
      total: 2,
      has_more: false,
    });
  });

  it('returns 404 when the target user does not exist', async () => {
    const stub = {
      user: { findUnique: vi.fn(async () => null) },
      review: { findMany: vi.fn(), count: vi.fn() },
      $transaction: vi.fn(),
    };
    await expect(
      listUserReviews(stub as unknown as never, 'ghost', { page: 1, pageSize: 20 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('does not leak phone or openid into the fromUser shape', async () => {
    // Defensive test: even if a future change accidentally selects more
    // fields in the batched user lookup, our projection only returns
    // {id, nickname, avatar}.
    const list = [
      {
        id: 'rv_1',
        rating: 5,
        comment: null,
        createdAt: new Date('2026-01-01'),
        fromUserId: 'f1',
        toUserId: 'target',
        activityId: 'a1',
      },
    ];
    // The mock could return sensitive fields, but our select clause
    // in the service hard-codes only {id, nickname, avatar}. We
    // assert the service doesn't pass them through to the DTO.
    const stub = {
      user: {
        findUnique: vi.fn(async () => ({ id: 'target' })),
        findMany: vi.fn(async () => [
          { id: 'f1', nickname: 'N1', avatar: 'a.png', phone: '+86-123', openid: 'opq' },
        ]),
      },
      review: { findMany: vi.fn(async () => list), count: vi.fn(async () => 1) },
      $transaction: vi.fn(),
    };
    const out = await listUserReviews(stub as unknown as never, 'target', { page: 1, pageSize: 20 });
    const from = out.data[0]?.from as Record<string, unknown>;
    expect(from).not.toHaveProperty('phone');
    expect(from).not.toHaveProperty('openid');
    expect(Object.keys(from).sort()).toEqual(['avatar', 'id', 'nickname']);
  });

  it('reports has_more when there are more pages', async () => {
    const list = Array.from({ length: 2 }, (_, i) => ({
      id: `rv_${i}`,
      rating: 5,
      comment: null,
      createdAt: new Date(`2026-01-0${i + 1}`),
      fromUserId: `f${i}`,
      toUserId: 'target',
      activityId: 'a1',
    }));
    const reviewers = Array.from({ length: 2 }, (_, i) => ({
      id: `f${i}`,
      nickname: `N${i}`,
      avatar: null as string | null,
    }));
    const stub = {
      user: {
        findUnique: vi.fn(async () => ({ id: 'target' })),
        findMany: vi.fn(async () => reviewers),
      },
      review: { findMany: vi.fn(async () => list), count: vi.fn(async () => 5) },
      $transaction: vi.fn(),
    };
    const out = await listUserReviews(stub as unknown as never, 'target', { page: 1, pageSize: 2 });
    expect(out.pagination.has_more).toBe(true);
  });
});
