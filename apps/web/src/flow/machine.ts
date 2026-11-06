// One session of the experience (指示書 第7.1節 reduced to HANDOFF §3 F1・F2・F3・F8; 第11節 M7).
// The machine is pure: it never calls a server. The session controller (session.ts) sends the junior's
// generated words (KOHAI_LINE), the research agent's pool (RESEARCH_RESULT) and safety results
// (SAFETY_RESULT) as events; without them the flow runs on core's templates and the fallback pool.
// Every world, verdict and number comes from @kimi/core through problem.ts.
import { and, assign, or, setup, stateIn } from "xstate";
import {
  FRACTION_BANK,
  gate,
  holderName,
  initialState,
  observe,
  problemNumber,
  readingCard,
  render,
  transcript,
  type AnyOp,
  type Hypothesis,
  type KohaiReading,
  type Lang,
  type ProblemRecord,
  type Rational,
  type ResearchState,
  type SlotValues,
  type TemplateKey,
  type WorldScene,
} from "@kimi/core";
import {
  MAX_FIXES,
  firstReading,
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
  type SessionMisread,
  type Shown,
} from "./problem.ts";
import { FORBIDDEN_CHILD_PHRASES } from "./text.ts";

export const FIRST_PROBLEM_ID = "p_signboard";
export const DEFAULT_MAX_PROBLEMS = 3;
/** The junior's generated sentence is at most this long (指示書 第6.8節 関門8). */
const MAX_LINE_CHARS = 40;

export type KohaiIntent = "read" | "which" | "restate";

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
  relationId: string;
  reading: KohaiReading;
  /** The card's one line (from the second problem), or null. */
  card: string | null;
  /** The junior's world as its rule built it: the child's teaching is applied to this. */
  base: WorldScene;
  /** The world on screen now, with its failing sentences. */
  shown: Shown;
  /** Where the child has put the "1" card and not yet confirmed. */
  placement: string | null;
  /** The problem words the child tapped as the reason (statement, token). */
  words: { statementIndex: number; token: number }[];
  /** The child's first placement on this problem, before any fix (the research observation). */
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
  firstPlacement: string | null;
  ops: AnyOp[];
  fixes: number;
  unitTries: number;
  totalTries: number;
  outcome: Outcome;
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
  /** Set once, at the child's first placement on the first problem; the controller posts it. */
  researchRequest: ResearchRequest | null;
  /** The agent's pool (null: failed or timed out); undefined until the controller answers. */
  researchResult: Hypothesis[] | null | undefined;
  researchApplied: boolean;
  session: SessionMisread | null;
  firstRecord: ProblemRecord | null;
  done: string[];
  problem: ProblemState | null;
  line: Line | null;
  uncheckedStreak: number;
  highlight: boolean;
  log: ProblemLog[];
  safetyLog: ("distress" | "hard_button" | "rest")[];
  endedBy: null | "stop" | "finished" | "consent_declined" | "hard" | "rest";
}

export type FlowEvent =
  | { type: "NEXT" }
  | { type: "CONSENT_YES" }
  | { type: "CONSENT_NO" }
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
  | { type: "CLOSE" }
  | { type: "KOHAI_LINE"; seq: number; text: string }
  | { type: "RESEARCH_RESULT"; pool: Hypothesis[] | null }
  | { type: "SAFETY_RESULT"; flag: SafetyFlagEvent };

// ---------------------------------------------------------------------------------------------
// Pure helpers over the context
// ---------------------------------------------------------------------------------------------

function said(p: ProblemState | null): Rational[] {
  return p === null ? [] : [p.unitValue, p.totalValue].filter((x): x is Rational => x !== null);
}

/** A core template as the junior's or the guide's line; a template the gate refuses is not shown. */
function lineOf(ctx: FlowContext, key: TemplateKey, slots: SlotValues, intent: KohaiIntent | null, request: KohaiRequest | null): Line {
  const seq = (ctx.line?.seq ?? 0) + 1;
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

const holderOf = (record: ProblemRecord, quantityId: string): string | undefined => record.world.quantities.find((q) => q.id === quantityId)?.holder;

function wordsOf(p: ProblemState): string[] {
  return p.words.flatMap((w) => {
    const t = p.record.statements[w.statementIndex]?.tokens[w.token];
    return t === undefined ? [] : [t];
  });
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
  return lineOf(ctx, "kohai.read", {}, "read", requestFor(ctx, p, "read"));
}

function whichLine(ctx: FlowContext): Line | null {
  const p = ctx.problem;
  if (p === null) return null;
  return lineOf({ ...ctx }, "kohai.which", {}, "which", requestFor(ctx, p, "which"));
}

function restateLine(ctx: FlowContext): Line | null {
  const p = ctx.problem;
  if (p === null || p.placement === null) return null;
  const holder = holderOf(p.record, p.placement);
  if (holder === undefined) return null;
  const base = lineOf(ctx, "kohai.restate", { holder: holderName(p.shown.world, holder) }, "restate", requestFor(ctx, p, "restate"));
  const words = wordsOf(p);
  if (words.length === 0 || base.text === "") return base;
  // The child's tapped word is handed back as it is, never put in other words (第6.8節 関門9).
  const echo = lineOf(ctx, "kohai.restate_word", { transcript: transcript(words.join("")) }, null, null);
  return echo.text === "" ? base : { ...base, text: `${base.text} ${echo.text}` };
}

/** Builds the state of a new problem from core's choice of problem and the junior's reading. */
function loadProblem(ctx: FlowContext): Partial<FlowContext> {
  if (ctx.done.length >= ctx.maxProblems) return { problem: null, line: null };
  let pick: ReturnType<typeof selectNext> = null;
  if (ctx.done.length === 0) {
    const first = ctx.bank.find((r) => r.world.problem_id === ctx.firstProblemId);
    const junior = first === undefined ? null : juniorFor(first, ctx.research, ctx.session, ctx.lang);
    if (first !== undefined && junior !== null) pick = { record: first, junior };
  }
  pick ??= selectNext(ctx.bank, ctx.done, ctx.research, ctx.session, ctx.lang);
  if (pick === null) return { problem: null, line: null };
  const { record, junior } = pick;
  const rel = relationOf(record);
  if (rel === undefined) return { problem: null, line: null };
  const session: SessionMisread =
    ctx.session ?? {
      id: junior.reading.sessionMisreadId ?? junior.reading.hypothesis.id,
      hypothesis: junior.reading.hypothesis,
      // With a pool from earlier sessions the research layer has already spoken.
      locked: ctx.research.pool.length > 0,
    };
  const problem: ProblemState = {
    record,
    relationId: rel.id,
    reading: junior.reading,
    card: ctx.done.length >= 1 ? readingCard(junior.reading.hypothesis, record) : null,
    base: junior.base,
    shown: junior.shown,
    placement: null,
    words: [],
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

function isEnd(ctx: FlowContext, quantityId: string): boolean {
  const p = ctx.problem;
  if (p === null) return false;
  const rel = p.record.world.relations.find((r) => r.id === p.relationId);
  return rel !== undefined && (rel.subject === quantityId || rel.reference === quantityId);
}

function place(ctx: FlowContext, quantityId: string): Partial<FlowContext> {
  const p = ctx.problem;
  if (p === null) return {};
  if (p.firstPlacement !== null) {
    const problem = { ...p, placement: quantityId };
    return { problem, line: restateLine({ ...ctx, problem }) };
  }
  // The child's own first placement on this problem, before any fix: the research observation (第6.7節).
  const reading = firstReading(p.record, p.relationId, quantityId);
  const research = reading === null ? ctx.research : observe(ctx.research, reading);
  const problem = { ...p, placement: quantityId, firstPlacement: quantityId };
  const firstOfSession = ctx.done.length === 1 && ctx.researchRequest === null && !ctx.researchApplied;
  const researchRequest: ResearchRequest | null =
    firstOfSession && reading !== null
      ? {
          pool: research.pool,
          weights: research.weights,
          unscored: research.unscored,
          unexpressible: research.unexpressible,
          readings: research.readings.map((r, i) => ({
            problem_id: r.record.world.problem_id,
            childWorld: r.childWorld,
            referencePlaced: r.referencePlaced,
            afterFix: r.afterFix,
            wordbookOpenedBefore: r.wordbookOpenedBefore,
            // Only this problem's tapped words, and only in memory (第9節).
            words: i === research.readings.length - 1 ? wordsOf(problem) : [],
          })),
        }
      : ctx.researchRequest;
  return { problem, research, researchRequest, line: restateLine({ ...ctx, problem }) };
}

function tapWord(ctx: FlowContext, statementIndex: number, token: number): Partial<FlowContext> {
  const p = ctx.problem;
  if (p === null) return {};
  const problem = { ...p, words: [{ statementIndex, token }] };
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
  return { problem: { ...p, shown: shown ?? p.shown, taughtOps: ops, fixes: p.fixes + 1, placement: null } };
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
  if (FORBIDDEN_CHILD_PHRASES.some((w) => text.includes(w))) return false;
  try {
    return gate({ kind: "say", text }, gateContext(p.record, ctx.lang, said(p))).ok;
  } catch {
    return false;
  }
}

function unitMiss(ctx: FlowContext, value: Rational): Partial<FlowContext> {
  const p = ctx.problem;
  if (p === null) return {};
  const problem = { ...p, unitTries: p.unitTries + 1, unitValue: value };
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
  return { problem, line };
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
    placeable: ({ context, event }) => event.type === "PLACE_ONE" && isEnd(context, event.quantityId),
    tappable: ({ context, event }) => event.type === "TAP_WORD" && validToken(context, event.statementIndex, event.token),
    allHold: ({ context }) => context.problem !== null && context.problem.shown.failing.length === 0 && context.problem.taughtOps.length > 0,
    tooManyFixes: ({ context }) => (context.problem?.fixes ?? 0) >= MAX_FIXES,
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
    session: null,
    firstRecord: null,
    done: [],
    problem: null,
    line: null,
    uncheckedStreak: 0,
    highlight: false,
    log: [],
    safetyLog: [],
    endedBy: null,
  }),
  initial: "active",
  on: {
    STOP: { target: ".ended", actions: assign(({ context }) => ({ ...close(context, "stopped"), endedBy: "stop" as const })) },
    HARD: {
      target: ".hard",
      actions: assign(({ context }) => ({ ...close(context, "hard"), line: null, safetyLog: [...context.safetyLog, "hard_button" as const] })),
    },
    SAFETY_RESULT: [
      {
        guard: "distress",
        target: ".hard",
        actions: assign(({ context }) => ({ ...close(context, "hard"), line: null, safetyLog: [...context.safetyLog, "distress" as const] })),
      },
      {
        guard: and(["secondUnchecked", inSession]),
        target: ".rest",
        actions: assign(({ context }) => ({ ...close(context, "rest"), line: null, uncheckedStreak: 2, safetyLog: [...context.safetyLog, "rest" as const] })),
      },
      { guard: and(["unchecked", inSession]), actions: assign(({ context }) => ({ uncheckedStreak: context.uncheckedStreak + 1, highlight: true })) },
      { guard: "checkedNone", actions: assign({ uncheckedStreak: 0, highlight: false }) },
    ],
    RESEARCH_RESULT: {
      guard: "researchOpen",
      actions: assign(({ event }) => ({ researchResult: event.type === "RESEARCH_RESULT" && Array.isArray(event.pool) ? event.pool : null })),
    },
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
            reading: {
              on: { NEXT: "looking" },
            },
            looking: {
              entry: assign(({ context }) => ({ line: whichLine(context) })),
              on: {
                PLACE_ONE: { guard: "placeable", target: "placed", actions: assign(({ context, event }) => (event.type === "PLACE_ONE" ? place(context, event.quantityId) : {})) },
                TAP_WORD: { guard: "tappable", actions: assign(({ context, event }) => (event.type === "TAP_WORD" ? tapWord(context, event.statementIndex, event.token) : {})) },
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
                CONFIRM_YES: { target: "checking", actions: assign(({ context }) => teach(context)) },
                CONFIRM_NO: {
                  target: "looking",
                  actions: assign(({ context }) => (context.problem === null ? {} : { problem: { ...context.problem, placement: null } })),
                },
              },
            },
            checking: {
              always: [{ guard: "allHold", target: "rebuilt" }, { guard: "tooManyFixes", target: "held" }, { target: "looking" }],
            },
            rebuilt: {
              entry: assign({ line: null }),
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
                  { actions: assign(({ context, event }) => (event.type === "ANSWER_UNIT" ? unitMiss(context, event.value) : {})) },
                ],
              },
            },
            total: {
              entry: assign({ line: null }),
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
                    actions: assign(({ context }) =>
                      context.problem === null ? {} : { problem: { ...context.problem, totalTries: context.problem.totalTries + 1 } },
                    ),
                  },
                ],
              },
            },
            solved: {
              entry: assign(({ context }) => ({ ...close(context, "solved"), line: null })),
              on: { NEXT: "#flow.active.next" },
            },
            held: {
              entry: assign(({ context }) => ({ ...close(context, "held"), line: lineOf(context, "hold.offer", {}, null, null) })),
              on: { NEXT: "#flow.active.next" },
            },
          },
        },
        next: {
          always: [{ guard: "waitResearch", target: "researching" }, { target: "loading", actions: assign(({ context }) => applyResearch(context)) }],
        },
        researching: {
          entry: assign({ line: null }),
          always: [{ guard: "researchArrived", target: "next" }],
        },
        finished: {
          entry: assign({ line: null }),
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

