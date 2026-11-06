/**
 * Test-only helpers: load the shared example set under packages/core/fixtures/schema-examples.
 * The same set is run through zod, the exported JSON Schema and (when present) the originals
 * outside the repo (指示書 第5.1節, 第11節 M1).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
  "schema-examples",
);

/** Original schema file stem -> key used by `schemas` / `toJsonSchemas()`. */
export const SCHEMA_KEYS = {
  "world-scene": "worldScene",
  interpretation: "interpretation",
  explanation: "explanation",
  safety: "safety",
  "reading-rule": "readingRule",
  "problem-record": "problemRecord",
  "kohai-utterance": "kohaiUtterance",
} as const;

export type SchemaFile = keyof typeof SCHEMA_KEYS;
export type SchemaKey = (typeof SCHEMA_KEYS)[SchemaFile];
export const SCHEMA_FILES = Object.keys(SCHEMA_KEYS) as SchemaFile[];

export interface Example {
  name: string;
  data: unknown;
}

export function loadExamples(file: SchemaFile, kind: "valid" | "invalid"): Example[] {
  const dir = path.join(FIXTURE_ROOT, file, kind);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ name: f.replace(/\.json$/, ""), data: JSON.parse(readFileSync(path.join(dir, f), "utf8")) as unknown }));
}

export function loadExample(file: SchemaFile, kind: "valid" | "invalid", name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURE_ROOT, file, kind, `${name}.json`), "utf8")) as unknown;
}

/** The design folder outside the repo. Tests that need it skip when it is absent (CI). */
export const DESIGN_DIR = process.env["KIMI_DESIGN_DIR"] || path.join("C:/dev", "hackathon-2026", "学習アプリ");

export function originalSchemaPath(file: SchemaFile): string {
  return path.join(DESIGN_DIR, `${file}.schema.json`);
}

/** Element i of a list, failing loudly instead of returning undefined. */
export function at<T>(xs: readonly T[], i: number): T {
  const x = xs[i];
  if (x === undefined) throw new Error(`no element at index ${i}`);
  return x;
}
