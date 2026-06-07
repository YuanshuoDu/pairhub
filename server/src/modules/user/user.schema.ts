/**
 * Zod schemas for the user module.
 *
 * Spec: docs/api/v1.md §6.2 (User / UserPublic) and §8 (endpoint contracts).
 *
 * Field constraints (intentionally stricter than the database column to
 * keep API behavior stable):
 *   - nickname:  1-50 chars  (DB:  String, no length cap)
 *   - avatar:    URL, max 500 chars
 *   - school:    max 100 chars
 *   - major:     max 100 chars
 *   - bio:       1-500 chars (DB:  VarChar(500))
 */
import { z } from 'zod';

// =====================================================================
// Body / query schemas
// =====================================================================

/**
 * PATCH /api/v1/users/me — body
 * All fields optional; only present keys are updated.
 */
export const updateMeBodySchema = z
  .object({
    nickname: z.string().trim().min(1, '昵称不能为空').max(50, '昵称不能超过 50 个字符').optional(),
    avatar: z
      .string()
      .url('头像必须是合法 URL')
      .max(500, '头像 URL 过长')
      .nullable()
      .optional(),
    school: z.string().trim().max(100, '学校名称过长').nullable().optional(),
    major: z.string().trim().max(100, '专业名称过长').nullable().optional(),
    bio: z
      .string()
      .max(500, '个人简介不能超过 500 个字符')
      .nullable()
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: '至少需要提供一个可更新字段',
  });

export type UpdateMeBody = z.infer<typeof updateMeBodySchema>;

/**
 * GET /api/v1/users/me/activities — query
 */
export const myActivitiesQuerySchema = z.object({
  type: z.enum(['created', 'joined']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type MyActivitiesQuery = z.infer<typeof myActivitiesQuerySchema>;

// =====================================================================
// Path schemas
// =====================================================================

/** User id format: `usr_<nanoid>` (also used by the signup endpoint).
 * The schema also accepts bare alphanumerics for forward-compat with
 * any future id scheme. The underscore is required because the
 * nanoid-style id from prisma includes it; rejecting underscores
 * would 400 every legitimate user id. */
export const userIdParamSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_]+$/i, '用户 ID 格式不合法'),
});

export type UserIdParam = z.infer<typeof userIdParamSchema>;

// =====================================================================
// Response shapes
// =====================================================================

/** Full user — visible to the user themselves only. */
export interface UserPrivateDTO {
  id: string;
  nickname: string;
  avatar: string | null;
  school: string | null;
  major: string | null;
  bio: string | null;
  lastActiveAt: string;
  createdAt: string;
}

/** Public user — what other users can see (no email/phone/bio). */
export interface UserPublicDTO {
  id: string;
  nickname: string;
  avatar: string | null;
  school: string | null;
  major: string | null;
  createdAt: string;
}

/** Lightweight activity summary used in the "my activities" list. */
export interface UserActivityDTO {
  id: string;
  type: string;
  title: string;
  status: string;
  startTime: string;
  endTime: string;
  maxParticipants: number;
  currentCount: number;
  createdAt: string;
  /** 'created' = I'm the creator, 'joined' = I signed up (and may or may not be creator). */
  relation: 'created' | 'joined';
}
