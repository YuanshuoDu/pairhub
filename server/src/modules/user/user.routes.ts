/**
 * User module — HTTP routes.
 *
 * Endpoints (all under /api/v1):
 *   - GET    /users/me                — current user (auth required)
 *   - PATCH  /users/me                — update profile (auth required)
 *   - GET    /users/:id               — public profile (auth optional)
 *   - GET    /users/me/activities     — my activities (auth required)
 *
 * Auth:   We use `app.authenticate` from `@/plugins/auth.js` for routes
 *         that require a logged-in user. For the public-by-id route we
 *         try to authenticate but never fail if the token is missing —
 *         a missing token just means "show only public fields".
 *
 * Errors:
 *   - 401  UNAUTHORIZED    — missing / invalid token on a protected route
 *   - 403  FORBIDDEN       — banned user trying to read their own profile
 *   - 404  USER_NOT_FOUND  — unknown id, or banned user viewed by others
 *   - 400  VALIDATION_ERROR— zod failure (handled by global error handler)
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { UnauthorizedError, ValidationError } from '@/lib/errors.js';

import {
  myActivitiesQuerySchema,
  updateMeBodySchema,
  userIdParamSchema,
} from './user.schema.js';
import {
  getMe,
  getUserById,
  listMyActivities,
  updateMe,
} from './user.service.js';

/**
 * Authenticate the request if a Bearer token is present. Returns the
 * userId (string) or null if no token was supplied.
 *
 * - No header       → null   (anonymous)
 * - Invalid token   → throws UnauthorizedError
 * - Valid token     → userId
 *
 * Used by the public-by-id route where auth is optional.
 */
async function tryAuth(app: FastifyInstance, req: FastifyRequest): Promise<string | null> {
  const auth = req.headers['authorization'];
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  try {
    await req.jwtVerify();
    const payload = req.user as { sub?: string } | undefined;
    if (!payload?.sub) {
      throw new UnauthorizedError('Token 缺少 sub 字段');
    }
    return payload.sub;
  } catch (e) {
    if (e instanceof UnauthorizedError) throw e;
    // Re-throw auth errors as 401 with a stable code.
    throw new UnauthorizedError('Token 无效或已过期');
  }
}

export async function registerUserModule(app: FastifyInstance): Promise<void> {
  // -----------------------------------------------------------------
  // GET /api/v1/users/me
  // -----------------------------------------------------------------
  app.get(
    '/api/v1/users/me',
    { preHandler: [app.authenticate] },
    async (req) => {
      const userId = req.userId;
      if (!userId) {
        // Defensive: should never happen if authenticate ran.
        throw new UnauthorizedError();
      }
      const data = await getMe(app.prisma, userId);
      return { data };
    },
  );

  // -----------------------------------------------------------------
  // PATCH /api/v1/users/me
  // -----------------------------------------------------------------
  app.patch(
    '/api/v1/users/me',
    { preHandler: [app.authenticate] },
    async (req) => {
      const userId = req.userId;
      if (!userId) throw new UnauthorizedError();

      const parsed = updateMeBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError({ issues: parsed.error.flatten() });
      }

      const data = await updateMe(app.prisma, userId, parsed.data);
      return { data };
    },
  );

  // -----------------------------------------------------------------
  // GET /api/v1/users/:id  (public; auth optional)
  // -----------------------------------------------------------------
  app.get<{ Params: { id: string } }>(
    '/api/v1/users/:id',
    async (req, reply) => {
      const parsedParams = userIdParamSchema.safeParse(req.params);
      if (!parsedParams.success) {
        throw new ValidationError({ issues: parsedParams.error.flatten() });
      }
      const targetId = parsedParams.data.id;

      // Optional auth: only attempt verification if a token was sent.
      const viewerId = await tryAuth(app, req);

      const data = await getUserById(app.prisma, viewerId, targetId);
      return reply.send({ data });
    },
  );

  // -----------------------------------------------------------------
  // GET /api/v1/users/me/activities
  // -----------------------------------------------------------------
  app.get(
    '/api/v1/users/me/activities',
    { preHandler: [app.authenticate] },
    async (req) => {
      const userId = req.userId;
      if (!userId) throw new UnauthorizedError();

      const parsedQuery = myActivitiesQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        throw new ValidationError({ issues: parsedQuery.error.flatten() });
      }

      const result = await listMyActivities(app.prisma, userId, parsedQuery.data);
      return {
        data: result.data,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      };
    },
  );
}
