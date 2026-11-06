// Hand-made reading rules, problem records and observations for the rules tests (指示書 第5.8節,
// 第6.7節, 第11節 M1). Every world, sentence and word here is written for these tests.
import type { AnyOp, Expr, ProblemRecord, Rational, WorldScene } from "../schema/index.ts";
import { apply } from "../apply/index.ts";
import { num } from "../apply/test-worlds.ts";
import { pairWorld, record, rel, stmt } from "../diagnose/test-records.ts";
import type { Hypothesis } from "./run.ts";
import type { Observation } from "./score.ts";

type Relation = WorldScene["relations"][number];
type Mark = ProblemRecord["syntax_marks"][number];
type Statement = ProblemRecord["statements"][number];
type Clause = Hypothesis["clauses"][number];
type Action = Clause["then"];
type PredName = Extract<Expr, { pred: string }>["pred"];

// ---------------------------------------------------------------------------------------------
// Conditions, actions and hypotheses
// ---------------------------------------------------------------------------------------------

export const p = (pred: PredName, ...args: string[]): Expr => ({ pred, args });
export const and = (...args: Expr[]): Expr => ({ op: "and", args });
export const or = (...args: Expr[]): Expr => ({ op: "or", args });
export const not = (arg: Expr): Expr => ({ op: "not", arg });
export const ALWAYS: Expr = p("true");

export const act = {
  noChange: (): Action => ({ action: "no_change" }),
  swap: (): Action => ({ action: "swap_reference" }),
  invert: (): Action => ({ action: "invert_ratio" }),
  flipEvent: (): Action => ({ action: "flip_event" }),
  misreadQuestion: (): Action => ({ action: "misread_question", target: "other_holder" }),
  additive: (amount: "numerator" | "ratio_value"): Action => ({ action: "set_relation_type_additive", amount }),
  numberOp: (mode: "divide_large_by_small" | "multiply_always" | "divide_always" | "percent_as_count"): Action => ({
    action: "number_op",
    mode,
  }),
  chooseBy: (
    by: "first_mentioned" | "second_mentioned" | "known_value" | "asked" | "larger_number" | "smaller_number",
  ): Action => ({ action: "choose_reference", by }),
  chooseByWord: (holder: "before_word" | "after_word", word: string): Action => ({
    action: "choose_reference",
    by: { holder, word },
  }),
};

export const clause = (when: Expr, then: Action): Clause => ({ when, then });

export function hyp(id: string, clauses: Clause[]): Hypothesis {
  return { id, origin: "math", clauses, word_cues: [], note_for_adult: "" };
}

/** One clause that applies the action to every relation and event. */
export const always = (id: string, then: Action): Hypothesis => hyp(id, [clause(ALWAYS, then)]);

export const H = {
  noChange: () => always("h_no_change", act.noChange()),
  swap: () => always("h_swap", act.swap()),
  invert: () => always("h_invert", act.invert()),
  additive: () => always("h_additive", act.additive("numerator")),
  additiveRatio: () => always("h_additive_ratio", act.additive("ratio_value")),
  multiplyAlways: () => always("h_multiply", act.numberOp("multiply_always")),
  divideAlways: () => always("h_divide", act.numberOp("divide_always")),
  divideLargeBySmall: () => always("h_large_by_small", act.numberOp("divide_large_by_small")),
  percentAsCount: () => always("h_percent_count", act.numberOp("percent_as_count")),
  flipEvent: () => always("h_flip_event", act.flipEvent()),
  misreadQuestion: () => always("h_misread_question", act.misreadQuestion()),
  chooseKnown: () => always("h_choose_known", act.chooseBy("known_value")),
};

// ---------------------------------------------------------------------------------------------
// Worlds and records
// ---------------------------------------------------------------------------------------------

export function mark(
  kind: Mark["kind"],
  statement_index: number,
  at: number,
  word: string,
  element_id: string | null,
  ratio_kind: Mark["ratio_kind"] = null,
): Mark {
  return {
    kind,
    statement_index,
    token_start: at,
    token_end: at,
    element_id,
    word,
    ratio_kind,
    l1_pattern_id: null,
    native_checked: null,
  };
}

export function tokenStatement(index: number, element_ids: string[], tokens: string[]): Statement {
  return { index, text: tokens.join(""), element_ids, is_question: false, speaker_holder_id: null, tokens };
}

/** The world with one relation changed by hand. */
export function withRelation(w: WorldScene, id: string, patch: Partial<Relation>): WorldScene {
  const c = structuredClone(w);
  return { ...c, relations: c.relations.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
}

/**
 * b = 3 times a with a = 6 (b = 18). The relation sentence has the tokens
 *   0:b 1:の 2:数 3:は 4:a 5:の 6:3 7:倍
 * so the particle appears twice; the one nearest the multiple (5) comes right after a, the reference,
 * and the far one (1) comes right after b, the subject.
 */
export function wordRecord(): ProblemRecord {
  const r = record(
    pairWorld(6, [rel("r_1", "times", "q_b", "q_a", num(3))], "ratio"),
    [stmt(0, ["q_a"]), tokenStatement(1, ["r_1"], ["b", "の", "数", "は", "a", "の", "3", "倍"]), stmt(2, ["q_b"], true)],
    "consistent",
    num(18),
  );
  r.syntax_marks = [
    mark("holder_mention", 1, 0, "b", "h_b"),
    mark("holder_mention", 1, 4, "a", "h_a"),
    mark("relation_word", 1, 5, "の", "r_1"),
    mark("ratio_notation", 1, 6, "3", "r_1", ["gt1"]),
    mark("relation_word", 1, 7, "倍", "r_1"),
  ];
  return r;
}

/** b is 25% of a with a = 200 (b = 50); the multiple is written as a percent. */
export function percentRecord(): ProblemRecord {
  const r = record(
    pairWorld(200, [rel("r_1", "fraction_of", "q_b", "q_a", num(1, 4))], "ratio"),
    [stmt(0, ["q_a"]), tokenStatement(1, ["r_1"], ["b", "は", "a", "の", "25%"]), stmt(2, ["q_b"], true)],
    "consistent",
    num(50),
  );
  r.syntax_marks = [
    mark("holder_mention", 1, 0, "b", "h_b"),
    mark("holder_mention", 1, 2, "a", "h_a"),
    mark("relation_word", 1, 3, "の", "r_1"),
    mark("ratio_notation", 1, 4, "25%", "r_1", ["lt1", "percent"]),
  ];
  return r;
}

/** b is 1/4 of a with a = 8 (b = 2): a unit fraction. */
export function unitFractionRecord(): ProblemRecord {
  const r = record(
    pairWorld(8, [rel("r_1", "fraction_of", "q_b", "q_a", num(1, 4))], "ratio"),
    [stmt(0, ["q_a"]), tokenStatement(1, ["r_1"], ["b", "は", "a", "の", "1/4"]), stmt(2, ["q_b"], true)],
    "consistent",
    num(2),
  );
  r.syntax_marks = [
    mark("holder_mention", 1, 0, "b", "h_b"),
    mark("holder_mention", 1, 2, "a", "h_a"),
    mark("ratio_notation", 1, 4, "1/4", "r_1", ["lt1", "fraction"]),
  ];
  return r;
}

/** b = 3 times a with a = 2 (b = 6): the known number is smaller than the multiple. */
export function smallKnownRecord(): ProblemRecord {
  const r = record(
    pairWorld(2, [rel("r_1", "times", "q_b", "q_a", num(3))], "ratio"),
    [stmt(0, ["q_a"]), tokenStatement(1, ["r_1"], ["b", "は", "a", "の", "3", "倍"]), stmt(2, ["q_b"], true)],
    "consistent",
    num(6),
  );
  r.syntax_marks = [
    mark("holder_mention", 1, 0, "b", "h_b"),
    mark("holder_mention", 1, 2, "a", "h_a"),
    mark("ratio_notation", 1, 4, "3", "r_1", ["gt1"]),
  ];
  return r;
}

/**
 * Two relations of different kinds: a = 2 given, m = 3 times a (r_1), b = m + 2 (r_2), b asked
 * (m = 6, b = 8).
 */
export function mixedRecord(): ProblemRecord {
  const w = pairWorld(2, [rel("r_1", "times", "q_m", "q_a", num(3)), rel("r_2", "more_by", "q_b", "q_m", num(2))], "ratio");
  w.holders.push({ id: "h_m", label: "m" });
  w.quantities.push({ id: "q_m", holder: "h_m", item_kind: "k_thing", at_event: null, value: null });
  return record(w, [stmt(0, ["q_a"]), stmt(1, ["r_1"]), stmt(2, ["r_2"]), stmt(3, ["q_b"], true)], "consistent", num(8));
}

/**
 * Two multiples of a = 6: b = 2 times a (r_1, b asked, 12) and c = 3 times a (r_2, 18). Each relation
 * has its own sentence, so a rule can pick one of them by a word.
 */
export function twoRelationRecord(): ProblemRecord {
  const w = pairWorld(6, [rel("r_1", "times", "q_b", "q_a", num(2)), rel("r_2", "times", "q_c", "q_a", num(3))], "ratio");
  w.holders.push({ id: "h_c", label: "c" });
  w.quantities.push({ id: "q_c", holder: "h_c", item_kind: "k_thing", at_event: null, value: null });
  const r = record(
    w,
    [
      stmt(0, ["q_a"]),
      tokenStatement(1, ["r_1"], ["b", "は", "a", "の", "2", "倍"]),
      tokenStatement(2, ["r_2"], ["c", "は", "a", "の", "3", "倍"]),
      stmt(3, ["q_b"], true),
    ],
    "consistent",
    num(12),
  );
  r.syntax_marks = [
    mark("holder_mention", 1, 0, "b", "h_b"),
    mark("holder_mention", 1, 2, "a", "h_a"),
    mark("ratio_notation", 1, 4, "2", "r_1", ["gt1"]),
    mark("holder_mention", 2, 0, "c", "h_c"),
    mark("holder_mention", 2, 2, "a", "h_a"),
    mark("ratio_notation", 2, 4, "3", "r_2", ["gt1"]),
  ];
  return r;
}

/** b = 0 times a: the multiple has no inverse. */
export function zeroTimesRecord(): ProblemRecord {
  return record(
    pairWorld(4, [rel("r_1", "times", "q_b", "q_a", num(0))], "ratio"),
    [stmt(0, ["q_a"]), stmt(1, ["r_1"]), stmt(2, ["q_b"], true)],
  );
}

// ---------------------------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------------------------

/** The child's first reading of a problem, applied to its correct world. */
export function observe(rec: ProblemRecord, ops: AnyOp[], referencePlaced = false): Observation {
  return { record: rec, child: apply({ correct: structuredClone(rec.world), ops }), ops, referencePlaced };
}

export const valueOf = (w: WorldScene, id: string): Rational | null | undefined =>
  w.quantities.find((q) => q.id === id)?.value;
