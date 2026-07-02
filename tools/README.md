# Tools

Build-time helpers that don't belong in any of the runtime packages.

## `codegen-dart.mjs`

Generates Dart DTOs from the server's OpenAPI 3.0 spec. Reads
`docs/api/openapi.json` (produced by the server's `pnpm run openapi:build`)
and writes one `.dart` file per component schema into
`app/lib/api/openapi/`, plus a barrel `openapi.dart`.

Pure Node ESM, no extra deps. The output is auditable; if you want to
know exactly what a `User` will look like in Dart, just `cat
app/lib/api/openapi/user.dart` after running it.

### When to run

Re-run whenever the spec changes — i.e. whenever
`server/src/lib/openapi-spec.ts` is edited. The CI plan is to add a
`pnpm run openapi:check` that regenerates both the JSON and the Dart
and diffs against the committed copies; for now we just run by hand:

```bash
# from the repo root
pnpm -C server run openapi:build      # openapi-spec.ts -> openapi.json
node tools/codegen-dart.mjs            # openapi.json -> app/lib/api/openapi/*.dart
```

### Scope (today)

- DATA MODELS only — no API client, no dio code, no DI graph.
  The hand-written `app/lib/features/<x>/data/<x>_api.dart` stays
  untouched; the generated DTOs are an additive drop-in for the
  hand-written freezed models in `app/lib/shared/models/`. The team
  can adopt at their own pace.
- Enum handling: real Dart enums + a `Wire` extension for the
  `(de)serialization` to/from the SCREAMING_SNAKE wire values. So
  `User.status` is typed `UserStatus` (variants `active`/`banned`/`deleted`)
  and the wire form is `'ACTIVE'`/`'BANNED'`/`'DELETED'`.
- Nullable: `nullable: true` → `T?`. The spec is 3.0.3 (no type arrays).
- `format: 'date-time'` → `DateTime`. `format: 'uri'` → `String` (we
  don't wrap in `Uri`; URLs are just strings at the JSON boundary).
- `$ref` → inlined as the named type.
- `array` + `items` → `List<T>`.
- Unknown shapes → `Object?` with a stderr warning so they don't
  get silently dropped.

### Known limitations

- No `oneOf` / `anyOf` (the spec doesn't use them).
- No request body / response wrappers — the DTOs are plain component
  schemas, not envelopes. If the team needs typed request/response
  pairs we can add a second pass that walks `paths` and emits
  `FooRequest` / `FooResponse` named types.
- No `format: 'binary'` / file upload handling.
- `additionalProperties: true` → `Map<String, Object?>` (we don't
  generate a per-shape dynamic accessor).
