/**
 * Centralized, validated environment configuration.
 *
 * Use this instead of reading `process.env` directly so that:
 * - Missing / malformed values fail fast on boot.
 * - The rest of the codebase gets typed config.
 * - Sensitive values never get logged in plaintext.
 */
import { z } from 'zod';

// Treat the test env as `test` so Prisma logging is silent.
const NODE_ENV = process.env['NODE_ENV'] ?? 'development';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default(NODE_ENV === 'production' ? 'info' : 'debug'),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .url('DATABASE_URL must be a valid URL'),
  REDIS_URL: z
    .string()
    .min(1, 'REDIS_URL is required')
    .url('REDIS_URL must be a valid URL'),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters (use openssl rand -base64 48)'),

  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(100),
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().min(1).max(1_000).default(10),
  // Per-route rate limits (issue #26). Tighter than the global
  // because these endpoints are write paths and abuse vectors.
  RATE_LIMIT_SIGNUP_MAX: z.coerce.number().int().min(1).max(1_000).default(20),
  RATE_LIMIT_CREATE_ACTIVITY_MAX: z.coerce.number().int().min(1).max(1_000).default(10),
  RATE_LIMIT_REVIEW_MAX: z.coerce.number().int().min(1).max(1_000).default(10),
  // 微信内容安全 API (issue #26). Used to screen user-generated text
  // (activity title/description, review comment) before it lands in
  // our DB. Empty values disable the integration (the helper short-
  // circuits to "passes" in that case — useful for dev + CI).
  WECHAT_MP_APPID: z.string().default(''),
  WECHAT_MP_SECRET: z.string().default(''),
  WECHAT_MSG_SEC_CHECK_URL: z
    .string()
    .url()
    .default('https://api.weixin.qq.com/wxa/msg_sec_check'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Print all the issues with their path so users can fix the env quickly.
  // We deliberately skip a logger here to keep the import order trivial.
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
export type Env = z.infer<typeof envSchema>;
