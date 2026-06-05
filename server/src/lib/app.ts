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
import fastifyPrintRoutes from 'fastify-print-routes';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';

import { env } from '@/lib/env.js';
import { logger } from '@/lib/logger.js';
import { prisma } from '@/lib/prisma.js';
import { redis } from '@/lib/redis.js';
import '@/lib/fastify.d.js';

import authPlugin from '@/plugins/auth.js';
import corsPlugin from '@/plugins/cors.js';
import errorHandlerPlugin from '@/plugins/error-handler.js';
import rateLimitPlugin from '@/plugins/rate-limit.js';

import { registerHealthModule } from '@/modules/health/index.js';
import { registerUserModule } from '@/modules/user/index.js';

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

  // Security & utilities
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(corsPlugin);
  await app.register(cookie);
  await app.register(sensible);

  // Auth + rate limit
  await app.register(authPlugin);
  await app.register(rateLimitPlugin);

  // Routes
  await registerHealthModule(app);
  await registerUserModule(app);

  // Dev-only: pretty-print registered routes
  if (env.NODE_ENV === 'development' && !options.silent) {
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
