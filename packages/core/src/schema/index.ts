// M1 step (1): schemas (指示書 第5.1節). zod is the source; JSON Schema (draft 2020-12) is exported from it.
import { z } from "zod";
import { explanation } from "./explanation.ts";
import { interpretation } from "./interpretation.ts";
import { kohaiUtterance } from "./kohai-utterance.ts";
import { problemRecord } from "./problem-record.ts";
import { readingRule } from "./reading-rule.ts";
import { safety } from "./safety.ts";
import { worldScene } from "./world-scene.ts";

export const schemas = {
  worldScene,
  interpretation,
  explanation,
  safety,
  readingRule,
  problemRecord,
  kohaiUtterance,
} as const;

export type SchemaName = keyof typeof schemas;
export type JsonSchema = z.core.JSONSchema.JSONSchema;

/** One draft 2020-12 JSON Schema per zod schema, under the same keys. */
export function toJsonSchemas(): Record<SchemaName, JsonSchema> {
  const out = {} as Record<SchemaName, JsonSchema>;
  for (const name of Object.keys(schemas) as SchemaName[]) {
    out[name] = z.toJSONSchema(schemas[name], { target: "draft-2020-12" });
  }
  return out;
}

export { problemScopedSchemas, worldIds, type ProblemScopedSchemas } from "./per-problem.ts";
export {
  validateOps,
  validateWorld,
  type AnyOp,
  type SemanticCode,
  type SemanticError,
  type SemanticResult,
} from "./semantic.ts";
export { PREFIX, TEMP_IDS, type ElementKind, type Rational } from "./common.ts";
export type { WorldScene } from "./world-scene.ts";
export type { Interpretation, Op } from "./interpretation.ts";
export type { Explanation } from "./explanation.ts";
export type { Safety } from "./safety.ts";
export type { ReadingRule, Expr } from "./reading-rule.ts";
export type { ProblemRecord, Statement } from "./problem-record.ts";
export type { KohaiUtterance } from "./kohai-utterance.ts";
