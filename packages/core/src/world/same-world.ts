// Whether two worlds are the same (指示書 第5.8節 same_world): solved values, what is asked, the kind
// of each relation, and the order of lengths. The base a relation counts as 1 is not compared, so the
// values compared are those of quantities (a swapped and an inverted reading differ only in amounts).
import type { WorldScene } from "../schema/world-scene.ts";
import { cmp, eq, fromSchema, rat, type Rational } from "../rational/index.ts";
import { solve, type SolveResult } from "../solve/index.ts";

type RelationClass = "multiplicative" | "additive" | "same" | "total" | "other";

function classOf(op: WorldScene["relations"][number]["operator"]): RelationClass {
  switch (op) {
    case "times":
    case "fraction_of":
    case "per":
      return "multiplicative";
    case "more_by":
    case "less_by":
      return "additive";
    case "same_as":
      return "same";
    case "total_of":
      return "total";
    default:
      return "other";
  }
}

function quantityValues(w: WorldScene, res: SolveResult): Map<string, Rational> {
  const out = new Map<string, Rational>();
  if (res.kind !== "unique" && res.kind !== "underdetermined") return out;
  const ids = new Set(w.quantities.map((q) => q.id));
  for (const [id, v] of res.values) if (ids.has(id)) out.set(id, v);
  return out;
}

/**
 * The order of lengths as facts "x<y" and "x=y" between quantities (指示書 第5.8節). Fixed values are
 * compared directly; a relation also orders its two ends when the values are not fixed (a difference
 * by its sign, a multiple by whether it is above or below 1, a total above each of its parts).
 */
function lengthOrder(w: WorldScene, values: ReadonlyMap<string, Rational>): string {
  const facts = new Set<string>();
  const order = (x: string, y: string, c: number): void => {
    if (c === 0) facts.add(x < y ? `${x}=${y}` : `${y}=${x}`);
    else facts.add(c < 0 ? `${x}<${y}` : `${y}<${x}`);
  };
  const ids = [...values.keys()].sort();
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i] as string;
      const b = ids[j] as string;
      order(a, b, cmp(values.get(a) as Rational, values.get(b) as Rational));
    }
  }
  const ZERO = rat(0);
  const ONE = rat(1);
  for (const r of w.relations) {
    const amount = r.amount === null ? null : fromSchema(r.amount);
    if (r.operator === "total_of") {
      for (const part of r.reference_list ?? []) order(part, r.subject, -1);
      continue;
    }
    if (r.reference === null) continue;
    if (r.operator === "same_as") order(r.subject, r.reference, 0);
    if (amount === null) continue;
    if (r.operator === "more_by") order(r.subject, r.reference, cmp(amount, ZERO));
    if (r.operator === "less_by") order(r.subject, r.reference, -cmp(amount, ZERO));
    if (r.operator === "times" || r.operator === "fraction_of" || r.operator === "per") {
      order(r.subject, r.reference, cmp(amount, ONE));
    }
  }
  return [...facts].sort().join(" ");
}

export function sameWorld(a: WorldScene, b: WorldScene): boolean {
  if (a.question.target_type !== b.question.target_type || a.question.target_id !== b.question.target_id) return false;

  const cb = new Map(b.relations.map((r) => [r.id, classOf(r.operator)]));
  if (a.relations.length !== b.relations.length) return false;
  for (const r of a.relations) if (cb.get(r.id) !== classOf(r.operator)) return false;

  const ra = solve(a);
  const rb = solve(b);
  if (ra.kind !== rb.kind) return false;
  if (ra.kind === "contradiction" || ra.kind === "nonlinear") return true;

  const va = quantityValues(a, ra);
  const vb = quantityValues(b, rb);
  if (va.size !== vb.size) return false;
  for (const [id, v] of va) {
    const w = vb.get(id);
    if (w === undefined || !eq(v, w)) return false;
  }
  return lengthOrder(a, va) === lengthOrder(b, vb);
}
