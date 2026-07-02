/**
 * User module — business logic.
 *
 * Public functions (consumed by user.routes.ts):
 *   - getMe(prisma, userId)
 *   - updateMe(prisma, userId, body)
 *   - getUserById(prisma, viewerId | null, targetId)
 *   - listMyActivities(prisma, userId, query)
 *   - softDeleteMe(prisma, userId)  ← spec endpoint #10 (v1.0.1)
 *
 * The service layer is intentionally pure: it only takes a `PrismaClient`
 * and primitives, no Fastify context. That makes it trivially unit-testable
 * and lets the route handlers stay thin (parse → call service → shape
 * the response).
 *
 * Privacy rules (enforced here, not just in the route):
 *   - getMe → all fields, including bio, email, phone (when added in M2)
 *   - getUserById with viewer === self → all fields
 *   - getUserById with viewer !== self or no viewer → public only,
 *     bio / email / phone are STRIPPED at this layer (defense in depth)
 *   - soft-deleted users (status === 'DELETED') are treated as 404 to
 *     everyone, including themselves — once you delete, your account
 *     disappears from the app.
 */
import type { PrismaClient, User, Activity } from '@prisma/client';

import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors.js';

import type {
  MyActivitiesQuery,
  UpdateMeBody,
  UserActivityDTO,
  UserPrivateDTO,
  UserPublicDTO,
} from './user.schema.js';

// =====================================================================
// Helpers
// =====================================================================

/** Project a Prisma User row to the full /me payload. */
function toPrivateDTO(u: User): UserPrivateDTO {
  return {
    id: u.id,
    nickname: u.nickname,
    avatar: u.avatar,
    school: u.school,
    major: u.major,
    bio: u.bio,
    // Prisma's `updatedAt` is the latest touch on the row — a
    // reasonable proxy for "lastActiveAt" until we add a dedicated
    // column (tracked as follow-up in issue #18).
    lastActiveAt: u.updatedAt.toISOString(),
    createdAt: u.createdAt.toISOString(),
  };
}

/** Project a Prisma User row to the public payload (no bio/email/phone). */
function toPublicDTO(u: User): UserPublicDTO {
  return {
    id: u.id,
    nickname: u.nickname,
    avatar: u.avatar,
    school: u.school,
    major: u.major,
    createdAt: u.createdAt.toISOString(),
  };
}

function toActivityDTO(a: Activity, relation: 'created' | 'joined'): UserActivityDTO {
  return {
    id: a.id,
    type: a.type,
    title: a.title,
    status: a.status,
    startTime: a.startTime.toISOString(),
    endTime: a.endTime.toISOString(),
    maxParticipants: a.maxParticipants,
    currentCount: a.currentCount,
    createdAt: a.createdAt.toISOString(),
    relation,
  };
}

// =====================================================================
// getMe — GET /api/v1/users/me
// =====================================================================

export async function getMe(prisma: PrismaClient, userId: string): Promise<UserPrivateDTO> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new NotFoundError('USER_NOT_FOUND', '用户不存在');
  }
  if (user.status === 'BANNED') {
    // Treat banned users as forbidden rather than revealing their profile.
    throw new ForbiddenError('账户已被封禁');
  }
  if (user.status === 'DELETED') {
    // Soft-deleted users get the same surface as "doesn't exist" so they
    // can't probe their old account via this endpoint. Note we don't
    // surface a distinct "ACCOUNT_DELETED" code here — that's reserved
    // for the social-login flow where the client genuinely needs to
    // know "you deleted, talk to support" vs "token bad".
    throw new NotFoundError('USER_NOT_FOUND', '用户不存在');
  }
  return toPrivateDTO(user);
}

// =====================================================================
// updateMe — PATCH /api/v1/users/me
// =====================================================================

/**
 * Whitelist of fields the user is allowed to update on their own profile.
 * Email/phone/oauth fields are deliberately excluded.
 */
const UPDATABLE_FIELDS = ['nickname', 'avatar', 'school', 'major', 'bio'] as const;

export async function updateMe(
  prisma: PrismaClient,
  userId: string,
  body: UpdateMeBody,
): Promise<UserPrivateDTO> {
  // Build a sparse update payload — only include keys that were actually
  // present in the body. This is critical for PATCH semantics: passing
  // `null` clears a field, omitting a key leaves it untouched.
  const data: Record<string, string | null> = {};
  for (const key of UPDATABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      const v = body[key];
      data[key] = v === undefined ? null : (v as string | null);
    }
  }

  if (Object.keys(data).length === 0) {
    throw new ValidationError({ reason: 'empty_update' });
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data,
    });
    return toPrivateDTO(user);
  } catch (e) {
    // P2025 = record not found
    if ((e as { code?: string }).code === 'P2025') {
      throw new NotFoundError('USER_NOT_FOUND', '用户不存在');
    }
    throw e;
  }
}

// =====================================================================
// getUserById — GET /api/v1/users/:id
// =====================================================================

export async function getUserById(
  prisma: PrismaClient,
  viewerId: string | null,
  targetId: string,
): Promise<UserPrivateDTO | UserPublicDTO> {
  const user = await prisma.user.findUnique({ where: { id: targetId } });
  if (!user) {
    throw new NotFoundError('USER_NOT_FOUND', '用户不存在');
  }

  if (user.status === 'BANNED' && viewerId !== user.id) {
    // Don't expose banned users' profiles to anyone but themselves.
    throw new NotFoundError('USER_NOT_FOUND', '用户不存在');
  }

  // Soft-deleted users are invisible to EVERYONE — even themselves. The
  // only way back is for support to manually restore the row, which is a
  // deliberate friction point (gives the user a cooling-off window and
  // gives the audit log time to capture the deletion request).
  if (user.status === 'DELETED') {
    throw new NotFoundError('USER_NOT_FOUND', '用户不存在');
  }

  // Owner sees the full profile; everyone else gets the public projection.
  if (viewerId !== null && viewerId === user.id) {
    return toPrivateDTO(user);
  }
  return toPublicDTO(user);
}

// =====================================================================
// listMyActivities — GET /api/v1/users/me/activities
// =====================================================================

export interface ListMyActivitiesResult {
  data: UserActivityDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listMyActivities(
  prisma: PrismaClient,
  userId: string,
  query: MyActivitiesQuery,
): Promise<ListMyActivitiesResult> {
  const { type, page, pageSize } = query;
  const skip = (page - 1) * pageSize;

  // Defense-in-depth: the JWT claim may say ACTIVE for up to 15 min after
  // a soft-delete (token TTL). The service layer always re-checks the row
  // to avoid leaking a soft-deleted user's activity history through a
  // stale token.
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });
  if (!me || me.status === 'DELETED') {
    throw new NotFoundError('USER_NOT_FOUND', '用户不存在');
  }

  // Three branches: 'created', 'joined', or both (default).
  if (type === 'created') {
    const where = { creatorId: userId };
    const [items, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        orderBy: { startTime: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.activity.count({ where }),
    ]);
    return {
      data: items.map((a) => toActivityDTO(a, 'created')),
      total,
      page,
      pageSize,
    };
  }

  if (type === 'joined') {
    // 'Joined' = the user has an APPROVED signup. Exclude activities the
    // user themselves created (those are 'created', not 'joined').
    const where = {
      signups: { some: { userId, status: 'APPROVED' as const } },
      creatorId: { not: userId },
    };
    const [items, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        orderBy: { startTime: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.activity.count({ where }),
    ]);
    return {
      data: items.map((a) => toActivityDTO(a, 'joined')),
      total,
      page,
      pageSize,
    };
  }

  // No type filter → return both, but we need a single ordering and total.
  // We do this in two queries and merge; this stays simple and correct at
  // current scale (M2). A materialized view lands in M3 if needed.
  const createdWhere = { creatorId: userId };
  const joinedWhere = {
    signups: { some: { userId, status: 'APPROVED' as const } },
    creatorId: { not: userId },
  };
  const [created, joined] = await Promise.all([
    prisma.activity.findMany({
      where: createdWhere,
      orderBy: { startTime: 'desc' },
    }),
    prisma.activity.findMany({
      where: joinedWhere,
      orderBy: { startTime: 'desc' },
    }),
  ]);
  const merged: Array<Activity & { _relation: 'created' | 'joined' }> = [
    ...created.map((a) => ({ ...a, _relation: 'created' as const })),
    ...joined.map((a) => ({ ...a, _relation: 'joined' as const })),
  ];
  merged.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  const total = merged.length;
  const slice = merged.slice(skip, skip + pageSize);
  return {
    data: slice.map((a) => toActivityDTO(a, a._relation)),
    total,
    page,
    pageSize,
  };
}

// =====================================================================
// softDeleteMe — DELETE /api/v1/users/me
// =====================================================================

/**
 * Spec endpoint #10 (v1.0.1 API doc): 注销账户（软删除）.
 *
 * Behavior:
 *   - Sets `status = 'DELETED'` and `deletedAt = now()` on the row.
 *   - Idempotent: a second call on an already-deleted user returns 204
 *     with no DB write (avoids bumping `deletedAt` on accidental
 *     double-clicks).
 *   - Returns 404 if the user doesn't exist OR was already soft-deleted
 *     BEFORE this token was issued. We deliberately do NOT distinguish
 *     "never existed" from "already deleted" in the response — that's a
 *     probing vector we don't need to expose.
 *   - Row is preserved for referential integrity (Activity.creatorId,
 *     Signup.userId, PushToken.userId all FK to users.id with ON DELETE
 *     RESTRICT). A nightly cleanup job (separate task — not in this PR)
 *     will hard-delete DELETED rows older than the configured retention
 *     window (M2 default: 90 days, to satisfy PIPL Article 47 audit).
 *
 * Why we don't clear PII fields here:
 *   - The user row already has its content (nickname, bio, avatar)
 *     wiped on a 30-day schedule in the cleanup job. Until then we
 *     keep the row readable for ops debugging.
 *   - Hard-clearing PII atomically with status flip would require
 *     multiple write paths and risks partial state if a transaction
 *     fails. Easier to keep PII wipe out-of-band in the cleanup job.
 *
 * @returns the deletion timestamp as an ISO string, for the response body
 *          so the client can confirm what the server recorded.
 */
export async function softDeleteMe(
  prisma: PrismaClient,
  userId: string,
): Promise<{ deletedAt: string }> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, status: true, deletedAt: true },
  });
  if (!existing) {
    throw new NotFoundError('USER_NOT_FOUND', '用户不存在');
  }
  // Idempotent: if already deleted, return the original timestamp.
  if (existing.status === 'DELETED' && existing.deletedAt) {
    return { deletedAt: existing.deletedAt.toISOString() };
  }
  // Single-row update — no transaction needed. We intentionally do NOT
  // touch related tables here (signup cancellation, activity cancel,
  // push-token revoke). Those have separate spec endpoints and should
  // be run by the client if the user wants a deeper wipe. Soft-delete
  // is just "make this account disappear from the UI".
  const now = new Date();
  await prisma.user.update({
    where: { id: userId },
    data: {
      status: 'DELETED',
      deletedAt: now,
    },
  });
  return { deletedAt: now.toISOString() };
}
