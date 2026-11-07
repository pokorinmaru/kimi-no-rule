// The child's own first prediction, before the junior shows its world (指示書 第7.1節 手順2, 第6.7節 手順2 (i)):
// "which has more?" (a holder of the relation, or not yet known) and, when the child places it, who is taken
// as 1. A constructive observation: each hypothesis's world on the problem implies a larger holder (core solve)
// and a 1 (the relation's reference), and the likelihood is a distribution over the answers the worlds of W
// imply, with the same ε rule as constructiveLikelihoods. Pure functions only.
import type { ProblemRecord } from "../schema/problem-record.ts";
import type { WorldScene } from "../schema/world-scene.ts";
import { apply } from "../apply/index.ts";
import { cmp, fromSchema, type Rational } from "../rational/index.ts";
import { predict } from "../rules/predict.ts";
import type { Hypothesis } from "../rules/run.ts";
import { solve } from "../solve/index.ts";
import { countsAsObservation, EPSILON_CONSTRUCTIVE, update } from "../rules/weights.ts";

const OTHER = "other";

/** One answer of the child: a holder id per part, null for a part not given (or a world that does not say). */
export interface FirstGuess {
  larger: string | null;
  oneOn: string | null;
}

/** The parts of an answer the child gave. */
export interface GuessFields {
  larger: boolean;
  oneOn: boolean;
}

export interface PredictionObservation {
  record: ProblemRecord;
  /** The holder the child said has more; null for 「まだわからない」. */
  larger: string | null;
  /** The holder the child put the "1" card on, or null when no card was placed. */
  oneOn: string | null;
  /** The word book showed one of this problem's wordings earlier: not counted (第6.7節 手順2). */
  wordbookOpenedBefore?: boolean;
}

/** The relation the child is asked about: the problem's first relation, as the screen draws it. */
function relationIdOf(record: ProblemRecord): string {
  const rel = record.world.relations[0];
  if (rel === undefined) throw new Error(`${record.world.problem_id} has no relation`);
  return rel.id;
}

function ends(record: ProblemRecord): { holders: string[]; quantityOf: Map<string, string> } {
  const rel = record.world.relations.find((r) => r.id === relationIdOf(record));
  const quantityOf = new Map<string, string>();
  for (const id of [rel?.subject, rel?.reference]) {
    const q = record.world.quantities.find((x) => x.id === id);
    if (q !== undefined) quantityOf.set(q.holder, q.id);
  }
  return { holders: [...quantityOf.keys()], quantityOf };
}

const key = (g: FirstGuess): string => `${g.larger ?? ""}\u0000${g.oneOn ?? ""}`;

/** The answer a world implies: the holder whose quantity core solves larger, and the holder of the relation's reference. */
export function guessOf(world: WorldScene, record: ProblemRecord, fields: GuessFields): FirstGuess {
  const rel = world.relations.find((r) => r.id === relationIdOf(record));
  const holderOf = (q: string | null | undefined): string | null => (q === null || q === undefined ? null : (world.quantities.find((x) => x.id === q)?.holder ?? null));
  let larger: string | null = null;
  if (fields.larger && rel !== undefined && rel.reference !== null) {
    const values = valuesOf(world);
    const a = values.get(rel.subject);
    const b = values.get(rel.reference);
    if (a !== undefined && b !== undefined) {
      const c = cmp(a, b);
      larger = c > 0 ? holderOf(rel.subject) : c < 0 ? holderOf(rel.reference) : null;
    }
  }
  return { larger, oneOn: fields.oneOn ? holderOf(rel?.reference) : null };
}

function valuesOf(world: WorldScene): Map<string, Rational> {
  try {
    const s = solve(world);
    if (s.kind === "unique" || s.kind === "underdetermined") return s.values;
  } catch {
    // A world core cannot solve says nothing about which is larger.
  }
  const out = new Map<string, Rational>();
  for (const q of world.quantities) if (q.value !== null) out.set(q.id, fromSchema(q.value));
  return out;
}

/** The distinct answers the worlds of W imply on the problem (W from core predict, as the constructive model uses it). */
export function guessAnswers(hs: readonly Hypothesis[], record: ProblemRecord, fields: GuessFields): FirstGuess[] {
  const pred = predict(hs, record, fields.oneOn);
  const out = new Map<string, FirstGuess>();
  for (const w of pred.worlds) {
    const g = guessOf(w, record, fields);
    out.set(key(g), g);
  }
  return [...out.values()];
}

/**
 * The likelihood of the child's answer under each hypothesis and "other": 1−ε for the answer its world implies,
 * ε shared evenly among the other answers of W (the child's answer added when no world implies it), and 1/|answers|
 * for "other". Each model's likelihoods over the answers sum to 1.
 */
export function guessLikelihoods(hs: readonly Hypothesis[], record: ProblemRecord, answer: FirstGuess): Record<string, number> {
  const fields: GuessFields = { larger: answer.larger !== null, oneOn: answer.oneOn !== null };
  const pred = predict(hs, record, fields.oneOn);
  const answers = new Set(pred.worlds.map((w) => key(guessOf(w, record, fields))));
  answers.add(key(answer));
  const n = answers.size;
  const observed = key(answer);
  const out: Record<string, number> = {};
  for (const p of pred.predictions) {
    const implied = key(guessOf(p.world, record, fields));
    out[p.hypothesisId] = n === 1 ? 1 : implied === observed ? 1 - EPSILON_CONSTRUCTIVE : EPSILON_CONSTRUCTIVE / (n - 1);
  }
  out[OTHER] = 1 / n;
  return out;
}

/** The child's world from the placed 1: the correct world with only the reference moved (core apply), or null. */
function readingWorld(record: ProblemRecord, quantityId: string): WorldScene | null {
  try {
    const res = apply({ correct: record.world, ops: [{ op: "set_relation_reference", target_id: relationIdOf(record), reference: quantityId, evidence: "" }] });
    return res.discarded.length > 0 ? null : res.judgeWorld;
  } catch {
    return null;
  }
}

/** The parts the research layer needs from the state, so this file does not import the state's module. */
interface StateLike {
  pool: { hypothesis: Hypothesis; status: "hypothesis" | "confirmed"; splitObservations: number }[];
  weights: Record<string, number>;
  readings: { record: ProblemRecord; childWorld: WorldScene; referencePlaced: boolean; afterFix: boolean; wordbookOpenedBefore: boolean }[];
  unscored: number;
}

/**
 * The prediction's update, before the pool's statuses are worked out again (index.ts does that): new weights,
 * (the split count is left as it was, Q52), and, when the 1 was placed, the child's world from it kept as a first reading.
 */
export function predictionUpdate<S extends StateLike>(state: S, o: PredictionObservation): { state: S; changed: boolean } {
  const { holders, quantityOf } = ends(o.record);
  for (const h of [o.larger, o.oneOn]) if (h !== null && !holders.includes(h)) throw new Error(`${h} is not an end of the relation`);
  const wordbookOpenedBefore = o.wordbookOpenedBefore === true;
  if ((o.larger === null && o.oneOn === null) || !countsAsObservation({ afterFix: false, wordbookOpenedBefore })) return { state, changed: false };

  const placed = o.oneOn === null ? undefined : quantityOf.get(o.oneOn);
  const world = placed === undefined ? null : readingWorld(o.record, placed);
  const readings = world === null ? state.readings : [...state.readings, { record: o.record, childWorld: world, referencePlaced: true, afterFix: false, wordbookOpenedBefore }];

  if (state.pool.length === 0) {
    if (world === null) return { state, changed: false };
    return { state: { ...state, readings, unscored: state.unscored + 1 }, changed: true };
  }
  const hs = state.pool.map((e) => e.hypothesis);
  const answer: FirstGuess = { larger: o.larger, oneOn: o.oneOn };
  const weights = update(state.weights, guessLikelihoods(hs, o.record, answer));
  // The split count stays: confirming needs split observations on different problems, and the first placement on
  // this same problem counts it already (Q52). Only the weights move.
  return { state: { ...state, weights, readings }, changed: true };
}
