/* eslint-disable no-console -- CLI tool, stdout is the whole point */
/**
 * Build a JSON artifact of the OpenAPI 3.0 spec at docs/api/openapi.json.
 *
 * The authoritative spec is server/src/lib/openapi-spec.ts (a typed
 * OpenAPIV3.Document so the editor gives us completion on every field).
 * The JSON artifact is what the `openapi-typescript` and
 * `openapi_dart_codegen` tools consume — both are JS libraries that want
 * to read a JSON file, not evaluate a TS module.
 *
 * Run from the server dir:
 *
 *   pnpm exec tsx scripts/build-openapi-json.ts
 *
 * The output is checked in to docs/api/openapi.json so:
 *   - clients that don't run pnpm can still see the contract
 *   - CI can diff the JSON against a previous commit and fail if the
 *     spec changed without regenerating downstream types
 *   - human readers can browse a single canonical URL
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openApiSpec } from '../src/lib/openapi-spec.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const outPath = resolve(repoRoot, 'docs', 'api', 'openapi.json');

mkdirSync(dirname(outPath), { recursive: true });

// Serialize. OpenAPI 3.0 documents are pure JSON, so JSON.stringify is
// lossless as long as nothing weird sneaks in (functions, BigInt, etc.).
// If the spec ever needs to embed something non-serializable we'll add
// a replacer here.
const json = JSON.stringify(openApiSpec, null, 2) + '\n';
writeFileSync(outPath, json, 'utf8');

// Minimal stdout so the build is easy to chain / log.
const { paths, components, info, servers, tags } = openApiSpec as {
  paths: Record<string, unknown>;
  components: { schemas?: Record<string, unknown> } | undefined;
  info: { title: string; version: string };
  servers: Array<{ url: string }>;
  tags: Array<{ name: string }>;
};

const pathCount = Object.keys(paths).length;
const schemaCount = components?.schemas ? Object.keys(components.schemas).length : 0;
const tagCount = tags.length;

console.log(
  `[openapi] wrote ${outPath}  (${info.title} v${info.version}, ` +
    `${pathCount} paths, ${schemaCount} schemas, ${tagCount} tags, ` +
    `${servers.length} server(s))`,
);
