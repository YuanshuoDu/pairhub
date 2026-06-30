/**
 * Build a Fastify instance with all production-ready plugins wired.
 *
 * Splitting this from `server.ts` lets us build an *isolated* instance
 * in tests (no port binding, no signal handlers) — see tests/health.test.ts.
 */
import 'dotenv/config';

import { fileURLToPath } from 'node:url';
import path from 'node:path';

import Fastify, { type FastifyInstance } from 'fastify';
// fastify-print-routes ships types/index.d.ts but the package.json `exports`
// field doesn't expose them — TS falls back to `any` for the import.
// @ts-expect-error -- upstream types exist but are not reachable via `exports`
import fastifyPrintRoutes from 'fastify-print-routes';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';

import { getEnv } from '@/lib/env.js';
import { logger } from '@/lib/logger.js';
import { prisma } from '@/lib/prisma.js';
import { redis } from '@/lib/redis.js';
import { initSentry } from '@/lib/sentry.js';

// `src/lib/fastify.d.ts` augments Fastify's types (req.userId, app.prisma,
// app.authenticate, etc.). It's picked up automatically by the TypeScript
// compiler via the `include` glob in tsconfig.json — no runtime import is
// needed. The previous `import '@/lib/fastify.d.js';` survived only as a
// no-op side-effect import and leaked the `@/` alias into dist/ (tsc-alias
// does not rewrite `.d.ts` references).

import authPlugin from '@/plugins/auth.js';
import corsPlugin from '@/plugins/cors.js';
import errorHandlerPlugin from '@/plugins/error-handler.js';
import rateLimitPlugin from '@/plugins/rate-limit.js';
import metricsPlugin from '@/plugins/metrics.js';
import { openApiPlugin } from '@/lib/openapi.js';

import { registerHealthModule } from '@/modules/health/index.js';
import { registerAuthModule } from '@/modules/auth/index.js';
import { registerUserModule } from '@/modules/user/index.js';
import { registerActivityModule } from '@/modules/activity/index.js';
import { registerSignupModule } from '@/modules/signup/index.js';
import { registerReviewModule } from '@/modules/review/index.js';
import { registerPushModule } from '@/modules/push/push.routes.js';
import { registerAdminModule } from '@/modules/admin/index.js';
import { registerMonitoringModule } from '@/modules/monitoring/index.js';
import { registerAnalyticsModule } from '@/modules/analytics/index.js';

export interface BuildAppOptions {
  /** Skip route printing (used in tests). */
  silent?: boolean;
  /** Override the logger (e.g. inject a silent logger in tests). */
  loggerOverride?: FastifyInstance['log'];
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.loggerOverride ?? logger,
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'reqId',
    disableRequestLogging: false,
    bodyLimit: 1 * 1024 * 1024, // 1 MiB
  });

  // Decorate with shared singletons BEFORE plugins that may need them.
  app.decorate('prisma', prisma);
  app.decorate('redis', redis);

  // Order matters: error handler must be first so it can catch any
  // errors from the rest of the lifecycle.
  await app.register(errorHandlerPlugin);

  // Sentry: init AFTER the error handler is registered (so the Fastify
  // error handler Sentry wires can delegate to ours) but BEFORE the
  // auth / rate-limit / metrics plugins that might throw.
  initSentry(app);

  // Security & utilities
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(corsPlugin);
  await app.register(cookie);
  await app.register(sensible);

  // OpenAPI / Swagger UI — registered before routes so the spec is
  // available at /api/v1/docs from the first request.
  await app.register(openApiPlugin);

  // Cross-cutting
  await app.register(authPlugin);
  await app.register(rateLimitPlugin);
  await app.register(metricsPlugin);

  // Routes
  await registerHealthModule(app);
  await registerAuthModule(app);
  await registerUserModule(app);
  await registerActivityModule(app);
  await registerSignupModule(app);
  await registerReviewModule(app);
  await registerPushModule(app);
  await registerAdminModule(app);
  await registerMonitoringModule(app);
  await registerAnalyticsModule(app);

  // Dev-only: pretty-print registered routes
  if (getEnv().NODE_ENV === 'development' && !options.silent) {
    await app.register(fastifyPrintRoutes, {
      // Print to stdout at boot
      output: console.info.bind(console),
    });
  }

  return app;
}

/**
 * Locate the project root from this file's URL.
 * Useful for tools like `tsx watch` that need a CWD.
 */
export function projectRoot(): string {
  // src/lib/app.ts → ../../..
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}
