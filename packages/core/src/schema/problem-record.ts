// Problem record, version 1 (指示書 第5.1節; original: problem-record.schema.json).
// `world` is checked as a full world-scene here (the original only asks for an object).
import { z } from "zod";
import { rational } from "./common.ts";
import { worldScene } from "./world-scene.ts";

export const statement = z.strictObject({
  index: z.int(),
  text: z.string(),
  element_ids: z.array(z.string()),
  is_question: z.boolean(),
  speaker_holder_id: z.string().nullable(),
  tokens: z.array(z.string()),
});

export const syntaxMark = z.strictObject({
  kind: z.enum([
    "demonstrative",
    "relation_word",
    "ratio_notation",
    "holder_mention",
    "unit_word",
    "sentence_pattern",
  ]),
  statement_index: z.int(),
  token_start: z.int(),
  token_end: z.int(),
  element_id: z.string().nullable(),
  word: z.string(),
  ratio_kind: z.array(z.enum(["gt1", "lt1", "fraction", "decimal", "percent"])).nullable(),
  l1_pattern_id: z.string().nullable(),
  native_checked: z.boolean().nullable(),
});

export const problemRecord = z.strictObject({
  schema_version: z.literal("1"),
  world: worldScene,
  consistency: z.enum(["consistent", "inconsistent"]),
  pair_id: z.string().nullable(),
  source: z.enum(["prepared", "discriminating_bank", "research", "companion", "try"]),
  checks: z.strictObject({
    double_build_match: z.boolean(),
    restate_match: z.boolean(),
    misread_pass_rate: z.number().nullable(),
    human_checked: z.boolean(),
  }),
  expected_answer: rational.nullable(),
  statements: z.array(statement),
  syntax_marks: z.array(syntaxMark),
  companion_ids: z.array(z.string()),
});

export type ProblemRecord = z.infer<typeof problemRecord>;
export type Statement = z.infer<typeof statement>;
