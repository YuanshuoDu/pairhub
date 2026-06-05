/**
 * Review module — Zod schemas for request validation.
 *
 * Spec: docs/api/v1.md (review endpoints, M2)
 * Issue: #24 — review API: 双向评分
 */
import { z } from 'zod';

export const ratingSchema = z
  .number()
  .int('评分必须是整数')
  .min(1, '评分不能低于 1')
  .max(5, '评分不能高于 5');

export const createReviewSchema = z.object({
  toUserId: z.string().min(1, 'toUserId 不能为空'),
  rating: ratingSchema,
  comment: z.string().min(1).max(500).optional(),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const reviewListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;
