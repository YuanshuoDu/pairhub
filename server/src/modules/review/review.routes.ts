/**
 * Review module — HTTP routes.
 *
 * Endpoints (v1):
 *   - POST /api/v1/activities/:id/reviews   — auth: create a review
 *   - GET  /api/v1/users/:id/reviews        — public: review history
 *
 * Spec: docs/api/v1.md (review endpoints, M2)
 * Issue: #24 — review API: 双向评分
 */
import type { FastifyInstance } from 'fastify';

import { UnauthorizedError, ValidationError } from '@/lib/errors.js';
import { checkFields } from '@/lib/content-safety.js';
import { env } from '@/lib/env.js';

import { createReviewSchema, reviewListQuerySchema } from './review.schema.js';
import { createReview, listUserReviews } from './review.service.js';

export async function registerReviewModule(app: FastifyInstance): Promise<void> {
  // ---- POST /api/v1/activities/:id/reviews ----
  app.post<{ Params: { id: string } }>(
    '/api/v1/activities/:id/reviews',
    {
      preHandler: app.authenticate,
      // Per-endpoint tighter cap. Issue #26.
      config: { rateLimit: { max: env.RATE_LIMIT_REVIEW_MAX, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const fromUserId = req.userId;
      if (!fromUserId) {
        // Should never happen — authenticate preHandler would have rejected.
        throw new UnauthorizedError();
      }

      const parsed = createReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten());
      }

      // 微信内容安全 — screen the optional comment. Skipped if the
      // helper is in disabled mode (no WECHAT_MP_APPID) or the comment
      // is absent. Issue #26.
      const safety = await checkFields([['comment', parsed.data.comment]]);
      if (!safety.pass) {
        throw new ValidationError({
          issues: [
            {
              code: 'content_rejected',
              path: [safety.field],
              message: safety.result.reason ?? '内容未通过安全审核',
            },
          ],
        });
      }

      const review = await createReview(app.prisma, req.params.id, fromUserId, parsed.data);
      return reply.code(201).send({ data: review });
    },
  );

  // ---- GET /api/v1/users/:id/reviews ----
  app.get<{ Params: { id: string } }>(
    '/api/v1/users/:id/reviews',
    async (req, reply) => {
      const parsed = reviewListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.flatten());
      }
      const result = await listUserReviews(app.prisma, req.params.id, parsed.data);
      return reply.send(result);
    },
  );
}
