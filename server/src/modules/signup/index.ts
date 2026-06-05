/**
 * Signup module — register / cancel / participants list.
 *
 * Endpoints (all under /api/v1):
 *   - POST   /activities/:id/signup     — register (auth required)
 *   - DELETE /activities/:id/signup     — cancel registration (auth required)
 *   - GET    /activities/:id/participants — list participants
 *
 * Concurrency:
 *   Registration uses a Prisma transaction that:
 *     1. Re-checks activity status + capacity inside the transaction.
 *     2. Creates the Signup row.
 *     3. Increments Activity.currentCount.
 *     4. If currentCount now >= maxParticipants, sets status = FULL.
 *   The (activityId, userId) unique constraint on Signup is the hard
 *   guarantee against double-booking; any race that slips past step 1
 *   is caught by Prisma at step 2.
 *
 * Cancellation reverses the effect: decrement currentCount and
 * (if status was FULL) reset to RECRUITING.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/errors.js';

const idParamSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-z0-9]+$/i, 'id 格式不合法'),
});

const participantsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export async function registerSignupModule(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/v1/activities/:id/signup
   */
  app.post(
    '/api/v1/activities/:id/signup',
    { preHandler: [app.authenticate] },
    async (req) => {
      const userId = req.userId;
      if (!userId) throw new UnauthorizedError();
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        throw new ValidationError({ issues: params.error.flatten() });
      }
      const activityId = params.data.id;

      // Wrap the whole thing in a transaction so the capacity check,
      // signup insert, and currentCount bump are atomic.
      const result = await app.prisma.$transaction(async (tx) => {
        const activity = await tx.activity.findUnique({
          where: { id: activityId },
        });
        if (!activity) {
          throw new NotFoundError('activity_not_found', '活动不存在');
        }
        if (activity.status === 'CANCELED' || activity.status === 'ENDED') {
          throw new ConflictError('activity_not_recruiting', `活动已 ${activity.status}，无法报名`);
        }
        if (activity.status === 'STARTED') {
          throw new ConflictError('activity_started', '活动已开始，无法报名');
        }
        if (activity.creatorId === userId) {
          throw new ConflictError('creator_self_signup', '创建者无需报名');
        }
        if (activity.currentCount >= activity.maxParticipants) {
          throw new ConflictError('activity_full', '活动已满');
        }

        // create will throw P2002 on duplicate; the unique index makes
        // double-booking a hard error.
        const signup = await tx.signup.create({
          data: { activityId, userId, status: 'APPROVED' },
        });

        const newCount = activity.currentCount + 1;
        const shouldBeFull = newCount >= activity.maxParticipants;
        await tx.activity.update({
          where: { id: activityId },
          data: {
            currentCount: newCount,
            ...(shouldBeFull ? { status: 'FULL' } : {}),
          },
        });

        return { signup, newCount, isFull: shouldBeFull };
      });

      return { data: result };
    },
  );

  /**
   * DELETE /api/v1/activities/:id/signup
   */
  app.delete(
    '/api/v1/activities/:id/signup',
    { preHandler: [app.authenticate] },
    async (req) => {
      const userId = req.userId;
      if (!userId) throw new UnauthorizedError();
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) {
        throw new ValidationError({ issues: params.error.flatten() });
      }
      const activityId = params.data.id;

      const result = await app.prisma.$transaction(async (tx) => {
        const signup = await tx.signup.findUnique({
          where: { activityId_userId: { activityId, userId } },
        });
        if (!signup) {
          throw new NotFoundError('signup_not_found', '报名记录不存在');
        }
        const activity = await tx.activity.findUnique({ where: { id: activityId } });
        if (!activity) {
          throw new NotFoundError('activity_not_found', '活动不存在');
        }
        if (activity.status === 'STARTED' || activity.status === 'ENDED') {
          throw new ForbiddenError('活动已开始 / 结束，不能退出');
        }

        await tx.signup.update({
          where: { id: signup.id },
          data: { status: 'CANCELED', canceledAt: new Date() },
        });

        const newCount = Math.max(0, activity.currentCount - 1);
        const shouldReopen =
          activity.status === 'FULL' && newCount < activity.maxParticipants;
        await tx.activity.update({
          where: { id: activityId },
          data: {
            currentCount: newCount,
            ...(shouldReopen ? { status: 'RECRUITING' } : {}),
          },
        });

        return { signupId: signup.id, newCount, reopened: shouldReopen };
      });

      return { data: result };
    },
  );

  /**
   * GET /api/v1/activities/:id/participants
   */
  app.get('/api/v1/activities/:id/participants', async (req) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) {
      throw new ValidationError({ issues: params.error.flatten() });
    }
    const query = participantsQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw new ValidationError({ issues: query.error.flatten() });
    }

    const activity = await app.prisma.activity.findUnique({
      where: { id: params.data.id },
    });
    if (!activity) {
      throw new NotFoundError('activity_not_found', '活动不存在');
    }

    const where = {
      activityId: params.data.id,
      status: 'APPROVED' as const,
    };
    const [signups, total] = await Promise.all([
      app.prisma.signup.findMany({
        where,
        include: {
          user: {
            select: { id: true, nickname: true, avatar: true, school: true },
          },
        },
        orderBy: { signedAt: 'asc' },
        skip: (query.data.page - 1) * query.data.pageSize,
        take: query.data.pageSize,
      }),
      app.prisma.signup.count({ where }),
    ]);

    // The creator is implicitly a participant (currentCount=1 at creation)
    // but has no Signup row. We surface them as the first participant so
    // the frontend can render the full list.
    const creator = await app.prisma.user.findUnique({
      where: { id: activity.creatorId },
      select: { id: true, nickname: true, avatar: true, school: true },
    });

    type ParticipantRow = {
      userId: string;
      nickname: string;
      avatar: string | null;
      school: string | null;
      relation: 'creator' | 'signup';
      signedAt: Date;
    };
    const data: ParticipantRow[] = [];
    if (creator) {
      data.push({
        userId: creator.id,
        nickname: creator.nickname,
        avatar: creator.avatar,
        school: creator.school,
        relation: 'creator',
        signedAt: activity.createdAt,
      });
    }
    for (const s of signups) {
      data.push({
        userId: s.user.id,
        nickname: s.user.nickname,
        avatar: s.user.avatar,
        school: s.user.school,
        relation: 'signup',
        signedAt: s.signedAt,
      });
    }

    return {
      data,
      total: total + (creator ? 1 : 0),
      page: query.data.page,
      pageSize: query.data.pageSize,
    };
  });
}
