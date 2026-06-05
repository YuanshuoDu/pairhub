import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Prisma, type Activity } from '@prisma/client';

// =====================================================================
// Schemas
// =====================================================================

const activityTypeEnum = z.enum(['STUDY', 'SPORTS', 'BOARD_GAME', 'ONLINE_GAME', 'OTHER']);

const createActivitySchema = z.object({
  type: activityTypeEnum,
  title: z.string().min(5).max(100),
  description: z.string().min(10).max(2000),
  coverUrl: z.string().url().optional(),
  locationName: z.string().min(1).max(100),
  locationAddr: z.string().min(1).max(200),
  locationLat: z.number().min(-90).max(90),
  locationLng: z.number().min(-180).max(180),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  maxParticipants: z.number().int().min(2).max(100),
  tags: z.array(z.string().min(1).max(20)).max(10).default([]),
});

const listQuerySchema = z.object({
  type: activityTypeEnum.optional(),
  status: z.enum(['RECRUITING', 'FULL', 'STARTED', 'ENDED']).optional(),
  startAfter: z.string().datetime().optional(),
  startBefore: z.string().datetime().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(0.1).max(50).optional(),
  keyword: z.string().min(1).max(50).optional(),
  tags: z.string().optional(), // csv
  sort: z.enum(['start_time_asc', 'created_desc', 'distance_asc']).default('start_time_asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// =====================================================================
// Auth helper
// =====================================================================

async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<string> {
  try {
    await req.jwtVerify();
    return (req.user as { sub: string }).sub;
  } catch {
    throw reply.code(401).send({
      type: 'https://pairhub.example.com/errors/auth',
      title: 'Unauthorized',
      status: 401,
      code: 'UNAUTHORIZED',
      detail: '请先登录',
    });
  }
}

// =====================================================================
// Routes
// =====================================================================

export async function registerActivityRoutes(app: FastifyInstance): Promise<void> {
  // ---------- GET /api/activities ----------
  app.get('/api/activities', async (req, reply) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() });
    }
    const q = parsed.data;

    const where: Prisma.ActivityWhereInput = {
      status: { in: ['RECRUITING', 'FULL', 'STARTED'] },
      contentCheck: 'PASS',
    };
    if (q.type) where.type = q.type;
    if (q.status) where.status = q.status;
    if (q.startAfter || q.startBefore) {
      where.startTime = {};
      if (q.startAfter) (where.startTime as Record<string, Date>).gte = new Date(q.startAfter);
      if (q.startBefore) (where.startTime as Record<string, Date>).lte = new Date(q.startBefore);
    }
    if (q.keyword) {
      where.OR = [
        { title: { contains: q.keyword, mode: 'insensitive' } },
        { description: { contains: q.keyword, mode: 'insensitive' } },
      ];
    }
    if (q.tags) {
      const tagList = q.tags.split(',').map((t) => t.trim()).filter(Boolean);
      if (tagList.length > 0) where.tags = { hasSome: tagList };
    }

    let orderBy: Prisma.ActivityOrderByWithRelationInput = { startTime: 'asc' };
    if (q.sort === 'created_desc') orderBy = { createdAt: 'desc' };
    // distance_asc would require raw SQL; defer to M2

    const skip = (q.page - 1) * q.pageSize;

    const [items, total] = await Promise.all([
      app.prisma.activity.findMany({
        where,
        orderBy,
        skip,
        take: q.pageSize,
        include: {
          creator: { select: { id: true, nickname: true, avatar: true, school: true, bio: true } },
          _count: { select: { signups: { where: { status: 'APPROVED' } } } },
        },
      }),
      app.prisma.activity.count({ where }),
    ]);

    return {
      data: items.map(serializeActivity),
      pagination: {
        page: q.page,
        page_size: q.pageSize,
        total,
        has_more: skip + items.length < total,
      },
    };
  });

  // ---------- POST /api/activities ----------
  app.post('/api/activities', async (req, reply) => {
    const userId = await requireAuth(req, reply);
    const parsed = createActivitySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() });
    }
    const data = parsed.data;

    if (new Date(data.endTime) <= new Date(data.startTime)) {
      return reply.code(422).send({
        code: 'BUSINESS_RULE_VIOLATION',
        detail: '结束时间必须晚于开始时间',
      });
    }

    const activity = await app.prisma.activity.create({
      data: {
        creatorId: userId,
        type: data.type,
        title: data.title,
        description: data.description,
        coverUrl: data.coverUrl,
        locationName: data.locationName,
        locationAddr: data.locationAddr,
        locationLat: new Prisma.Decimal(data.locationLat),
        locationLng: new Prisma.Decimal(data.locationLng),
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        maxParticipants: data.maxParticipants,
        tags: data.tags,
        currentCount: 1, // creator counts
        signups: {
          create: { userId, status: 'APPROVED' },
        },
      },
    });

    return reply.code(201).send({ data: serializeActivity(activity) });
  });

  // ---------- GET /api/activities/:id ----------
  app.get<{ Params: { id: string } }>('/api/activities/:id', async (req, reply) => {
    const activity = await app.prisma.activity.findUnique({
      where: { id: req.params.id },
      include: {
        creator: { select: { id: true, nickname: true, avatar: true, school: true, bio: true } },
        signups: {
          where: { status: 'APPROVED' },
          take: 5,
          include: { user: { select: { id: true, nickname: true, avatar: true } } },
          orderBy: { signedAt: 'asc' },
        },
      },
    });

    if (!activity) {
      return reply.code(404).send({ code: 'ACTIVITY_NOT_FOUND', detail: '活动不存在' });
    }

    return { data: serializeActivityDetail(activity) };
  });

  // ---------- POST /api/activities/:id/signup ----------
  app.post<{ Params: { id: string } }>('/api/activities/:id/signup', async (req, reply) => {
    const userId = await requireAuth(req, reply);

    const result = await app.prisma.$transaction(async (tx) => {
      const activity = await tx.activity.findUnique({ where: { id: req.params.id } });
      if (!activity) {
        throw new HttpError(404, 'ACTIVITY_NOT_FOUND', '活动不存在');
      }
      if (activity.status !== 'RECRUITING') {
        throw new HttpError(422, 'NOT_RECRUITING', '当前活动不在招募中');
      }
      if (activity.startTime <= new Date()) {
        throw new HttpError(422, 'ALREADY_STARTED', '活动已开始，不能报名');
      }
      if (activity.currentCount >= activity.maxParticipants) {
        throw new HttpError(409, 'FULL', '活动已满员');
      }
      const existing = await tx.signup.findUnique({
        where: { activityId_userId: { activityId: activity.id, userId } },
      });
      if (existing && existing.status === 'APPROVED') {
        throw new HttpError(409, 'ALREADY_SIGNED_UP', '你已经报名了');
      }

      const signup = existing
        ? await tx.signup.update({
            where: { id: existing.id },
            data: { status: 'APPROVED', signedAt: new Date(), canceledAt: null },
          })
        : await tx.signup.create({
            data: { activityId: activity.id, userId, status: 'APPROVED' },
          });

      const updated = await tx.activity.update({
        where: { id: activity.id },
        data: { currentCount: { increment: 1 } },
      });

      if (updated.currentCount >= updated.maxParticipants) {
        await tx.activity.update({
          where: { id: updated.id },
          data: { status: 'FULL' },
        });
      }

      return signup;
    });

    return reply.code(201).send({ data: { signupId: result.id, status: result.status } });
  });

  // ---------- DELETE /api/activities/:id/signup ----------
  app.delete<{ Params: { id: string } }>('/api/activities/:id/signup', async (req, reply) => {
    const userId = await requireAuth(req, reply);

    const result = await app.prisma.$transaction(async (tx) => {
      const signup = await tx.signup.findUnique({
        where: { activityId_userId: { activityId: req.params.id, userId } },
      });
      if (!signup || signup.status !== 'APPROVED') {
        throw new HttpError(404, 'SIGNUP_NOT_FOUND', '未找到有效报名记录');
      }
      const activity = await tx.activity.findUnique({ where: { id: req.params.id } });
      if (!activity) throw new HttpError(404, 'ACTIVITY_NOT_FOUND', '活动不存在');
      if (activity.startTime <= new Date()) {
        throw new HttpError(422, 'ALREADY_STARTED', '活动已开始，不能取消');
      }

      await tx.signup.update({
        where: { id: signup.id },
        data: { status: 'CANCELED', canceledAt: new Date() },
      });

      const updated = await tx.activity.update({
        where: { id: activity.id },
        data: { currentCount: { decrement: 1 } },
      });

      if (updated.status === 'FULL' && updated.currentCount < updated.maxParticipants) {
        await tx.activity.update({
          where: { id: updated.id },
          data: { status: 'RECRUITING' },
        });
      }

      return { ok: true };
    });

    return { data: result };
  });
}

// =====================================================================
// Helpers
// =====================================================================

class HttpError extends Error {
  constructor(public statusCode: number, public code: string, message: string) {
    super(message);
  }
}

type ActivityWithRelations = Activity & {
  creator: { id: string; nickname: string; avatar: string | null; school: string | null; bio: string | null };
  _count?: { signups: number };
  signups?: Array<{ user: { id: string; nickname: string; avatar: string | null } }>;
};

function serializeActivity(a: ActivityWithRelations) {
  return {
    id: a.id,
    creator: a.creator,
    type: a.type,
    title: a.title,
    description: a.description,
    cover_url: a.coverUrl,
    location: {
      name: a.locationName,
      addr: a.locationAddr,
      lat: Number(a.locationLat),
      lng: Number(a.locationLng),
    },
    start_time: a.startTime.toISOString(),
    end_time: a.endTime.toISOString(),
    max_participants: a.maxParticipants,
    current_count: a._count?.signups ?? a.currentCount,
    tags: a.tags,
    status: a.status,
    created_at: a.createdAt.toISOString(),
  };
}

function serializeActivityDetail(a: ActivityWithRelations) {
  return {
    ...serializeActivity(a),
    participants_preview: (a.signups ?? []).map((s) => s.user),
  };
}
