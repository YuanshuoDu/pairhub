/**
 * Review module — business logic.
 *
 * Encapsulates all DB access for reviews. Routes are thin shells that
 * parse input, call the service, and serialize output.
 *
 * Spec: docs/api/v1.md (review endpoints, M2)
 * Issue: #24 — review API: 双向评分
 */
import type { PrismaClient, Review } from '@prisma/client';

import { AppError, ConflictError, ForbiddenError, NotFoundError } from '@/lib/errors.js';
import type { CreateReviewInput, ReviewListQuery } from './review.schema.js';

// =====================================================================
// Types
// =====================================================================

export interface ReviewSerialized {
  id: string;
  activityId: string;
  from: { id: string; nickname: string; avatar: string | null };
  toUserId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface ReviewListResult {
  data: ReviewSerialized[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    has_more: boolean;
  };
}

// =====================================================================
// createReview
// =====================================================================

/**
 * Create a review from `fromUserId` to `toUserId` for `activityId`.
 *
 * Pre-conditions (all enforced here, not in the route):
 *   1. Activity exists and is in ENDED || REVIEWABLE status
 *   2. fromUserId is a participant (creator OR approved signup)
 *   3. toUserId is a participant
 *   4. toUserId !== fromUserId (no self-review)
 *   5. No existing review for (activity, from, to)
 *
 * Errors map to RFC 7807 codes (see docs/api/v1.md §4):
 *   - 400 SELF_REVIEW
 *   - 403 FORBIDDEN (not a participant, either side)
 *   - 404 ACTIVITY_NOT_FOUND
 *   - 409 ACTIVITY_NOT_REVIEWABLE (status != ENDED/REVIEWABLE)
 *   - 409 REVIEW_ALREADY_EXISTS
 *
 * Returns the serialized review including the fromUser relation so the
 * route can return the same shape as the read endpoint.
 */
export async function createReview(
  prisma: PrismaClient,
  activityId: string,
  fromUserId: string,
  input: CreateReviewInput,
): Promise<ReviewSerialized> {
  const { toUserId, rating, comment } = input;

  // Self-review guard — HTTP 400, code SELF_REVIEW.
  if (toUserId === fromUserId) {
    throw new AppError(400, 'SELF_REVIEW', '不能给自己评价', { toUserId });
  }

  return prisma.$transaction(async (tx) => {
    // 1. Activity must exist and be ENDED || REVIEWABLE
    const activity = await tx.activity.findUnique({
      where: { id: activityId },
      select: { id: true, creatorId: true, status: true },
    });
    if (!activity) {
      throw new NotFoundError('ACTIVITY_NOT_FOUND', '活动不存在');
    }
    if (activity.status !== 'ENDED' && activity.status !== 'REVIEWABLE') {
      throw new ConflictError('ACTIVITY_NOT_REVIEWABLE', '活动未结束，暂不能评价');
    }

    // 2. Both parties must be participants.
    // A participant is the activity creator OR an APPROVED signup.
    const isFromCreator = activity.creatorId === fromUserId;
    const fromSignup = isFromCreator
      ? null
      : await tx.signup.findUnique({
          where: { activityId_userId: { activityId, userId: fromUserId } },
          select: { status: true },
        });
    const fromIsParticipant = isFromCreator || fromSignup?.status === 'APPROVED';
    if (!fromIsParticipant) {
      throw new ForbiddenError('你不是该活动的参与者，不能评价');
    }

    const isToCreator = activity.creatorId === toUserId;
    const toSignup = isToCreator
      ? null
      : await tx.signup.findUnique({
          where: { activityId_userId: { activityId, userId: toUserId } },
          select: { status: true },
        });
    const toIsParticipant = isToCreator || toSignup?.status === 'APPROVED';
    if (!toIsParticipant) {
      throw new ForbiddenError('被评价者不是该活动的参与者');
    }

    // 3. Unique guard — DB unique constraint is the source of truth, but
    // we surface a friendly error early to keep the response stable.
    const existing = await tx.review.findUnique({
      where: {
        activityId_fromUserId_toUserId: { activityId, fromUserId, toUserId },
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictError('REVIEW_ALREADY_EXISTS', '你已评价过该用户');
    }

    // 4. Insert
    const created = await tx.review.create({
      data: {
        activityId,
        fromUserId,
        toUserId,
        rating,
        comment: comment ?? null,
      },
    });

    // 5. Hydrate the fromUser for the response (we know it's the
    // authenticated user; one cheap lookup).
    const fromUser = await tx.user.findUniqueOrThrow({
      where: { id: fromUserId },
      select: { id: true, nickname: true, avatar: true },
    });

    return {
      id: created.id,
      activityId: created.activityId,
      from: fromUser,
      toUserId: created.toUserId,
      rating: created.rating,
      comment: created.comment,
      createdAt: created.createdAt.toISOString(),
    };
  });
}

// =====================================================================
// listUserReviews
// =====================================================================

/**
 * Public read of reviews received by `userId`, newest first.
 *
 * The fromUser is exposed as { id, nickname, avatar } only — no phone,
 * no openid, no email (the User model has none of the latter two, but
 * we intentionally select a narrow shape for privacy).
 */
export async function listUserReviews(
  prisma: PrismaClient,
  userId: string,
  query: ReviewListQuery,
): Promise<ReviewListResult> {
  const { page, pageSize } = query;
  const skip = (page - 1) * pageSize;

  // Verify user exists — surface a 404 rather than a confusing empty list
  // when the client passes a typo'd id.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) {
    throw new NotFoundError('USER_NOT_FOUND', '用户不存在');
  }

  const where = { toUserId: userId };

  const [items, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      // Note: `fromUser` is intentionally not joined here. The `Review` model
      // stores fromUserId/toUserId as bare FK strings (no `@relation`) so
      // users can be anonymized/hard-deleted without cascading review
      // removal. Reviewer display info is joined below via a single
      // batched `findMany({ id: { in: [...] }})`.
    }),
    prisma.review.count({ where }),
  ]);

  // Batched reviewer lookup (1 query for the whole page, not N+1).
  const reviewerIds = Array.from(new Set(items.map((r) => r.fromUserId)));
  const reviewers = reviewerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: reviewerIds } },
        select: { id: true, nickname: true, avatar: true },
      })
    : [];
  const reviewerMap = new Map(reviewers.map((u) => [u.id, u]));

  return {
    data: items.map((r) => serializeReview(r, reviewerMap.get(r.fromUserId))),
    pagination: {
      page,
      page_size: pageSize,
      total,
      has_more: skip + items.length < total,
    },
  };
}

// =====================================================================
// Helpers
// =====================================================================

type ReviewerSnapshot = { id: string; nickname: string; avatar: string | null };

/**
 * Render a `Review` row for the public profile endpoint. The reviewer
 * (fromUser) is passed in separately because the `Review` model stores
 * `fromUserId` as a bare FK (no `@relation`); the caller is responsible
 * for the user lookup. If the reviewer has been anonymized / hard-deleted,
 * the snapshot will be `null` and we render an "已注销" placeholder.
 */
export function serializeReview(
  r: Review,
  fromUser: ReviewerSnapshot | undefined,
): ReviewSerialized {
  return {
    id: r.id,
    activityId: r.activityId,
    from: fromUser
      ? { id: fromUser.id, nickname: fromUser.nickname, avatar: fromUser.avatar }
      : { id: r.fromUserId, nickname: '已注销', avatar: null },
    toUserId: r.toUserId,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
  };
}
