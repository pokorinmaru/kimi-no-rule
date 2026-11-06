// Misreading candidates (指示書 第5.4節): the correct world with one relation or event flipped, solved,
// and merged by same_world (指示書 第5.8節).
import type { Rational } from "../schema/common.ts";
import type { AnyOp } from "../schema/semantic.ts";
import type { WorldScene } from "../schema/world-scene.ts";
import { fromSchema, inv, isZero, toSchema } from "../rational/index.ts";
import { solve } from "../solve/index.ts";
import { sameWorld } from "../world/same-world.ts";

export type FlipKind = "operator_swap" | "invert_amount" | "swap_ends" | "event_type";

export interface Candidate {
  flips: { kind: FlipKind; element_id: string }[];
  ops: AnyOp[];
  world: WorldScene;
  answer: Rational | null;
  impossible: boolean;
}

const MULTIPLICATIVE = new Set(["times", "fraction_of", "per"]);
const EVIDENCE = "";

interface Flip {
  kind: FlipKind;
  element_id: string;
  op: AnyOp;
  world: WorldScene;
}

function flips(correct: WorldScene): Flip[] {
  const out: Flip[] = [];
  const withRelation = (id: string, f: (r: WorldScene["relations"][number]) => WorldScene["relations"][number]) => ({
    ...correct,
    relations: correct.relations.map((r) => (r.id === id ? f(r) : r)),
  });
  for (const r of correct.relations) {
    if (r.operator === "more_by" || r.operator === "less_by") {
      const operator = r.operator === "more_by" ? "less_by" : "more_by";
      out.push({
        kind: "operator_swap",
        element_id: r.id,
        op: { op: "set_relation_operator", target_id: r.id, operator, evidence: EVIDENCE },
        world: withRelation(r.id, (x) => ({ ...x, operator })),
      });
    }
    if (MULTIPLICATIVE.has(r.operator) && r.amount !== null && !isZero(fromSchema(r.amount))) {
      const amount = toSchema(inv(fromSchema(r.amount)));
      out.push({
        kind: "invert_amount",
        element_id: r.id,
        op: { op: "set_relation_amount", target_id: r.id, number: amount, evidence: EVIDENCE },
        world: withRelation(r.id, (x) => ({ ...x, amount })),
      });
    }
    // Swapping the ends of "the same as" gives back the same world, so it is no misreading (Q18).
    if (r.reference !== null && r.operator !== "same_as") {
      const reference = r.reference;
      out.push({
        kind: "swap_ends",
        element_id: r.id,
        op: { op: "swap_relation_direction", target_id: r.id, evidence: EVIDENCE },
        world: withRelation(r.id, (x) => ({ ...x, subject: reference, reference: x.subject })),
      });
    }
  }
  for (const e of correct.events) {
    if (e.type !== "gain" && e.type !== "lose") continue;
    const type = e.type === "gain" ? "lose" : "gain";
    out.push({
      kind: "event_type",
      element_id: e.id,
      op: { op: "set_event_type", target_id: e.id, event_type: type, evidence: EVIDENCE },
      world: { ...correct, events: correct.events.map((x) => (x.id === e.id ? { ...x, type } : x)) },
    });
  }
  return out;
}

function answerOf(w: WorldScene): { answer: Rational | null; impossible: boolean } {
  const res = solve(w);
  if (res.kind !== "unique" && res.kind !== "underdetermined") return { answer: null, impossible: false };
  const v = res.values.get(w.question.target_id);
  return {
    answer: v === undefined ? null : toSchema(v),
    impossible: res.kind === "unique" && res.impossible.length > 0,
  };
}

/** The candidates, in the order of the correct world's relations then events; same worlds merged. */
export function misreadCandidates(correct: WorldScene): Candidate[] {
  const out: Candidate[] = [];
  for (const f of flips(structuredClone(correct))) {
    const same = out.find((c) => sameWorld(c.world, f.world));
    if (same !== undefined) {
      same.flips.push({ kind: f.kind, element_id: f.element_id });
      continue;
    }
    out.push({ flips: [{ kind: f.kind, element_id: f.element_id }], ops: [f.op], world: f.world, ...answerOf(f.world) });
  }
  return out;
}
