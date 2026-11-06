// M1 step (6): diagnose the child's reading (指示書 第5.4節). Pure functions only.
import type { ApplyResult } from "../apply/index.ts";
import type { Rational } from "../schema/common.ts";
import type { ProblemRecord } from "../schema/problem-record.ts";
import type { AnyOp } from "../schema/semantic.ts";
import { eq, fromSchema } from "../rational/index.ts";
import { solve } from "../solve/index.ts";
import { sameWorld } from "../world/same-world.ts";
import { misreadCandidates, type Candidate } from "./candidates.ts";

export { misreadCandidates, type Candidate, type FlipKind } from "./candidates.ts";
export { problemConditions, type ConditionFailure } from "./conditions.ts";

export type Layer =
  | "question"
  | "direction"
  | "relation_kind"
  | "situation"
  | "word_meaning"
  | "quantity"
  | "operation_choice"
  | "calculation";
export type Outcome = "match" | "needs_reference" | "correct_unexplained" | "layers";

export interface DiagnoseInput {
  record: ProblemRecord;
  ops: readonly AnyOp[];
  unclear?: readonly string[];
  child: ApplyResult;
}

export interface Diagnosis {
  outcome: Outcome;
  layers: Layer[];
  primary: Layer | null;
  operationEvidence: Candidate["flips"];
  observedReference: boolean;
  unconfirmed: string[];
  consistency: "consistent" | "inconsistent";
}

/** The order in which layers are shown (指示書 第5.4節). */
export const LAYER_ORDER: readonly Layer[] = [
  "question",
  "direction",
  "relation_kind",
  "situation",
  "word_meaning",
  "quantity",
  "operation_choice",
  "calculation",
];

const MULTIPLICATIVE = new Set(["times", "fraction_of", "per"]);

function answerOf(w: ProblemRecord["world"]): ReturnType<typeof fromSchema> | undefined {
  const res = solve(w);
  if (res.kind !== "unique" && res.kind !== "underdetermined") return undefined;
  return res.values.get(w.question.target_id);
}

export function diagnose(input: DiagnoseInput): Diagnosis {
  const { record, ops, child } = input;
  const correct = record.world;
  const unclear = new Set(input.unclear ?? []);
  const touched = new Set(child.touched);
  const observed = new Set(child.observedReferences.map((o) => `${o.relation_id} ${o.reference}`));
  const base = {
    observedReference: child.observedReferences.length > 0,
    unconfirmed: [...unclear].sort(),
    consistency: record.consistency,
  };

  // 1. Does the child's world match the correct one (指示書 第5.4節 一致の定義)?
  const named = [...new Set(record.statements.flatMap((s) => s.element_ids))];
  const allTouched = named.every((id) => touched.has(id));
  if (allTouched && sameWorld(child.judgeWorld, correct)) {
    const chosen = new Set(ops.flatMap((o) => (o.op === "set_relation_reference" ? [o.target_id] : [])));
    const multiplicative = correct.relations.filter((r) => MULTIPLICATIVE.has(r.operator));
    const sameBase = multiplicative.every(
      (r) => child.judgeWorld.relations.find((x) => x.id === r.id)?.reference === r.reference,
    );
    const allChosen = multiplicative.every((r) => chosen.has(r.id));
    if (sameBase && allChosen) {
      return { outcome: "match", layers: [], primary: null, operationEvidence: [], ...base };
    }
    if (sameBase) {
      return { outcome: "needs_reference", layers: [], primary: null, operationEvidence: [], ...base };
    }
  }

  // 2. Layers from the kinds of ops (指示書 第5.4節 の表).
  const layers = new Set<Layer>();
  const relationOrEvent = new Set([...correct.relations, ...correct.events].map((x) => x.id));
  for (const o of ops) {
    if ("target_id" in o && unclear.has(o.target_id)) continue;
    switch (o.op) {
      case "rename_item_kind":
        layers.add("word_meaning");
        break;
      case "swap_relation_direction":
        layers.add("direction");
        break;
      case "set_relation_reference":
        if (!observed.has(`${o.target_id} ${o.reference}`)) layers.add("direction");
        break;
      case "set_relation_operator": {
        const before = correct.relations.find((r) => r.id === o.target_id)?.operator;
        const pair = new Set([before, o.operator]);
        layers.add(pair.has("more_by") && pair.has("less_by") ? "direction" : "relation_kind");
        break;
      }
      case "set_event_type":
      case "add_relation":
      case "add_event":
      case "set_event_to_holder":
        layers.add("relation_kind");
        break;
      case "set_quantity":
      case "set_relation_amount":
      case "set_event_amount":
        layers.add("quantity");
        break;
      case "set_question_target":
        layers.add("question");
        break;
      case "add_holder":
      case "add_item_kind":
      case "add_quantity":
      case "remove_element":
        layers.add("situation");
        break;
      default:
        break;
    }
  }

  // 3. Numbers the child said: answers and procedures.
  const correctAnswer = answerOf(correct);
  const candidates = misreadCandidates(correct);
  const evidence: Candidate["flips"] = [];
  const matchCandidates = (v: Rational): boolean => {
    const hits = candidates.filter((c) => c.answer !== null && eq(fromSchema(c.answer), fromSchema(v)));
    for (const c of hits) evidence.push(...c.flips);
    return hits.length > 0;
  };
  const isCorrect = (v: Rational): boolean => correctAnswer !== undefined && eq(fromSchema(v), correctAnswer);
  // Did the child touch a relation or an event in words (指示書 第5.4節)? Relations a procedure only
  // carried along do not count; any op that edits the world, or a phrase on a relation or event, does.
  const NUMBER_ONLY = new Set(["state_answer", "state_procedure", "word_cue", "set_unit_value"]);
  const explicit =
    ops.some((o) => !NUMBER_ONLY.has(o.op)) ||
    (child.procedures.length === 0 && child.touched.some((id) => relationOrEvent.has(id)));
  let correctUnexplained = false;

  for (const p of child.procedures) {
    if (isCorrect(p.value)) correctUnexplained = true;
    else if (matchCandidates(p.value)) layers.add("operation_choice");
    else layers.add("calculation");
  }
  for (const a of child.answers) {
    if (!a.onQuestionTarget) continue;
    if (isCorrect(a.value)) {
      correctUnexplained = true;
      continue;
    }
    if (!explicit && matchCandidates(a.value)) {
      layers.add("operation_choice");
      continue;
    }
    const judged = answerOf(child.judgeWorld);
    if (judged !== undefined && !eq(judged, fromSchema(a.value))) layers.add("calculation");
  }

  const ordered = LAYER_ORDER.filter((l) => layers.has(l));
  const outcome: Outcome = ordered.length === 0 && correctUnexplained ? "correct_unexplained" : "layers";
  return { outcome, layers: ordered, primary: ordered[0] ?? null, operationEvidence: evidence, ...base };
}
