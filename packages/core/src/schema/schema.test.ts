// Shape validation: zod is the source, JSON Schema is exported from it, and the originals outside
// the repo must give the same verdict on a shared example set (指示書 第5.1節, 第11節 M1 first line).
import { existsSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import fc from "fast-check";
import { Ajv } from "ajv";
import { Ajv2019 } from "ajv/dist/2019";
import { Ajv2020 } from "ajv/dist/2020";
import { schemas, toJsonSchemas } from "./index.ts";
import {
  SCHEMA_FILES,
  SCHEMA_KEYS,
  loadExamples,
  originalSchemaPath,
  type SchemaFile,
  type SchemaKey,
} from "./test-fixtures.ts";

type Check = (data: unknown) => boolean;

/** Pick the ajv dialect from the schema's own $schema (the originals are read at test time). */
function compileFor(schema: Record<string, unknown>): Check {
  const dialect = typeof schema["$schema"] === "string" ? schema["$schema"] : "";
  const opts = { strict: false, allErrors: true };
  const ajv = dialect.includes("2020-12")
    ? new Ajv2020(opts)
    : dialect.includes("2019-09")
      ? new Ajv2019(opts)
      : dialect === "" || /draft-0[67]/.test(dialect)
        ? new Ajv(opts)
        : undefined;
  if (!ajv) throw new Error(`no ajv dialect for $schema ${dialect}`);
  const validate = ajv.compile(schema);
  return (data) => validate(data) === true;
}

function zodCheck(key: SchemaKey): Check {
  const schema = schemas[key] as { safeParse: (d: unknown) => { success: boolean } };
  return (data) => schema.safeParse(data).success;
}

const exported = new Map<SchemaKey, Check>();
beforeAll(() => {
  const all = toJsonSchemas() as Record<SchemaKey, Record<string, unknown>>;
  for (const file of SCHEMA_FILES) {
    const key = SCHEMA_KEYS[file];
    exported.set(key, new Ajv2020({ strict: false }).compile(all[key]) as unknown as Check);
  }
});
const jsonCheck = (key: SchemaKey): Check => (data) => exported.get(key)?.(data) === true;

describe("shared example set", () => {
  it.each(SCHEMA_FILES)("%s has at least 5 valid and 8 invalid examples", (file) => {
    expect(loadExamples(file, "valid").length).toBeGreaterThanOrEqual(5);
    expect(loadExamples(file, "invalid").length).toBeGreaterThanOrEqual(8);
  });

  it("world-scene valid examples cover every problem type used in M1", () => {
    const types = new Set(
      loadExamples("world-scene", "valid").map((e) => (e.data as { problem_type: string }).problem_type),
    );
    for (const t of ["compare", "change", "combine", "ratio", "rate"]) expect(types).toContain(t);
  });
});

describe("toJsonSchemas", () => {
  it("returns one JSON Schema per zod schema, under the same keys", () => {
    const all = toJsonSchemas() as Record<string, unknown>;
    expect(Object.keys(all).sort()).toEqual(Object.keys(schemas).sort());
    expect(Object.keys(all).sort()).toEqual([...Object.values(SCHEMA_KEYS)].sort());
  });

  it.each(SCHEMA_FILES)("%s is a draft 2020-12 schema that ajv compiles", (file) => {
    const s = (toJsonSchemas() as Record<SchemaKey, Record<string, unknown>>)[SCHEMA_KEYS[file]];
    expect(s["$schema"]).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(() => new Ajv2020({ strict: false }).compile(s)).not.toThrow();
  });
});

for (const file of SCHEMA_FILES) {
  const key = SCHEMA_KEYS[file];
  const valid = loadExamples(file, "valid");
  const invalid = loadExamples(file, "invalid");

  describe(`${file}: zod and the exported JSON Schema agree on the example set`, () => {
    it.each(valid.map((e) => [e.name, e.data] as const))("zod accepts valid/%s", (_n, data) => {
      expect(zodCheck(key)(data)).toBe(true);
    });
    it.each(valid.map((e) => [e.name, e.data] as const))("exported JSON Schema accepts valid/%s", (_n, data) => {
      expect(jsonCheck(key)(data)).toBe(true);
    });
    it.each(invalid.map((e) => [e.name, e.data] as const))("zod rejects invalid/%s", (_n, data) => {
      expect(zodCheck(key)(data)).toBe(false);
    });
    it.each(invalid.map((e) => [e.name, e.data] as const))("exported JSON Schema rejects invalid/%s", (_n, data) => {
      expect(jsonCheck(key)(data)).toBe(false);
    });
  });
}

// ---- random edits of valid examples: every validator must still give the same verdict ----

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Path = (string | number)[];

function pathsOf(node: Json, prefix: Path = []): Path[] {
  const out: Path[] = [prefix];
  if (Array.isArray(node)) node.forEach((c, i) => out.push(...pathsOf(c, [...prefix, i])));
  else if (node !== null && typeof node === "object")
    for (const [k, c] of Object.entries(node)) out.push(...pathsOf(c, [...prefix, k]));
  return out;
}

const leaf: fc.Arbitrary<Json> = fc.oneof(
  fc.constant(null),
  fc.boolean(),
  fc.integer({ min: -50, max: 50 }),
  fc.double({ min: -50, max: 50, noNaN: true, noDefaultInfinity: true }),
  fc.constantFrom("", "x", "none", "ja", "q_a", "h_b", "n_1", "3", "more_by", "gain", "read"),
  fc.string({ maxLength: 12 }),
);
const anyJson: fc.Arbitrary<Json> = fc.oneof(
  leaf,
  fc.array(leaf, { maxLength: 3 }),
  // Parsed JSON never has an object without a prototype; fast-check makes some by default, and zod throws on them
  // instead of refusing them, which failed this test now and then (2026-11-08).
  fc.dictionary(fc.stringMatching(/^[a-z_]{1,8}$/), leaf, { maxKeys: 3, noNullPrototype: true }),
  fc.constant({ num: 1, den: 1 }),
);

describe("the random edits", () => {
  it("are plain JSON: no object without a prototype", () => {
    fc.assert(
      fc.property(anyJson, (v) => {
        if (typeof v === "object" && v !== null && !Array.isArray(v)) expect(Object.getPrototypeOf(v)).toBe(Object.prototype);
      }),
      { numRuns: 2000 },
    );
  });
});

interface Edit {
  pick: number;
  mode: "delete" | "replace" | "add";
  key: string;
  value: Json;
}
const editArb: fc.Arbitrary<Edit> = fc.record({
  pick: fc.nat(),
  mode: fc.constantFrom("delete" as const, "replace" as const, "add" as const),
  key: fc.stringMatching(/^[a-z_]{1,8}$/),
  value: anyJson,
});

function applyEdit(doc: Json, edit: Edit, skip: (p: Path) => boolean = () => false): Json {
  const copy = structuredClone(doc);
  const paths = pathsOf(copy).filter((p) => !skip(p));
  const target = paths[edit.pick % paths.length] ?? [];
  if (target.length === 0) return edit.mode === "replace" ? edit.value : copy;
  let parent: Json = copy;
  for (const step of target.slice(0, -1)) parent = (parent as Record<string | number, Json>)[step] as Json;
  const last = target[target.length - 1] as string | number;
  const node = (parent as Record<string | number, Json>)[last] as Json;
  if (edit.mode === "delete") {
    if (Array.isArray(parent)) parent.splice(last as number, 1);
    else Reflect.deleteProperty(parent as Record<string, Json>, last);
  } else if (edit.mode === "add" && node !== null && typeof node === "object" && !Array.isArray(node)) {
    node[edit.key] = edit.value;
  } else {
    (parent as Record<string | number, Json>)[last] = edit.value;
  }
  return copy;
}

describe("property: zod and the exported JSON Schema agree on random edits", () => {
  it.each(SCHEMA_FILES)("%s", (file) => {
    const key = SCHEMA_KEYS[file];
    const bases = loadExamples(file, "valid").map((e) => e.data as Json);
    fc.assert(
      fc.property(fc.nat(), fc.array(editArb, { minLength: 1, maxLength: 3 }), (b, edits) => {
        const doc = edits.reduce((d, e) => applyEdit(d, e), bases[b % bases.length] as Json);
        expect(zodCheck(key)(doc)).toBe(jsonCheck(key)(doc));
      }),
      { numRuns: 300 },
    );
  });
});

// ---- the originals outside the repo (developer machine only; skipped in CI) ----

const haveOriginals = SCHEMA_FILES.every((f) => existsSync(originalSchemaPath(f)));

function loadOriginal(file: SchemaFile): Check {
  return compileFor(JSON.parse(readFileSync(originalSchemaPath(file), "utf8")) as Record<string, unknown>);
}

describe.skipIf(!haveOriginals)("the originals give the same verdict as zod", () => {
  for (const file of SCHEMA_FILES) {
    const key = SCHEMA_KEYS[file];
    const examples = [
      ...loadExamples(file, "valid").map((e) => [`valid/${e.name}`, e.data] as const),
      ...loadExamples(file, "invalid").map((e) => [`invalid/${e.name}`, e.data] as const),
    ];

    it.each(examples)(`${file}: %s`, (name, data) => {
      const original = loadOriginal(file);
      expect(original(data)).toBe(name.startsWith("valid/"));
      expect(zodCheck(key)(data)).toBe(original(data));
    });

    it(`${file}: property, random edits of valid examples`, () => {
      const original = loadOriginal(file);
      const bases = loadExamples(file, "valid").map((e) => e.data as Json);
      // The original problem-record only says `world` is an object; zod nests world-scene there
      // (指示書 第5.1節), so edits inside `world` are compared by the world-scene property instead.
      const skip = (p: Path): boolean => file === "problem-record" && p[0] === "world";
      fc.assert(
        fc.property(fc.nat(), fc.array(editArb, { minLength: 1, maxLength: 3 }), (b, edits) => {
          const doc = edits
            .filter((e) => !(file === "problem-record" && e.key === "world"))
            .reduce((d, e) => applyEdit(d, e, skip), bases[b % bases.length] as Json);
          expect(zodCheck(key)(doc)).toBe(original(doc));
        }),
        { numRuns: 300 },
      );
    });
  }
});

describe("problem-record nests a world-scene", () => {
  it("rejects a record whose world is an object but not a valid world-scene", () => {
    const [first] = loadExamples("problem-record", "valid");
    const record = structuredClone(first?.data) as { world: Record<string, unknown> };
    record.world = { ...record.world, problem_type: "division" };
    expect(zodCheck("problemRecord")(record)).toBe(false);
  });
});
