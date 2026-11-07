// One session of the experience (指示書 第7.1節 reduced to HANDOFF §3 F1・F2・F3・F8; 第11節 M7).
// The machine is pure: it never calls a server. The session controller (session.ts) sends the junior's
// generated words (KOHAI_LINE), the research agent's pool (RESEARCH_RESULT) and safety results
// (SAFETY_RESULT) as events; without them the flow runs on core's templates and the fallback pool. The
// child's voice comes as VOICE_HEARD (the browser's final words, kept in memory only) and VOICE_OPS (the ops
// the worker's /interpret returned); core validates the ops again here before any is used.
// Every world, verdict and number comes from @kimi/core through problem.ts.
import { and, assign, or, setup, stateIn } from "xstate";
import {
  CARD_RULES,
  CORRECT_READING_ID,
  FRACTION_BANK,
  cardFits,
  checkScenePair,
  pickScenes,
  sceneAvoidValues,
  gate,
  holderName,
  initialState,
  observe,
  observeAgreement,
  problemNumber,
  readingCard,
  render,
  transcript,
  validateOps,
  type AnyOp,
  type Hypothesis,
  type KohaiReading,
  type Lang,
  type ProblemRecord,
  type Rational,
  type ResearchState,
  type SceneChoice,
  type ScenePair,
  type SlotValues,
  type TemplateKey,
  type WorldScene,
} from "@kimi/core";
import {
  MAX_FIXES,
  firstReading,
  galleryOf,
  gateContext,
  judgeTotal,
  judgeUnit,
  juniorFor,
  knownEnd,
  lockSession,
  referenceOp,
  relationOf,
  researched,
  selectNext,
  showOn,
  wordCueOp,
  type GalleryItem,
  type PickReason,
  type SessionMisread,
  type Shown,
} from "./problem.ts";
import { hasForbiddenPhrase } from "./text.ts";

export const FIRST_PROBLEM_ID = "p_signboard";
export const DEFAULT_MAX_PROBLEMS = 3;
/** The junior's generated sentence is at most this long (指示書 第6.8節 関門8). */
const MAX_LINE_CHARS = 40;
/** Tries at the unit and at the total on one problem before it is held (指示書 第5.7節). */
export const MAX_ANSWER_TRIES = 2;
/** The worker takes at most this many readings in one /research call; the device keeps them all. */
export const MAX_RESEARCH_READINGS = 12;
/** Times the child may answer by voice on one problem (指示書 第7.1節); after that the card only. */
export const MAX_VOICE_TURNS = 2;
/** The words heard are kept up to this length (memory only). */
export const MAX_HEARD_CHARS = 200;
/** The junior hands back what it heard only when it is this short; otherwise the problem words heard. */
const MAX_HEARD_ECHO_CHARS = 40;

export type KohaiIntent = "read" | "which" | "restate";

/** The child's prediction about the junior's world (指示書 第7.1節 手順4): "unknown" is the skip (no observation). */
export type PredictionAnswer = "fits" | "odd" | "unknown";
export type PredictionOrder = readonly ["fits", "odd"] | readonly ["odd", "fits"];

/**
 * The order of the two prediction buttons on the n-th problem of the session (1-based). It changes on every
 * problem, so no answer sits in the same place twice in a row (指示書 第11節 M7), and it is decided by the
 * problem's number so the tests can check it. Neither button is chosen beforehand.
 */
export function predictionOrder(n: number): PredictionOrder {
  return n % 2 === 1 ? (["fits", "odd"] as const) : (["odd", "fits"] as const);
}

/** What the controller sends to POST /kohai. No correct world, no right or wrong, no child's free words. */
export interface KohaiRequest {
  problem_id: string;
  intent: KohaiIntent;
  lang: Lang;
  kohaiWorld: WorldScene;
  childOps: { holderIds: string[]; words: string[] };
  failing?: { statement_index: number; words: string[] }[];
}

/** One reading as sent to POST /research: the problem by id, the child's world, and the tapped words. */
export interface ResearchReadingBody {
  problem_id: string;
  childWorld: WorldScene;
  referencePlaced: boolean;
  afterFix: boolean;
  wordbookOpenedBefore: boolean;
  words: string[];
}

export interface ResearchRequest {
  pool: ResearchState["pool"];
  weights: ResearchState["weights"];
  unscored: number;
  unexpressible: boolean;
  readings: ResearchReadingBody[];
}

/** The junior's current words: a core template, replaced by a generated line only when that passes. */
export interface Line {
  seq: number;
  key: TemplateKey | null;
  text: string;
  source: "template" | "claude";
  intent: KohaiIntent | null;
  request: KohaiRequest | null;
}

export interface ProblemState {
  record: ProblemRecord;
  /** Why this problem was opened (core chooseNext), for the adults' research note only. */
  pickedBy: PickReason;
  relationId: string;
  reading: KohaiReading;
  /** The card's one line (from the second problem), or null. */
  card: string | null;
  /** The taught reading builds the sentence's own world here: drawn as the length order only until the child's 1. */
  orderOnly: boolean;
  /** The child's prediction about the junior's world, null until the child answers or skips it. */
  prediction: PredictionAnswer | null;
  /** The order of the "fits" and "odd" buttons on this problem. */
  predictionOrder: PredictionOrder;
  /** The junior's world as its rule built it: the child's teaching is applied to this. */
  base: WorldScene;
  /** The world on screen now, with its failing sentences. */
  shown: Shown;
  /** Where the child has put the "1" card and not yet confirmed. */
  placement: string | null;
  /** The problem words the child tapped as the reason (statement, token), or heard in the child's voice. */
  words: { statementIndex: number; token: number }[];
  /**
   * The child's last words heard by the browser, in memory only: for the junior's restate line and the research
   * request's words. Never in the log, the research state or the store; let go once taught or replaced by a tap.
   */
  heard: string | null;
  /** Waiting for the ops of the words heard (the junior has acknowledged them). */
  listening: boolean;
  voiceTurns: number;
  /** The child's first confirmed placement on this problem, before any fix (the research observation). */
  firstPlacement: string | null;
  /** The ops of the last confirmed teaching (evidence always empty). */
  taughtOps: AnyOp[];
  fixes: number;
  unitTries: number;
  unitValue: Rational | null;
  totalTries: number;
  totalValue: Rational | null;
  logged: boolean;
}

export type Outcome = "solved" | "held" | "stopped" | "hard" | "rest";

/** What the device keeps of one problem (no child's free words: evidence is always empty). */
export interface ProblemLog {
  problemId: string;
  consistency: ProblemRecord["consistency"];
  source: KohaiReading["source"];
  readingId: string;
  reading: Hypothesis;
  /** The child's prediction about the junior's world (null: the problem ended before it). */
  prediction: PredictionAnswer | null;
  firstPlacement: string | null;
  ops: AnyOp[];
  fixes: number;
  unitTries: number;
  totalTries: number;
  outcome: Outcome;
}

/**
 * The junior's rule card the child edits (指示書 第7.1節 後輩のルールカード, 第2節 自分で直す): the reading it
 * opened with, the rule on the card now, and the solved problems of this session drawn as that rule's worlds.
 */
export interface RuleCardState {
  /** The problem after which the card opened (it opens once after each problem). */
  afterProblemId: string;
  /** The junior's reading when the card opened. */
  start: Hypothesis;
  /** The rule on the card now: the start, or one of core's CARD_RULES the child chose. */
  rule: Hypothesis;
  /** How many times the child chose a rule. */
  picks: number;
  gallery: GalleryItem[];
  /** The everyday scenes, or null when no reading on hand breaks a scene. */
  scenes: CardScenes | null;
}

/** The kinds of the problem words a child can tap (core's syntax marks), and "other" for an unmarked word. */
export type WordKind = "holder_mention" | "ratio_notation" | "relation_word" | "unit_word" | "demonstrative" | "sentence_pattern" | "other";

/** What the controller sends to POST /scenes: the reading, the language and the kinds of the tapped words (never the words). */
export interface ScenesRequest {
  rule: Hypothesis;
  lang: Lang;
  word_kinds: WordKind[];
}

/**
 * The everyday scenes on the rule card (指示書 第6.7節 手順5): two scenes core checked for one reading, the one
 * that breaks the common-sense sentence and the one that keeps it. They are drawn as the worlds of the rule on
 * the card now; the program's pair comes at once, and a proposal from the worker replaces it only when core
 * passes it for the same reading.
 */
export interface CardScenes {
  /** The reading the scenes are for: the rule on the card, or, when that never breaks a scene, the card's first reading or the session's misreading. */
  focus: Hypothesis;
  pair: ScenePair;
  source: "program" | "claude";
  /** Claude's line for grown-ups. Never on the child's screen. */
  reason: string | null;
  request: ScenesRequest;
}

/** What the device keeps of one rule card (no child's words): the rule left and whether every world fit. */
export interface CardLog {
  afterProblemId: string;
  startRuleId: string;
  leftRuleId: string;
  picks: number;
  fitsAll: boolean;
  galleryIds: string[];
}

export type SafetyFlagEvent = "none" | "distress" | "inappropriate" | "unchecked";

export interface FlowInput {
  lang?: Lang;
  bank?: readonly ProblemRecord[];
  firstProblemId?: string;
  maxProblems?: number;
  introSeen?: boolean;
  consented?: boolean;
  research?: ResearchState;
}

export interface FlowContext {
  lang: Lang;
  bank: readonly ProblemRecord[];
  firstProblemId: string;
  maxProblems: number;
  introSeen: boolean;
  consented: boolean;
  research: ResearchState;
  /** Set once, when the child confirms the first placement on the first problem; the controller posts it. */
  researchRequest: ResearchRequest | null;
  /** The agent's pool (null: failed or timed out); undefined until the controller answers. */
  researchResult: Hypothesis[] | null | undefined;
  researchApplied: boolean;
  /** The research agent's pool that came after the wait (it runs on); taken once, from the next problem on. */
  lateResearchApplied: boolean;
  session: SessionMisread | null;
  firstRecord: ProblemRecord | null;
  /** The reading the child left on the rule card when it made every gallery world fit; the junior reads with it. */
  taught: Hypothesis | null;
  ruleCard: RuleCardState | null;
  /** The problem after which the rule card was last shown (so it opens once after each problem). */
  cardShownAfter: string | null;
  cardLog: CardLog[];
  done: string[];
  problem: ProblemState | null;
  line: Line | null;
  /** The last line number used: lines never go back to an earlier number within a session. */
  lastSeq: number;
  uncheckedStreak: number;
  highlight: boolean;
  /** The worker could not be reached (or has no key) for the voice: the mic is not offered for the rest of the session. */
  voiceOff: boolean;
  log: ProblemLog[];
  safetyLog: ("distress" | "hard_button" | "rest")[];
  endedBy: null | "stop" | "finished" | "consent_declined" | "hard" | "rest";
}

export type FlowEvent =
  | { type: "NEXT" }
  | { type: "CONSENT_YES" }
  | { type: "CONSENT_NO" }
  | { type: "PREDICT"; answer: PredictionAnswer }
  | { type: "PLACE_ONE"; quantityId: string }
  | { type: "TAP_WORD"; statementIndex: number; token: number }
  | { type: "CONFIRM_YES" }
  | { type: "CONFIRM_NO" }
  | { type: "ANSWER_UNIT"; value: Rational }
  | { type: "ANSWER_TOTAL"; value: Rational }
  | { type: "STOP" }
  | { type: "DONT_KNOW" }
  | { type: "HARD" }
  | { type: "RESUME" }
  | { type: "HOLD" }
  /** The child chooses who is taken as 1 on the junior's rule card: one of core's CARD_RULES. */
  | { type: "CARD_PICK"; ruleId: string }
  /** A proposal for the everyday scenes from the worker (choices only); core checks it again before it is used. */
  | { type: "SCENES_RESULT"; focusId: string; proposal: { breaks: SceneChoice; keeps: SceneChoice } | null; reason: string | null }
  | { type: "CLOSE" }
  | { type: "KOHAI_LINE"; seq: number; text: string }
  | { type: "RESEARCH_RESULT"; pool: Hypothesis[] | null }
  /** The agent's pool arriving after the wait ended and the fallback was used. */
  | { type: "RESEARCH_LATE"; pool: Hypothesis[] }
  | { type: "SAFETY_RESULT"; flag: SafetyFlagEvent }
  /** The browser's final words for what the child said (the controller sends them to /safety and /interpret). */
  | { type: "VOICE_HEARD"; transcript: string }
  /** The ops /interpret returned for the words heard (null: none, failed, timed out, or not to be answered, Q26). */
  | { type: "VOICE_OPS"; ops: AnyOp[] | null; offline?: boolean }
  /** The screen's language (HANDOFF §7 の4): taken only while no problem is open, so a problem's lines and card stay in one language. */
  | { type: "SET_LANG"; lang: Lang };

// ---------------------------------------------------------------------------------------------
// Pure helpers over the context
// ---------------------------------------------------------------------------------------------

function said(p: ProblemState | null): Rational[] {
  return p === null ? [] : [p.unitValue, p.totalValue].filter((x): x is Rational => x !== null);
}

/** A core template as the junior's or the guide's line; a template the gate refuses is not shown. */
function lineOf(ctx: FlowContext, key: TemplateKey, slots: SlotValues, intent: KohaiIntent | null, request: KohaiRequest | null): Line {
  const seq = Math.max(ctx.lastSeq, ctx.line?.seq ?? 0) + 1;
  let text: string;
  try {
    const action = render(key, ctx.lang, seq, slots);
    const ok = ctx.problem === null || gate(action, gateContext(ctx.problem.record, ctx.lang, said(ctx.problem))).ok;
    text = ok ? action.text : "";
  } catch {
    text = "";
  }
  return { seq, key, text, source: "template", intent, request };
}

/** Clears the junior's line and keeps its number, so the next line has a later one. */
function noLine(ctx: FlowContext): { line: null; lastSeq: number } {
  return { line: null, lastSeq: Math.max(ctx.lastSeq, ctx.line?.seq ?? 0) };
}

const holderOf = (record: ProblemRecord, quantityId: string): string | undefined => record.world.quantities.find((q) => q.id === quantityId)?.holder;

function wordsOf(p: ProblemState): string[] {
  return p.words.flatMap((w) => {
    const t = p.record.statements[w.statementIndex]?.tokens[w.token];
    return t === undefined ? [] : [t];
  });
}

/**
 * No request when the junior's world is the sentence's own world (a taught card that fits): the worker
 * refuses that world anyway, and the fixed line is enough (safety review, Q38).
 */
function requestOrNull(ctx: FlowContext, p: ProblemState, intent: KohaiIntent): KohaiRequest | null {
  return p.orderOnly ? null : requestFor(ctx, p, intent);
}

function requestFor(ctx: FlowContext, p: ProblemState, intent: KohaiIntent): KohaiRequest {
  const holder = p.placement === null ? undefined : holderOf(p.record, p.placement);
  return {
    problem_id: p.record.world.problem_id,
    intent,
    lang: ctx.lang,
    kohaiWorld: p.shown.world,
    childOps: { holderIds: holder === undefined ? [] : [holder], words: intent === "restate" ? wordsOf(p) : [] },
    ...(intent === "which" ? { failing: p.shown.cues } : {}),
  };
}

function readLine(ctx: FlowContext, p: ProblemState): Line {
  return lineOf(ctx, "kohai.read", {}, "read", requestOrNull(ctx, p, "read"));
}

function whichLine(ctx: FlowContext): Line | null {
  const p = ctx.problem;
  if (p === null) return null;
  return lineOf({ ...ctx }, "kohai.which", {}, "which", requestOrNull(ctx, p, "which"));
}

function restateLine(ctx: FlowContext): Line | null {
  const p = ctx.problem;
  if (p === null || p.placement === null) return null;
  const holder = holderOf(p.record, p.placement);
  if (holder === undefined) return null;
  const base = lineOf(ctx, "kohai.restate", { holder: holderName(p.shown.world, holder) }, "restate", requestOrNull(ctx, p, "restate"));
  if (base.text === "") return base;
  // What the junior heard is handed back as it was said, when core's gate passes it (no answer, no operation name).
  const heard = p.heard === null ? null : heardEcho(ctx, p.heard);
  if (heard !== null) return { ...base, text: `${heard} ${base.text}` };
  const words = wordsOf(p);
  if (words.length === 0) return base;
  // The child's tapped word is handed back as it is, never put in other words (第6.8節 関門9).
  const echo = lineOf(ctx, "kohai.restate_word", { transcript: transcript(words.join("、")) }, null, null);
  return echo.text === "" ? base : { ...base, text: `${base.text} ${echo.text}` };
}

function heardEcho(ctx: FlowContext, heard: string): string | null {
  if (heard.length > MAX_HEARD_ECHO_CHARS || hasForbiddenPhrase(heard)) return null;
  const echo = lineOf(ctx, "kohai.restate_heard", { transcript: transcript(heard) }, null, null);
  return echo.text === "" ? null : echo.text;
}

/** The kinds of marked problem words a voice may name as a reason (the same kinds a child taps). */
const HEARD_KINDS = new Set(["holder_mention", "ratio_notation", "relation_word", "demonstrative"]);
const MAX_HEARD_CUES = 3;

/** The words heard as the problem writes them: full-width forms folded, and 「4分の3」 as 「3/4」. */
function foldHeard(text: string): string {
  return text.normalize("NFKC").replace(/(\d+)\s*分\s*の\s*(\d+)/g, "$2/$1");
}

/**
 * Problem words heard in the child's voice, as tapped-word cues: the marked words of the problem's sentences
 * (not the question) that the words heard hold. A word of one kana (の) is too common to take from a voice.
 */
function heardCues(record: ProblemRecord, heard: string): { statementIndex: number; token: number }[] {
  const said = foldHeard(heard);
  const out: { statementIndex: number; token: number }[] = [];
  const seen = new Set<string>();
  for (const m of record.syntax_marks) {
    if (!HEARD_KINDS.has(m.kind)) continue;
    const st = record.statements[m.statement_index];
    if (st === undefined || st.is_question) continue;
    for (let t = m.token_start; t <= m.token_end; t++) {
      const tok = st.tokens[t];
      if (tok === undefined || seen.has(tok) || /^[\u3040-\u30ff]$/.test(tok) || !said.includes(tok.normalize("NFKC"))) continue;
      seen.add(tok);
      out.push({ statementIndex: m.statement_index, token: t });
    }
  }
  return out.slice(0, MAX_HEARD_CUES);
}

/**
 * The ops of the words heard, as the child's own moves: core validates them on this problem's correct world;
 * a reference op on an end of the relation is the child's "1" card (as PLACE_ONE), word cues on the problem's
 * tokens and the problem words heard are the tapped words. Null when nothing usable is left.
 */
function voiceUse(ctx: FlowContext, ops: AnyOp[] | null): { quantityId: string; words: { statementIndex: number; token: number }[] } | null {
  const p = ctx.problem;
  if (p === null || !Array.isArray(ops) || ops.length === 0) return null;
  try {
    if (!validateOps(p.record.world, ops).ok) return null;
  } catch {
    return null;
  }
  let quantityId: string | null = null;
  for (const o of ops) if (o.op === "set_relation_reference" && o.target_id === p.relationId && isEnd(ctx, o.reference)) quantityId ??= o.reference;
  if (quantityId === null) return null;
  const cues: { statementIndex: number; token: number }[] = [];
  for (const o of ops) {
    if (o.op !== "word_cue") continue;
    for (const t of o.tokens) if (validToken(ctx, o.statement_index, t)) cues.push({ statementIndex: o.statement_index, token: t });
  }
  for (const c of p.heard === null ? [] : heardCues(p.record, p.heard)) {
    if (!cues.some((x) => x.statementIndex === c.statementIndex && x.token === c.token)) cues.push(c);
  }
  return { quantityId, words: cues.slice(0, MAX_HEARD_CUES) };
}

/** The child's words heard: kept in memory, and the junior's fixed acknowledgement at once (no request to the worker). */
function hear(ctx: FlowContext, text: string): Partial<FlowContext> {
  const p = ctx.problem;
  if (p === null) return {};
  const problem = { ...p, heard: text.trim().slice(0, MAX_HEARD_CHARS), listening: true, voiceTurns: p.voiceTurns + 1 };
  return { problem, line: lineOf({ ...ctx, problem }, "kohai.listening", {}, null, null) };
}

function voicePlace(ctx: FlowContext, ops: AnyOp[] | null): Partial<FlowContext> {
  const p = ctx.problem;
  const use = voiceUse(ctx, ops);
  if (p === null || use === null) return {};
  const problem = { ...p, placement: use.quantityId, words: use.words.length > 0 ? use.words : p.words, listening: false };
  return { problem, line: restateLine({ ...ctx, problem }) };
}

/** Nothing usable came back: the junior asks for the card with a fixed line, and taps go on (no dead end). */
function voiceMiss(ctx: FlowContext, offline: boolean): Partial<FlowContext> {
  const p = ctx.problem;
  if (p === null) return {};
  const problem = { ...p, heard: null, listening: false };
  return { problem, line: lineOf({ ...ctx, problem }, "kohai.show_card", {}, null, null), voiceOff: ctx.voiceOff || offline };
}

/** Builds the state of a new problem from core's choice of problem and the junior's reading. */
function loadProblem(ctx: FlowContext): Partial<FlowContext> {
  if (ctx.done.length >= ctx.maxProblems) return { problem: null, ...noLine(ctx) };
  let pick: ReturnType<typeof selectNext> = null;
  if (ctx.done.length === 0) {
    const first = ctx.bank.find((r) => r.world.problem_id === ctx.firstProblemId);
    const junior = first === undefined ? null : juniorFor(first, ctx.research, ctx.session, ctx.lang, ctx.taught);
    if (first !== undefined && junior !== null) pick = { record: first, junior, reason: { kind: "first" } };
  }
  pick ??= selectNext(ctx.bank, ctx.done, ctx.research, ctx.session, ctx.lang, ctx.taught);
  if (pick === null) return { problem: null, ...noLine(ctx) };
  const { record, junior, reason } = pick;
  const rel = relationOf(record);
  if (rel === undefined) return { problem: null, ...noLine(ctx) };
  const session: SessionMisread =
    ctx.session ?? {
      id: junior.reading.sessionMisreadId ?? junior.reading.hypothesis.id,
      hypothesis: junior.reading.hypothesis,
      // With a pool from earlier sessions the research layer has already spoken.
      locked: ctx.research.pool.length > 0,
    };
  const problem: ProblemState = {
    record,
    pickedBy: reason,
    relationId: rel.id,
    reading: junior.reading,
    card: ctx.done.length >= 1 ? readingCard(junior.reading.hypothesis, record, ctx.lang) : null,
    orderOnly: junior.orderOnly,
    prediction: null,
    predictionOrder: predictionOrder(ctx.done.length + 1),
    base: junior.base,
    shown: junior.shown,
    placement: null,
    words: [],
    heard: null,
    listening: false,
    voiceTurns: 0,
    firstPlacement: null,
    taughtOps: [],
    fixes: 0,
    unitTries: 0,
    unitValue: null,
    totalTries: 0,
    totalValue: null,
    logged: false,
  };
  const next = { ...ctx, problem };
  return {
    problem,
    session,
    firstRecord: ctx.firstRecord ?? record,
    done: [...ctx.done, record.world.problem_id],
    line: readLine(next, problem),
  };
}

/**
 * The child's prediction about the junior's world. It is kept on the problem and observed by core's
 * agreement model (指示書 第6.7節 手順2 (ii)); "unknown" observes nothing. Whether it "fits" is never shown:
 * every answer goes on to the same lit sentences and the same junior's line.
 */
function predict(ctx: FlowContext, answer: PredictionAnswer): Partial<FlowContext> {
  const p = ctx.problem;
  if (p === null || p.prediction !== null) return {};
  let research: ResearchState;
  try {
    // The junior's world as its reading built it, with its "1" card drawn (so the reference is observed).
    research = observeAgreement(ctx.research, { record: p.record, shownWorld: p.base, answer, referencePlaced: true });
  } catch {
    // core could not judge it: the prediction is kept on the log and the research state stays as it was.
    research = ctx.research;
  }
  return { problem: { ...p, prediction: answer }, research };
}

function isEnd(ctx: FlowContext, quantityId: string): boolean {
  const p = ctx.problem;
  if (p === null) return false;
  const rel = p.record.world.relations.find((r) => r.id === p.relationId);
  return rel !== undefined && (rel.subject === quantityId || rel.reference === quantityId);
}

function place(ctx: FlowContext, quantityId: string): Partial<FlowContext> {
  const p = ctx.problem;
  if (p === null) return {};
  // The child's own card move replaces any words heard before it, and a late reply for them is dropped.
  const problem = { ...p, placement: quantityId, heard: null, listening: false };
  return { problem, line: restateLine({ ...ctx, problem }) };
}

/**
 * The child said "yes" to the junior's restatement. The first placement confirmed on this problem, before
 * any fix, is the research observation (第6.7節); on the first problem of the session the research request
 * is built here, with the words the child tapped before confirming. A placement the child rejected is
 * neither observed nor sent.
 */
function confirmFirst(ctx: FlowContext): Partial<FlowContext> {
  const p = ctx.problem;
  if (p === null || p.placement === null || p.firstPlacement !== null) return {};
  const reading = firstReading(p.record, p.relationId, p.placement);
  const research = reading === null ? ctx.research : observe(ctx.research, reading);
  const problem = { ...p, firstPlacement: p.placement };
  const firstOfSession = ctx.done.length === 1 && ctx.researchRequest === null && !ctx.researchApplied;
  // The worker takes the most recent readings only; the device keeps every one (第7.5節).
  const recent = research.readings.slice(-MAX_RESEARCH_READINGS);
  const researchRequest: ResearchRequest | null =
    firstOfSession && reading !== null
      ? {
          pool: research.pool,
          weights: research.weights,
          unscored: research.unscored,
          unexpressible: research.unexpressible,
          readings: recent.map((r, i) => ({
            problem_id: r.record.world.problem_id,
            childWorld: r.childWorld,
            referencePlaced: r.referencePlaced,
            afterFix: r.afterFix,
            wordbookOpenedBefore: r.wordbookOpenedBefore,
            // Only this problem's tapped words or words heard, and only in memory (第9節).
            words: i === recent.length - 1 ? researchWords(problem) : [],
          })),
        }
      : ctx.researchRequest;
  return { problem, research, researchRequest };
}

/** The words heard when they fit the worker's limit for one word, otherwise the problem words tapped or heard. */
function researchWords(p: ProblemState): string[] {
  return p.heard !== null && p.heard.length <= MAX_HEARD_ECHO_CHARS ? [p.heard] : wordsOf(p);
}

function tapWord(ctx: FlowContext, statementIndex: number, token: number): Partial<FlowContext> {
  const p = ctx.problem;
  if (p === null) return {};
  const problem = { ...p, words: [{ statementIndex, token }], heard: null, listening: false };
  return { problem };
}

function validToken(ctx: FlowContext, statementIndex: number, token: number): boolean {
  const s = ctx.problem?.record.statements[statementIndex];
  return s !== undefined && Number.isInteger(token) && token >= 0 && token < s.tokens.length;
}

function teach(ctx: FlowContext): Partial<FlowContext> {
  const p = ctx.problem;
  if (p === null || p.placement === null) return {};
  const ops = [referenceOp(p.relationId, p.placement), ...p.words.map((w) => wordCueOp(w.statementIndex, w.token))];
  const shown = showOn(p.record, p.base, ops, ctx.lang);
  // When core refuses the taught world, the junior's world stays as it was and the try still counts.
  return { problem: { ...p, shown: shown ?? p.shown, taughtOps: ops, fixes: p.fixes + 1, placement: null, heard: null, listening: false } };
}

function logOf(p: ProblemState, outcome: Outcome): ProblemLog {
  const pending = p.placement === null ? [] : [referenceOp(p.relationId, p.placement), ...p.words.map((w) => wordCueOp(w.statementIndex, w.token))];
  const ops = (p.taughtOps.length > 0 ? p.taughtOps : pending).map((o) => ({ ...o, evidence: "" }));
  return {
    problemId: p.record.world.problem_id,
    consistency: p.record.consistency,
    source: p.reading.source,
    readingId: p.reading.hypothesis.id,
    reading: p.reading.hypothesis,
    prediction: p.prediction,
    firstPlacement: p.firstPlacement,
    ops,
    fixes: p.fixes,
    unitTries: p.unitTries,
    totalTries: p.totalTries,
    outcome,
  };
}

function close(ctx: FlowContext, outcome: Outcome): Partial<FlowContext> {
  const p = ctx.problem;
  if (p === null || p.logged) return {};
  return { problem: { ...p, logged: true }, log: [...ctx.log, logOf(p, outcome)] };
}

/** The solved problems of this session, in order: the rule card's gallery. */
function solvedRecords(ctx: FlowContext): ProblemRecord[] {
  return ctx.log.flatMap((l) => {
    const r = l.outcome === "solved" ? ctx.bank.find((b) => b.world.problem_id === l.problemId) : undefined;
    return r === undefined ? [] : [r];
  });
}

/** Two solved problems, and the card not yet shown after the last problem. */
function needsCard(ctx: FlowContext): boolean {
  const last = ctx.log.at(-1)?.problemId;
  return last !== undefined && last !== ctx.cardShownAfter && solvedRecords(ctx).length >= 2;
}

const MAX_WORD_KINDS = 16;

/** The kinds of the words the child tapped as reasons this session (never the words themselves). */
function tappedKinds(ctx: FlowContext): WordKind[] {
  const out: WordKind[] = [];
  for (const l of ctx.log) {
    const record = ctx.bank.find((b) => b.world.problem_id === l.problemId);
    if (record === undefined) continue;
    for (const o of l.ops) {
      if (o.op !== "word_cue") continue;
      for (const t of o.tokens) {
        const mark = record.syntax_marks.find((m) => m.statement_index === o.statement_index && m.token_start <= t && t <= m.token_end);
        const kind: WordKind = mark?.kind ?? "other";
        if (!out.includes(kind)) out.push(kind);
      }
    }
  }
  return out.slice(0, MAX_WORD_KINDS);
}

/**
 * The everyday scenes for the card (指示書 第6.7節 手順5): core's pair for the rule on the card, or, when that rule
 * never breaks a scene (the sentence's own reading), for the card's first reading or the session's misreading.
 * The scenes keep away from every bank problem's answer and one part. Kept as they are while the reading stays.
 */
function scenesFor(ctx: FlowContext, rule: Hypothesis, start: Hypothesis, prev: CardScenes | null): CardScenes | null {
  const candidates = [rule, start, ...(ctx.session === null ? [] : [ctx.session.hypothesis])].filter((h) => h.id !== CORRECT_READING_ID);
  const avoid = sceneAvoidValues(ctx.bank);
  for (const h of candidates) {
    if (prev !== null && prev.focus.id === h.id) return prev;
    let pair: ScenePair | null;
    try {
      pair = pickScenes(h, avoid);
    } catch {
      pair = null;
    }
    // The request carries the reading's clauses only: no cue words and no note for grown-ups go to the server.
    if (pair !== null) return { focus: h, pair, source: "program", reason: null, request: { rule: { ...h, word_cues: [], note_for_adult: "" }, lang: ctx.lang, word_kinds: tappedKinds(ctx) } };
  }
  return null;
}

/** A proposal for the scenes is used only for the reading the scenes are for now, and only when core passes it. */
function acceptScenes(ctx: FlowContext, focusId: string, proposal: { breaks: SceneChoice; keeps: SceneChoice } | null, reason: string | null): Partial<FlowContext> {
  const c = ctx.ruleCard;
  const s = c?.scenes;
  if (c === null || s === null || s === undefined || s.focus.id !== focusId || proposal === null) return {};
  let pair: ScenePair | null;
  try {
    pair = checkScenePair(s.focus, proposal, sceneAvoidValues(ctx.bank));
  } catch {
    pair = null;
  }
  if (pair === null) return {};
  return { ruleCard: { ...c, scenes: { ...s, pair, source: "claude", reason: typeof reason === "string" ? reason.slice(0, 300) : null } } };
}

/** Opens the rule card with the junior's reading on the last problem (kept as it is when the child comes back to it). */
function openCard(ctx: FlowContext): Partial<FlowContext> {
  const last = ctx.log.at(-1);
  if (last === undefined) return {};
  if (ctx.ruleCard?.afterProblemId === last.problemId) return {};
  const start = ctx.taught ?? last.reading;
  return {
    ruleCard: {
      afterProblemId: last.problemId,
      start,
      rule: start,
      picks: 0,
      gallery: galleryOf(start, solvedRecords(ctx), ctx.lang),
      scenes: scenesFor(ctx, start, start, null),
    },
    ...noLine(ctx),
  };
}

/** The child chose a rule: every gallery world is built again by core with it. */
function pickCard(ctx: FlowContext, ruleId: string): Partial<FlowContext> {
  const c = ctx.ruleCard;
  const h = CARD_RULES.find((x) => x.id === ruleId);
  if (c === null || h === undefined) return {};
  return { ruleCard: { ...c, rule: h, picks: c.picks + 1, gallery: galleryOf(h, solvedRecords(ctx), ctx.lang), scenes: scenesFor(ctx, h, c.start, c.scenes) } };
}

/**
 * The child leaves the card: it is recorded, and its rule becomes the junior's taught reading only when it
 * makes every gallery world fit (core cardFits); otherwise the session's one misreading goes on (Q30).
 */
function leaveCard(ctx: FlowContext): Partial<FlowContext> {
  const c = ctx.ruleCard;
  if (c === null) return {};
  const records = solvedRecords(ctx);
  let fitsAll: boolean;
  try {
    fitsAll = cardFits(c.rule, records);
  } catch {
    fitsAll = false;
  }
  const entry: CardLog = {
    afterProblemId: c.afterProblemId,
    startRuleId: c.start.id,
    leftRuleId: c.rule.id,
    picks: c.picks,
    fitsAll,
    galleryIds: records.map((r) => r.world.problem_id),
  };
  return { ruleCard: null, cardShownAfter: c.afterProblemId, cardLog: [...ctx.cardLog, entry], taught: fitsAll ? c.rule : null };
}

function applyResearch(ctx: FlowContext): Partial<FlowContext> {
  if (ctx.researchApplied || ctx.done.length === 0) return {};
  const research = ctx.researchRequest === null ? ctx.research : researched(ctx.research, ctx.researchResult ?? null, ctx.bank);
  const session = ctx.session === null || ctx.firstRecord === null || ctx.session.locked ? ctx.session : lockSession(research, ctx.firstRecord, ctx.session);
  return { research, session, researchApplied: true };
}

/** A generated line is used only for the line it was asked for, and only when core's gate and the word list pass it. */
function acceptGenerated(ctx: FlowContext, seq: number, text: string): boolean {
  const l = ctx.line;
  const p = ctx.problem;
  if (l === null || p === null || l.seq !== seq || l.intent === null || l.source !== "template") return false;
  if (typeof text !== "string" || text.length === 0 || text.length > MAX_LINE_CHARS) return false;
  if (hasForbiddenPhrase(text)) return false;
  try {
    return gate({ kind: "say", text }, gateContext(p.record, ctx.lang, said(p))).ok;
  } catch {
    return false;
  }
}

/**
 * A unit or a total that core did not accept: the child's number stays as the child's own, and the junior
 * says its fixed mismatch line (never the right number, never a judging word). After MAX_ANSWER_TRIES the
 * problem is held by the machine (指示書 第5.7節).
 */
function answerMiss(ctx: FlowContext, kind: "unit" | "total", value: Rational): Partial<FlowContext> {
  const p = ctx.problem;
  if (p === null) return {};
  const problem = kind === "unit" ? { ...p, unitTries: p.unitTries + 1, unitValue: value } : { ...p, totalTries: p.totalTries + 1, totalValue: value };
  const known = knownEnd(p.record);
  let line: Line | null = null;
  try {
    if (known?.value !== null && known !== undefined) {
      line = lineOf(
        { ...ctx, problem },
        "unit.mismatch",
        { holder: holderName(p.record.world, known.holder), number: problemNumber(p.record.world, known.value as Rational) },
        null,
        null,
      );
    }
  } catch {
    line = null;
  }
  return line === null ? { problem } : { problem, line };
}

// ---------------------------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------------------------

const inSession = or([stateIn("#flow.active"), stateIn("#flow.stuck")]);

export const flowMachine = setup({
  types: {
    context: {} as FlowContext,
    events: {} as FlowEvent,
    input: {} as FlowInput | undefined,
  },
  guards: {
    needsIntro: ({ context }) => !context.introSeen,
    needsConsent: ({ context }) => !context.consented,
    hasProblem: ({ context }) => context.problem !== null && !context.problem.logged,
    predictable: ({ context, event }) =>
      event.type === "PREDICT" && (["fits", "odd", "unknown"] as const).includes(event.answer) && context.problem !== null && context.problem.prediction === null,
    placeable: ({ context, event }) => event.type === "PLACE_ONE" && isEnd(context, event.quantityId),
    tappable: ({ context, event }) => event.type === "TAP_WORD" && validToken(context, event.statementIndex, event.token),
    allHold: ({ context }) => context.problem !== null && context.problem.shown.failing.length === 0 && context.problem.taughtOps.length > 0,
    tooManyFixes: ({ context }) => (context.problem?.fixes ?? 0) >= MAX_FIXES,
    lastUnitTry: ({ context }) => (context.problem?.unitTries ?? 0) + 1 >= MAX_ANSWER_TRIES,
    lastTotalTry: ({ context }) => (context.problem?.totalTries ?? 0) + 1 >= MAX_ANSWER_TRIES,
    unitOk: ({ context, event }) => event.type === "ANSWER_UNIT" && context.problem !== null && judgeUnit(context.problem.record, event.value),
    totalOk: ({ context, event }) => event.type === "ANSWER_TOTAL" && context.problem !== null && judgeTotal(context.problem.record, event.value),
    waitResearch: ({ context }) =>
      !context.researchApplied && context.done.length === 1 && context.researchRequest !== null && context.researchResult === undefined,
    researchArrived: ({ context }) => context.researchResult !== undefined,
    openProblem: ({ context }) => context.problem !== null && !context.problem.logged,
    generatedLine: ({ context, event }) => event.type === "KOHAI_LINE" && acceptGenerated(context, event.seq, event.text),
    distress: ({ event }) => event.type === "SAFETY_RESULT" && event.flag === "distress",
    secondUnchecked: ({ context, event }) => event.type === "SAFETY_RESULT" && event.flag === "unchecked" && context.uncheckedStreak >= 1,
    unchecked: ({ event }) => event.type === "SAFETY_RESULT" && event.flag === "unchecked",
    checkedNone: ({ event }) => event.type === "SAFETY_RESULT" && event.flag === "none",
    researchOpen: ({ context }) => !context.researchApplied && context.researchRequest !== null,
    noOpenProblem: ({ context }) => context.problem === null || context.problem.logged,
    needsCard: ({ context }) => needsCard(context),
    hearable: ({ context, event }) =>
      event.type === "VOICE_HEARD" &&
      typeof event.transcript === "string" &&
      event.transcript.trim() !== "" &&
      !context.voiceOff &&
      context.problem !== null &&
      !context.problem.listening &&
      context.problem.voiceTurns < MAX_VOICE_TURNS,
    voicePlaces: ({ context, event }) => event.type === "VOICE_OPS" && context.problem?.listening === true && voiceUse(context, event.ops) !== null,
    voicePending: ({ context, event }) => event.type === "VOICE_OPS" && context.problem?.listening === true,
    voiceOffline: ({ event }) => event.type === "VOICE_OPS" && event.offline === true,
    pickable: ({ context, event }) => event.type === "CARD_PICK" && context.ruleCard !== null && CARD_RULES.some((h) => h.id === event.ruleId),
  },
}).createMachine({
  id: "flow",
  context: ({ input }) => ({
    lang: input?.lang ?? "ja",
    bank: input?.bank ?? FRACTION_BANK,
    firstProblemId: input?.firstProblemId ?? FIRST_PROBLEM_ID,
    maxProblems: input?.maxProblems ?? DEFAULT_MAX_PROBLEMS,
    introSeen: input?.introSeen ?? false,
    consented: input?.consented ?? false,
    research: input?.research ?? initialState(),
    researchRequest: null,
    researchResult: undefined,
    researchApplied: false,
    lateResearchApplied: false,
    session: null,
    firstRecord: null,
    taught: null,
    ruleCard: null,
    cardShownAfter: null,
    cardLog: [],
    done: [],
    problem: null,
    line: null,
    lastSeq: 0,
    uncheckedStreak: 0,
    highlight: false,
    voiceOff: false,
    log: [],
    safetyLog: [],
    endedBy: null,
  }),
  initial: "active",
  on: {
    STOP: { target: ".ended", actions: assign(({ context }) => ({ ...close(context, "stopped"), endedBy: "stop" as const })) },
    HARD: {
      target: ".hard",
      actions: assign(({ context }) => ({ ...close(context, "hard"), ...noLine(context), safetyLog: [...context.safetyLog, "hard_button" as const] })),
    },
    SAFETY_RESULT: [
      {
        guard: "distress",
        target: ".hard",
        actions: assign(({ context }) => ({ ...close(context, "hard"), ...noLine(context), safetyLog: [...context.safetyLog, "distress" as const] })),
      },
      {
        guard: and(["secondUnchecked", inSession]),
        target: ".rest",
        actions: assign(({ context }) => ({ ...close(context, "rest"), ...noLine(context), uncheckedStreak: 2, safetyLog: [...context.safetyLog, "rest" as const] })),
      },
      { guard: and(["unchecked", inSession]), actions: assign(({ context }) => ({ uncheckedStreak: context.uncheckedStreak + 1, highlight: true })) },
      { guard: "checkedNone", actions: assign({ uncheckedStreak: 0, highlight: false }) },
    ],
    // The agent takes about a minute; the child never waits that long (the fallback is used at the wait's end).
    // When its pool comes later, core checks it and it shapes the next problems; the session's one misreading
    // stays as it was locked (Q30).
    RESEARCH_LATE: {
      guard: ({ context, event }) => event.type === "RESEARCH_LATE" && context.researchApplied && !context.lateResearchApplied && Array.isArray(event.pool),
      actions: assign(({ context, event }) =>
        event.type === "RESEARCH_LATE" ? { research: researched(context.research, event.pool, context.bank), lateResearchApplied: true } : {},
      ),
    },
    RESEARCH_RESULT: {
      guard: "researchOpen",
      actions: assign(({ event }) => ({ researchResult: event.type === "RESEARCH_RESULT" && Array.isArray(event.pool) ? event.pool : null })),
    },
    SET_LANG: { guard: "noOpenProblem", actions: assign(({ context, event }) => (event.type === "SET_LANG" ? { lang: event.lang } : { lang: context.lang })) },
    KOHAI_LINE: {
      guard: "generatedLine",
      actions: assign(({ context, event }) =>
        event.type === "KOHAI_LINE" && context.line !== null ? { line: { ...context.line, text: event.text, source: "claude" as const } } : {},
      ),
    },
  },
  states: {
    active: {
      initial: "entry",
      on: { DONT_KNOW: "stuck" },
      states: {
        hist: { type: "history", history: "deep" },
        entry: {
          always: [{ guard: "needsIntro", target: "intro" }, { guard: "needsConsent", target: "consent" }, { target: "loading" }],
        },
        intro: {
          on: { NEXT: { target: "entry", actions: assign({ introSeen: true }) } },
        },
        consent: {
          on: {
            CONSENT_YES: { target: "loading", actions: assign({ consented: true }) },
            CONSENT_NO: { target: "#flow.ended", actions: assign({ endedBy: "consent_declined" as const }) },
          },
        },
        loading: {
          entry: assign(({ context }) => loadProblem(context)),
          always: [{ guard: "hasProblem", target: "problem" }, { target: "finished" }],
        },
        problem: {
          initial: "reading",
          states: {
            // The junior has shown its world; the child answers "fits" / "odd" (or skips) before any sentence
            // lights (指示書 第7.1節 手順4, 第11節 M7). "Next" does not skip the question.
            reading: {
              on: {
                PREDICT: {
                  guard: "predictable",
                  target: "looking",
                  actions: assign(({ context, event }) => (event.type === "PREDICT" ? predict(context, event.answer) : {})),
                },
              },
            },
            looking: {
              // With nothing lit (a taught reading drawn as the order only) the junior keeps its reading line.
              entry: assign(({ context }) => (context.problem !== null && context.problem.shown.failing.length === 0 ? {} : { line: whichLine(context) })),
              on: {
                PLACE_ONE: { guard: "placeable", target: "placed", actions: assign(({ context, event }) => (event.type === "PLACE_ONE" ? place(context, event.quantityId) : {})) },
                TAP_WORD: { guard: "tappable", actions: assign(({ context, event }) => (event.type === "TAP_WORD" ? tapWord(context, event.statementIndex, event.token) : {})) },
                VOICE_HEARD: { guard: "hearable", actions: assign(({ context, event }) => (event.type === "VOICE_HEARD" ? hear(context, event.transcript) : {})) },
                VOICE_OPS: [
                  { guard: "voicePlaces", target: "placed", actions: assign(({ context, event }) => (event.type === "VOICE_OPS" ? voicePlace(context, event.ops) : {})) },
                  { guard: "voicePending", actions: assign(({ context, event }) => voiceMiss(context, event.type === "VOICE_OPS" && event.offline === true)) },
                  { guard: "voiceOffline", actions: assign({ voiceOff: true }) },
                ],
              },
            },
            placed: {
              on: {
                PLACE_ONE: {
                  guard: "placeable",
                  target: "placed",
                  reenter: true,
                  actions: assign(({ context, event }) => (event.type === "PLACE_ONE" ? place(context, event.quantityId) : {})),
                },
                TAP_WORD: {
                  guard: "tappable",
                  actions: assign(({ context, event }) => {
                    if (event.type !== "TAP_WORD") return {};
                    const next = { ...context, ...tapWord(context, event.statementIndex, event.token) };
                    return { problem: next.problem, line: restateLine(next) };
                  }),
                },
                CONFIRM_YES: {
                  target: "checking",
                  actions: assign(({ context }) => {
                    const next = { ...context, ...confirmFirst(context) };
                    return { ...next, ...teach(next) };
                  }),
                },
                CONFIRM_NO: {
                  target: "looking",
                  actions: assign(({ context }) => (context.problem === null ? {} : { problem: { ...context.problem, placement: null, heard: null, listening: false } })),
                },
                VOICE_HEARD: { guard: "hearable", actions: assign(({ context, event }) => (event.type === "VOICE_HEARD" ? hear(context, event.transcript) : {})) },
                VOICE_OPS: [
                  {
                    guard: "voicePlaces",
                    target: "placed",
                    reenter: true,
                    actions: assign(({ context, event }) => (event.type === "VOICE_OPS" ? voicePlace(context, event.ops) : {})),
                  },
                  { guard: "voicePending", actions: assign(({ context, event }) => voiceMiss(context, event.type === "VOICE_OPS" && event.offline === true)) },
                  { guard: "voiceOffline", actions: assign({ voiceOff: true }) },
                ],
              },
            },
            checking: {
              always: [{ guard: "allHold", target: "rebuilt" }, { guard: "tooManyFixes", target: "held" }, { target: "looking" }],
            },
            rebuilt: {
              entry: assign(({ context }) => noLine(context)),
              on: { NEXT: "unit" },
            },
            unit: {
              entry: assign(({ context }) => ({ line: lineOf(context, "kohai.unit", {}, null, null) })),
              on: {
                ANSWER_UNIT: [
                  {
                    guard: "unitOk",
                    target: "total",
                    actions: assign(({ context, event }) =>
                      context.problem === null || event.type !== "ANSWER_UNIT"
                        ? {}
                        : { problem: { ...context.problem, unitTries: context.problem.unitTries + 1, unitValue: event.value } },
                    ),
                  },
                  {
                    guard: "lastUnitTry",
                    target: "held",
                    actions: assign(({ context, event }) =>
                      context.problem === null || event.type !== "ANSWER_UNIT" ? {} : { problem: { ...context.problem, unitTries: context.problem.unitTries + 1, unitValue: event.value } },
                    ),
                  },
                  { actions: assign(({ context, event }) => (event.type === "ANSWER_UNIT" ? answerMiss(context, "unit", event.value) : {})) },
                ],
              },
            },
            total: {
              entry: assign(({ context }) => noLine(context)),
              on: {
                ANSWER_TOTAL: [
                  {
                    guard: "totalOk",
                    target: "solved",
                    actions: assign(({ context, event }) =>
                      context.problem === null || event.type !== "ANSWER_TOTAL"
                        ? {}
                        : { problem: { ...context.problem, totalTries: context.problem.totalTries + 1, totalValue: event.value } },
                    ),
                  },
                  {
                    guard: "lastTotalTry",
                    target: "held",
                    actions: assign(({ context, event }) =>
                      context.problem === null || event.type !== "ANSWER_TOTAL"
                        ? {}
                        : { problem: { ...context.problem, totalTries: context.problem.totalTries + 1, totalValue: event.value } },
                    ),
                  },
                  { actions: assign(({ context, event }) => (event.type === "ANSWER_TOTAL" ? answerMiss(context, "total", event.value) : {})) },
                ],
              },
            },
            solved: {
              entry: assign(({ context }) => ({ ...close(context, "solved"), ...noLine(context) })),
              on: { NEXT: "#flow.active.next" },
            },
            held: {
              entry: assign(({ context }) => ({ ...close(context, "held"), line: lineOf(context, "hold.offer", {}, null, null) })),
              on: { NEXT: "#flow.active.next" },
            },
          },
        },
        next: {
          always: [
            { guard: "needsCard", target: "card" },
            { guard: "waitResearch", target: "researching" },
            { target: "loading", actions: assign(({ context }) => applyResearch(context)) },
          ],
        },
        // The junior's rule card (指示書 第7.1節 後輩のルールカード): after two solved problems, before the next
        // problem and at the session's end. Nothing here says right or wrong; the sentences' light is the only feedback.
        card: {
          entry: assign(({ context }) => openCard(context)),
          on: {
            CARD_PICK: { guard: "pickable", actions: assign(({ context, event }) => (event.type === "CARD_PICK" ? pickCard(context, event.ruleId) : {})) },
            SCENES_RESULT: {
              actions: assign(({ context, event }) => (event.type === "SCENES_RESULT" ? acceptScenes(context, event.focusId, event.proposal, event.reason) : {})),
            },
            NEXT: { target: "next", actions: assign(({ context }) => leaveCard(context)) },
          },
        },
        researching: {
          entry: assign(({ context }) => noLine(context)),
          always: [{ guard: "researchArrived", target: "next" }],
        },
        finished: {
          entry: assign(({ context }) => noLine(context)),
          on: { NEXT: { target: "#flow.ended", actions: assign({ endedBy: "finished" as const }) } },
        },
      },
    },
    stuck: {
      on: {
        RESUME: "active.hist",
        HOLD: { guard: "openProblem", target: "active.next", actions: assign(({ context }) => close(context, "held")) },
      },
    },
    hard: {
      on: {
        HARD: {},
        CLOSE: { target: "ended", actions: assign(({ context }) => ({ endedBy: context.endedBy ?? ("hard" as const) })) },
      },
    },
    rest: {
      on: { CLOSE: { target: "ended", actions: assign({ endedBy: "rest" as const }) } },
    },
    ended: {
      type: "final",
    },
  },
});

