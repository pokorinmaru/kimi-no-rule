// Reading-rule hypotheses, version 2 (指示書 第5.1節; original: reading-rule.schema.json).
// A condition is a recursive expression; z.lazy lets the JSON Schema export break the cycle with $ref.
import { z } from "zod";

export const PREDICATES = [
  "relation_operator_is",
  "ratio_kind_is",
  "problem_type_is",
  "consistency_is",
  "word_in_statement",
  "word_before_ratio",
  "word_after_holder",
  "reference_is",
  "numbers_compare",
  "ratio_is_unit_fraction",
  "true",
] as const;

export type Expr =
  | { op: "and" | "or"; args: Expr[] }
  | { op: "not"; arg: Expr }
  | { pred: (typeof PREDICATES)[number]; args: string[] };

export const expr: z.ZodType<Expr> = z.lazy(() =>
  z.union([
    z.strictObject({ op: z.enum(["and", "or"]), args: z.array(expr).min(2) }),
    z.strictObject({ op: z.literal("not"), arg: expr }),
    z.strictObject({ pred: z.enum(PREDICATES), args: z.array(z.string()) }),
  ]),
);

const REFERENCE_CHOICES = [
  "first_mentioned",
  "second_mentioned",
  "known_value",
  "asked",
  "larger_number",
  "smaller_number",
] as const;

export const action = z.union([
  z.strictObject({
    action: z.literal("choose_reference"),
    by: z.union([
      z.enum(REFERENCE_CHOICES),
      z.strictObject({ holder: z.enum(["before_word", "after_word"]), word: z.string() }),
    ]),
  }),
  z.strictObject({ action: z.literal("swap_reference") }),
  z.strictObject({ action: z.literal("set_relation_type_additive"), amount: z.enum(["numerator", "ratio_value"]) }),
  z.strictObject({
    action: z.literal("number_op"),
    mode: z.enum(["divide_large_by_small", "multiply_always", "divide_always", "percent_as_count"]),
  }),
  z.strictObject({ action: z.literal("invert_ratio") }),
  z.strictObject({ action: z.literal("flip_event") }),
  z.strictObject({ action: z.literal("misread_question"), target: z.literal("other_holder") }),
  z.strictObject({ action: z.literal("no_change") }),
]);

export const wordCueItem = z.union([
  z.enum([
    "operation_by_size",
    "keyword_multiply",
    "keyword_subtract",
    "first_mentioned_as_whole",
    "known_as_whole",
    "additive_reading",
    "none",
  ]),
  z.strictObject({ kind: z.literal("problem_word"), word: z.string() }),
]);

export const hypothesis = z.strictObject({
  id: z.string(),
  origin: z.enum(["math", "japanese_reading", "first_language"]),
  clauses: z.array(z.strictObject({ when: expr, then: action })).min(1),
  word_cues: z.array(wordCueItem),
  note_for_adult: z.string(),
});

export const readingRule = z.strictObject({
  schema_version: z.literal("2"),
  hypotheses: z.array(hypothesis).min(1).max(5),
  unexpressible: z.array(z.strictObject({ note_for_adult: z.string() })),
});

export type ReadingRule = z.infer<typeof readingRule>;
