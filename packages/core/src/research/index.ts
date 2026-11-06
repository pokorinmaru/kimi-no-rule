// The research layer's program side (指示書 第6.7節, kept to the submission: hypotheses, weights, choosing a
// discriminating problem from the prepared bank, confirming and going back to a hypothesis, which reading
// the junior uses, and the one-line card). Claude only writes the hypotheses; everything here is decided
// by the program. Pure functions only.
import type { ProblemRecord } from "../schema/problem-record.ts";
import type { WorldScene } from "../schema/world-scene.ts";
import { hypothesis as hypothesisSchema } from "../schema/reading-rule.ts";
import { predict } from "../rules/predict.ts";
import { firedClauses, runRule, type Hypothesis } from "../rules/run.ts";
import { sameReading } from "../rules/same-reading.ts";
import { groupHypotheses } from "../rules/score.ts";
import {
  addHypothesis,
  confirmation,
  constructiveLikelihoods,
  countsAsObservation,
  infoGain,
  isSplit,
  mergeHypotheses,
  update,
  type Weights,
} from "../rules/weights.ts";
import { COMMON_MISREADINGS } from "./common.ts";

export { COMMON_FRACTION_READINGS, COMMON_MISREADINGS, CORRECT_READING_ID } from "./common.ts";

export const OTHER = "other";
export const POOL_MAX = 5;
/** Below this expected gain (bits) no bank problem tells the candidates apart. 【仮】 */
export const GAIN_THRESHOLD = 0.05;

export interface PoolEntry {
  hypothesis: Hypothesis;
  status: "hypothesis" | "confirmed";
  /** Constructive observations made on problems where the pool's predictions split. */
  splitObservations: number;
}

/** The child's first reading of one problem: the world from the child's first operations. */
export interface FirstReading {
  record: ProblemRecord;
  childWorld: WorldScene;
  referencePlaced: boolean;
  afterFix: boolean;
  wordbookOpenedBefore: boolean;
}

export interface ResearchState {
  pool: PoolEntry[];
  weights: Weights;
  /** Every first reading that counted, oldest first. */
  readings: FirstReading[];
  /** How many of `readings` came before the pool first had a hypothesis (those were not scored). */
  unscored: number;
  unexpressible: boolean;
}

export type PoolEdit =
  | { kind: "add"; hypothesis: Hypothesis }
  | { kind: "modify"; hypothesis: Hypothesis }
  | { kind: "delete"; id: string };

export interface Revision {
  state: ResearchState;
  rejected: { index: number; reason: "invalid" | "duplicate_id" | "unknown_id" | "run_failed" | "pool_full" | "pool_empty" }[];
  /** Hypotheses folded into another that builds the same worlds on every given problem. */
  merged: { kept: string; dropped: string }[];
}

export interface Choice {
  problemId: string;
  gain: number;
  /** What each candidate predicts there (the world's class in W), for the research note. */
  predictions: { hypothesisId: string; worldClass: number }[];
}

export interface KohaiReading {
  hypothesis: Hypothesis;
  source: "taught" | "mirror" | "competitor";
  /** The one misreading the junior uses in this session (fixed once chosen). */
  sessionMisreadId: string | null;
  /** Whether the reading builds a world other than the correct one on this problem. */
  changesWorld: boolean;
}

export function initialState(): ResearchState {
  return { pool: [], weights: { [OTHER]: 1 }, readings: [], unscored: 0, unexpressible: false };
}

const isNoChange = (h: Hypothesis): boolean => h.clauses.every((c) => c.then.action === "no_change");

function normalized(w: Weights): Weights {
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / total]));
}

/** The status of every entry, and whether "other" weighs most, from the current weights. */
function restated(pool: readonly PoolEntry[], weights: Weights): { pool: PoolEntry[]; unexpressible: boolean } {
  const otherWeight = weights[OTHER] ?? 0;
  const unexpressible = pool.length > 0 && otherWeight > 0 && otherWeight >= Math.max(...Object.values(weights));
  const out = pool.map((e) => {
    const c = confirmation({
      weights,
      id: e.hypothesis.id,
      splitObservations: e.splitObservations,
      previous: e.status,
      noChange: isNoChange(e.hypothesis),
    });
    return { ...e, status: c.status };
  });
  return { pool: out, unexpressible };
}

export function observe(state: ResearchState, reading: FirstReading): ResearchState {
  if (!countsAsObservation(reading)) return state;
  const readings = [...state.readings, reading];
  if (state.pool.length === 0) return { ...state, readings, unscored: state.unscored + 1 };
  const pred = predict(
    state.pool.map((e) => e.hypothesis),
    reading.record,
    reading.referencePlaced,
  );
  const weights = update(state.weights, constructiveLikelihoods(pred, reading.childWorld, reading.referencePlaced));
  const split = isSplit(pred);
  const counted = state.pool.map((e) => ({ ...e, splitObservations: e.splitObservations + (split ? 1 : 0) }));
  const { pool, unexpressible } = restated(counted, weights);
  return { ...state, pool, weights, readings, unexpressible };
}

/** What one hypothesis alone says about the scored readings: its weight's catch-up factor and its split count. */
function history(h: Hypothesis, others: readonly Hypothesis[], scored: readonly FirstReading[]): { factor: number; splits: number } {
  let factor = 1;
  let splits = 0;
  for (const r of scored) {
    const alone = constructiveLikelihoods(predict([h], r.record, r.referencePlaced), r.childWorld, r.referencePlaced);
    factor *= (alone[h.id] as number) / (alone[OTHER] as number);
    if (isSplit(predict([...others, h], r.record, r.referencePlaced))) splits++;
  }
  return { factor, splits };
}

export function revisePool(state: ResearchState, edits: readonly PoolEdit[], problems: readonly ProblemRecord[]): Revision {
  const rejected: Revision["rejected"] = [];
  const records = [...problems, ...state.readings.map((r) => r.record)];
  const runs = (h: Hypothesis): boolean => {
    try {
      for (const r of records) runRule(h, r);
      return true;
    } catch {
      return false;
    }
  };
  const firstFill = state.pool.length === 0;
  let pool = [...state.pool];
  let weights: Weights = { ...state.weights };
  const scored = state.readings.slice(state.unscored);
  const written = new Set<string>();

  edits.forEach((edit, index) => {
    if (edit.kind === "delete") {
      const at = pool.findIndex((e) => e.hypothesis.id === edit.id);
      if (at < 0) return void rejected.push({ index, reason: "unknown_id" });
      // A pool is never emptied once it has hypotheses: the scored readings would lose their start.
      if (pool.length === 1) return void rejected.push({ index, reason: "pool_empty" });
      pool.splice(at, 1);
      weights = mergeHypotheses(weights, OTHER, edit.id);
      return;
    }
    const parsed = hypothesisSchema.safeParse(edit.hypothesis);
    if (!parsed.success || parsed.data.id === OTHER) return void rejected.push({ index, reason: "invalid" });
    const h = parsed.data;
    if (!runs(h)) return void rejected.push({ index, reason: "run_failed" });
    const at = pool.findIndex((e) => e.hypothesis.id === h.id);
    if (edit.kind === "add") {
      if (at >= 0) return void rejected.push({ index, reason: "duplicate_id" });
      if (pool.length >= POOL_MAX) return void rejected.push({ index, reason: "pool_full" });
      pool.push({ hypothesis: h, status: "hypothesis", splitObservations: 0 });
      written.add(h.id);
      if (!firstFill) weights = addHypothesis(weights, h.id);
      return;
    }
    if (at < 0) return void rejected.push({ index, reason: "unknown_id" });
    // A modified rule is judged again on every scored reading, as if it had been there from the start.
    const others = pool.filter((_, i) => i !== at).map((e) => e.hypothesis);
    const { factor, splits } = history(h, others, scored);
    weights = addHypothesis(mergeHypotheses(weights, OTHER, h.id), h.id);
    weights = normalized({ ...weights, [h.id]: (weights[h.id] as number) * factor });
    pool[at] = { hypothesis: h, status: "hypothesis", splitObservations: splits };
    written.add(h.id);
  });

  // Rules that build the same worlds on every given problem are one reading: the first in the pool stays.
  const merged: Revision["merged"] = [];
  for (const group of groupHypotheses(
    pool.map((e) => e.hypothesis),
    problems,
  )) {
    const [keep, ...drop] = group;
    for (const d of drop) {
      // A reading written again under another id earns nothing: its share goes back to other, so weights
      // move only on observations. Two hypotheses that were already there keep both their shares.
      if (!firstFill) weights = mergeHypotheses(weights, written.has(d.id) ? OTHER : (keep as Hypothesis).id, d.id);
      merged.push({ kept: (keep as Hypothesis).id, dropped: d.id });
    }
  }
  const droppedIds = new Set(merged.map((m) => m.dropped));
  pool = pool.filter((e) => !droppedIds.has(e.hypothesis.id));

  // The first hypotheses are written from the readings so far, so those readings do not count for them:
  // each distinct reading and "other" start alike.
  if (firstFill && pool.length > 0) {
    const share = 1 / (pool.length + 1);
    weights = { [OTHER]: share, ...Object.fromEntries(pool.map((e) => [e.hypothesis.id, share])) };
  }

  const { pool: statused, unexpressible } = restated(pool, weights);
  return { state: { ...state, pool: statused, weights, unexpressible }, rejected, merged };
}

export function chooseNext(
  state: ResearchState,
  bank: readonly ProblemRecord[],
  done: ReadonlySet<string>,
  threshold: number = GAIN_THRESHOLD,
): Choice | null {
  const live = state.pool.filter((e) => (state.weights[e.hypothesis.id] ?? 0) > 0);
  if (live.length < 2) return null;
  let best: Choice | null = null;
  for (const record of bank) {
    if (done.has(record.world.problem_id)) continue;
    const pred = predict(
      state.pool.map((e) => e.hypothesis),
      record,
      true,
    );
    const gain = infoGain(state.weights, pred);
    // Equal gains (up to rounding) keep the bank order.
    if (best === null || gain > best.gain + 1e-12) {
      best = {
        problemId: record.world.problem_id,
        gain,
        predictions: pred.predictions.map((p) => ({ hypothesisId: p.hypothesisId, worldClass: p.worldClass })),
      };
    }
  }
  return best !== null && best.gain >= threshold ? best : null;
}

function top(state: ResearchState): PoolEntry | undefined {
  let best: PoolEntry | undefined;
  for (const e of state.pool) {
    if (best === undefined || (state.weights[e.hypothesis.id] ?? 0) > (state.weights[best.hypothesis.id] ?? 0)) best = e;
  }
  return best;
}

export function kohaiReading(input: {
  state: ResearchState;
  record: ProblemRecord;
  sessionMisreadId: string | null;
  /** The session's misreading itself, kept by the flow so a later pool edit cannot lose it. */
  sessionMisread?: Hypothesis | null;
  taught: Hypothesis | null;
}): KohaiReading {
  const { state, record, sessionMisreadId, taught } = input;
  if (taught !== null) return { hypothesis: taught, source: "taught", sessionMisreadId, changesWorld: !sameReading(runRule(taught, record), record.world, true) };
  const head = top(state);
  const changes = (h: Hypothesis): boolean => !sameReading(runRule(h, record), record.world, true);
  const competitor = COMMON_MISREADINGS.find(changes);
  if (competitor === undefined) throw new Error(`no common misreading changes ${record.world.problem_id}`);
  if (sessionMisreadId !== null) {
    const h =
      (input.sessionMisread?.id === sessionMisreadId ? input.sessionMisread : undefined) ??
      state.pool.find((e) => e.hypothesis.id === sessionMisreadId)?.hypothesis ??
      COMMON_MISREADINGS.find((x) => x.id === sessionMisreadId);
    if (h === undefined) throw new Error(`unknown misreading ${sessionMisreadId}`);
    // The session keeps its one misreading; where it changes nothing here, the flow must not show this
    // problem as a misreading (it would show the correct world first, 原則4) and picks another.
    return { hypothesis: h, source: head?.hypothesis.id === h.id ? "mirror" : "competitor", sessionMisreadId, changesWorld: changes(h) };
  }
  if (head !== undefined && !isNoChange(head.hypothesis) && changes(head.hypothesis)) {
    return { hypothesis: head.hypothesis, source: "mirror", sessionMisreadId: head.hypothesis.id, changesWorld: true };
  }
  return { hypothesis: competitor, source: "competitor", sessionMisreadId: competitor.id, changesWorld: true };
}

type Action = Hypothesis["clauses"][number]["then"];

const BY_TEXT: Record<string, string> = {
  first_mentioned: "先に出てきた人を、1とみる",
  second_mentioned: "あとに出てきた人を、1とみる",
  known_value: "わかっている数の人を、1とみる",
  asked: "聞かれている人を、1とみる",
  larger_number: "数の大きいほうを、1とみる",
  smaller_number: "数の小さいほうを、1とみる",
};

/** The card's words for one action. They name no operation and no number other than the "1" (原則1・11). */
function cardText(a: Action): string | null {
  switch (a.action) {
    case "no_change":
      return null;
    case "choose_reference":
      if (typeof a.by === "string") return BY_TEXT[a.by] as string;
      // The word was written by Claude: it is shown only when it is a plain word with no number or
      // operation in it (原則1・11); otherwise the card says "a word" without quoting it.
      return safeWord(a.by.word)
        ? `「${a.by.word}」の${a.by.holder === "before_word" ? "前" : "後ろ"}の人を、1とみる`
        : `ある言葉の${a.by.holder === "before_word" ? "前" : "後ろ"}の人を、1とみる`;
    case "swap_reference":
      return "1とみる人を、入れかえて読む";
    case "set_relation_type_additive":
      return a.amount === "numerator" ? "分数の上の数だけ、ちがうと読む" : "分数の大きさだけ、ちがうと読む";
    case "number_op":
      return a.mode === "divide_large_by_small"
        ? "数の大きさで、読み方を決める"
        : a.mode === "percent_as_count"
          ? "百分率を、そのままの数とみる"
          : "どの問題も、同じやり方で読む";
    case "invert_ratio":
      return "分数を、上と下を入れかえて読む";
    case "flip_event":
      return "ふえた・へったを、反対に読む";
    case "misread_question":
      return "聞かれている人を、ほかの人として読む";
  }
}

const NUMBER_OR_OPERATION = /[0-9０-９一二三四五六七八九十百千万〇零半倍分割足引掛たすひくかけわる+\-×÷*/=]|one|two|three|four|five|six|seven|eight|nine|ten|half|times|plus|minus|divide|multiply/i;

/** A word the card may quote: short, one line, with no number and no operation in it. */
export function safeWord(w: string): boolean {
  return w.length > 0 && w.length <= 8 && !/[\s「」]/.test(w) && !NUMBER_OR_OPERATION.test(w);
}

/**
 * The card's one line for the junior's reading. Given the problem, it names the clause that acted there,
 * and none when the reading builds the correct world; without a problem, the first clause that changes anything.
 */
export function readingCard(h: Hypothesis, record?: ProblemRecord): string | null {
  const acting = record === undefined ? h.clauses : [...new Set(firedClauses(h, record))].sort((x, y) => x - y).map((i) => h.clauses[i] as Hypothesis["clauses"][number]);
  if (record !== undefined && sameReading(runRule(h, record), record.world, true)) return null;
  for (const c of acting) {
    const text = cardText(c.then);
    if (text !== null) return `後輩の読み方：${text}`;
  }
  return null;
}
