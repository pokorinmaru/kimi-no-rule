// One session of the experience (指示書 第7.1節 reduced to HANDOFF §3 F1・F2・F3・F8; 第11節 M7).
// The machine is pure: it never calls a server. The session controller (session.ts) sends the junior's
// generated words (KOHAI_LINE), the research agent's pool (RESEARCH_RESULT) and safety results
// (SAFETY_RESULT) as events; without them the flow runs on core's templates and the fallback pool. The
// child's voice comes as VOICE_HEARD (the browser's final words, kept in memory only) and VOICE_OPS (the ops
// the worker's /interpret returned); core validates the ops again here before any is used. On the step flow
// (Q62) the words are heard at the relation step only, and a validated reference chooses as that holder's button.
// Every world, verdict and number comes from @kimi/core through problem.ts.
import { and, assign, not, or, setup, stateIn } from "xstate";
import {
  CARD_RULES,
  CHILD_FIRST_PROBLEM_ID,
  CHILD_SECOND_PROBLEM_ID,
  stepsOf,
  type Step,
  CORRECT_READING_ID,
  FRACTION_BANK,
  cardFits,
  checkScenePair,
  pickScenes,
  readsBeyondWording,
  sceneAvoidValues,
  transferOptions,
  gate,
  helpSentence,
  holderName,
  initialState,
  observe,
  observeAgreement,
  observePrediction,
  problemNumber,
  readingCard,
  render,
  transcript,
  validateOps,
  wordbookPage,
  wordbookPagesOf,
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
  type TransferLink,
  type TransferWording,
  type WordbookPageId,
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

/** The child's own first prediction (指示書 第7.1節 手順2): who has more, and who the child put the "1" card on (holder ids). */
export interface FirstGuessLog {
  larger: string | null;
  oneOn: string | null;
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
  /** Where the child has put the "1" card in the first prediction (a holder), before the junior's world. */
  guessOne: string | null;
  /** The child's first prediction, null until the child answers "who has more?" (or "not yet"). Never judged. */
  guess: FirstGuessLog | null;
  /** The child's prediction about the junior's world, null until the child answers or skips it. */
  prediction: PredictionAnswer | null;
  /** The order of the "fits" and "odd" buttons on this problem. */
  predictionOrder: PredictionOrder;
  /** The junior's world as its rule built it: the child's teaching is applied to this. */
  base: WorldScene;
  /** The world on screen now, with its failing sentences. */
  shown: Shown;
  /** The junior's world as the problem opened (「この問題をさいしょから」 shows it again). */
  startShown: Shown;
  /**
   * The child went back to the start of this problem (Q60): what the child does now is no longer an unaided first
   * reading, so nothing more is observed on it. On the step flow a restart before the relation's first choice leaves
   * it false (nothing was observed and no other reading's world was shown yet).
   */
  restarted: boolean;
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
  /** The word book had shown one of this problem's wordings before that first placement (core does not count it). */
  firstAided: boolean;
  /** The ops of the last confirmed teaching (evidence always empty). */
  taughtOps: AnyOp[];
  fixes: number;
  unitTries: number;
  unitValue: Rational | null;
  totalTries: number;
  totalValue: Rational | null;
  logged: boolean;
  /** The word book's pages for this problem's wordings (core wordbookPagesOf); the book opens on the first. */
  pages: WordbookPageId[];
  /** The problem's wording (its first page) did not come in an earlier problem of this session (指示書 第7.1節). */
  newWording: boolean;
  /** The number of fixes when the word book last opened on this problem (0: before any fix), or null. */
  bookAt: number | null;
  /** How many times the word book opened on this problem. */
  bookOpens: number;
  /** The child's answers to "which is longer?" (holder ids): observations only, never judged. */
  orderGuesses: string[];
  /** The sentence of the help's first step and its lit relation words (core helpSentence), while the help is open. */
  help: { statementIndex: number; tokens: number[] } | null;
  /** The problem one sentence at a time (Q62), on the child's route; null on the adults' route (the old steps). */
  steps: StepState | null;
}

/** One step the child went through (Q62): no words of the child, only what was chosen and how it went. */
export interface StepLogEntry {
  kind: Step["kind"];
  /** How many answers the step took (wrong ones included). */
  tries: number;
  /** ok: right at once; helped: right after a hint or the smaller step; stopped: not right, the step was passed on. */
  outcome: "ok" | "helped" | "stopped";
  /** At the relation sentence: the holders chosen, in order ("unknown" for わからない). */
  choices?: string[];
  /** At the relation sentence: the first holder chosen was the one compared with (kept here, not looked up later). */
  firstRight?: boolean;
}

export interface StepState {
  steps: Step[];
  index: number;
  /** Wrong answers on this step so far. */
  tries: number;
  /** The light on the sentence's number (a fact) or its 「の」 and ratio (the relation). */
  hint: boolean;
  /** The smaller step: the dealing drawn so the child can count one part (unit), or the parts asked lit (total). */
  help: boolean;
  /** The holder the child chose at the relation sentence when it was not the one compared with: its world is shown. */
  misread: string | null;
  /** The holders chosen at the relation sentence, in order. */
  choices: string[];
  /** The numbers the child has said right (one part, the answer): the picture may draw them. */
  said: Rational[];
  entries: StepLogEntry[];
  /** The answer step was not right twice: the problem is kept for later. */
  held: boolean;
  /** The relation's choices in the other order on this problem, so the right one does not keep one place (review). */
  flip: boolean;
  /** The holder the child's words chose at the relation step: restated on top of the next screen, then let go. */
  heardFrom: string | null;
  /** The child's words at the relation step gave nothing usable: a fixed line, the buttons stay. */
  missed: boolean;
}

export type Outcome = "solved" | "held" | "stopped" | "hard" | "rest";

/** What the device keeps of one problem (no child's free words: evidence is always empty). */
export interface ProblemLog {
  problemId: string;
  consistency: ProblemRecord["consistency"];
  source: KohaiReading["source"];
  readingId: string;
  reading: Hypothesis;
  /** The child's first prediction before the junior's world (null: the problem ended before it). */
  guess?: FirstGuessLog | null;
  /** The child's prediction about the junior's world (null: the problem ended before it). */
  prediction: PredictionAnswer | null;
  firstPlacement: string | null;
  ops: AnyOp[];
  fixes: number;
  unitTries: number;
  totalTries: number;
  outcome: Outcome;
  /** The child's answers to "which is longer?" in the help (holder ids; never judged). */
  orderGuesses?: string[];
  /** How many times the word book opened on this problem. */
  bookOpens?: number;
  /** On a transfer problem only: what it was offered after, and whether core kept the reading as not leaning on the wording. */
  transfer?: TransferLog;
  /** The steps of the problem one sentence at a time (Q62): where the child stopped. */
  steps?: StepLogEntry[];
}

/**
 * What the device keeps of a transfer problem (指示書 第6.7節 手順6, Q48): ids, the wording and core's yes/no only.
 * Shown on the grown-up's screen, never to the child.
 */
export interface TransferLog {
  fixedProblemId: string;
  oldReadingId: string;
  wording: TransferWording;
  /** core readsBeyondWording: the other phrasing read without the old reading, before any help on it, and solved. */
  beyondWording: boolean;
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
  /** The stored transfer problems and their old readings (only those in `bank` are ever offered). */
  transfers?: readonly TransferLink[];
  firstProblemId?: string;
  /** The problem one sentence at a time (Q62): the child's route sets it; the adults' route keeps the old steps. */
  stepFlow?: boolean;
  maxProblems?: number;
  introSeen?: boolean;
  consented?: boolean;
  research?: ResearchState;
}

export interface FlowContext {
  lang: Lang;
  bank: readonly ProblemRecord[];
  transfers: readonly TransferLink[];
  firstProblemId: string;
  stepFlow: boolean;
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
  /** The word book's pages opened in this session: a later first reading on a problem with one of them is not counted. */
  wordbookOpened: WordbookPageId[];
  safetyLog: ("distress" | "hard_button" | "rest")[];
  endedBy: null | "stop" | "finished" | "consent_declined" | "hard" | "rest";
}

export type FlowEvent =
  | { type: "NEXT" }
  | { type: "CONSENT_YES" }
  | { type: "CONSENT_NO" }
  /** The child's first prediction: the "1" card on a holder's outline (null takes it off). */
  | { type: "GUESS_ONE"; holderId: string | null }
  /** The child's first prediction: who has more (a holder of the relation), or null for "not yet". Moves on to the junior's world. */
  | { type: "GUESS"; larger: string | null }
  | { type: "PREDICT"; answer: PredictionAnswer }
  | { type: "PLACE_ONE"; quantityId: string }
  | { type: "TAP_WORD"; statementIndex: number; token: number }
  | { type: "CONFIRM_YES" }
  | { type: "CONFIRM_NO" }
  | { type: "ANSWER_UNIT"; value: Rational }
  /** The step flow (Q62): a number for the step's question. */
  | { type: "STEP_NUMBER"; value: Rational }
  /** The step flow (Q62): who is compared with at the relation sentence (a holder), or null for わからない. */
  | { type: "STEP_CHOOSE"; holderId: string | null }
  /** The step flow (Q62): back to the question after the world of another reading. */
  | { type: "STEP_AGAIN" }
  | { type: "ANSWER_TOTAL"; value: Rational }
  | { type: "STOP" }
  /** 「この問題をさいしょから」 (Q60): back to the first step of the open problem, with nothing the child did on it kept. */
  | { type: "RESTART_PROBLEM" }
  | { type: "DONT_KNOW" }
  | { type: "HARD" }
  | { type: "RESUME" }
  | { type: "HOLD" }
  /** The child chooses who is taken as 1 on the junior's rule card: one of core's CARD_RULES. */
  | { type: "CARD_PICK"; ruleId: string }
  /** A proposal for the everyday scenes from the worker (choices only); core checks it again before it is used. */
  | { type: "SCENES_RESULT"; focusId: string; proposal: { breaks: SceneChoice; keeps: SceneChoice } | null; reason: string | null }
  | { type: "CLOSE" }
  /** In the help: the child's answer to "which is longer?" (a holder of the relation). Recorded, never judged. */
  | { type: "ORDER_GUESS"; holderId: string }
  /** In the help: the child opens the word book. */
  | { type: "OPEN_BOOK" }
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
/**
 * The open problem as it was when it opened (Q60): the same record, reading and junior's world, and nothing the child
 * did on it (the guess, the prediction, the card, the words, the voice, the fixes, the answers, the help).
 */
function restartProblem(ctx: FlowContext): Partial<FlowContext> {
  const p = ctx.problem;
  if (p === null) return {};
  // On the step flow nothing is observed before the relation's first choice, and no other reading's world is shown
  // before it: a restart before that choice keeps the problem's first reading unaided, so it is still observed.
  const unobserved = p.steps !== null && p.firstPlacement === null && !p.restarted;
  const problem: ProblemState = {
    ...p,
    guessOne: null,
    guess: null,
    prediction: null,
    shown: p.startShown,
    placement: null,
    words: [],
    heard: null,
    listening: false,
    // The voice turns used stay used (they bound the requests sent for this problem).
    firstPlacement: null,
    firstAided: !unobserved,
    taughtOps: [],
    fixes: 0,
    unitTries: 0,
    unitValue: null,
    totalTries: 0,
    totalValue: null,
    bookAt: null,
    bookOpens: 0,
    orderGuesses: [],
    help: null,
    restarted: !unobserved,
    // The step flow starts again from the first sentence (Q62).
    steps:
      p.steps === null
        ? null
        : { ...p.steps, index: 0, tries: 0, hint: false, help: false, misread: null, choices: [], said: [], entries: [], held: false, heardFrom: null, missed: false },
  };
  return { problem, ...noLine(ctx) };
}

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

/**
 * A transfer problem (指示書 第6.7節 手順6, Q48) when the last problem was solved after the child fixed the junior's
 * reading: core's options for that reading (another phrasing first), the first one the junior can misread there.
 */
function transferPick(ctx: FlowContext): ReturnType<typeof selectNext> {
  const last = ctx.log.at(-1);
  if (last === undefined || last.outcome !== "solved" || last.fixes === 0 || last.problemId !== ctx.done.at(-1)) return null;
  const fixed = ctx.bank.find((r) => r.world.problem_id === last.problemId);
  if (fixed === undefined) return null;
  for (const o of transferOptions({ fixed, oldReadingId: last.readingId, links: ctx.transfers, bank: ctx.bank, done: ctx.done })) {
    const junior = juniorFor(o.record, ctx.research, ctx.session, ctx.lang, ctx.taught);
    // A junior whose world already fits leaves the child nothing to read there.
    if (junior === null || junior.orderOnly) continue;
    return { record: o.record, junior, reason: { kind: "transfer", fixedProblemId: last.problemId, oldReading: o.oldReading, wording: o.wording } };
  }
  return null;
}

/** The festival stories of the child's route (Q60, Q62): their wording is not counted for the word book. */
const STORY_IDS: ReadonlySet<string> = new Set([CHILD_FIRST_PROBLEM_ID, CHILD_SECOND_PROBLEM_ID]);

/** The steps of a problem on the step flow (Q62), or null (the adults' route, or a problem core cannot step). */
function stepStateOf(ctx: FlowContext, record: ProblemRecord): StepState | null {
  if (!ctx.stepFlow) return null;
  const steps = stepsOf(record);
  if (steps === null) return null;
  return {
    steps,
    index: 0,
    tries: 0,
    hint: false,
    help: false,
    misread: null,
    choices: [],
    said: [],
    entries: [],
    held: false,
    flip: ctx.done.length % 2 === 1,
    heardFrom: null,
    missed: false,
  };
}

const sameNumber = (a: Rational, b: Rational): boolean => a.num * b.den === b.num * a.den;

/** The steps for the log: when the problem ended on an open step (stopped, hard, rest), that step is kept as stopped. */
function stepLogOf(s: StepState, outcome: Outcome): StepLogEntry[] {
  const entries = s.entries.map((e) => ({ ...e, ...(e.choices === undefined ? {} : { choices: [...e.choices] }) }));
  const open = s.steps[s.index];
  if (outcome === "solved" || s.held || open === undefined) return entries;
  return [...entries, { kind: open.kind, tries: s.tries, outcome: "stopped", ...(open.kind === "relation" ? { choices: [...s.choices] } : {}) }];
}

/** The step done: its entry kept, and on to the next step. */
function passStep(s: StepState, outcome: StepLogEntry["outcome"], said: Rational[] = s.said): StepState {
  const step = s.steps[s.index];
  if (step === undefined) return s;
  const first = s.choices.find((c) => c !== "unknown");
  const entry: StepLogEntry = {
    kind: step.kind,
    tries: s.tries + 1,
    outcome,
    ...(step.kind === "relation" ? { choices: [...s.choices], firstRight: first === step.referenceHolderId } : {}),
  };
  return { ...s, index: s.index + 1, tries: 0, hint: false, help: false, misread: null, choices: [], said, entries: [...s.entries, entry], heardFrom: null, missed: false };
}

/**
 * A number for the step's question. Right: on to the next step. Wrong once: the sentence's number lights (a fact),
 * or the smaller step opens (one part: the dealing drawn to count; the answer: its parts lit). Wrong twice: a fact or
 * one part is passed on (kept as stopped there); the answer keeps the problem for later.
 */
function stepNumber(ctx: FlowContext, value: Rational): Partial<FlowContext> {
  const p = ctx.problem;
  const s = p?.steps;
  if (p == null || s == null) return {};
  const step = s.steps[s.index];
  if (step === undefined || step.kind === "relation") return {};
  const helped = s.hint || s.help;
  const extra = step.kind === "unit" ? { unitTries: p.unitTries + 1, unitValue: value } : step.kind === "total" ? { totalTries: p.totalTries + 1, totalValue: value } : {};
  if (sameNumber(value, step.value)) {
    const said = step.kind === "fact" ? s.said : [...s.said, step.value];
    return { problem: { ...p, ...extra, steps: passStep(s, helped ? "helped" : "ok", said) } };
  }
  if (s.tries === 0) {
    const next: StepState = step.kind === "fact" ? { ...s, tries: 1, hint: true } : { ...s, tries: 1, help: true };
    return { problem: { ...p, ...extra, steps: next } };
  }
  if (step.kind === "total") {
    const entry: StepLogEntry = { kind: "total", tries: s.tries + 1, outcome: "stopped" };
    return { problem: { ...p, ...extra, steps: { ...s, tries: s.tries + 1, entries: [...s.entries, entry], held: true } } };
  }
  // A fact is in the sentence, and one part was just drawn to count: the child goes on, and the step is kept as stopped.
  const said = step.kind === "unit" ? [...s.said, step.value] : s.said;
  return { problem: { ...p, ...extra, steps: passStep(s, "stopped", said) } };
}

/**
 * Who is compared with, at the relation sentence. The first holder chosen is the research observation, as the first
 * placement of the "1" card was (the same op, through the same confirm). The holder compared with: the problem's
 * reading is taught and the next step opens. Another holder: its world is drawn (the misread), then the question
 * again. わからない: the sentence's 「の」 and ratio light.
 */
function stepChoose(ctx: FlowContext, holderId: string | null): Partial<FlowContext> {
  const p = ctx.problem;
  const s = p?.steps;
  if (p == null || s == null) return {};
  const step = s.steps[s.index];
  if (step === undefined || step.kind !== "relation") return {};
  if (holderId === null) return { problem: { ...p, steps: { ...s, hint: true, choices: [...s.choices, "unknown"] } } };
  const quantity = p.record.world.quantities.find((q) => q.holder === holderId && (q.id === step.referenceQuantityId || p.record.world.relations.some((r) => r.id === step.relationId && r.subject === q.id)));
  if (quantity === undefined) return {};
  const choices = [...s.choices, holderId];
  // The first choice is observed as the first placement would have been (research, 第6.7節).
  let next: FlowContext = { ...ctx, problem: { ...p, placement: quantity.id, steps: { ...s, choices } } };
  next = { ...next, ...confirmFirst(next) };
  if (holderId !== step.referenceHolderId) {
    const q = next.problem;
    if (q === null) return {};
    return { problem: { ...q, placement: null, steps: { ...s, choices, tries: s.tries + 1, misread: quantity.id } }, research: next.research, researchRequest: next.researchRequest };
  }
  next = { ...next, ...teach(next) };
  const q = next.problem;
  if (q === null) return {};
  const helped = s.hint || s.tries > 0;
  return { problem: { ...q, steps: passStep({ ...s, choices }, helped ? "helped" : "ok") }, research: next.research, researchRequest: next.researchRequest };
}

/** A tap on the relation's buttons: the child's own choice replaces any words heard, and a late reply for them is dropped. */
function stepTap(ctx: FlowContext, holderId: string | null): Partial<FlowContext> {
  const p = ctx.problem;
  if (p == null || p.steps == null) return {};
  const problem = { ...p, heard: null, listening: false, steps: { ...p.steps, heardFrom: null, missed: false } };
  return stepChoose({ ...ctx, problem }, holderId);
}

/** The child's words at the relation step: kept in memory while /safety and /interpret work on them. */
function stepHear(ctx: FlowContext, text: string): Partial<FlowContext> {
  const heard = hear(ctx, text).problem;
  if (heard == null || heard.steps == null) return {};
  // The step screen has no junior's line: only the waiting is shown.
  return { problem: { ...heard, steps: { ...heard.steps, missed: false } } };
}

/**
 * The child's words chose a holder at the relation step: core validated the ops (voiceUse), and the holder of the
 * reference is taken exactly as its button (the same research observation, the same teaching or the other reading's
 * world). The problem words heard are kept as the tapped words, so they go with the research request (in memory).
 */
function stepVoiceChoose(ctx: FlowContext, ops: AnyOp[] | null): Partial<FlowContext> {
  const p = ctx.problem;
  const use = voiceUse(ctx, ops);
  if (p == null || p.steps == null || use === null) return {};
  const holderId = holderOf(p.record, use.quantityId);
  if (holderId === undefined) return {};
  const problem = { ...p, words: use.words.length > 0 ? use.words : p.words, listening: false };
  const out = stepChoose({ ...ctx, problem }, holderId);
  const q = out.problem;
  if (q == null || q.steps == null) return out;
  return { ...out, problem: { ...q, steps: { ...q.steps, heardFrom: holderId, missed: false } } };
}

/** Nothing usable came back for the words at the relation step: a fixed line, and the buttons go on (no dead end). */
function stepVoiceMiss(ctx: FlowContext, offline: boolean): Partial<FlowContext> {
  const p = ctx.problem;
  if (p == null || p.steps == null) return {};
  return { problem: { ...p, heard: null, listening: false, steps: { ...p.steps, missed: true } }, voiceOff: ctx.voiceOff || offline };
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
  // On the step flow the second problem is the festival story where the child's count is a part (Q62).
  if (pick === null && ctx.stepFlow && ctx.done.length === 1) {
    const second = ctx.bank.find((r) => r.world.problem_id === CHILD_SECOND_PROBLEM_ID);
    const junior = second === undefined ? null : juniorFor(second, ctx.research, ctx.session, ctx.lang, ctx.taught);
    if (second !== undefined && junior !== null) pick = { record: second, junior, reason: { kind: "first" } };
  }
  pick ??= transferPick(ctx);
  // A transfer problem is offered only right after a fix, never as an ordinary pick.
  const transferIds = new Set(ctx.transfers.map((l) => l.problemId));
  pick ??= selectNext(
    // On the step flow only problems core can take one sentence at a time (safety review S3).
    ctx.bank.filter((r) => !transferIds.has(r.world.problem_id) && (!ctx.stepFlow || stepsOf(r) !== null)),
    ctx.done,
    ctx.research,
    ctx.session,
    ctx.lang,
    ctx.taught,
  );
  if (pick === null) return { problem: null, ...noLine(ctx) };
  const { record, junior, reason } = pick;
  const rel = relationOf(record);
  if (rel === undefined) return { problem: null, ...noLine(ctx) };
  const pages = pagesOf(record);
  // A wording counts as met on an earlier problem, except on the festival story, where the book does not open by
  // itself after a fix that fits (Q60): there it counts only when its page was opened.
  const earlier = new Set([
    ...ctx.done.flatMap((id) => {
      const r = ctx.bank.find((b) => b.world.problem_id === id);
      return r === undefined || STORY_IDS.has(id) ? [] : pagesOf(r);
    }),
    ...ctx.wordbookOpened,
  ]);
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
    guessOne: null,
    guess: null,
    prediction: null,
    predictionOrder: predictionOrder(ctx.done.length + 1),
    base: junior.base,
    shown: junior.shown,
    startShown: junior.shown,
    restarted: false,
    placement: null,
    words: [],
    heard: null,
    listening: false,
    voiceTurns: 0,
    firstPlacement: null,
    firstAided: false,
    taughtOps: [],
    fixes: 0,
    unitTries: 0,
    unitValue: null,
    totalTries: 0,
    totalValue: null,
    logged: false,
    pages,
    newWording: pages[0] !== undefined && !earlier.has(pages[0]),
    bookAt: null,
    bookOpens: 0,
    orderGuesses: [],
    help: null,
    steps: stepStateOf(ctx, record),
  };
  const next = { ...ctx, problem };
  return {
    problem,
    session,
    firstRecord: ctx.firstRecord ?? record,
    done: [...ctx.done, record.world.problem_id],
    // The junior reads only after the child's own first prediction (the reading step's entry says its line).
    ...noLine(next),
  };
}

/**
 * The holders of the relation's two ends as buttons ("who has more?"). In the order the problem names them, the
 * holder with more sat second on most problems, so the order flips with the problem's number as the prediction
 * buttons do (predictionOrder): no holder keeps one place (safety review, 2026-11-07).
 */
export function guessHolders(p: ProblemState): string[] {
  const ends = orderHolders(p);
  const named = p.record.world.holders.map((h) => h.id).filter((id) => ends.includes(id));
  return p.predictionOrder[0] === "fits" ? named : named.reverse();
}

/** The buttons of the help's "which is longer?": the same order as the guess. */
export function helpHolders(p: ProblemState): string[] {
  return guessHolders(p);
}

/**
 * The child's own first prediction (指示書 第7.1節 手順2, 第6.7節 手順2 (i)): who has more, and the "1" card when placed.
 * core observes it (observePrediction; "not yet" with no card observes nothing). Nothing is judged and nothing on
 * screen changes with the answer: the junior's world and words come next, the same for every answer.
 */
function guess(ctx: FlowContext, larger: string | null): Partial<FlowContext> {
  const p = ctx.problem;
  if (p === null || p.guess !== null) return {};
  let research: ResearchState = ctx.research;
  if (!p.restarted) try {
    research = observePrediction(ctx.research, {
      record: p.record,
      larger,
      oneOn: p.guessOne,
      wordbookOpenedBefore: p.pages.some((pg) => ctx.wordbookOpened.includes(pg)),
    });
  } catch {
    // core could not judge it: the prediction is kept on the log and the research state stays as it was.
    research = ctx.research;
  }
  const problem = { ...p, guess: { larger, oneOn: p.guessOne } };
  // The junior's first line is made once, here: coming back to the junior's world (after "don't know") keeps it.
  return { problem, research, line: readLine({ ...ctx, problem, research }, problem) };
}

/**
 * The child's prediction about the junior's world. It is kept on the problem and observed by core's
 * agreement model (指示書 第6.7節 手順2 (ii)); "unknown" observes nothing. Whether it "fits" is never shown:
 * every answer goes on to the same lit sentences and the same junior's line.
 */
function predict(ctx: FlowContext, answer: PredictionAnswer): Partial<FlowContext> {
  const p = ctx.problem;
  if (p === null || p.prediction !== null) return {};
  let research: ResearchState = ctx.research;
  if (!p.restarted) try {
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
  // A reading after the word book showed one of this problem's wordings is not counted by core (countsAsObservation).
  const aided = p.restarted || p.pages.some((pg) => ctx.wordbookOpened.includes(pg));
  // After 「この問題をさいしょから」 the child has seen this problem's worlds: nothing more is observed on it.
  const reading = p.restarted ? null : firstReading(p.record, p.relationId, p.placement, aided);
  const research = reading === null ? ctx.research : observe(ctx.research, reading);
  const problem = { ...p, firstPlacement: p.placement, firstAided: aided };
  const firstOfSession = ctx.done.length === 1 && ctx.researchRequest === null && !ctx.researchApplied;
  // The worker takes the most recent readings only; the device keeps every one (第7.5節).
  const recent = research.readings.slice(-MAX_RESEARCH_READINGS);
  const researchRequest: ResearchRequest | null =
    firstOfSession && reading !== null && !reading.wordbookOpenedBefore
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

/**
 * The words heard when they fit the worker's limit for one word, otherwise the problem words tapped or heard.
 * Words still waiting (listening) have not passed /safety yet, so they are never sent (safety review, Q46).
 */
function researchWords(p: ProblemState): string[] {
  return p.heard !== null && !p.listening && p.heard.length <= MAX_HEARD_ECHO_CHARS ? [p.heard] : wordsOf(p);
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

/** core's verdict on a transfer problem, from the child's first world there; undefined on any other problem. */
function transferLog(ctx: FlowContext, p: ProblemState, outcome: Outcome): TransferLog | undefined {
  const why = p.pickedBy;
  if (why.kind !== "transfer") return undefined;
  const fixed = ctx.bank.find((r) => r.world.problem_id === why.fixedProblemId);
  const childWorld = p.firstPlacement === null ? null : (firstReading(p.record, p.relationId, p.firstPlacement)?.childWorld ?? null);
  const beyondWording =
    fixed !== undefined &&
    readsBeyondWording({ fixed, record: p.record, oldReading: why.oldReading, childWorld, solved: outcome === "solved", unaided: !p.firstAided });
  return { fixedProblemId: why.fixedProblemId, oldReadingId: why.oldReading.id, wording: why.wording, beyondWording };
}

function logOf(p: ProblemState, outcome: Outcome, transfer?: TransferLog): ProblemLog {
  const pending = p.placement === null ? [] : [referenceOp(p.relationId, p.placement), ...p.words.map((w) => wordCueOp(w.statementIndex, w.token))];
  const ops = (p.taughtOps.length > 0 ? p.taughtOps : pending).map((o) => ({ ...o, evidence: "" }));
  return {
    problemId: p.record.world.problem_id,
    consistency: p.record.consistency,
    source: p.reading.source,
    readingId: p.reading.hypothesis.id,
    reading: p.reading.hypothesis,
    guess: p.guess === null ? null : { ...p.guess },
    prediction: p.prediction,
    firstPlacement: p.firstPlacement,
    ops,
    fixes: p.fixes,
    unitTries: p.unitTries,
    totalTries: p.totalTries,
    outcome,
    orderGuesses: [...p.orderGuesses],
    bookOpens: p.bookOpens,
    ...(transfer === undefined ? {} : { transfer }),
    ...(p.steps === null ? {} : { steps: stepLogOf(p.steps, outcome) }),
  };
}

function close(ctx: FlowContext, outcome: Outcome): Partial<FlowContext> {
  const p = ctx.problem;
  if (p === null || p.logged) return {};
  return { problem: { ...p, logged: true }, log: [...ctx.log, logOf(p, outcome, transferLog(ctx, p, outcome))] };
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
  // The step flow (Q62) has no rule card: the child goes from one problem to the next.
  if (ctx.stepFlow) return false;
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
// The help for a child who is stuck and the word book (指示書 第7.1節 手順4・5, 第11節 M7)
// ---------------------------------------------------------------------------------------------

function pagesOf(record: ProblemRecord): WordbookPageId[] {
  try {
    return wordbookPagesOf(record);
  } catch {
    return [];
  }
}

/** The page the book opens on for this problem, when core lets it be shown here. */
export function bookPageId(ctx: FlowContext): WordbookPageId | null {
  const p = ctx.problem;
  const id = p?.pages[0];
  if (p === null || id === undefined) return null;
  return wordbookPage(id, p.record, ctx.lang) === null ? null : id;
}

/**
 * The book opens by itself after the first fix on a wording new in this session, and after the second fix when a
 * sentence still does not fit (指示書 第7.1節 手順5); once for each fix. On the festival story the child's route opens
 * with, a fix that makes every sentence fit goes straight to the rebuilt world, the story's own ending (Q60: the
 * book's unrelated example there broke the story); the book is still there from 「わからない」.
 */
function bookNeeded(ctx: FlowContext): boolean {
  const p = ctx.problem;
  if (p === null || p.bookAt === p.fixes || bookPageId(ctx) === null) return false;
  if (STORY_IDS.has(p.record.world.problem_id) && p.shown.failing.length === 0) return false;
  return (p.fixes === 1 && p.newWording) || (p.fixes === 2 && p.shown.failing.length > 0);
}

/** The help's first step: the relation words of a failing sentence lit, and the junior asks to read them again. */
function startHelp(ctx: FlowContext): Partial<FlowContext> {
  const p = ctx.problem;
  if (p === null) return {};
  let help: ProblemState["help"];
  try {
    help = helpSentence(p.record, p.shown.failing);
  } catch {
    help = null;
  }
  const problem = { ...p, help, placement: null, heard: null, listening: false };
  return { problem, line: help === null ? null : lineOf({ ...ctx, problem }, "kohai.help_read", {}, null, null) };
}

/** The holders of the relation's two ends: the buttons of "which is longer?". */
export function orderHolders(p: ProblemState): string[] {
  const rel = p.record.world.relations.find((r) => r.id === p.relationId);
  return [rel?.subject, rel?.reference].flatMap((q) => {
    const h = q === undefined || q === null ? undefined : holderOf(p.record, q);
    return h === undefined ? [] : [h];
  });
}

function guessOrder(ctx: FlowContext, holderId: string): Partial<FlowContext> {
  const p = ctx.problem;
  if (p === null) return {};
  return { problem: { ...p, orderGuesses: [...p.orderGuesses, holderId] } };
}

function openBook(ctx: FlowContext): Partial<FlowContext> {
  const p = ctx.problem;
  const id = bookPageId(ctx);
  if (p === null || id === null) return {};
  const problem = { ...p, bookAt: p.fixes, bookOpens: p.bookOpens + 1, help: null };
  return {
    problem,
    wordbookOpened: ctx.wordbookOpened.includes(id) ? ctx.wordbookOpened : [...ctx.wordbookOpened, id],
    line: lineOf({ ...ctx, problem }, "kohai.wordbook", {}, null, null),
  };
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
    onSteps: ({ context }) => context.problem?.steps != null,
    stepsDone: ({ context }) => context.problem?.steps != null && context.problem.steps.index >= context.problem.steps.steps.length,
    stepsHeld: ({ context }) => context.problem?.steps?.held === true,
    atRelation: ({ context }) => {
      const s = context.problem?.steps;
      return s != null && s.steps[s.index]?.kind === "relation" && s.misread === null;
    },
    guessOneOk: ({ context, event }) =>
      event.type === "GUESS_ONE" && context.problem !== null && (event.holderId === null || guessHolders(context.problem).includes(event.holderId)),
    guessable: ({ context, event }) =>
      event.type === "GUESS" && context.problem !== null && context.problem.guess === null && (event.larger === null || guessHolders(context.problem).includes(event.larger)),
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
    restartable: ({ context }) => context.problem !== null && !context.problem.logged,
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
    bookNeeded: ({ context }) => bookNeeded(context),
    helpWords: ({ context }) => context.problem?.help !== null && context.problem?.help !== undefined,
    orderable: ({ context, event }) => event.type === "ORDER_GUESS" && context.problem !== null && orderHolders(context.problem).includes(event.holderId),
    bookOpenable: ({ context }) => bookPageId(context) !== null,
    pickable: ({ context, event }) => event.type === "CARD_PICK" && context.ruleCard !== null && CARD_RULES.some((h) => h.id === event.ruleId),
  },
}).createMachine({
  id: "flow",
  context: ({ input }) => ({
    lang: input?.lang ?? "ja",
    bank: input?.bank ?? FRACTION_BANK,
    transfers: input?.transfers ?? [],
    firstProblemId: input?.firstProblemId ?? FIRST_PROBLEM_ID,
    stepFlow: input?.stepFlow ?? false,
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
    wordbookOpened: [],
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
      on: {
        // Words still waiting for their reply are dropped: back on the step, nothing stays listening (safety review).
        DONT_KNOW: {
          target: "stuck",
          actions: assign(({ context }) => (context.problem?.listening === true ? { problem: { ...context.problem, listening: false, heard: null } } : {})),
        },
        // From any step of an open problem (its help and word book too), back to its first step (Q60).
        RESTART_PROBLEM: { guard: "restartable", target: ".problem", reenter: true, actions: assign(({ context }) => restartProblem(context)) },
      },
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
          initial: "entry",
          states: {
            entry: {
              always: [{ guard: "onSteps", target: "steps" }, { target: "guess" }],
            },
            // The problem one sentence at a time (Q62): one sentence, its picture, one question; a wrong answer
            // branches at that step (a hint, the world of the other reading, or a smaller step).
            steps: {
              always: [
                { guard: "stepsHeld", target: "held" },
                { guard: "stepsDone", target: "solved" },
              ],
              on: {
                STEP_NUMBER: { actions: assign(({ context, event }) => (event.type === "STEP_NUMBER" ? stepNumber(context, event.value) : {})) },
                STEP_CHOOSE: { actions: assign(({ context, event }) => (event.type === "STEP_CHOOSE" ? stepTap(context, event.holderId) : {})) },
                STEP_AGAIN: {
                  actions: assign(({ context }) =>
                    context.problem?.steps == null ? {} : { problem: { ...context.problem, steps: { ...context.problem.steps, misread: null, heardFrom: null } } },
                  ),
                },
                // The relation question answered in the child's own words: heard only there (not on the other
                // reading's world); the ops core validates choose as the buttons do.
                VOICE_HEARD: {
                  guard: and(["hearable", "atRelation"]),
                  actions: assign(({ context, event }) => (event.type === "VOICE_HEARD" ? stepHear(context, event.transcript) : {})),
                },
                VOICE_OPS: [
                  { guard: "voicePlaces", actions: assign(({ context, event }) => (event.type === "VOICE_OPS" ? stepVoiceChoose(context, event.ops) : {})) },
                  { guard: "voicePending", actions: assign(({ context, event }) => stepVoiceMiss(context, event.type === "VOICE_OPS" && event.offline === true)) },
                  { guard: "voiceOffline", actions: assign({ voiceOff: true }) },
                ],
              },
            },
            // The child's own first prediction, before the junior shows its world (指示書 第7.1節 手順2): the problem's
            // sentences, plain outlines of the two holders, an optional "1" card, and one tap on who has more.
            // 「わからない」 opens the waiting screen (active's DONT_KNOW) and comes back here.
            guess: {
              on: {
                GUESS_ONE: {
                  guard: "guessOneOk",
                  actions: assign(({ context, event }) =>
                    event.type === "GUESS_ONE" && context.problem !== null ? { problem: { ...context.problem, guessOne: event.holderId } } : {},
                  ),
                },
                GUESS: { guard: "guessable", target: "reading", actions: assign(({ context, event }) => (event.type === "GUESS" ? guess(context, event.larger) : {})) },
              },
            },
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
                // 「わからない」 here opens the junior's staged questions, not the waiting screen (指示書 第7.1節 手順4).
                DONT_KNOW: "help",
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
                DONT_KNOW: "help",
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
            // After each fix: the word book when it must open (指示書 第7.1節 手順5, 第11節 M7), else every sentence fits,
            // else the problem is held after the last fix, else the junior's staged questions.
            checking: {
              always: [
                { guard: "bookNeeded", target: "wordbook" },
                { guard: "allHold", target: "rebuilt" },
                { guard: "tooManyFixes", target: "held" },
                { target: "help" },
              ],
            },
            // The junior's staged questions (指示書 第7.1節 手順4・5): (a) the relation words of a failing sentence lit, read
            // them again; (b) "which is longer?" with the two holders, recorded and never judged; (c) the word book offered.
            // No answer, no operation, no correct world, and the junior never names who is taken as 1.
            help: {
              initial: "read",
              entry: assign(({ context }) => startHelp(context)),
              exit: assign(({ context }) => (context.problem === null ? {} : { problem: { ...context.problem, help: null } })),
              states: {
                read: {
                  always: [{ guard: not("helpWords"), target: "order" }],
                  on: { NEXT: "order", DONT_KNOW: "order" },
                },
                order: {
                  entry: assign(({ context }) => ({ line: lineOf(context, "kohai.help_order", {}, null, null) })),
                  on: {
                    ORDER_GUESS: { guard: "orderable", target: "offer", actions: assign(({ context, event }) => (event.type === "ORDER_GUESS" ? guessOrder(context, event.holderId) : {})) },
                    DONT_KNOW: "offer",
                  },
                },
                offer: {
                  always: [{ guard: not("bookOpenable"), target: "#flow.active.problem.looking" }],
                  entry: assign(({ context }) => ({ line: lineOf(context, "kohai.wordbook", {}, null, null) })),
                  on: {
                    OPEN_BOOK: "#flow.active.problem.wordbook",
                    NEXT: "#flow.active.problem.looking",
                    DONT_KNOW: "#flow.stuck",
                  },
                },
              },
            },
            // ことばの絵本 (指示書 第7.1節): one page for this problem's wording, an everyday example core keeps away from every
            // number of the problem. Closed, the child goes on fixing (or on to the unit when every sentence already fits).
            wordbook: {
              entry: assign(({ context }) => openBook(context)),
              on: {
                NEXT: [{ guard: "allHold", target: "rebuilt" }, { target: "looking" }],
                DONT_KNOW: "#flow.stuck",
              },
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

