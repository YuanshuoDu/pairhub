/* eslint-disable no-console -- CLI tool, stdout is the whole point */
/**
 * Generate Dart DTOs from the v1 OpenAPI spec.
 *
 * Source:   docs/api/openapi.json   (produced by the server's openapi:build)
 * Target:   app/lib/api/openapi/    (one file per component schema + a barrel)
 *
 * Scope: DATA MODELS ONLY. We intentionally do not generate an API client
 * (the app already has hand-written dio-based clients in
 * app/lib/features/<x>/data/<x>_api.dart). The generated DTOs are
 * intended to be drop-in for the hand-written freezed models in
 * app/lib/shared/models/ — the team can adopt at their own pace.
 *
 * Supported schema features:
 *   - object with required[] and properties{}
 *   - string, integer, number, boolean primitives
 *   - string with enum -> real Dart enum + a Wire extension for (de)serialization
 *   - format: 'date-time' -> DateTime (DateTime.parse / toIso8601String)
 *   - format: 'uri'      -> String (we don't wrap in Uri; URLs are just strings
 *                           at the JSON boundary)
 *   - nullable: true -> T?  (the spec is 3.0.3 - no type arrays)
 *   - array + items -> List<T>
 *   - $ref to another component schema -> inlined as the named type
 *
 * Anything we don't know how to translate becomes Object? with a
 * stderr warning so it doesn't get silently dropped.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const specPath = resolve(repoRoot, 'docs', 'api', 'openapi.json');
const outDir = resolve(repoRoot, 'app', 'lib', 'api', 'openapi');

const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const schemas = spec.components?.schemas ?? {};

// ---------------------------------------------------------------------------
// Type translation
// ---------------------------------------------------------------------------

/**
 * Convert an OpenAPI 3.0 property descriptor into a Dart type string.
 * `prop` is one entry of `properties`; `parentName` + `propName` are
 * used only for diagnostic messages.
 */
function dartType(prop, parentName, propName) {
  // $ref: resolve to the named schema.
  if (prop.$ref) {
    return refName(prop.$ref);
  }

  // nullable is its own flag in 3.0.x; wrap the result in `?` below.
  const nullable = prop.nullable === true;

  // oneOf / anyOf: we don't generate a union today. The spec doesn't
  // use either, so this is just defensive.
  if (prop.oneOf || prop.anyOf) {
    warn(parentName, propName, 'oneOf/anyOf not supported; emitting Object?');
    return wrap('Object?', nullable);
  }

  switch (prop.type) {
    case 'string': {
      if (Array.isArray(prop.enum)) {
        // Returned as the enum name; the actual Dart enum is generated
        // in pass 2 by emitEnumClass().
        return wrap(propNameToEnumName(parentName, propName), nullable);
      }
      if (prop.format === 'date-time') return wrap('DateTime', nullable);
      return wrap('String', nullable);
    }
    case 'integer':
      return wrap('int', nullable);
    case 'number':
      return wrap('double', nullable);
    case 'boolean':
      return wrap('bool', nullable);
    case 'array': {
      const inner = prop.items
        ? dartType(prop.items, parentName, propName)
        : 'Object?';
      return wrap(`List<${inner}>`, nullable);
    }
    case 'object': {
      // Inline anonymous object — we don't generate a type for these.
      // In practice the spec doesn't use this; if it ever does, the
      // team can opt in by promoting to a named component.
      return wrap('Map<String, Object?>', nullable);
    }
    default:
      warn(parentName, propName, `unknown type "${prop.type}"; emitting Object?`);
      return wrap('Object?', nullable);
  }
}

function wrap(t, nullable) {
  return nullable ? `${t}?` : t;
}

function refName(ref) {
  // "#/components/schemas/Foo" -> "Foo"
  const m = ref.match(/^#\/components\/schemas\/(.+)$/);
  if (!m) throw new Error(`unhandled $ref: ${ref}`);
  return m[1];
}

function propNameToEnumName(parentName, propName) {
  // Foo.bar → FooBar (Dart enum names are PascalCase).
  return parentName + propName.charAt(0).toUpperCase() + propName.slice(1);
}

function warn(parent, prop, msg) {
  console.warn(`[warn] ${parent}.${prop}: ${msg}`);
}

// ---------------------------------------------------------------------------
// Class emission
// ---------------------------------------------------------------------------

function emitModelClass(name, schema) {
  const required = new Set(schema.required ?? []);
  const props = schema.properties ?? {};

  const lines = [];
  lines.push(`// GENERATED from docs/api/openapi.json by tools/codegen-dart.mjs.`);
  lines.push(`// Do not edit by hand — re-run \`pnpm run openapi:codegen\` after spec changes.`);
  lines.push(``);

  // Imports: any $ref'd schemas.
  const imports = new Set();
  for (const [pname, prop] of Object.entries(props)) {
    if (prop.$ref) imports.add(refName(prop.$ref));
  }
  if (imports.size) {
    for (const i of [...imports].sort()) {
      lines.push(`import '${kebab(i)}.dart';`);
    }
    lines.push(``);
  }

  // Per-property enums (real Dart enums + Wire extensions).
  for (const [pname, prop] of Object.entries(props)) {
    if (prop.type === 'string' && Array.isArray(prop.enum)) {
      lines.push(...emitEnumClass(propNameToEnumName(name, pname), prop.enum, prop.description));
      lines.push(``);
    }
  }

  // The model class itself.
  lines.push(`class ${name} {`);
  // Constructor.
  const ctorParams = Object.entries(props)
    .map(([pname, prop]) => {
      const t = dartType(prop, name, pname);
      const req = required.has(pname);
      return `${req ? 'required ' : 'this.'}${pname}${req ? '' : ' = ' + defaultFor(t)},`;
    });
  if (ctorParams.length) {
    lines.push(`  const ${name}({\n    ${ctorParams.join('\n    ')}\n  });`);
  } else {
    lines.push(`  const ${name}();`);
  }
  lines.push(``);

  // Fields.
  for (const [pname, prop] of Object.entries(props)) {
    lines.push(`  final ${dartType(prop, name, pname)} ${pname};`);
  }
  lines.push(``);

  // fromJson factory.
  lines.push(`  factory ${name}.fromJson(Map<String, dynamic> json) => ${name}(`);
  for (const [pname, prop] of Object.entries(props)) {
    const t = dartType(prop, name, pname);
    const expr = jsonParseExpr(prop, `json['${pname}']`, name, pname);
    if (required.has(pname)) {
      lines.push(`    ${pname}: ${expr},`);
    } else {
      lines.push(`    ${pname}: ${expr},`);
    }
  }
  lines.push(`  );`);
  lines.push(``);

  // toJson method.
  lines.push(`  Map<String, dynamic> toJson() => {`);
  for (const [pname, prop] of Object.entries(props)) {
    const t = dartType(prop, name, pname);
    const expr = jsonEmitExpr(prop, pname, t);
    lines.push(`    ${expr},`);
  }
  lines.push(`  };`);
  lines.push(`}`);
  lines.push(``);

  return lines.join('\n');
}

function defaultFor(t) {
  if (t.endsWith('?')) return 'null';
  if (t === 'int' || t === 'double') return '0';
  if (t === 'bool') return 'false';
  if (t === 'String') return "''";
  if (t === 'DateTime') return 'DateTime.fromMillisecondsSinceEpoch(0)';
  if (t.startsWith('List<')) return 'const []';
  if (t === 'Map<String, Object?>') return 'const {}';
  return 'null';
}

function jsonParseExpr(prop, accessor, parent, pname) {
  const nullable = prop.nullable === true;
  if (prop.$ref) {
    return `${refName(prop.$ref)}.fromJson(${accessor} as Map<String, dynamic>)`;
  }
  if (prop.type === 'string' && Array.isArray(prop.enum)) {
    const enumName = propNameToEnumName(parent, pname);
    return nullable
      ? `(${accessor} == null ? null : ${enumName}Wire.fromWire(${accessor} as String))`
      : `${enumName}Wire.fromWire(${accessor} as String)`;
  }
  if (prop.type === 'string' && prop.format === 'date-time') {
    return nullable
      ? `(${accessor} == null ? null : DateTime.parse(${accessor} as String))`
      : `DateTime.parse(${accessor} as String)`;
  }
  if (prop.type === 'array') {
    return nullable
      ? `(${accessor} == null ? null : (${accessor} as List<dynamic>).map(${arrayMapFn(prop, parent, pname)}).toList())`
      : `(${accessor} as List<dynamic>).map(${arrayMapFn(prop, parent, pname)}).toList()`;
  }
  if (nullable) return `(${accessor} == null ? null : ${accessor} as ${stripNullable(prop)})`;
  return `${accessor} as ${stripNullable(prop)}`;
}

function arrayMapFn(prop, parent, pname) {
  const inner = prop.items;
  if (!inner) return '(e) => e as Object?';
  if (inner.$ref) {
    return `(e) => ${refName(inner.$ref)}.fromJson(e as Map<String, dynamic>)`;
  }
  if (inner.type === 'string' && Array.isArray(inner.enum)) {
    const enumName = propNameToEnumName(parent, pname);
    return `(e) => ${enumName}Wire.fromWire(e as String)`;
  }
  if (inner.type === 'string' && inner.format === 'date-time') {
    return '(e) => DateTime.parse(e as String)';
  }
  return `(e) => e as ${stripNullable(inner)}`;
}

function stripNullable(prop) {
  switch (prop.type) {
    case 'string': return 'String';
    case 'integer': return 'int';
    case 'number': return 'double';
    case 'boolean': return 'bool';
    case 'array': return 'List';
    case 'object': return 'Map<String, Object?>';
    default: return 'Object?';
  }
}

function jsonEmitExpr(prop, pname, dartT) {
  const accessor = pname;
  if (prop.$ref) {
    return `'${pname}': ${accessor}.toJson()`;
  }
  if (prop.type === 'string' && Array.isArray(prop.enum)) {
    return prop.nullable
      ? `'${pname}': ${accessor}?.wire`
      : `'${pname}': ${accessor}.wire`;
  }
  if (prop.type === 'string' && prop.format === 'date-time') {
    return prop.nullable
      ? `'${pname}': ${accessor}?.toIso8601String()`
      : `'${pname}': ${accessor}.toIso8601String()`;
  }
  if (prop.nullable) {
    return `'${pname}': ${accessor}`;
  }
  return `'${pname}': ${accessor}`;
}

// ---------------------------------------------------------------------------
// Enum emission
// ---------------------------------------------------------------------------

function emitEnumClass(name, values, description) {
  const lines = [];
  // Dart identifier conversion: SCREAMING_SNAKE → lowerCamelCase.
  // 'USER' → user, 'CANCELED' → canceled, etc. (Dart 3 allows all-caps
  // enum values but the convention is lowerCamelCase.)
  const variants = values.map((v) => ({
    wire: v,
    dart: snakeToCamel(v, /* upperFirst */ false),
  }));
  // First variant must not collide with the enum class name.
  // E.g. enum `UserStatus` cannot have a variant `userStatus`.
  const reserved = new Set([name]);
  for (const v of variants) {
    if (reserved.has(v.dart)) {
      warn(`enum ${name}`, v.wire, `variant ${v.dart} collides with enum name; using _${v.dart}`);
      v.dart = '_' + v.dart;
    }
  }

  if (description) {
    lines.push(`/// ${description}`);
  }
  lines.push(`enum ${name} {`);
  for (const v of variants) {
    lines.push(`  ${v.dart},`);
  }
  lines.push(`}`);
  lines.push(``);
  lines.push(`extension ${name}Wire on ${name} {`);
  lines.push(`  String get wire {`);
  lines.push(`    switch (this) {`);
  for (const v of variants) {
    lines.push(`      case ${name}.${v.dart}: return '${v.wire}';`);
  }
  lines.push(`    }`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  static ${name} fromWire(String wire) {`);
  lines.push(`    switch (wire) {`);
  for (const v of variants) {
    lines.push(`      case '${v.wire}': return ${name}.${v.dart};`);
  }
  lines.push(`      default: throw ArgumentError.value(wire, 'wire', 'unknown ${name} value');`);
  lines.push(`    }`);
  lines.push(`  }`);
  lines.push(`}`);
  return lines;
}

function snakeToCamel(s, upperFirst) {
  const parts = s.toLowerCase().split('_');
  return parts
    .map((p, i) => (i === 0 && !upperFirst ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join('');
}

// ---------------------------------------------------------------------------
// File naming
// ---------------------------------------------------------------------------

function kebab(s) {
  // "ActivityType" -> "activity_type" (we map PascalCase to snake_case
  // to match the Dart convention; the import in Dart uses the same).
  return s.replace(/([A-Z])/g, (_, c, i) => (i === 0 ? c.toLowerCase() : '_' + c.toLowerCase()));
}

function toSnakeCase(s) {
  return s.replace(/([A-Z])/g, (_, c, i) => (i === 0 ? c.toLowerCase() : '_' + c.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

mkdirSync(outDir, { recursive: true });

const fileNames = [];
for (const [name, schema] of Object.entries(schemas)) {
  // Skip if it's not an object with properties (e.g. bare string alias).
  if (schema.type !== 'object' || !schema.properties) {
    console.warn(`[skip] ${name}: not an object schema (type=${schema.type})`);
    continue;
  }
  const dart = emitModelClass(name, schema);
  const file = resolve(outDir, `${toSnakeCase(name)}.dart`);
  writeFileSync(file, dart, 'utf8');
  fileNames.push(name);
  console.log(`[dart] wrote ${file}`);
}

// Barrel: re-exports all generated types so consumers can
//   `import 'package:studybuddy_app/api/openapi/openapi.dart';`
//   and pull in everything.
const barrel = [
  `// GENERATED barrel for the openapi codegen.`,
  `// Do not edit by hand.`,
  ``,
  ...fileNames.sort().map((n) => `export '${toSnakeCase(n)}.dart';`),
  ``,
].join('\n');
const barrelFile = resolve(outDir, 'openapi.dart');
writeFileSync(barrelFile, barrel, 'utf8');
console.log(`[dart] wrote ${barrelFile}`);

console.log(`[dart] generated ${fileNames.length} file(s) + barrel in ${outDir}`);
