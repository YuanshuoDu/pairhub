/**
 * OpenAPI / Swagger plugin.
 *
 * Registers:
 *   - @fastify/swagger in 'static' mode, fed the hand-curated spec
 *     from ./openapi-spec.ts. Exposes the raw JSON at `/api/v1/docs/json`.
 *   - @fastify/swagger-ui under `/api/v1/docs` so devs / clients can
 *     browse and try-out the API at the same prefix as the rest of v1.
 *
 * Why static rather than dynamic: the production handlers parse zod
 * schemas in-handler (see modules/user/user.routes.ts et al.) rather
 * than via `schema: { body: zod, ... }`, so the dynamic generator has
 * nothing to walk. Static mode is honest about the situation; the
 * follow-up will refactor handlers to attach schemas and switch to
 * dynamic mode (see docs/api/v1.md §10).
 */
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { openApiSpec } from '@/lib/openapi-spec.js';

export const openApiPlugin = fp(
  async (app: FastifyInstance): Promise<void> => {
    // Strip the paths / components from the spec object we hand to
    // @fastify/swagger — it only wants the metadata in `openapi` mode
    // (info / servers / tags / components / securitySchemes). The
    // `paths` block is also re-attached verbatim so the rendered JSON
    // is byte-identical to the source spec.
    const { paths, components, ...metadata } = openApiSpec;

    await app.register(swagger, {
      mode: 'static',
      specification: {
        document: {
          ...metadata,
          paths,
          components,
        },
      },
    });

    await app.register(swaggerUi, {
      routePrefix: '/api/v1/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
        displayRequestDuration: true,
        filter: true,
        operationsSorter: 'alpha',
        tagsSorter: 'alpha',
        tryItOutEnabled: false,
        persistAuthorization: true,
        // Disable the online validator (the spec host hits
        // validator.swagger.io by default which we don't want in
        // air-gapped CI).
        validatorUrl: 'none',
      },
      // Tell swagger-ui where the spec lives so the UI's "Explore"
      // button can fetch it without a CORS round-trip. With
      // routePrefix = '/api/v1/docs', the spec is served at
      // '/api/v1/docs/json' by default — we make that explicit here.
      staticCSP: true,
      uiHooks: {
        onRequest: async (_req, reply) => {
          reply.header('Cache-Control', 'no-store');
        },
      },
    });
  },
  {
    name: 'openapi',
    // Run before any module routes are registered so swagger is ready
    // when a request hits /api/v1/docs.
    fastify: '4.x',
  },
);
