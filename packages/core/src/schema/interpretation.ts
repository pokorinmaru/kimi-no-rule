// Interpretation, version 6 (指示書 第5.1節; original: interpretation.schema.json).
// The schema is built from a small set of field schemas so that the per-problem schema
// (per-problem.ts) is the same shape with the id fields narrowed.
import { z } from "zod";
import {
  EVENT_TYPES,
  LANG,
  QUESTION_TARGET_TYPES,
  RELATION_OPERATORS,
  UTTERANCE_LANG,
  rational,
} from "./common.ts";

export interface InterpretationFields<N extends string | null> {
  /** Any id field that names an existing or temporary element. */
  id: z.ZodType<string>;
  /** at_event of add_quantity. */
  atEvent: z.ZodType<string | null>;
  /** new_id of the add_* ops. */
  newId: z.ZodType<N>;
  /** The word_cue variants (one per statement when scoped). */
  wordCue: z.ZodType<WordCueOp>[];
}

const evidence = z.string();
const relationOperator = z.enum(RELATION_OPERATORS);
const eventType = z.enum(EVENT_TYPES);

export function buildInterpretation<N extends string | null>(f: InterpretationFields<N>) {
  const { id, atEvent, newId } = f;
  const variants = [
    z.strictObject({ op: z.literal("set_quantity"), target_id: id, number: rational, evidence }),
    z.strictObject({ op: z.literal("set_relation_amount"), target_id: id, number: rational, evidence }),
    z.strictObject({ op: z.literal("set_event_amount"), target_id: id, number: rational, evidence }),
    z.strictObject({ op: z.literal("set_relation_operator"), target_id: id, operator: relationOperator, evidence }),
    z.strictObject({ op: z.literal("swap_relation_direction"), target_id: id, evidence }),
    z.strictObject({ op: z.literal("set_relation_reference"), target_id: id, reference: id, evidence }),
    z.strictObject({
      op: z.literal("add_relation"),
      new_id: newId,
      operator: relationOperator,
      subject: id,
      reference: id.nullable(),
      reference_list: z.array(id).nullable(),
      number: rational.nullable(),
      evidence,
    }),
    z.strictObject({
      op: z.literal("add_event"),
      new_id: newId,
      event_type: eventType,
      holder: id,
      item_kind: id,
      number: rational.nullable(),
      to_holder: id.nullable(),
      evidence,
    }),
    z.strictObject({ op: z.literal("set_event_type"), target_id: id, event_type: eventType, evidence }),
    z.strictObject({ op: z.literal("set_event_to_holder"), target_id: id, to_holder: id, evidence }),
    z.strictObject({
      op: z.literal("set_question_target"),
      target_id: id,
      question_type: z.enum(QUESTION_TARGET_TYPES),
      evidence,
    }),
    z.strictObject({ op: z.literal("rename_item_kind"), target_id: id, label: z.string(), evidence }),
    z.strictObject({ op: z.literal("add_holder"), new_id: newId, label: z.string(), evidence }),
    z.strictObject({ op: z.literal("add_item_kind"), new_id: newId, label: z.string(), evidence }),
    z.strictObject({
      op: z.literal("add_quantity"),
      new_id: newId,
      holder: id,
      item_kind: id,
      at_event: atEvent,
      number: rational.nullable(),
      evidence,
    }),
    z.strictObject({ op: z.literal("remove_element"), target_id: id, evidence }),
    z.strictObject({ op: z.literal("state_answer"), target_id: id, number: rational, evidence }),
    z.strictObject({
      op: z.literal("state_procedure"),
      target_id: id,
      operands: z.array(z.union([z.strictObject({ quantity_id: id }), rational])).length(2),
      operation: z.enum(["multiply", "divide", "add", "subtract"]),
      evidence,
    }),
    z.strictObject({ op: z.literal("set_unit_value"), target_id: id, number: rational, evidence }),
  ] as const;

  const members: readonly ((typeof variants)[number] | z.ZodType<WordCueOp>)[] = [...variants, ...f.wordCue];
  const op = z.union(members);

  return z.strictObject({
    schema_version: z.literal("6"),
    utterance_lang: z.enum(UTTERANCE_LANG),
    representable: z.enum(["full", "partial", "none"]),
    ops: z.array(op),
    unclear: z.array(id),
    phrases: z.array(z.strictObject({ phrase: z.string(), lang: z.enum(LANG), element_id: id })),
  });
}

export interface WordCueOp {
  op: "word_cue";
  statement_index: number;
  tokens: number[];
  evidence: string;
}

export const baseWordCue: z.ZodType<WordCueOp> = z.strictObject({
  op: z.literal("word_cue"),
  statement_index: z.int(),
  tokens: z.array(z.int()),
  evidence,
});

export const interpretation = buildInterpretation({
  id: z.string(),
  atEvent: z.string().nullable(),
  newId: z.string(),
  wordCue: [baseWordCue],
});

export type Interpretation = z.infer<typeof interpretation>;
export type Op = Interpretation["ops"][number];
