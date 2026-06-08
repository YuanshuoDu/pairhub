/**
 * Activity module — CRUD + state machine + list filtering.
 *
 * Endpoints (all under /api/v1/activities):
 *   - GET    /            — list with filters (type / status / city / bbox / time)
 *                           + pagination, sorted by startTime. Redis-cached 5 min.
 *   - POST   /            — create (auth required, current user = creator)
 *   - GET    /:id        — detail (+ isJoined flag for the caller)
 *   - PATCH  /:id        — update title/description/startTime/endTime/maxParticipants/tags
 *                           (creator only; type/location/status are immutable here)
 *   - DELETE /:id        — soft delete (status → CANCELED, creator only)
 *
 * State machine:
 *   RECRUITING → FULL      (currentCount >= maxParticipants, set by signup module)
 *   RECRUITING → STARTED   (startTime reached)
 *   FULL       → STARTED
 *   STARTED    → ENDED     (endTime reached)
 *   *          → CANCELED  (creator cancels OR admin moderation)
 *
 * NOTE: M2 partial — full list filtering (city / bbox / time) lands in M2-W7
 * (issue #25 性能优化). This endpoint ships the core filters + a cursor page.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '@/lib/errors.js';
import { checkFields } from '@/lib/content-safety.js';
import { env } from '@/lib/env.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const activityTypeSchema = z.enum([
  'STUDY',
  'SPORTS',
  'BOARD_GAME',
  'ONLINE_GAME',
  'OTHER',
]);

const activityStatusSchema = z.enum([
  'RECRUITING',
  'FULL',
  'STARTED',
  'ENDED',
  'CANCELED',
]);

export const listQuerySchema = z
  .object({
    type: activityTypeSchema.optional(),
    status: activityStatusSchema.optional(),
    /** Free-text city name (matches locationName loosely). */
    city: z.string().trim().min(1).max(50).optional(),
    /** Geo "near me" filter — WGS-84 (decimal degrees, same as the stored
     *  location_lat / location_lng). All three must be present together. */
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().positive().max(200).default(5),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(
    (v) => (v.lat === undefined) === (v.lng === undefined),
    { message: 'lat 和 lng 必须同时提供', path: ['lat'] },
  );

export const createBodySchema = z
  .object({
    type: activityTypeSchema,
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(2000),
    coverUrl: z.string().url().max(500).optional(),
    location: z.object({
      name: z.string().trim().min(1).max(200),
      addr: z.string().trim().min(1).max(500),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    }),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    maxParticipants: z.number().int().min(2).max(200).default(10),
    tags: z.array(z.string().min(1).max(20)).max(10).optional(),
  })
  .strict()
  .refine((v) => new Date(v.endTime) > new Date(v.startTime), {
    message: 'endTime must be after startTime',
  });

export const idParamSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-z0-9]+$/i, 'id 格式不合法'),
});

export const patchBodySchema = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().min(1).max(2000).optional(),
    coverUrl: z.string().url().max(500).nullable().optional(),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
    maxParticipants: z.number().int().min(2).max(200).optional(),
    tags: z.array(z.string().min(1).max(20)).max(10).optional(),
  })
  .strict()
  .refine(
    (v) => v.startTime === undefined || v.endTime === undefined ||
      new Date(v.endTime) > new Date(v.startTime),
    { message: 'endTime must be after startTime' },
  )
  .refine((v) => Object.keys(v).length > 0, {
    message: '至少需要提供一个可更新字段',
  });

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

/**
 * ActivityStatus values. Kept in sync with `prisma/schema.prisma` `ActivityStatus`
 * enum. Declared explicitly because `(typeof activityStatusSchema)['_def']['values']`
 * infers to `readonly [string, ...string[]]` and loses the literal union.
 */
type Status = 'RECRUITING' | 'FULL' | 'STARTED' | 'ENDED' | 'CANCELED';

const TRANSITIONS: Record<Status, readonly Status[]> = {
  RECRUITING: ['FULL', 'STARTED', 'CANCELED'],
  FULL: ['STARTED', 'CANCELED'],
  STARTED: ['ENDED', 'CANCELED'],
  ENDED: [],
  CANCELED: [],
};

export function canTransition(from: Status, to: Status): boolean {
  return TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// Cache helpers (5-minute TTL)
// ---------------------------------------------------------------------------

const CACHE_TTL_SECONDS = 5 * 60;
const cacheKey = (query: object) =>
  `activity:list:${Buffer.from(JSON.stringify(query)).toString('base64url')}`;

async function readCache(
  redis: { get: (k: string) => Promise<string | null> },
  key: string,
): Promise<unknown | null> {
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeCache(
  redis: { set: (k: string, v: string, ...args: unknown[]) => Promise<unknown> },
  key: string,
  value: unknown,
): Promise<void> {
  await redis.set(key, JSON.stringify(value), 'EX', CACHE_TTL_SECONDS);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function registerActivityModule(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/activities — list with filters + cache
   *
   * Geo "near me" mode (issue #35): when `lat` + `lng` + `radiusKm` are
   * supplied we route through a Haversine `$queryRaw` so the database
   * does the distance math + sort + filter in one round-trip. Without
   * geo, we use the standard Prisma findMany and sort by startTime.
   */
  app.get('/api/v1/activities', async (req) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError({ issues: parsed.error.flatten() });
    }
    const q = parsed.data;

    const cached = await readCache(app.redis as never, cacheKey(q));
    if (cached) {
      return { data: cached, cached: true };
    }

    // ---- Geo "near me" branch (Haversine in SQL) ----
    if (q.lat !== undefined && q.lng !== undefined) {
      const skip = (q.page - 1) * q.pageSize;

      // WGS-84 Haversine. Earth radius = 6371 km. LEAST/GREATEST clamp
      // protects against floating-point drift near antipodal points
      // where the acos argument would otherwise be 1.00000002 → NaN.
      // The two CASTs (::float8) are required because location_lat /
      // location_lng are Decimal(10,7) in Prisma; trig functions reject
      // numeric type out of the box on PG.
      //
      // Filters type / status / city are pushed into the SQL so the
      // distance sort is correct under the filter. status='CANCELED'
      // is excluded by default (matches non-geo branch semantics).
      const typeFilter = q.type ? Prisma.sql`AND type = ${q.type}::"ActivityType"` : Prisma.empty;
      const statusFilter = q.status
        ? Prisma.sql`AND status = ${q.status}::"ActivityStatus"`
        : Prisma.sql`AND status <> 'CANCELED'::"ActivityStatus"`;
      const cityFilter = q.city
        ? Prisma.sql`AND location_name ILIKE ${'%' + q.city + '%'}`
        : Prisma.empty;

      const distanceExpr = Prisma.sql`(
        6371 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(${q.lat})) * cos(radians(location_lat::float8)) *
            cos(radians(location_lng::float8) - radians(${q.lng})) +
            sin(radians(${q.lat})) * sin(radians(location_lat::float8))
          ))
        )
      )`;

      const rows = await app.prisma.$queryRaw<Array<{ id: string; distance_km: number }>>(
        Prisma.sql`
          SELECT id, ${distanceExpr} AS distance_km
          FROM activities
          WHERE 1=1
            ${typeFilter}
            ${statusFilter}
            ${cityFilter}
            AND ${distanceExpr} <= ${q.radiusKm}
          ORDER BY distance_km ASC
          LIMIT ${q.pageSize} OFFSET ${skip}
        `,
      );

      // Fetch the full activity rows in one shot (single PK lookup) so
      // the response shape matches the non-geo branch. Maintain the
      // distance order from the raw query.
      const ids = rows.map((r) => r.id);
      const distanceMap = new Map(rows.map((r) => [r.id, r.distance_km]));
      const data = ids.length
        ? await app.prisma.activity.findMany({
            where: { id: { in: ids } },
          })
        : [];
      data.sort((a, b) => (distanceMap.get(a.id) ?? 0) - (distanceMap.get(b.id) ?? 0));

      // Total: how many activities within radius (regardless of page).
      // One more query, but cheap (uses the same where-clause + index).
      const totalRows = await app.prisma.$queryRaw<Array<{ count: bigint }>>(
        Prisma.sql`
          SELECT COUNT(*)::bigint AS count
          FROM activities
          WHERE 1=1
            ${typeFilter}
            ${statusFilter}
            ${cityFilter}
            AND ${distanceExpr} <= ${q.radiusKm}
        `,
      );
      const total = Number(totalRows[0]?.count ?? 0);

      const hasMore = skip + data.length < total;
      // Attach distance_km to each row so the client can render "1.2 km"
      // labels next to the pin. Rounded to 2 decimal places.
      const enriched = data.map((a) => ({
        ...a,
        distanceKm:
          distanceMap.get(a.id) !== undefined
            ? Math.round((distanceMap.get(a.id) as number) * 100) / 100
            : null,
      }));
      const result = {
        data: enriched,
        total,
        page: q.page,
        pageSize: q.pageSize,
        hasMore,
      };
      await writeCache(app.redis as never, cacheKey(q), result);
      return { data: result };
    }

    // ---- Standard branch (no geo) ----
    const where: Record<string, unknown> = {};
    if (q.type) where['type'] = q.type;
    if (q.status) where['status'] = q.status;
    if (q.city) where['locationName'] = { contains: q.city };
    where['status'] = where['status'] ?? { not: 'CANCELED' };

    const [data, total] = await Promise.all([
      app.prisma.activity.findMany({
        where,
        orderBy: { startTime: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      app.prisma.activity.count({ where }),
    ]);

    // `hasMore` lets the client drive "load more" without paging through
    // every item; the alternative (page * pageSize < total) requires
    // an extra round-trip or a stale total, so we pre-compute here.
    // Issue #25.
    const hasMore = q.page * q.pageSize < total;
    const result = { data, total, page: q.page, pageSize: q.pageSize, hasMore };
    await writeCache(app.redis as never, cacheKey(q), result);
    return { data: result };
  });

  /**
   * POST /api/v1/activities — create
   */
  app.post(
    '/api/v1/activities',
    {
      preHandler: [app.authenticate],
      // Per-endpoint tighter limit on top of the global 100/min/IP bucket.
      // Issue #26 — activity creation is a write path with potential for
      // spam / abuse.
      config: { rateLimit: { max: env.RATE_LIMIT_CREATE_ACTIVITY_MAX, timeWindow: '1 minute' } },
    },
    async (req) => {
    const userId = req.userId;
    if (!userId) throw new UnauthorizedError();

    const parsed = createBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError({ issues: parsed.error.flatten() });
    }
    const v = parsed.data;

    // 微信内容安全 — screen title + description before they land in DB.
    // Skipped if WECHAT_MP_APPID is empty (dev / CI). Issue #26.
    const safety = await checkFields([
      ['title', v.title],
      ['description', v.description],
    ]);
    if (!safety.pass) {
      throw new ValidationError({
        issues: [{ code: 'content_rejected', path: [safety.field], message: safety.result.reason ?? '内容未通过安全审核' }],
      });
    }

    const created = await app.prisma.activity.create({
      data: {
        creatorId: userId,
        type: v.type,
        title: v.title,
        description: v.description,
        coverUrl: v.coverUrl ?? null,
        locationName: v.location.name,
        locationAddr: v.location.addr,
        locationLat: v.location.lat,
        locationLng: v.location.lng,
        startTime: new Date(v.startTime),
        endTime: new Date(v.endTime),
        maxParticipants: v.maxParticipants,
        currentCount: 1, // creator is the first participant
        tags: v.tags ?? [],
        status: 'RECRUITING',
      },
    });

    return { data: created };
    },
  );

  /**
   * GET /api/v1/activities/:id — detail (+ isJoined for the caller)
   */
  app.get('/api/v1/activities/:id', async (req) => {
    const parsed = idParamSchema.safeParse(req.params);
    if (!parsed.success) {
      throw new ValidationError({ issues: parsed.error.flatten() });
    }

    const activity = await app.prisma.activity.findUnique({
      where: { id: parsed.data.id },
    });
    if (!activity || activity.status === 'CANCELED') {
      throw new NotFoundError('activity_not_found', '活动不存在或已取消');
    }

    // Best-effort isJoined (don't fail the request if the user is anonymous).
    let isJoined = false;
    if (req.userId) {
      const signup = await app.prisma.signup.findUnique({
        where: {
          activityId_userId: { activityId: activity.id, userId: req.userId },
        },
      });
      isJoined = !!signup && signup.status === 'APPROVED';
    }

    return { data: { ...activity, isJoined } };
  });

  /**
   * PATCH /api/v1/activities/:id — update (creator only)
   */
  app.patch(
    '/api/v1/activities/:id',
    {
      preHandler: [app.authenticate],
      // Same tighter cap as create. Issue #26.
      config: { rateLimit: { max: env.RATE_LIMIT_CREATE_ACTIVITY_MAX, timeWindow: '1 minute' } },
    },
    async (req) => {
    const userId = req.userId;
    if (!userId) throw new UnauthorizedError();

    const params = idParamSchema.safeParse(req.params);
    if (!params.success) {
      throw new ValidationError({ issues: params.error.flatten() });
    }
    const body = patchBodySchema.safeParse(req.body);
    if (!body.success) {
      throw new ValidationError({ issues: body.error.flatten() });
    }

    // Screen any user-editable text fields that are present in the patch.
    // Only check fields the caller actually sent (sparse PATCH semantics).
    const safety = await checkFields([
      ['title', body.data.title],
      ['description', body.data.description],
    ]);
    if (!safety.pass) {
      throw new ValidationError({
        issues: [{ code: 'content_rejected', path: [safety.field], message: safety.result.reason ?? '内容未通过安全审核' }],
      });
    }

    const existing = await app.prisma.activity.findUnique({
      where: { id: params.data.id },
    });
    if (!existing) {
      throw new NotFoundError('activity_not_found', '活动不存在');
    }
    if (existing.creatorId !== userId) {
      throw new ForbiddenError('只有创建者可以修改活动');
    }
    if (existing.status === 'CANCELED') {
      throw new ForbiddenError('已取消的活动不能再修改');
    }

    const updated = await app.prisma.activity.update({
      where: { id: params.data.id },
      data: {
        ...(body.data.title !== undefined ? { title: body.data.title } : {}),
        ...(body.data.description !== undefined
          ? { description: body.data.description }
          : {}),
        ...(body.data.coverUrl !== undefined
          ? { coverUrl: body.data.coverUrl }
          : {}),
        ...(body.data.startTime !== undefined
          ? { startTime: new Date(body.data.startTime) }
          : {}),
        ...(body.data.endTime !== undefined
          ? { endTime: new Date(body.data.endTime) }
          : {}),
        ...(body.data.maxParticipants !== undefined
          ? { maxParticipants: body.data.maxParticipants }
          : {}),
        ...(body.data.tags !== undefined ? { tags: body.data.tags } : {}),
      },
    });

    return { data: updated };
    },
  );

  /**
   * DELETE /api/v1/activities/:id — soft delete (creator only)
   */
  app.delete('/api/v1/activities/:id', { preHandler: [app.authenticate] }, async (req) => {
    const userId = req.userId;
    if (!userId) throw new UnauthorizedError();

    const params = idParamSchema.safeParse(req.params);
    if (!params.success) {
      throw new ValidationError({ issues: params.error.flatten() });
    }

    const existing = await app.prisma.activity.findUnique({
      where: { id: params.data.id },
    });
    if (!existing) {
      throw new NotFoundError('activity_not_found', '活动不存在');
    }
    if (existing.creatorId !== userId) {
      throw new ForbiddenError('只有创建者可以取消活动');
    }
    if (existing.status === 'CANCELED') {
      // Idempotent.
      return { data: { id: existing.id, status: 'CANCELED' } };
    }
    if (!canTransition(existing.status as Status, 'CANCELED')) {
      throw new ForbiddenError(`当前状态 ${existing.status} 不可取消`);
    }

    const updated = await app.prisma.activity.update({
      where: { id: params.data.id },
      data: { status: 'CANCELED' },
    });

    return { data: { id: updated.id, status: updated.status } };
  });
}
