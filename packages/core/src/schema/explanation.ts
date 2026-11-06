// Child explanation, version 2 (指示書 第5.1節; original: explanation.schema.json).
import { z } from "zod";
import { UTTERANCE_LANG, rational } from "./common.ts";

export function buildExplanation(elementId: z.ZodType<string>) {
  return z.strictObject({
    schema_version: z.literal("2"),
    utterance_lang: z.enum(UTTERANCE_LANG),
    kind: z.enum(["expression", "reason"]),
    tokens: z.array(
      z.strictObject({
        type: z.enum(["number", "operator", "paren_open", "paren_close", "unknown"]),
        number: rational.nullable(),
        operator: z.enum(["+", "-", "*", "/", "="]).nullable(),
      }),
    ),
    answer: rational.nullable(),
    mentioned_elements: z.array(elementId),
    evidence: z.string(),
  });
}

export const explanation = buildExplanation(z.string());
export type Explanation = z.infer<typeof explanation>;
