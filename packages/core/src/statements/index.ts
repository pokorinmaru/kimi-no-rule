// M1 step (5): check each sentence of the problem against the child's world (指示書 第5.7節).
// The values solved here are only for judging; they are never returned (指示書 第5.5節).
// Pure functions only: the inputs are never changed.
import type { ApplyResult } from "../apply/index.ts";
import type { Rational as SchemaRational } from "../schema/common.ts";
import type { ProblemRecord } from "../schema/problem-record.ts";
import type { AnyOp } from "../schema/semantic.ts";
import type { WorldScene } from "../schema/world-scene.ts";
import { eq, fromSchema, type Rational } from "../rational/index.ts";
import { solve } from "../solve/index.ts";

export type StatementVerdict = "holds" | "fails" | "undetermined" | "different_question" | "jointly_unsatisfiable";

export interface ReasonCue {
  statement_index: number;
  token_start: number;
  token_end: number;
  word: string;
  /** The element of the child's world that plays the word's part now. */
  linked_to: string;
}

export interface StatementCheck {
  index: number;
  verdict: StatementVerdict;
  cues: ReasonCue[];
}

export interface CheckInput {
  correct: WorldScene;
  statements: ProblemRecord["statements"];
  syntaxMarks: ProblemRecord["syntax_marks"];
  ops: readonly AnyOp[];
  child: ApplyResult;
}

export type CheckResult = { kind: "number_only" } | { kind: "checked"; statements: StatementCheck[] };

type Verdict = "holds" | "fails" | "undetermined";

function setQuantityValue(w: WorldScene, id: string, v: SchemaRational): WorldScene {
  return { ...w, quantities: w.quantities.map((x) => (x.id === id ? { ...x, value: v } : x)) };
}

/** A relation id that is not in the world, for adding the correct relation next to the child's. */
function spareRelationId(w: WorldScene): string {
  const used = new Set(w.relations.map((r) => r.id));
  for (let n = 1; ; n++) {
    const id = `r_check${n}`;
    if (!used.has(id)) return id;
  }
}

/**
 * The constraints a sentence stands for: given numbers, relations and events of the correct world.
 * What is asked is never one of them (it belongs to the question sentence).
 */
function constraintsOf(correct: WorldScene, ids: readonly string[]): string[] {
  const asked = correct.question.target_id;
  return ids.filter(
    (id) =>
      id !== asked &&
      (correct.quantities.some((x) => x.id === id && x.value !== null) ||
        correct.relations.some((r) => r.id === id) ||
        correct.events.some((e) => e.id === id)),
  );
}

function combine(vs: readonly Verdict[]): Verdict {
  if (vs.includes("fails")) return "fails";
  if (vs.includes("undetermined")) return "undetermined";
  return "holds";
}

/** Checks every sentence of the problem in the child's world (指示書 第5.7節). */
export function checkStatements(input: CheckInput): CheckResult {
  const { correct, statements, syntaxMarks, ops, child } = input;
  const world = child.checkWorld;

  // Only a number for what is asked, with no word on a relation or an event: no checking, the child is
  // asked to show the world instead (指示書 第5.7節).
  const relationOrEvent = new Set(
    [...world.relations, ...world.events, ...correct.relations, ...correct.events].map((x) => x.id),
  );
  if (
    ops.length > 0 &&
    ops.every((o) => o.op === "state_answer" && o.target_id === world.question.target_id) &&
    !child.touched.some((id) => relationOrEvent.has(id))
  ) {
    return { kind: "number_only" };
  }
  const touched = new Set(child.touched);

  const unsat = child.draw.unsatisfiable;
  if (unsat.length > 0) {
    const inSet = new Set(unsat.flat());
    return {
      kind: "checked",
      statements: statements.map((s) => ({
        index: s.index,
        verdict: s.element_ids.some((id) => inSet.has(id)) ? "jointly_unsatisfiable" : "undetermined",
        cues: [],
      })),
    };
  }

  const res = solve(world);
  const values: Map<string, Rational> =
    res.kind === "unique" || res.kind === "underdetermined"
      ? new Map([...res.values].map(([k, v]) => [k, v]))
      : new Map();
  const solvable = res.kind === "unique" || res.kind === "underdetermined";
  const released = new Set(child.draw.released);
  const procedureValue = new Map(child.procedures.map((p) => [p.target_id, p.value]));

  const checkOne = (id: string): Verdict => {
    if (released.has(id)) return "fails";
    if (!solvable) return "undetermined";
    const given = correct.quantities.find((x) => x.id === id);
    if (given !== undefined && given.value !== null) {
      const v = values.get(id);
      if (v === undefined || !world.quantities.some((x) => x.id === id)) return "undetermined";
      return eq(v, fromSchema(given.value)) ? "holds" : "fails";
    }
    const rel = correct.relations.find((r) => r.id === id);
    if (rel !== undefined) {
      if (!world.relations.some((r) => r.id === id)) return "undetermined";
      const ends = [rel.subject, rel.reference, ...(rel.reference_list ?? [])].filter((x): x is string => x !== null);
      if (ends.some((e) => procedureValue.has(e))) {
        // A procedure aims at this relation: put its value on the relation's formula (指示書 第5.3節, Q17).
        let probe: WorldScene = { ...world, relations: world.relations.filter((r) => r.id !== id) };
        for (const [qid, v] of procedureValue) probe = setQuantityValue(probe, qid, v);
        const base = solve(probe);
        if (base.kind !== "unique" && base.kind !== "underdetermined") return "undetermined";
        if (ends.some((e) => !base.values.has(e))) return "undetermined";
        probe = { ...probe, relations: [...probe.relations, { ...rel, id: spareRelationId(probe) }] };
        return solve(probe).kind === "contradiction" ? "fails" : "holds";
      }
      if (ends.some((e) => !values.has(e))) return "undetermined";
      // The correct sentence, added to the child's world: it fails exactly when it cannot hold there.
      const probe: WorldScene = { ...world, relations: [...world.relations, { ...rel, id: spareRelationId(world) }] };
      return solve(probe).kind === "contradiction" ? "fails" : "holds";
    }
    const ev = correct.events.find((e) => e.id === id);
    if (ev !== undefined) {
      const mine = world.events.find((e) => e.id === id);
      if (mine === undefined) return "undetermined";
      if (
        mine.type !== ev.type ||
        mine.holder !== ev.holder ||
        mine.item_kind !== ev.item_kind ||
        mine.to_holder !== ev.to_holder
      ) {
        return "fails";
      }
      const v = values.get(id);
      if (v === undefined || ev.amount === null) return "undetermined";
      return eq(v, fromSchema(ev.amount)) ? "holds" : "fails";
    }
    return "undetermined";
  };

  return {
    kind: "checked",
    statements: statements.map((s) => {
      if (s.is_question) {
        const same =
          world.question.target_type === correct.question.target_type &&
          world.question.target_id === correct.question.target_id;
        return { index: s.index, verdict: same ? "holds" : "different_question", cues: [] };
      }
      const constraints = constraintsOf(correct, s.element_ids);
      // A sentence none of whose elements the child's words touched is not decided yet (指示書 第5.7節);
      // a constraint the child's world had to give up is still shown as not holding (指示書 第5.3節).
      // A sentence with no elements at all (an opening line) has nothing to decide and holds.
      const untouched = s.element_ids.length > 0 && !s.element_ids.some((id) => touched.has(id));
      const verdict =
        untouched && !constraints.some((id) => released.has(id)) ? "undetermined" : combine(constraints.map(checkOne));
      return { index: s.index, verdict, cues: verdict === "fails" ? cuesFor(s, correct, world, syntaxMarks) : [] };
    }),
  };
}

/**
 * For a failing sentence, ties its relation words to what plays the base's part in the child's world
 * now, never to the base the words name (指示書 第5.7節).
 */
function cuesFor(
  s: ProblemRecord["statements"][number],
  correct: WorldScene,
  world: WorldScene,
  marks: ProblemRecord["syntax_marks"],
): ReasonCue[] {
  const cues: ReasonCue[] = [];
  for (const m of marks) {
    if (m.statement_index !== s.index) continue;
    if (m.kind !== "relation_word" && m.kind !== "ratio_notation") continue;
    if (m.element_id === null || !s.element_ids.includes(m.element_id)) continue;
    const right = correct.relations.find((r) => r.id === m.element_id);
    const mine = world.relations.find((r) => r.id === m.element_id);
    if (right === undefined || mine === undefined || mine.reference === null) continue;
    if (mine.reference === right.reference) continue;
    cues.push({
      statement_index: s.index,
      token_start: m.token_start,
      token_end: m.token_end,
      word: m.word,
      linked_to: mine.reference,
    });
  }
  return cues;
}
