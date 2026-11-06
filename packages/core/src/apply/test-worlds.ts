// Test-only worlds and op builders for the apply tests (指示書 第5.3節, fields per op from 第5.1節).
// Every world here passes schemas.worldScene and validateWorld (checked in apply.test.ts).
import type { AnyOp, Interpretation, Rational, WorldScene } from "../schema/index.ts";

type Relation = WorldScene["relations"][number];
type WorldEvent = WorldScene["events"][number];
type Operator = Relation["operator"];
type EventType = WorldEvent["type"];
type QuestionType = WorldScene["question"]["target_type"];
type Phrase = Interpretation["phrases"][number];

/** A rational in the schema form. */
export const num = (n: number, d = 1): Rational => ({ num: n, den: d });

/**
 * Three holders, two item kinds, one event.
 *   q_a = 5 and q_c = 2 are given; q_b is asked (solves to 8); q_c2 is the count of c after e_1 (6);
 *   q_d = 1 is of another kind.
 *   r_1: q_b = q_a + 3, r_2: q_c = q_a - 3, r_4: q_b = q_c + 6. All three hold in this world.
 */
const W: WorldScene = {
  schema_version: "3",
  problem_id: "p_apply_test",
  problem_type: "compare",
  problem_text: "",
  grade: 3,
  problem_lang: "ja",
  holders: [
    { id: "h_a", label: "a" },
    { id: "h_b", label: "b" },
    { id: "h_c", label: "c" },
  ],
  item_kinds: [
    { id: "k_thing", noun: "thing", counter: "", asset_key: null, countable: true },
    { id: "k_other", noun: "other", counter: "", asset_key: null, countable: false },
  ],
  quantities: [
    { id: "q_a", holder: "h_a", item_kind: "k_thing", at_event: null, value: num(5) },
    { id: "q_b", holder: "h_b", item_kind: "k_thing", at_event: null, value: null },
    { id: "q_c", holder: "h_c", item_kind: "k_thing", at_event: null, value: num(2) },
    { id: "q_c2", holder: "h_c", item_kind: "k_thing", at_event: "e_1", value: null },
    { id: "q_d", holder: "h_a", item_kind: "k_other", at_event: null, value: num(1) },
  ],
  relations: [
    { id: "r_1", operator: "more_by", subject: "q_b", reference: "q_a", reference_list: null, amount: num(3), other_description: null },
    { id: "r_2", operator: "less_by", subject: "q_c", reference: "q_a", reference_list: null, amount: num(3), other_description: null },
    { id: "r_4", operator: "more_by", subject: "q_b", reference: "q_c", reference_list: null, amount: num(6), other_description: null },
  ],
  events: [{ id: "e_1", order: 1, type: "gain", holder: "h_c", item_kind: "k_thing", amount: num(4), to_holder: null }],
  question: { target_type: "quantity", target_id: "q_b" },
  word_links: [
    { phrase: "a", lang: "ja", element_id: "h_a" },
    { phrase: "more", lang: "ja", element_id: "r_1" },
    { phrase: "gets", lang: "ja", element_id: "e_1" },
  ],
};

/** A fresh copy of the main test world. */
export function worldW(): WorldScene {
  return structuredClone(W);
}

/** The main world, but the asked quantity already carries its answer (8). */
export function worldWithStoredAnswer(): WorldScene {
  const w = worldW();
  w.quantities = w.quantities.map((q) => (q.id === "q_b" ? { ...q, value: num(8) } : q));
  return w;
}

/** The main world without q_c2, so nothing is counted at e_1. */
export function worldWithoutLaterCount(): WorldScene {
  const w = worldW();
  w.quantities = w.quantities.filter((q) => q.id !== "q_c2");
  return w;
}

/** The main world with a quantity whose id is already q_new1. */
export function worldWithTakenId(): WorldScene {
  const w = worldW();
  w.quantities.push({ id: "q_new1", holder: "h_b", item_kind: "k_other", at_event: null, value: num(7) });
  return w;
}

/** A total: q_t = q_x + q_y, with q_x = 2, q_y = 3, q_t asked. */
export function totalWorld(): WorldScene {
  return {
    schema_version: "3",
    problem_id: "p_apply_total",
    problem_type: "combine",
    problem_text: "",
    grade: 2,
    problem_lang: "ja",
    holders: [
      { id: "h_x", label: "x" },
      { id: "h_y", label: "y" },
      { id: "h_t", label: "t" },
    ],
    item_kinds: [{ id: "k_thing", noun: "thing", counter: "", asset_key: null, countable: true }],
    quantities: [
      { id: "q_x", holder: "h_x", item_kind: "k_thing", at_event: null, value: num(2) },
      { id: "q_y", holder: "h_y", item_kind: "k_thing", at_event: null, value: num(3) },
      { id: "q_t", holder: "h_t", item_kind: "k_thing", at_event: null, value: null },
    ],
    relations: [
      { id: "r_t", operator: "total_of", subject: "q_t", reference: null, reference_list: ["q_x", "q_y"], amount: null, other_description: null },
    ],
    events: [],
    question: { target_type: "quantity", target_id: "q_t" },
    word_links: [],
  };
}

/** b = a + d, with a given and b asked. Built from the answer a + d. */
export function differenceWorld(a: number, d: number): WorldScene {
  return {
    schema_version: "3",
    problem_id: "p_apply_difference",
    problem_type: "compare",
    problem_text: "",
    grade: 2,
    problem_lang: "ja",
    holders: [
      { id: "h_a", label: "a" },
      { id: "h_b", label: "b" },
    ],
    item_kinds: [{ id: "k_thing", noun: "thing", counter: "", asset_key: null, countable: true }],
    quantities: [
      { id: "q_a", holder: "h_a", item_kind: "k_thing", at_event: null, value: num(a) },
      { id: "q_b", holder: "h_b", item_kind: "k_thing", at_event: null, value: null },
    ],
    relations: [
      { id: "r_1", operator: "more_by", subject: "q_b", reference: "q_a", reference_list: null, amount: num(d), other_description: null },
    ],
    events: [],
    question: { target_type: "quantity", target_id: "q_b" },
    word_links: [],
  };
}

export const phrase = (element_id: string): Phrase => ({ phrase: "x", lang: "ja", element_id });

const E = "";
type Operand = { quantity_id: string } | Rational;
type Operation = "multiply" | "divide" | "add" | "subtract";

/** One builder per op, with the fields of 指示書 第5.1節. */
export const op = {
  setQuantity: (target_id: string, number: Rational): AnyOp => ({ op: "set_quantity", target_id, number, evidence: E }),
  setRelationAmount: (target_id: string, number: Rational): AnyOp => ({ op: "set_relation_amount", target_id, number, evidence: E }),
  setEventAmount: (target_id: string, number: Rational): AnyOp => ({ op: "set_event_amount", target_id, number, evidence: E }),
  setRelationOperator: (target_id: string, operator: Operator): AnyOp => ({ op: "set_relation_operator", target_id, operator, evidence: E }),
  swap: (target_id: string): AnyOp => ({ op: "swap_relation_direction", target_id, evidence: E }),
  setReference: (target_id: string, reference: string): AnyOp => ({ op: "set_relation_reference", target_id, reference, evidence: E }),
  setUnitValue: (target_id: string, number: Rational): AnyOp => ({ op: "set_unit_value", target_id, number, evidence: E }),
  addRelation: (
    new_id: string | null,
    operator: Operator,
    subject: string,
    reference: string | null,
    number: Rational | null,
    reference_list: string[] | null = null,
  ): AnyOp => ({ op: "add_relation", new_id, operator, subject, reference, reference_list, number, evidence: E }),
  addEvent: (
    new_id: string | null,
    event_type: EventType,
    holder: string,
    item_kind: string,
    number: Rational | null,
    to_holder: string | null = null,
  ): AnyOp => ({ op: "add_event", new_id, event_type, holder, item_kind, number, to_holder, evidence: E }),
  setEventType: (target_id: string, event_type: EventType): AnyOp => ({ op: "set_event_type", target_id, event_type, evidence: E }),
  setEventToHolder: (target_id: string, to_holder: string): AnyOp => ({ op: "set_event_to_holder", target_id, to_holder, evidence: E }),
  setQuestionTarget: (target_id: string, question_type: QuestionType): AnyOp => ({
    op: "set_question_target",
    target_id,
    question_type,
    evidence: E,
  }),
  renameItemKind: (target_id: string, label: string): AnyOp => ({ op: "rename_item_kind", target_id, label, evidence: E }),
  addHolder: (new_id: string | null, label: string): AnyOp => ({ op: "add_holder", new_id, label, evidence: E }),
  addItemKind: (new_id: string | null, label: string): AnyOp => ({ op: "add_item_kind", new_id, label, evidence: E }),
  addQuantity: (
    new_id: string | null,
    holder: string,
    item_kind: string,
    at_event: string | null,
    number: Rational | null,
  ): AnyOp => ({ op: "add_quantity", new_id, holder, item_kind, at_event, number, evidence: E }),
  remove: (target_id: string): AnyOp => ({ op: "remove_element", target_id, evidence: E }),
  answer: (target_id: string, number: Rational): AnyOp => ({ op: "state_answer", target_id, number, evidence: E }),
  procedure: (target_id: string, operands: Operand[], operation: Operation): AnyOp => ({
    op: "state_procedure",
    target_id,
    operands,
    operation,
    evidence: E,
  }),
  wordCue: (statement_index: number, tokens: number[]): AnyOp => ({ op: "word_cue", statement_index, tokens, evidence: E }),
};
