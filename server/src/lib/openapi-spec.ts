/**
 * Hand-curated OpenAPI 3.0.3 spec for the StudyBuddy v1 API.
 *
 * Scope: the 18 endpoints listed in docs/api/v1.md §1.1 (endpoint list)
 * plus `POST /api/v1/auth/logout` which exists in the code but is not
 * in the public spec table.
 *
 * Source of truth for shapes:
 *   - docs/api/v1.md §2 (request/response envelopes), §4 (error codes),
 *     §5 (pagination), §6 (per-resource schemas), §8 (worked examples).
 *   - server/prisma/schema.prisma (column types).
 *
 * This file is intentionally static (no auto-derivation from Fastify
 * routes): the production handlers parse zod schemas in-handler rather
 * than via `schema: { body: ... }`, so there's nothing for the dynamic
 * generator to walk. Future phases will refactor handlers to attach
 * schemas and switch to dynamic mode — see docs/api/v1.md §10.
 */
import type { OpenAPIV3 } from 'openapi-types';

const errorEnvelope: OpenAPIV3.SchemaObject = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string', example: 'VALIDATION_ERROR' },
        message: { type: 'string', example: '请求参数校验失败' },
        details: { type: 'object', additionalProperties: true, nullable: true },
      },
    },
    meta: { $ref: '#/components/schemas/Meta' },
  },
};

const meta: OpenAPIV3.SchemaObject = {
  type: 'object',
  required: ['requestId', 'timestamp'],
  properties: {
    requestId: { type: 'string', example: 'req_4f2c' },
    timestamp: { type: 'string', format: 'date-time' },
  },
};

const successEnvelope = (
  data: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
): OpenAPIV3.SchemaObject => ({
  type: 'object',
  required: ['data'],
  properties: { data, meta: { $ref: '#/components/schemas/Meta' } },
});

const user: OpenAPIV3.SchemaObject = {
  type: 'object',
  required: ['id', 'nickname', 'role', 'status', 'createdAt'],
  properties: {
    id: { type: 'string', example: 'usr_abc' },
    nickname: { type: 'string', maxLength: 50 },
    avatar: { type: 'string', format: 'uri', nullable: true },
    school: { type: 'string', nullable: true },
    major: { type: 'string', nullable: true },
    grade: { type: 'string', nullable: true },
    bio: { type: 'string', maxLength: 500, nullable: true },
    role: { type: 'string', enum: ['USER', 'ADMIN'] },
    status: { type: 'string', enum: ['ACTIVE', 'BANNED', 'DELETED'] },
    createdAt: { type: 'string', format: 'date-time' },
    deletedAt: { type: 'string', format: 'date-time', nullable: true },
  },
};

const creator: OpenAPIV3.SchemaObject = {
  type: 'object',
  required: ['id', 'nickname'],
  properties: {
    id: { type: 'string' },
    nickname: { type: 'string' },
    avatar: { type: 'string', format: 'uri', nullable: true },
  },
};

const activity: OpenAPIV3.SchemaObject = {
  type: 'object',
  required: [
    'id',
    'creator',
    'type',
    'title',
    'status',
    'currentCount',
    'maxParticipants',
    'startTime',
    'endTime',
    'createdAt',
  ],
  properties: {
    id: { type: 'string', example: 'act_abc123' },
    creator: { $ref: '#/components/schemas/Creator' },
    type: {
      type: 'string',
      enum: ['STUDY', 'SPORTS', 'BOARD_GAME', 'ONLINE_GAME', 'OTHER'],
    },
    title: { type: 'string', maxLength: 50 },
    description: { type: 'string', maxLength: 2000 },
    locationName: { type: 'string' },
    locationAddr: { type: 'string' },
    locationLat: { type: 'number', minimum: -90, maximum: 90 },
    locationLng: { type: 'number', minimum: -180, maximum: 180 },
    startTime: { type: 'string', format: 'date-time' },
    endTime: { type: 'string', format: 'date-time' },
    maxParticipants: { type: 'integer', minimum: 2, maximum: 100 },
    currentCount: { type: 'integer', minimum: 0 },
    status: {
      type: 'string',
      enum: ['RECRUITING', 'FULL', 'STARTED', 'ENDED', 'CANCELED'],
    },
    tags: { type: 'array', items: { type: 'string', maxLength: 20 } },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const signup: OpenAPIV3.SchemaObject = {
  type: 'object',
  required: ['id', 'activityId', 'user', 'status', 'signedAt'],
  properties: {
    id: { type: 'string', example: 'sgn_xxx' },
    activityId: { type: 'string' },
    user: { $ref: '#/components/schemas/Creator' },
    status: { type: 'string', enum: ['APPROVED', 'CANCELED', 'KICKED'] },
    message: { type: 'string', maxLength: 200, nullable: true },
    signedAt: { type: 'string', format: 'date-time' },
  },
};

const pagination: OpenAPIV3.SchemaObject = {
  type: 'object',
  required: ['total', 'page', 'pageSize'],
  properties: {
    total: { type: 'integer', minimum: 0 },
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100 },
    hasMore: { type: 'boolean' },
  },
};

const errorResponse = (code: string, message: string): OpenAPIV3.ResponseObject => ({
  description: message,
  content: {
    'application/json': {
      schema: errorEnvelope,
      example: {
        error: { code, message },
        meta: { requestId: 'req_4f2c', timestamp: '2026-06-29T12:00:00.000Z' },
      },
    },
  },
});

const jsonResponse = (
  description: string,
  schema: OpenAPIV3.SchemaObject,
  _status: '200' | '201' = '200',
): OpenAPIV3.ResponseObject => ({
  description,
  content: { 'application/json': { schema } },
});

// ---------------------------------------------------------------------------
// Reusable parameters
// ---------------------------------------------------------------------------
const activityIdParam: OpenAPIV3.ParameterObject = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'Activity id (cuid with `act_` prefix in the seed).',
  schema: { type: 'string', minLength: 1, maxLength: 64 },
};

const userIdParam: OpenAPIV3.ParameterObject = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'User id (cuid with `usr_` prefix in the seed).',
  schema: { type: 'string', minLength: 1, maxLength: 64 },
};

// ---------------------------------------------------------------------------
// Path definitions
// ---------------------------------------------------------------------------
const paths: OpenAPIV3.PathsObject = {
  // -- Health ----------------------------------------------------------------
  '/api/v1/health': {
    get: {
      tags: ['Health'],
      summary: 'Liveness + dependency probe',
      description:
        'Returns 200 with DB and Redis probe results. Used by the docker-compose healthcheck and the liveness Kubernetes probe. No auth.',
      security: [],
      responses: {
        '200': jsonResponse(
          'Service is up; reports DB + Redis reachability.',
          successEnvelope({
            type: 'object',
            required: ['status', 'db', 'redis', 'uptime'],
            properties: {
              status: { type: 'string', enum: ['ok', 'degraded'] },
              db: { type: 'string', enum: ['up', 'down'] },
              redis: { type: 'string', enum: ['up', 'down'] },
              uptime: { type: 'number' },
            },
          }),
        ),
        '503': errorResponse('SERVICE_UNAVAILABLE', 'At least one dependency is down.'),
      },
    },
  },

  // -- Auth ------------------------------------------------------------------
  '/api/v1/auth/wx-login': {
    post: {
      tags: ['Auth'],
      summary: 'WeChat login (jscode2session)',
      description:
        'Exchanges a WeChat `code` for an `openid` via the WeChat jscode2session API, then issues or reuses a user record and returns an access token. Idempotent: re-login with the same `code` returns the same user.',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['code'],
              properties: {
                code: { type: 'string', minLength: 1 },
                nickname: { type: 'string', maxLength: 50 },
                avatar: { type: 'string', format: 'uri' },
                phone: { type: 'string', description: 'E.164-ish phone for unlock.' },
              },
            },
          },
        },
      },
      responses: {
        '200': jsonResponse(
          'New or existing user authenticated.',
          successEnvelope({
            type: 'object',
            required: ['token', 'user'],
            properties: {
              token: { type: 'string', description: 'Access JWT (15-min TTL).' },
              refreshToken: { type: 'string', description: 'Refresh token (30-day TTL).' },
              user: { $ref: '#/components/schemas/User' },
            },
          }),
        ),
        '401': errorResponse('INVALID_CODE', 'WeChat jscode2session returned 40029.'),
        '429': errorResponse('LOGIN_RATE_LIMITED', '10 req/min per IP.'),
      },
    },
  },

  '/api/v1/auth/apple-login': {
    post: {
      tags: ['Auth'],
      summary: 'Apple Sign-In (id_token verify)',
      description: 'Verifies the Apple `id_token` and issues or reuses a user record.',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['idToken'],
              properties: {
                idToken: { type: 'string' },
                fullName: { type: 'string' },
                phone: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        '200': jsonResponse('Authenticated.', successEnvelope({ $ref: '#/components/schemas/User' })),
        '401': errorResponse('INVALID_ID_TOKEN', 'Apple id_token verify failed.'),
      },
    },
  },

  '/api/v1/auth/google-login': {
    post: {
      tags: ['Auth'],
      summary: 'Google Sign-In (id_token verify)',
      description: 'Verifies the Google `id_token` and issues or reuses a user record.',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['idToken'],
              properties: {
                idToken: { type: 'string' },
                phone: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        '200': jsonResponse('Authenticated.', successEnvelope({ $ref: '#/components/schemas/User' })),
        '401': errorResponse('INVALID_ID_TOKEN', 'Google id_token verify failed.'),
      },
    },
  },

  '/api/v1/auth/refresh': {
    post: {
      tags: ['Auth'],
      summary: 'Rotate access + refresh tokens',
      description:
        'Validates the `refresh_token` and its `jti` against Redis, then issues a new access/refresh pair and replaces the stored jti. Returns 410 if the user has been soft-deleted.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['refreshToken'],
              properties: { refreshToken: { type: 'string' } },
            },
          },
        },
      },
      responses: {
        '200': jsonResponse(
          'New tokens issued.',
          successEnvelope({
            type: 'object',
            required: ['token', 'refreshToken'],
            properties: {
              token: { type: 'string' },
              refreshToken: { type: 'string' },
            },
          }),
        ),
        '401': errorResponse('UNAUTHORIZED', 'refresh_token invalid or already consumed.'),
        '410': errorResponse('ACCOUNT_DELETED', 'User has been soft-deleted.'),
      },
    },
  },

  '/api/v1/auth/logout': {
    post: {
      tags: ['Auth'],
      summary: 'Consume the current refresh_token (idempotent)',
      description:
        'Deletes the `jti` from Redis if present. Calling twice is a no-op (still 200).',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['refreshToken'],
              properties: { refreshToken: { type: 'string' } },
            },
          },
        },
      },
      responses: {
        '200': jsonResponse('Logged out (idempotent).', successEnvelope({ type: 'object' })),
        '401': errorResponse('UNAUTHORIZED', 'No access token.'),
      },
    },
  },

  '/api/v1/auth/link-provider': {
    post: {
      tags: ['Auth'],
      summary: 'Bind an additional login provider (planned)',
      description:
        'Spec endpoint #6 — bind an extra provider to the current user. **Not implemented yet**; the underlying schema is single-openid. Will land in a follow-up after the IdentityProvider table is added.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['provider', 'providerSub'],
              properties: {
                provider: { type: 'string', enum: ['WECHAT', 'APPLE', 'GOOGLE'] },
                providerSub: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        '204': { description: 'Provider bound.' },
        '409': errorResponse('PROVIDER_ALREADY_LINKED', 'The (provider, sub) is already owned by another user.'),
        '422': errorResponse('LAST_PROVIDER', 'Cannot unlink the user\'s last login method.'),
      },
    },
  },

  // -- User ------------------------------------------------------------------
  '/api/v1/users/me': {
    get: {
      tags: ['User'],
      summary: 'Current user profile',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': jsonResponse('Profile.', successEnvelope({ $ref: '#/components/schemas/User' })),
        '401': errorResponse('UNAUTHORIZED', 'Token missing or invalid.'),
        '404': errorResponse('USER_NOT_FOUND', 'Token sub has no row (or user is DELETED).'),
      },
    },
    patch: {
      tags: ['User'],
      summary: 'Update mutable profile fields',
      description:
        'Strict schema: at least one of `nickname` / `avatar` / `school` / `major` / `grade` / `bio` must be present. Email and phone are NOT updatable here.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              minProperties: 1,
              properties: {
                nickname: { type: 'string', minLength: 1, maxLength: 50 },
                avatar: { type: 'string', format: 'uri' },
                school: { type: 'string', maxLength: 100 },
                major: { type: 'string', maxLength: 100 },
                grade: { type: 'string', maxLength: 50 },
                bio: { type: 'string', maxLength: 500 },
              },
            },
          },
        },
      },
      responses: {
        '200': jsonResponse('Updated profile.', successEnvelope({ $ref: '#/components/schemas/User' })),
        '400': errorResponse('VALIDATION_ERROR', 'Empty body or extra keys.'),
        '401': errorResponse('UNAUTHORIZED', 'Token missing or invalid.'),
      },
    },
    delete: {
      tags: ['User'],
      summary: 'Soft-delete the current account',
      description:
        'Marks the user `DELETED` with `deletedAt = now()`. Idempotent: a second call returns the original `deletedAt` without re-writing the row. All active access tokens (≤15-min TTL) will be rejected by `authenticate()`.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': jsonResponse(
          'Soft-deleted.',
          successEnvelope({
            type: 'object',
            required: ['deletedAt'],
            properties: { deletedAt: { type: 'string', format: 'date-time' } },
          }),
        ),
        '401': errorResponse('UNAUTHORIZED', 'Token missing or invalid.'),
      },
    },
  },

  '/api/v1/users/{id}': {
    get: {
      tags: ['User'],
      summary: 'Public profile (auth optional)',
      description:
        'Returns the public profile. If a valid bearer token is sent, `viewerId` is propagated so the service can return viewer-aware fields. Returns 404 for DELETED users (no probe).',
      security: [],
      parameters: [userIdParam],
      responses: {
        '200': jsonResponse('Public profile.', successEnvelope({ $ref: '#/components/schemas/User' })),
        '404': errorResponse('USER_NOT_FOUND', 'No such user (or DELETED).'),
      },
    },
  },

  '/api/v1/users/me/activities': {
    get: {
      tags: ['User'],
      summary: 'My activities (created or joined)',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'type',
          in: 'query',
          required: false,
          description: '`created` lists activities I created; `joined` lists activities I signed up for.',
          schema: { type: 'string', enum: ['created', 'joined'], default: 'created' },
        },
        {
          name: 'page',
          in: 'query',
          required: false,
          schema: { type: 'integer', minimum: 1, default: 1 },
        },
        {
          name: 'pageSize',
          in: 'query',
          required: false,
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      ],
      responses: {
        '200': jsonResponse(
          'Page of activities.',
          {
            type: 'object',
            required: ['data', 'total', 'page', 'pageSize'],
            properties: {
              data: { type: 'array', items: { $ref: '#/components/schemas/Activity' } },
              total: { type: 'integer' },
              page: { type: 'integer' },
              pageSize: { type: 'integer' },
              hasMore: { type: 'boolean' },
            },
          },
        ),
        '401': errorResponse('UNAUTHORIZED', 'Token missing or invalid.'),
      },
    },
  },

  // -- Activity --------------------------------------------------------------
  '/api/v1/activities': {
    get: {
      tags: ['Activity'],
      summary: 'List activities (paged, filterable, geo-sortable)',
      security: [],
      parameters: [
        { name: 'type', in: 'query', schema: { type: 'string', enum: ['STUDY', 'SPORTS', 'BOARD_GAME', 'ONLINE_GAME', 'OTHER'] } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['RECRUITING', 'FULL', 'STARTED', 'ENDED', 'CANCELED'] } },
        { name: 'school', in: 'query', schema: { type: 'string' } },
        { name: 'keyword', in: 'query', schema: { type: 'string' } },
        { name: 'start_after', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'start_before', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'lat', in: 'query', schema: { type: 'number', minimum: -90, maximum: 90 } },
        { name: 'lng', in: 'query', schema: { type: 'number', minimum: -180, maximum: 180 } },
        { name: 'radius_km', in: 'query', schema: { type: 'number', minimum: 0, maximum: 20000, default: 50 } },
        {
          name: 'sort',
          in: 'query',
          schema: { type: 'string', enum: ['time_asc', 'time_desc', 'distance_asc', 'created_desc'], default: 'created_desc' },
        },
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        { name: 'page_size', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
      ],
      responses: {
        '200': jsonResponse(
          'Page of activities.',
          successEnvelope({
            type: 'object',
            required: ['data', 'total', 'page', 'pageSize'],
            properties: {
              data: { type: 'array', items: { $ref: '#/components/schemas/Activity' } },
              ...pagination.properties,
            },
          }),
        ),
      },
    },
    post: {
      tags: ['Activity'],
      summary: 'Create an activity',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['type', 'title', 'locationName', 'locationLat', 'locationLng', 'startTime', 'endTime', 'maxParticipants'],
              properties: {
                type: { type: 'string', enum: ['STUDY', 'SPORTS', 'BOARD_GAME', 'ONLINE_GAME', 'OTHER'] },
                title: { type: 'string', minLength: 1, maxLength: 50 },
                description: { type: 'string', maxLength: 2000 },
                locationName: { type: 'string', maxLength: 100 },
                locationAddr: { type: 'string', maxLength: 200 },
                locationLat: { type: 'number', minimum: -90, maximum: 90 },
                locationLng: { type: 'number', minimum: -180, maximum: 180 },
                startTime: { type: 'string', format: 'date-time' },
                endTime: { type: 'string', format: 'date-time' },
                maxParticipants: { type: 'integer', minimum: 2, maximum: 100 },
                tags: { type: 'array', items: { type: 'string', maxLength: 20 }, maxItems: 10 },
              },
            },
          },
        },
      },
      responses: {
        '201': jsonResponse('Created.', successEnvelope({ $ref: '#/components/schemas/Activity' })),
        '400': errorResponse('VALIDATION_ERROR', 'Body failed zod validation.'),
        '401': errorResponse('UNAUTHORIZED', 'Token missing or invalid.'),
        '429': errorResponse('CREATE_RATE_LIMITED', '10 activities per hour per user.'),
      },
    },
  },

  '/api/v1/activities/{id}': {
    get: {
      tags: ['Activity'],
      summary: 'Activity detail',
      security: [],
      parameters: [activityIdParam],
      responses: {
        '200': jsonResponse('Activity.', successEnvelope({ $ref: '#/components/schemas/Activity' })),
        '404': errorResponse('ACTIVITY_NOT_FOUND', 'No such activity.'),
      },
    },
    patch: {
      tags: ['Activity'],
      summary: 'Modify activity (creator only)',
      security: [{ bearerAuth: [] }],
      parameters: [activityIdParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              minProperties: 1,
              properties: {
                title: { type: 'string', maxLength: 50 },
                description: { type: 'string', maxLength: 2000 },
                locationName: { type: 'string' },
                locationAddr: { type: 'string' },
                startTime: { type: 'string', format: 'date-time' },
                endTime: { type: 'string', format: 'date-time' },
                maxParticipants: { type: 'integer', minimum: 2, maximum: 100 },
                tags: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
      responses: {
        '200': jsonResponse('Updated.', successEnvelope({ $ref: '#/components/schemas/Activity' })),
        '403': errorResponse('FORBIDDEN', 'Caller is not the creator.'),
        '404': errorResponse('ACTIVITY_NOT_FOUND', 'No such activity.'),
        '422': errorResponse('CANCEL_TOO_LATE', '>1h before start_time; cannot cancel.'),
      },
    },
    delete: {
      tags: ['Activity'],
      summary: 'Cancel activity (creator only)',
      security: [{ bearerAuth: [] }],
      parameters: [activityIdParam],
      responses: {
        '200': jsonResponse('Canceled.', successEnvelope({ $ref: '#/components/schemas/Activity' })),
        '403': errorResponse('FORBIDDEN', 'Caller is not the creator.'),
        '404': errorResponse('ACTIVITY_NOT_FOUND', 'No such activity.'),
        '422': errorResponse('CANCEL_TOO_LATE', '>1h before start_time; cannot cancel.'),
      },
    },
  },

  // -- Signup ----------------------------------------------------------------
  '/api/v1/activities/{id}/signup': {
    post: {
      tags: ['Signup'],
      summary: 'Sign up for an activity',
      security: [{ bearerAuth: [] }],
      parameters: [activityIdParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { message: { type: 'string', maxLength: 200 } },
            },
          },
        },
      },
      responses: {
        '201': jsonResponse('Signed up.', successEnvelope({ $ref: '#/components/schemas/Signup' })),
        '404': errorResponse('ACTIVITY_NOT_FOUND', 'No such activity.'),
        '409': errorResponse('ALREADY_SIGNED_UP', 'Caller is already signed up.'),
        '422': errorResponse('ACTIVITY_NOT_OPEN', 'Status is not RECRUITING/FULL, or activity is full.'),
        '429': errorResponse('SIGNUP_RATE_LIMITED', '30 signups per hour per user.'),
      },
    },
    delete: {
      tags: ['Signup'],
      summary: 'Cancel my signup',
      security: [{ bearerAuth: [] }],
      parameters: [activityIdParam],
      responses: {
        '200': jsonResponse('Cancelled.', successEnvelope({ $ref: '#/components/schemas/Signup' })),
        '404': errorResponse('SIGNUP_NOT_FOUND', 'Caller was not signed up.'),
        '422': errorResponse('ACTIVITY_NOT_CANCELABLE', 'Activity is STARTED or ENDED.'),
      },
    },
  },

  '/api/v1/activities/{id}/participants': {
    get: {
      tags: ['Signup'],
      summary: 'List participants (public)',
      security: [],
      parameters: [
        activityIdParam,
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
      ],
      responses: {
        '200': jsonResponse(
          'Page of participants.',
          successEnvelope({
            type: 'object',
            required: ['data', 'total', 'page', 'pageSize'],
            properties: {
              data: { type: 'array', items: { $ref: '#/components/schemas/Signup' } },
              total: { type: 'integer' },
              page: { type: 'integer' },
              pageSize: { type: 'integer' },
              hasMore: { type: 'boolean' },
            },
          }),
        ),
        '404': errorResponse('ACTIVITY_NOT_FOUND', 'No such activity.'),
      },
    },
  },
};

export const openApiSpec: OpenAPIV3.Document = {
  openapi: '3.0.3',
  info: {
    title: 'StudyBuddy API',
    version: '1.0.0',
    description:
      'StudyBuddy v1 server API. Spec source of truth: `docs/api/v1.md`. Hand-curated OpenAPI doc; future phases will refactor route handlers to attach zod schemas and switch to dynamic generation.',
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Local dev' },
    { url: 'https://api.studybuddy.example.com', description: 'Production' },
  ],
  tags: [
    { name: 'Health', description: 'Liveness + dependency probe.' },
    { name: 'Auth', description: 'Login, refresh, logout, link provider.' },
    { name: 'User', description: 'Self / public profile, soft-delete.' },
    { name: 'Activity', description: 'CRUD on activities (list / create / detail / update / cancel).' },
    { name: 'Signup', description: 'Sign up to / cancel / list participants for an activity.' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Issued by `/auth/*-login` or `/auth/refresh`. 15-minute access TTL. Send as `Authorization: Bearer <token>`.',
      },
    },
    schemas: {
      Meta: meta,
      User: user,
      Creator: creator,
      Activity: activity,
      Signup: signup,
      Pagination: pagination,
    },
    responses: {
      Unauthorized: errorResponse('UNAUTHORIZED', 'No bearer token.'),
      Forbidden: errorResponse('FORBIDDEN', 'Caller lacks permission.'),
      NotFound: errorResponse('NOT_FOUND', 'Resource not found.'),
      ValidationError: errorResponse('VALIDATION_ERROR', 'Body failed zod validation.'),
      RateLimited: errorResponse('RATE_LIMIT_EXCEEDED', 'Too many requests.'),
    },
  },
  paths,
};
