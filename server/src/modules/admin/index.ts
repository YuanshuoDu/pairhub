/**
 * Admin module — operator-only endpoints for the M3 launch (issue #32).
 *
 * Endpoints (all under /api/v1/admin, all gated by `adminOnly`):
 *   - GET    /activities              — review queue + filter
 *   - POST   /activities/:id/approve  — PENDING_REVIEW → RECRUITING
 *   - POST   /activities/:id/reject   — PENDING_REVIEW → REJECTED + reason
 *   - GET    /users                   — search by nickname / phone / id
 *   - PATCH  /users/:id/status        — ban / unban
 *   - GET    /dashboard/metrics       — at-a-glance counts for the launch
 *
 * Authorization is layered: the route first runs `app.authenticate` to
 * decode the JWT and populate `req.userId / req.userRole`, then runs
 * `app.adminOnly` to 403 anyone whose role isn't ADMIN. Both hooks are
 * declared in src/lib/fastify.d.ts and wired in src/plugins/auth.ts.
 *
 * The frontend (miniprogram + Flutter admin pages) lands in a follow-up
 * PR; this PR ships the server + tests + operator runbook.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const adminActivityStatusSchema = z.enum([
  'PENDING_REVIEW',
  'RECRUITING',
  'FULL',
  'STARTED',
  'ENDED',
  'CANCELED',
  'REJECTED',
]);

export const adminListActivitiesQuerySchema = z
  .object({
    status: adminActivityStatusSchema.default('PENDING_REVIEW'),
    type: z.enum(['STUDY', 'SPORTS', 'BOARD_GAME', 'ONLINE_GAME', 'OTHER']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

const adminIdParamSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, 'id 格式不合法'),
});

export const adminRejectBodySchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

export const adminUserStatusPatchSchema = z
  .object({
    status: z.enum(['ACTIVE', 'BANNED']),
    /** Optional note recorded in the audit log (M3 W11). */
    note: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const adminListUsersQuerySchema = z
  .object({
    /** Substring match against nickname OR phone. */
    search: z.string().trim().min(1).max(50).optional(),
    status: z.enum(['ACTIVE', 'BANNED']).optional(),
    role: z.enum(['USER', 'ADMIN']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function registerAdminModule(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/admin/activities?status=PENDING_REVIEW
   *
   * The review queue. Default is `PENDING_REVIEW` because that's the
   * only state the operator needs to clear; other states are reachable
   * by passing `?status=…` explicitly.
   */
  app.get(
    '/api/v1/admin/activities',
    { preHandler: [app.authenticate, app.adminOnly] },
    async (req) => {
      const q = adminListActivitiesQuerySchema.safeParse(req.query);
      if (!q.success) {
        throw new ValidationError({ issues: q.error.flatten() });
      }
      const { status, type, page, pageSize } = q.data;
      const where: Record<string, unknown> = { status };
      if (type) where['type'] = type;
      const [items, total] = await Promise.all([
        app.prisma.activity.findMany({
          where,
          orderBy: { createdAt: 'asc' }, // FIFO: oldest pending first
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            creator: {
              select: { id: true, nickname: true, avatar: true, school: true },
            },
          },
        }),
        app.prisma.activity.count({ where }),
      ]);
      return {
        data: items.map((a) => ({
          id: a.id,
          type: a.type,
          title: a.title,
          description: a.description,
          coverUrl: a.coverUrl,
          location: {
            name: a.locationName,
            addr: a.locationAddr,
            lat: Number(a.locationLat),
            lng: Number(a.locationLng),
          },
          startTime: a.startTime.toISOString(),
          endTime: a.endTime.toISOString(),
          maxParticipants: a.maxParticipants,
          currentCount: a.currentCount,
          tags: a.tags,
          status: a.status,
          moderationNote: a.moderationNote,
          creator: a.creator,
          createdAt: a.createdAt.toISOString(),
        })),
        page: { page, pageSize, total, hasMore: page * pageSize < total },
      };
    },
  );

  /**
   * POST /api/v1/admin/activities/:id/approve
   *
   * Transition: PENDING_REVIEW → RECRUITING. Operator can approve an
   * activity that's already RECRUITING (idempotent — returns the row).
   * Anything in ENDED / CANCELED / REJECTED returns 409.
   */
  app.post(
    '/api/v1/admin/activities/:id/approve',
    { preHandler: [app.authenticate, app.adminOnly] },
    async (req) => {
      const params = adminIdParamSchema.safeParse(req.params);
      if (!params.success) {
        throw new ValidationError({ issues: params.error.flatten() });
      }
      const existing = await app.prisma.activity.findUnique({
        where: { id: params.data.id },
      });
      if (!existing || existing.status === 'CANCELED' || existing.status === 'REJECTED') {
        throw new NotFoundError('activity_not_found', '活动不存在或已下线');
      }
      if (existing.status === 'ENDED' || existing.status === 'STARTED') {
        throw new ConflictError('ACTIVITY_STATE_LOCKED', '活动已开始或已结束，不能审核');
      }
      const updated =
        existing.status === 'RECRUITING'
          ? existing
          : await app.prisma.activity.update({
              where: { id: existing.id },
              data: { status: 'RECRUITING', moderationNote: null },
            });
      return {
        data: {
          id: updated.id,
          status: updated.status,
          moderationNote: updated.moderationNote,
        },
      };
    },
  );

  /**
   * POST /api/v1/admin/activities/:id/reject
   *
   * Transition: PENDING_REVIEW → REJECTED. Body: `{ reason }` (1-500
   * chars). The reason is stored in `Activity.moderationNote` and
   * surfaced to the creator's "my activities" view in a follow-up
   * client PR.
   */
  app.post(
    '/api/v1/admin/activities/:id/reject',
    { preHandler: [app.authenticate, app.adminOnly] },
    async (req) => {
      const params = adminIdParamSchema.safeParse(req.params);
      if (!params.success) {
        throw new ValidationError({ issues: params.error.flatten() });
      }
      const body = adminRejectBodySchema.safeParse(req.body);
      if (!body.success) {
        throw new ValidationError({ issues: body.error.flatten() });
      }
      const existing = await app.prisma.activity.findUnique({
        where: { id: params.data.id },
      });
      if (!existing) {
        throw new NotFoundError('activity_not_found', '活动不存在');
      }
      if (existing.status === 'STARTED' || existing.status === 'ENDED') {
        throw new ConflictError('ACTIVITY_STATE_LOCKED', '活动已开始或已结束，不能驳回');
      }
      if (existing.status === 'REJECTED') {
        // Idempotent — return current state.
        return {
          data: {
            id: existing.id,
            status: existing.status,
            moderationNote: existing.moderationNote,
          },
        };
      }
      const updated = await app.prisma.activity.update({
        where: { id: existing.id },
        data: { status: 'REJECTED', moderationNote: body.data.reason },
      });
      // Invalidate the default list cache so creators see the status
      // change immediately on the next list fetch.
      await invalidateActivityListCache(app);
      return {
        data: {
          id: updated.id,
          status: updated.status,
          moderationNote: updated.moderationNote,
        },
      };
    },
  );

  /**
   * GET /api/v1/admin/users?search=&status=&role=
   *
   * Search by nickname / phone substring, optionally filter by status
   * or role. No "show me everything" — the operator must always pass
   * at least one filter so the query stays cheap.
   */
  app.get(
    '/api/v1/admin/users',
    { preHandler: [app.authenticate, app.adminOnly] },
    async (req) => {
      const q = adminListUsersQuerySchema.safeParse(req.query);
      if (!q.success) {
        throw new ValidationError({ issues: q.error.flatten() });
      }
      const { search, status, role, page, pageSize } = q.data;
      if (!search && !status && !role) {
        throw new ValidationError({
          message: '至少需要提供 search / status / role 之一',
        });
      }
      const where: Record<string, unknown> = {};
      if (status) where['status'] = status;
      if (role) where['role'] = role;
      if (search) {
        // OR across nickname + phone. Prisma's `OR` + `mode: 'insensitive'`
        // is PG-only; we use the underlying `contains` (case-sensitive on
        // the C locale) which is fine for ASCII / CJK — the operator
        // can paste an exact match anyway.
        where['OR'] = [
          { nickname: { contains: search } },
          { phone: { contains: search } },
          { id: { contains: search } },
        ];
      }
      const [items, total] = await Promise.all([
        app.prisma.user.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            nickname: true,
            avatar: true,
            school: true,
            phone: true,
            status: true,
            role: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        app.prisma.user.count({ where }),
      ]);
      return {
        data: items.map((u) => ({
          ...u,
          createdAt: u.createdAt.toISOString(),
          updatedAt: u.updatedAt.toISOString(),
        })),
        page: { page, pageSize, total, hasMore: page * pageSize < total },
      };
    },
  );

  /**
   * PATCH /api/v1/admin/users/:id/status
   *
   * Body: `{ status: 'ACTIVE' | 'BANNED', note?: string }`.
   * Setting `BANNED` blocks the user from creating activities /
   * signups in subsequent requests; existing access tokens remain
   * valid for up to 15 minutes (the access-token TTL).
   */
  app.patch(
    '/api/v1/admin/users/:id/status',
    { preHandler: [app.authenticate, app.adminOnly] },
    async (req) => {
      const params = adminIdParamSchema.safeParse(req.params);
      if (!params.success) {
        throw new ValidationError({ issues: params.error.flatten() });
      }
      const body = adminUserStatusPatchSchema.safeParse(req.body);
      if (!body.success) {
        throw new ValidationError({ issues: body.error.flatten() });
      }
      // Don't let an admin ban themselves.
      if (params.data.id === req.userId && body.data.status === 'BANNED') {
        throw new ConflictError('SELF_BAN', '不能封禁自己');
      }
      const existing = await app.prisma.user.findUnique({
        where: { id: params.data.id },
      });
      if (!existing) {
        throw new NotFoundError('user_not_found', '用户不存在');
      }
      const updated = await app.prisma.user.update({
        where: { id: params.data.id },
        data: { status: body.data.status },
        select: { id: true, status: true, role: true },
      });
      return {
        data: updated,
        meta: body.data.note ? { note: body.data.note } : undefined,
      };
    },
  );

  /**
   * GET /api/v1/admin/dashboard/metrics
   *
   * Cheap at-a-glance counts for the launch dashboard. All counts
   * are point-in-time; we don't expose trends yet (M3 W12 will add
   * Grafana + a time-series view of the same numbers).
   */
  app.get(
    '/api/v1/admin/dashboard/metrics',
    { preHandler: [app.authenticate, app.adminOnly] },
    async () => {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const [
        usersTotal,
        usersBanned,
        usersNewToday,
        usersNewThisWeek,
        activitiesTotal,
        activitiesPending,
        activitiesRecruiting,
        signupsTotal,
        signupsToday,
        pushTokensTotal,
      ] = await Promise.all([
        app.prisma.user.count(),
        app.prisma.user.count({ where: { status: 'BANNED' } }),
        app.prisma.user.count({ where: { createdAt: { gte: since24h } } }),
        app.prisma.user.count({ where: { createdAt: { gte: since7d } } }),
        app.prisma.activity.count(),
        app.prisma.activity.count({ where: { status: 'PENDING_REVIEW' } }),
        app.prisma.activity.count({ where: { status: 'RECRUITING' } }),
        app.prisma.signup.count(),
        app.prisma.signup.count({ where: { signedAt: { gte: since24h } } }),
        app.prisma.pushToken.count(),
      ]);

      return {
        data: {
          users: {
            total: usersTotal,
            banned: usersBanned,
            newToday: usersNewToday,
            newThisWeek: usersNewThisWeek,
          },
          activities: {
            total: activitiesTotal,
            pending: activitiesPending,
            recruiting: activitiesRecruiting,
          },
          signups: {
            total: signupsTotal,
            today: signupsToday,
          },
          pushTokens: { total: pushTokensTotal },
          generatedAt: new Date().toISOString(),
        },
      };
    },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Best-effort cache invalidation for the default activity list. Mirrors
 * the invalidation done by the activity module on create / update /
 * delete. We swallow errors because a stale list is a much smaller
 * problem than a 500 on a moderator's action.
 */
async function invalidateActivityListCache(app: FastifyInstance): Promise<void> {
  try {
    const redis = app.redis as { scan: (k: string, ...args: unknown[]) => Promise<[string, string[]]>; del: (...args: unknown[]) => Promise<unknown> };
    const pattern = 'activity:list:*';
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = next;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  } catch {
    // noop — see comment above
  }
}
