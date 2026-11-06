// Weights of the hypotheses and "other", updated by observations (指示書 第6.7節 手順2・手順4).
// Pure functions only. The numbers are first guesses, to be measured (指示書 第13節).
import type { WorldScene } from "../schema/world-scene.ts";
import type { predict } from "./predict.ts";
import { sameReading } from "./same-reading.ts";

export const EPSILON_CONSTRUCTIVE = 0.1;
export const EPSILON_AGREEMENT = 0.2;
export const CONFIRM_WEIGHT = 0.8;
export const REVERT_WEIGHT = 0.5;
export const CONFIRM_OBSERVATIONS = 2;

export type Weights = Record<string, number>;
type Predicted = ReturnType<typeof predict>;

const OTHER = "other";

/**
 * How likely each model makes the observed world: a hypothesis builds its own world with 1−ε and
 * spreads ε over the rest of W; "other" builds every world of W alike. Each model sums to 1 over W.
 */
export function constructiveLikelihoods(pred: Predicted, observed: WorldScene, referenceObserved: boolean): Record<string, number> {
  const worlds = [...pred.worlds];
  let observedClass = worlds.findIndex((w) => sameReading(w, observed, referenceObserved));
  if (observedClass < 0) {
    worlds.push(observed);
    observedClass = worlds.length - 1;
  }
  const n = worlds.length;
  const out: Record<string, number> = {};
  for (const p of pred.predictions) {
    out[p.hypothesisId] = n === 1 ? 1 : p.worldClass === observedClass ? 1 - EPSILON_CONSTRUCTIVE : EPSILON_CONSTRUCTIVE / (n - 1);
  }
  out[OTHER] = 1 / n;
  return out;
}

/** "It fits" or "it is odd" about the junior's world of class shownClass. */
export function agreementLikelihoods(pred: Predicted, shownClass: number, answer: "fits" | "odd" | "unknown"): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of pred.predictions) {
    if (answer === "unknown") out[p.hypothesisId] = 1;
    else {
      const agrees = (p.worldClass === shownClass) === (answer === "fits");
      out[p.hypothesisId] = agrees ? 1 - EPSILON_AGREEMENT : EPSILON_AGREEMENT;
    }
  }
  out[OTHER] = answer === "unknown" ? 1 : 0.5;
  return out;
}

function normalized(w: Weights): Weights {
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  if (total <= 0) throw new Error("weights sum to zero");
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / total]));
}

export function update(w: Weights, likelihoods: Record<string, number>): Weights {
  return normalized(Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v * (likelihoods[k] ?? 1)])));
}

/** A new hypothesis takes half of "other"; the ratios between the others stay as they were. */
export function addHypothesis(w: Weights, id: string): Weights {
  if (id in w) return w;
  const other = w[OTHER] ?? 0;
  return { ...w, [id]: other / 2, [OTHER]: other / 2 };
}

export function mergeHypotheses(w: Weights, keep: string, drop: string): Weights {
  if (!(drop in w) || keep === drop) return w;
  const { [drop]: dropped = 0, ...rest } = w;
  return { ...rest, [keep]: (rest[keep] ?? 0) + dropped };
}

const entropy = (ps: readonly number[]): number => -ps.filter((p) => p > 0).reduce((s, p) => s + p * Math.log2(p), 0);

/**
 * The expected information, in bits, the child's first world on this problem gives about which
 * hypothesis holds. "Other" is left out, so a problem where every hypothesis predicts the same world gives 0.
 */
export function infoGain(w: Weights, pred: Predicted): number {
  const ids = pred.predictions.map((p) => p.hypothesisId).filter((id) => (w[id] ?? 0) > 0);
  const total = ids.reduce((s, id) => s + (w[id] ?? 0), 0);
  if (total <= 0 || ids.length < 2) return 0;
  const prior = ids.map((id) => (w[id] ?? 0) / total);
  const n = pred.worlds.length;
  const classOf = new Map(pred.predictions.map((p) => [p.hypothesisId, p.worldClass]));
  const like = (id: string, o: number): number =>
    n === 1 ? 1 : classOf.get(id) === o ? 1 - EPSILON_CONSTRUCTIVE : EPSILON_CONSTRUCTIVE / (n - 1);
  let expected = 0;
  for (let o = 0; o < n; o++) {
    const joint = ids.map((id, i) => (prior[i] as number) * like(id, o));
    const po = joint.reduce((a, b) => a + b, 0);
    if (po > 0) expected += po * entropy(joint.map((j) => j / po));
  }
  const gain = entropy(prior) - expected;
  return Math.abs(gain) < 1e-12 ? 0 : gain;
}

export function status(
  weight: number,
  splitConstructiveObservations: number,
  previous: "hypothesis" | "confirmed",
): "hypothesis" | "confirmed" {
  if (previous === "confirmed") return weight < REVERT_WEIGHT ? "hypothesis" : "confirmed";
  return weight >= CONFIRM_WEIGHT && splitConstructiveObservations >= CONFIRM_OBSERVATIONS ? "confirmed" : "hypothesis";
}
