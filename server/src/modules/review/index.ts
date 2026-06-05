/**
 * Review module — public surface.
 * Mounted by lib/app.ts after user module.
 *
 * Spec: docs/api/v1.md (review endpoints, M2)
 * Issue: #24 — review API: 双向评分
 */
export { registerReviewModule } from './review.routes.js';
export { createReview, listUserReviews, serializeReview } from './review.service.js';
export {
  createReviewSchema,
  reviewListQuerySchema,
  ratingSchema,
} from './review.schema.js';
export type { CreateReviewInput, ReviewListQuery } from './review.schema.js';
export type { ReviewSerialized, ReviewListResult } from './review.service.js';
