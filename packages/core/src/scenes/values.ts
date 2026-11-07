// Values a scene must not show or reach (指示書 第6.7節 手順5): a problem's answer and the values on the way to
// it, the size of one part included. Kept apart from the scenes so the gate can use it without a cycle.
import type { Rational } from "../schema/common.ts";
import type { WorldScene } from "../schema/world-scene.ts";
import { div, eq, fromSchema, mul, rat, toSchema, type Rational as Exact } from "../rational/index.ts";
import { solve } from "../solve/index.ts";

const MULTIPLICATIVE = new Set(["times", "fraction_of"]);

/** Every solved value of a world, the size of one part of each multiple, and the reference times the numerator. */
export function worldValues(w: WorldScene): Exact[] {
  const res = solve(w);
  if (res.kind !== "unique" && res.kind !== "underdetermined") return [];
  const out: Exact[] = [...res.values.values()];
  for (const r of w.relations) {
    if (!MULTIPLICATIVE.has(r.operator) || r.amount === null || r.reference === null) continue;
    const ref = res.values.get(r.reference);
    if (ref === undefined) continue;
    const a = fromSchema(r.amount);
    // One part, and the value on the way when the given number is multiplied first (20 x 3 before / 5).
    out.push(div(ref, rat(a.den)), mul(ref, rat(a.num)));
  }
  return out;
}

/** The values of a problem the child does not read in it: the answer, and the values on the way (one part). */
export function hiddenValues(w: WorldScene): Rational[] {
  const given = [
    ...w.quantities.flatMap((q) => (q.value === null ? [] : [fromSchema(q.value)])),
    ...w.relations.flatMap((r) => (r.amount === null ? [] : [fromSchema(r.amount)])),
  ];
  return dedupe(worldValues(w).filter((v) => !given.some((g) => eq(g, v))));
}

export function dedupe(xs: readonly Exact[]): Rational[] {
  const out: Exact[] = [];
  for (const x of xs) if (!out.some((y) => eq(x, y))) out.push(x);
  return out.map(toSchema);
}

export const sameValue = (a: Rational, b: Rational): boolean => eq(fromSchema(a), fromSchema(b));
export const meets = (xs: readonly Rational[], ys: readonly Rational[]): boolean => xs.some((x) => ys.some((y) => sameValue(x, y)));

/** The scenes the core built (frozen): the gate lets only these through. */
export const sceneMarks = new WeakSet<object>();
