// The research layer's program side (指示書 第6.7節, kept to the submission: hypotheses, weights, choosing a
// discriminating problem from the prepared bank, confirming and going back to a hypothesis, which reading
// the junior uses, and the one-line card). Claude only writes the hypotheses; everything here is decided
// by the program. Pure functions only.
import type { ProblemRecord } from "../schema/problem-record.ts";
import type { WorldScene } from "../schema/world-scene.ts";
import { hypothesis as hypothesisSchema } from "../schema/reading-rule.ts";
import { classOf, predict } from "../rules/predict.ts";
import { firedClauses, runRule, type Hypothesis } from "../rules/run.ts";
import { sameReading } from "../rules/same-reading.ts";
import { groupHypotheses } from "../rules/score.ts";
import {
  addHypothesis,
  agreementLikelihoods,
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
import { hasOperationName, numbersIn } from "../gates/index.ts";
import { apply } from "../apply/index.ts";
import { checkStatements } from "../statements/index.ts";

export { COMMON_FRACTION_READINGS, COMMON_MISREADINGS, CORRECT_READING_ID } from "./common.ts";
export { CARD_RULE_IDS, CARD_RULES } from "./card-rules.ts";

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

/** The child's prediction about the junior's world (指示書 第7.1節 手順4): "fits", "odd", or "unknown" (no observation). */
export interface AgreementObservation {
  record: ProblemRecord;
  /** The world the junior showed, as its reading built it. */
  shownWorld: WorldScene;
  answer: "fits" | "odd" | "unknown";
  referencePlaced: boolean;
}

/**
 * An agreement observation (指示書 第6.7節 手順2 (ii)): "fits" supports the hypotheses that predict the shown
 * world, "odd" the others. "unknown", or a pool with no hypothesis yet, changes nothing. It is not a
 * constructive observation, so it never counts toward confirming (手順4), and it is not kept as a reading.
 */
export function observeAgreement(state: ResearchState, o: AgreementObservation): ResearchState {
  if (o.answer === "unknown" || state.pool.length === 0) return state;
  const pred = predict(
    state.pool.map((e) => e.hypothesis),
    o.record,
    o.referencePlaced,
  );
  // A shown world no hypothesis predicts takes a class of its own (classOf adds it to this W only).
  const shownClass = classOf(pred.worlds, o.shownWorld, o.referencePlaced);
  const weights = update(state.weights, agreementLikelihoods(pred, shownClass, o.answer));
  const { pool, unexpressible } = restated(state.pool, weights);
  return { ...state, pool, weights, unexpressible };
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

/** Whether a reading reproduces the child's first readings, allowing one slip once there are two or more. */
export function supportedBy(h: Hypothesis, readings: readonly FirstReading[]): boolean {
  let misses = 0;
  for (const r of readings) {
    let ok = false;
    try {
      ok = sameReading(runRule(h, r.record), r.childWorld, r.referencePlaced);
    } catch {
      ok = false;
    }
    if (!ok) misses++;
  }
  return misses === 0 || (readings.length >= 2 && misses <= 1);
}

/**
 * The floor under the pool Claude writes (Q43): every candidate reading that reproduces all the child's
 * first readings so far stays in the pool, and the pool holds at least two, so a problem that tells them
 * apart can always be chosen. Claude adds readings no list has; it cannot drop one the evidence still
 * supports. Readings already represented (same worlds on every problem) are not added twice.
 */
export function ensurePool(state: ResearchState, candidates: readonly Hypothesis[], problems: readonly ProblemRecord[]): ResearchState {
  // A child slips now and then (a world from another reading): one miss does not drop a reading the rest of
  // the evidence supports, or the child's own reading could leave the pool for good after one slip.
  const reproduces = (h: Hypothesis): boolean => supportedBy(h, state.readings);
  // Represented means "builds the same worlds", never "has the same id": a hypothesis that kept a common
  // reading's id but was rewritten does not stand for it.
  const represented = (h: Hypothesis, pool: readonly Hypothesis[]): boolean => pool.some((e) => groupHypotheses([e, h], problems).length === 1);
  const taken = new Set(state.pool.map((e) => e.hypothesis.id));
  const fresh = (h: Hypothesis): Hypothesis => {
    let id = h.id;
    for (let n = 2; taken.has(id); n++) id = `${h.id}_${n}`;
    taken.add(id);
    return id === h.id ? h : { ...h, id };
  };
  const pool = state.pool.map((e) => e.hypothesis);
  const adds: Hypothesis[] = [];
  for (const h of candidates) {
    if (pool.length + adds.length >= POOL_MAX) break;
    if (reproduces(h) && !represented(h, [...pool, ...adds])) adds.push(fresh(h));
  }
  for (const h of candidates) {
    if (pool.length + adds.length >= 2) break;
    if (!represented(h, [...pool, ...adds])) adds.push(fresh(h));
  }
  if (adds.length === 0) return state;
  return revisePool(
    state,
    adds.map((hypothesis) => ({ kind: "add" as const, hypothesis })),
    problems,
  ).state;
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

type CardLang = "ja" | "en";

const BY_TEXT: Record<CardLang, Record<string, string>> = {
  ja: {
    first_mentioned: "先に出てきた人を、1とみる",
    second_mentioned: "あとに出てきた人を、1とみる",
    known_value: "わかっている数の人を、1とみる",
    asked: "聞かれている人を、1とみる",
    larger_number: "数の大きいほうを、1とみる",
    smaller_number: "数の小さいほうを、1とみる",
  },
  // The English card follows the same rules: no operation, no number but the 1 of "as 1", no judging
  // word, and never "you" (原則1・10・11; HANDOFF §7 の4).
  en: {
    first_mentioned: "takes the person named first as 1",
    second_mentioned: "takes the person named later as 1",
    known_value: "takes the person whose count is given as 1",
    asked: "takes the person asked about as 1",
    larger_number: "takes the side with the bigger count as 1",
    smaller_number: "takes the side with the smaller count as 1",
  },
};

const CARD_WORDS = {
  ja: {
    quoted: (word: string, before: boolean) => `「${word}」の${before ? "前" : "後ろ"}の人を、1とみる`,
    unquoted: (before: boolean) => `ある言葉の${before ? "前" : "後ろ"}の人を、1とみる`,
    swap: "1とみる人を、入れかえて読む",
    additiveNumerator: "分数の上の数だけ、ちがうと読む",
    additiveValue: "分数の大きさだけ、ちがうと読む",
    bySize: "数の大きさで、読み方を決める",
    percent: "百分率を、そのままの数とみる",
    same: "どの問題も、同じやり方で読む",
    asWritten: "文が言うとおりの人を、1とみる",
    invert: "分数を、上と下を入れかえて読む",
    flip: "ふえた・へったを、反対に読む",
    question: "聞かれている人を、ほかの人として読む",
    prefix: "後輩の読み方：",
  },
  en: {
    quoted: (word: string, before: boolean) => `takes the person ${before ? "before" : "after"} "${word}" as 1`,
    unquoted: (before: boolean) => `takes the person ${before ? "before" : "after"} a certain word as 1`,
    swap: "swaps who is taken as 1",
    additiveNumerator: "reads the top of the fraction as the gap between them",
    additiveValue: "reads the size of the fraction as the gap between them",
    bySize: "picks the reading by how big the counts are",
    percent: "reads a percent as a plain count",
    same: "reads every problem in the same way",
    asWritten: "takes as 1 the person the sentence says",
    invert: "reads the fraction upside down",
    flip: "reads gaining and losing the other way round",
    question: "reads the person asked about as someone else",
    prefix: "Junior's reading: ",
  },
} as const;

/** The card's words for one action. They name no operation and no number other than the "1" (原則1・11). */
function cardText(a: Action, lang: CardLang): string | null {
  const w = CARD_WORDS[lang];
  switch (a.action) {
    case "no_change":
      return null;
    case "choose_reference":
      if (typeof a.by === "string") return BY_TEXT[lang][a.by] as string;
      // The word was written by Claude: it is shown only when it is a plain word with no number or
      // operation in it (原則1・11); otherwise the card says "a word" without quoting it.
      return safeWord(a.by.word) ? w.quoted(a.by.word, a.by.holder === "before_word") : w.unquoted(a.by.holder === "before_word");
    case "swap_reference":
      return w.swap;
    case "set_relation_type_additive":
      return a.amount === "numerator" ? w.additiveNumerator : w.additiveValue;
    case "number_op":
      return a.mode === "divide_large_by_small" ? w.bySize : a.mode === "percent_as_count" ? w.percent : w.same;
    case "invert_ratio":
      return w.invert;
    case "flip_event":
      return w.flip;
    case "misread_question":
      return w.question;
  }
}

const NUMBER_OR_OPERATION = /[0-9０-９一二三四五六七八九十百千万〇零半倍分割足引掛たすひくかけわる+\-×÷*/=]|one|two|three|four|five|six|seven|eight|nine|ten|half|times|plus|minus|divide|multiply/i;
/** Words for numbers and multiples the letters above do not reach, and kanji for the results of operations. */
const MORE_NUMBER_WORDS = /eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|double|twice|triple|dozen|[差和積商乗]/i;

/**
 * A word the card may quote: short, one line, with no number and no operation in it. Core decides what is a
 * number (numbersIn) and what is an operation name (the gate's own patterns); the lists here only add to them.
 */
export function safeWord(w: string): boolean {
  if (w.length === 0 || w.length > 8 || /[\s「」]/.test(w)) return false;
  const t = w.normalize("NFKC");
  return numbersIn(t).length === 0 && !hasOperationName(t) && !NUMBER_OR_OPERATION.test(t) && !MORE_NUMBER_WORDS.test(t);
}

/**
 * The card's one line for the junior's reading. Given the problem, it names the clause that acted there,
 * and none when the reading builds the correct world; without a problem, the first clause that changes anything.
 * In English (lang "en") the card follows the same rules (HANDOFF §7 の4).
 */
export function readingCard(h: Hypothesis, record?: ProblemRecord, lang: CardLang = "ja", opts: { forEdit?: boolean } = {}): string | null {
  // The card the child edits (指示書 第7.1節 後輩のルールカード) always shows its slot, on any problem.
  if (opts.forEdit === true) {
    const slot = cardSlot(h, lang);
    return slot === null ? null : `${CARD_WORDS[lang].prefix}${slot}`;
  }
  const acting = record === undefined ? h.clauses : [...new Set(firedClauses(h, record))].sort((x, y) => x - y).map((i) => h.clauses[i] as Hypothesis["clauses"][number]);
  if (record !== undefined && sameReading(runRule(h, record), record.world, true)) return null;
  for (const c of acting) {
    const text = cardText(c.then, lang);
    if (text !== null) return `${CARD_WORDS[lang].prefix}${text}`;
  }
  return null;
}

/**
 * The slot of the rule card the child edits: who the rule takes as 1 (指示書 第7.1節 後輩のルールカード). Only a
 * rule with one clause that chooses who is 1, swaps it, or keeps the sentence's own 1 has a slot; the reading
 * that keeps it reads "the person the sentence says". The same card rules hold (no number but the 1, no
 * operation, no judging word, nothing placed on the child), in both languages.
 */
export function cardSlot(h: Hypothesis, lang: CardLang = "ja"): string | null {
  if (h.clauses.length !== 1) return null;
  const a = (h.clauses[0] as Hypothesis["clauses"][number]).then;
  if (a.action === "no_change") return CARD_WORDS[lang].asWritten;
  if (a.action === "choose_reference" || a.action === "swap_reference") return cardText(a, lang);
  return null;
}

/**
 * The sentences that do not hold in the world the rule builds on a problem (core runRule, then checkStatements
 * as the screen checks a world with no op of the child's). Null when core cannot run or check it.
 */
export function cardFailing(h: Hypothesis, record: ProblemRecord): number[] | null {
  try {
    const base = runRule(h, record);
    const phrases = [...new Set(record.statements.flatMap((s) => s.element_ids))].map((element_id) => ({
      phrase: element_id,
      lang: record.world.problem_lang,
      element_id,
    }));
    const child = apply({ correct: base, ops: [], phrases });
    if (child.discarded.length > 0) return null;
    const checked = checkStatements({ correct: record.world, statements: record.statements, syntaxMarks: record.syntax_marks, ops: [], child });
    if (checked.kind !== "checked") return null;
    return checked.statements.filter((s) => s.verdict !== "holds").map((s) => s.index);
  } catch {
    return null;
  }
}

/** Whether the rule makes every sentence hold on every problem given. An empty list never fits. */
export function cardFits(h: Hypothesis, records: readonly ProblemRecord[]): boolean {
  return records.length > 0 && records.every((r) => cardFailing(h, r)?.length === 0);
}
