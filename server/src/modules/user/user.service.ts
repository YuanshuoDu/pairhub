/**
 * User module — business logic.
 *
 * Public functions (consumed by user.routes.ts):
 *   - getMe(prisma, userId)
 *   - updateMe(prisma, userId, body)
 *   - getUserById(prisma, viewerId | null, targetId)
 *   - listMyActivities(prisma, userId, query)
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
