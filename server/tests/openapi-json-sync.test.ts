/**
 * Doc-construction contract: `docs/api/openapi.json` is the JSON
 * artifact we ship to clients (and feed to `openapi-typescript` for
 * the minip codegen). It must match the typed source in
 * `src/lib/openapi-spec.ts` byte-for-byte — otherwise someone edited
 * the spec, forgot to regenerate, and the openapi.json + the types
 * derived from it are now out of sync with what the server actually
 * serves.
 *
 * If this test fails, run `pnpm run openapi:build` from the server
 * dir and commit the regenerated openapi.json.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { openApiSpec } from '@/lib/openapi-spec.js';

const here = dirname(fileURLToPath(import.meta.url));
const jsonPath = resolve(here, '..', '..', 'docs', 'api', 'openapi.json');

describe('OpenAPI doc-construction contract', () => {
  it('docs/api/openapi.json is in sync with src/lib/openapi-spec.ts', () => {
    const onDisk = readFileSync(jsonPath, 'utf8');
    // JSON.stringify re-serializes; the formatting on disk must match
    // (build-openapi-json.ts uses 2-space indent + trailing newline).
    const regenerated = JSON.stringify(openApiSpec, null, 2) + '\n';
    expect(regenerated).toBe(onDisk);
  });
});
