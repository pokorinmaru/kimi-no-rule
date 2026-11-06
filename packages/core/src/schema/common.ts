// Shared building blocks for the shape schemas (指示書 第5.1節).
// Every object is strict: the exported JSON Schema says additionalProperties: false, so zod must
// reject extra keys too, or the two would disagree.
import { z } from "zod";

/** A rational number {num, den}. Whether den is a positive integer is a meaning check (semantic.ts). */
export const rational = z.strictObject({ num: z.int(), den: z.int() });
export type Rational = z.infer<typeof rational>;

export const LANG = ["ja", "en"] as const;
export const UTTERANCE_LANG = ["ja", "en", "unknown"] as const;
export const RELATION_OPERATORS = [
  "more_by",
  "less_by",
  "times",
  "fraction_of",
  "same_as",
  "total_of",
  "per",
  "other",
] as const;
export const EVENT_TYPES = ["gain", "lose", "move"] as const;
export const QUESTION_TARGET_TYPES = ["quantity", "relation_amount", "event_amount"] as const;

/** Id prefixes of the five element kinds of a world. */
export const PREFIX = {
  holder: "h_",
  item_kind: "k_",
  quantity: "q_",
  relation: "r_",
  event: "e_",
} as const;
export type ElementKind = keyof typeof PREFIX;

/** Temporary ids for elements added inside one utterance. */
export const TEMP_IDS = ["n_1", "n_2", "n_3", "n_4", "n_5"] as const;

/** z.enum needs a non-empty tuple; callers always pass at least TEMP_IDS. */
export function idEnum(ids: readonly string[]): z.ZodType<string> {
  const unique = [...new Set(ids)];
  const [first, ...rest] = unique;
  if (first === undefined) return z.never();
  return z.enum([first, ...rest]);
}
