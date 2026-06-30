import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'coverage'],
    // Run before any test file is loaded. Sets the env vars
    // (DATABASE_URL / REDIS_URL / JWT_SECRET) that env.ts requires
    // at import time, so individual test files don't need to repeat
    // the boilerplate. Issue #26 unblock.
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/server.ts',
        'src/**/*.test.ts',
        'src/lib/prisma.ts',
        'src/lib/redis.ts',
      ],
    },
    testTimeout: 15_000,
    // The openapi plugin (registered in lib/app.ts) loads @fastify/swagger
    // and @fastify/swagger-ui at build time. The first buildApp in a
    // fresh process takes ~5s while swagger-ui hashes its static assets;
    // the 10s default is too tight when the suite runs back-to-back.
    hookTimeout: 30_000,
  },
});
