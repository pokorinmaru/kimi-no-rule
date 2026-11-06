// Hand-made worlds and problem records for the same_world, candidate, condition and diagnose tests
// (指示書 第5.2節, 第5.4節, 第5.8節). Every world here is written for these tests.
import type { ProblemRecord, Rational, WorldScene } from "../schema/index.ts";
import { differenceWorld, num, totalWorld } from "../apply/test-worlds.ts";

type Relation = WorldScene["relations"][number];
type Statement = ProblemRecord["statements"][number];

export function stmt(index: number, element_ids: string[], is_question = false): Statement {
  const text = "s" + String(index);
  return { index, text, element_ids, is_question, speaker_holder_id: null, tokens: [text] };
}

export function record(
  world: WorldScene,
  statements: Statement[],
  consistency: ProblemRecord["consistency"] = "consistent",
  expected: Rational | null = null,
): ProblemRecord {
  return {
    schema_version: "1",
    world,
    consistency,
    pair_id: null,
    source: "prepared",
    checks: { double_build_match: false, restate_match: false, misread_pass_rate: null, human_checked: false },
    expected_answer: expected,
    statements,
    syntax_marks: [],
    companion_ids: [],
  };
}

/** Every element the sentences of a record name. */
export const statementElements = (r: ProblemRecord): string[] => [...new Set(r.statements.flatMap((s) => s.element_ids))];

export const rel = (
  id: string,
  operator: Relation["operator"],
  subject: string,
  reference: string | null,
  amount: Rational | null,
): Relation => ({ id, operator, subject, reference, reference_list: null, amount, other_description: null });

/** Two holders a and b of one countable kind; q_a given (or null), q_b asked; the relations are passed in. */
export function pairWorld(a: number | null, relations: Relation[], problem_type: WorldScene["problem_type"] = "compare"): WorldScene {
  return {
    schema_version: "3",
    problem_id: "p_pair",
    problem_type,
    problem_text: "",
    grade: 4,
    problem_lang: "ja",
    holders: [
      { id: "h_a", label: "a" },
      { id: "h_b", label: "b" },
    ],
    item_kinds: [{ id: "k_thing", noun: "thing", counter: "", asset_key: null, countable: true }],
    quantities: [
      { id: "q_a", holder: "h_a", item_kind: "k_thing", at_event: null, value: a === null ? null : num(a) },
      { id: "q_b", holder: "h_b", item_kind: "k_thing", at_event: null, value: null },
    ],
    relations,
    events: [],
    question: { target_type: "quantity", target_id: "q_b" },
    word_links: [],
  };
}

const PAIR_STATEMENTS = (): Statement[] => [stmt(0, ["q_a"]), stmt(1, ["r_1"]), stmt(2, ["q_b"], true)];

/** b = a + d (answer a + d). The only misreading flips r_1, giving a - d. */
export function differenceRecord(a = 5, d = 3): ProblemRecord {
  return record(differenceWorld(a, d), PAIR_STATEMENTS(), "consistent", num(a + d));
}

/** b = k times a (answer k a), a relation word that matches multiplying. The misreading gives a / k. */
export function timesRecord(a = 4, k = 3): ProblemRecord {
  return record(pairWorld(a, [rel("r_1", "times", "q_b", "q_a", num(k))], "ratio"), PAIR_STATEMENTS(), "consistent", num(a * k));
}

/** One holder: starts with `start`, gains `gain`, the count after the event is asked. */
export function eventRecord(start = 5, gain = 3): ProblemRecord {
  const world: WorldScene = {
    schema_version: "3",
    problem_id: "p_event",
    problem_type: "change",
    problem_text: "",
    grade: 2,
    problem_lang: "ja",
    holders: [{ id: "h_a", label: "a" }],
    item_kinds: [{ id: "k_thing", noun: "thing", counter: "", asset_key: null, countable: true }],
    quantities: [
      { id: "q_a0", holder: "h_a", item_kind: "k_thing", at_event: null, value: num(start) },
      { id: "q_a1", holder: "h_a", item_kind: "k_thing", at_event: "e_1", value: null },
    ],
    relations: [],
    events: [{ id: "e_1", order: 1, type: "gain", holder: "h_a", item_kind: "k_thing", amount: num(gain), to_holder: null }],
    question: { target_type: "quantity", target_id: "q_a1" },
    word_links: [],
  };
  return record(world, [stmt(0, ["q_a0"]), stmt(1, ["e_1"]), stmt(2, ["q_a1"], true)], "consistent", num(start + gain));
}

/** a gives 2 to b (a had 5, b had 1); the count of b after the move is asked (3). A move has no flip. */
export function moveRecord(): ProblemRecord {
  const world: WorldScene = {
    schema_version: "3",
    problem_id: "p_move",
    problem_type: "change",
    problem_text: "",
    grade: 2,
    problem_lang: "ja",
    holders: [
      { id: "h_a", label: "a" },
      { id: "h_b", label: "b" },
      { id: "h_c", label: "c" },
    ],
    item_kinds: [{ id: "k_thing", noun: "thing", counter: "", asset_key: null, countable: true }],
    quantities: [
      { id: "q_a0", holder: "h_a", item_kind: "k_thing", at_event: null, value: num(5) },
      { id: "q_b0", holder: "h_b", item_kind: "k_thing", at_event: null, value: num(1) },
      { id: "q_b1", holder: "h_b", item_kind: "k_thing", at_event: "e_1", value: null },
    ],
    relations: [],
    events: [{ id: "e_1", order: 1, type: "move", holder: "h_a", item_kind: "k_thing", amount: num(2), to_holder: "h_b" }],
    question: { target_type: "quantity", target_id: "q_b1" },
    word_links: [],
  };
  return record(world, [stmt(0, ["q_a0", "q_b0"]), stmt(1, ["e_1"]), stmt(2, ["q_b1"], true)], "consistent", num(3));
}

/**
 * Two steps: m = a + 2 and b = m + 2 with a = 5 (m = 7, b = 9). Flipping either relation gives b = 5,
 * but the two worlds differ in m (3 or 7): two candidates with the same answer.
 */
export function twoStepRecord(): ProblemRecord {
  const world: WorldScene = {
    schema_version: "3",
    problem_id: "p_two_step",
    problem_type: "compare",
    problem_text: "",
    grade: 3,
    problem_lang: "ja",
    holders: [
      { id: "h_a", label: "a" },
      { id: "h_m", label: "m" },
      { id: "h_b", label: "b" },
    ],
    item_kinds: [{ id: "k_thing", noun: "thing", counter: "", asset_key: null, countable: true }],
    quantities: [
      { id: "q_a", holder: "h_a", item_kind: "k_thing", at_event: null, value: num(5) },
      { id: "q_m", holder: "h_m", item_kind: "k_thing", at_event: null, value: null },
      { id: "q_b", holder: "h_b", item_kind: "k_thing", at_event: null, value: null },
    ],
    relations: [rel("r_1", "more_by", "q_b", "q_m", num(2)), rel("r_2", "more_by", "q_m", "q_a", num(2))],
    events: [],
    question: { target_type: "quantity", target_id: "q_b" },
    word_links: [],
  };
  return record(world, [stmt(0, ["q_a"]), stmt(1, ["r_2"]), stmt(2, ["r_1"]), stmt(3, ["q_b"], true)], "consistent", num(9));
}

/** t = x + y: a total has nothing to flip, so there is no candidate. */
export function totalRecord(): ProblemRecord {
  return record(
    totalWorld(),
    [stmt(0, ["q_x"]), stmt(1, ["q_y"]), stmt(2, ["r_t"]), stmt(3, ["q_t"], true)],
    "consistent",
    num(5),
  );
}

// ---------------------------------------------------------------------------------------------
// Records that break one of the conditions on a problem world
// ---------------------------------------------------------------------------------------------

/** q_a has no value: b = a + 3 cannot be solved. */
export function notUniqueRecord(): ProblemRecord {
  return record(pairWorld(null, [rel("r_1", "more_by", "q_b", "q_a", num(3))]), PAIR_STATEMENTS());
}

/** b = 2 - 5: a negative count. */
export function negativeRecord(): ProblemRecord {
  return record(pairWorld(2, [rel("r_1", "less_by", "q_b", "q_a", num(5))]), PAIR_STATEMENTS());
}

/** b = 1/2 of 5 of a countable kind: not a whole number. */
export function nonIntegerRecord(): ProblemRecord {
  return record(pairWorld(5, [rel("r_1", "times", "q_b", "q_a", num(1, 2))], "ratio"), PAIR_STATEMENTS());
}

/** b = 6 is given and b = (unknown) times a with a asked: a product of two unknowns. */
export function nonlinearRecord(): ProblemRecord {
  const w = pairWorld(null, [rel("r_1", "times", "q_b", "q_a", null)], "ratio");
  w.quantities = w.quantities.map((q) => (q.id === "q_b" ? { ...q, value: num(6) } : q));
  w.question = { target_type: "quantity", target_id: "q_a" };
  return record(w, [stmt(0, ["q_b"]), stmt(1, ["r_1"]), stmt(2, ["q_a"], true)]);
}

/** b = 1 times a: both flips give back the same world. */
export function identityRecord(): ProblemRecord {
  return record(pairWorld(5, [rel("r_1", "times", "q_b", "q_a", num(1))], "ratio"), PAIR_STATEMENTS());
}

/** b = a + 3 is asked; c = a + 1 is a side relation, so flipping it leaves the answer 8. */
export function sameAnswerRecord(): ProblemRecord {
  const w = pairWorld(5, [rel("r_1", "more_by", "q_b", "q_a", num(3)), rel("r_2", "more_by", "q_c", "q_a", num(1))]);
  w.holders.push({ id: "h_c", label: "c" });
  w.quantities.push({ id: "q_c", holder: "h_c", item_kind: "k_thing", at_event: null, value: null });
  return record(w, [stmt(0, ["q_a"]), stmt(1, ["r_1"]), stmt(2, ["r_2"]), stmt(3, ["q_b"], true)]);
}

/** b = a + 3, but no sentence stands for the relation: no sentence can fail in the flipped world. */
export function silentRecord(): ProblemRecord {
  return record(differenceWorld(5, 3), [stmt(0, ["q_a"]), stmt(1, ["q_b"], true)]);
}
