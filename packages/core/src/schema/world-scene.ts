// World-scene, version 3 (指示書 第5.1節; original: world-scene.schema.json).
import { z } from "zod";
import { EVENT_TYPES, LANG, QUESTION_TARGET_TYPES, RELATION_OPERATORS, rational } from "./common.ts";

export const holder = z.strictObject({ id: z.string(), label: z.string() });

export const itemKind = z.strictObject({
  id: z.string(),
  noun: z.string(),
  counter: z.string(),
  asset_key: z.string().nullable(),
  countable: z.boolean(),
});

export const quantity = z.strictObject({
  id: z.string(),
  holder: z.string(),
  item_kind: z.string(),
  at_event: z.string().nullable(),
  value: rational.nullable(),
});

export const relation = z.strictObject({
  id: z.string(),
  operator: z.enum(RELATION_OPERATORS),
  subject: z.string(),
  reference: z.string().nullable(),
  reference_list: z.array(z.string()).nullable(),
  amount: rational.nullable(),
  other_description: z.string().nullable(),
});

export const worldEvent = z.strictObject({
  id: z.string(),
  order: z.int(),
  type: z.enum(EVENT_TYPES),
  holder: z.string(),
  item_kind: z.string(),
  amount: rational.nullable(),
  to_holder: z.string().nullable(),
});

export const question = z.strictObject({
  target_type: z.enum(QUESTION_TARGET_TYPES),
  target_id: z.string(),
});

export const wordLink = z.strictObject({
  phrase: z.string(),
  lang: z.enum(LANG),
  element_id: z.string(),
});

export const worldScene = z.strictObject({
  schema_version: z.literal("3"),
  problem_id: z.string(),
  problem_type: z.enum(["compare", "change", "combine", "ratio", "rate", "other"]),
  problem_text: z.string(),
  grade: z.int(),
  problem_lang: z.enum(LANG),
  holders: z.array(holder),
  item_kinds: z.array(itemKind),
  quantities: z.array(quantity),
  relations: z.array(relation),
  events: z.array(worldEvent),
  question,
  word_links: z.array(wordLink),
});

export type WorldScene = z.infer<typeof worldScene>;
