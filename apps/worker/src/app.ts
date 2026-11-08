// The local worker (指示書 第11節 M5, reduced to HANDOFF §3: the junior's words, the research agent and the
// safety check; the everyday scenes, 指示書 第6.7節 手順5; and the child's voice as ops, 第6.1節). It calls only @kimi/interpret's functions. Nothing is logged or stored: there is no
// logger, errors answer without details, and every body is capped. Without a key every route answers 503,
// so the device falls back to its templates, its fallback pool and "unchecked".
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { PREPARED_BANK, redactInterpretation, sameWorld, sceneAvoidValues, schemas, validateWorld, type GateContext, type Hypothesis, type ProblemRecord, type ResearchState, type WorldScene } from "@kimi/core";
import { INTERPRET_TIMEOUT_MS, WORD_KINDS, checkSafety, interpret, kohai, proposeScenes, writeHypotheses, type AgentClient, type ClaudeClient, type ResearchReading, type WordKind } from "@kimi/interpret";

export interface WorkerDeps {
  /** The Claude client, or null when there is no key. */
  client(): ClaudeClient | null;
  /** The agent client for the research agent, or null when there is no key. */
  agent(): AgentClient | null;
  bank?: readonly ProblemRecord[];
  /** The clock for the per-process cap (tests only). */
  now?: () => number;
}

/** At most this many calls per route in one window, per process: a runaway page cannot spend the key. */
export const RATE_LIMITS = { windowMs: 60 * 60 * 1000, research: { max: 30 }, kohai: { max: 300 }, scenes: { max: 60 }, interpret: { max: 120 } } as const;

/** A sliding window of call times; true while there is room, and the call is counted. */
function limiter(max: number, windowMs: number, now: () => number): () => boolean {
  const times: number[] = [];
  return () => {
    const t = now();
    while (times.length > 0 && (times[0] as number) <= t - windowMs) times.shift();
    if (times.length >= max) return false;
    times.push(t);
    return true;
  };
}

export const BODY_LIMITS = { kohai: 64 * 1024, research: 256 * 1024, safety: 4 * 1024, scenes: 16 * 1024, interpret: 4 * 1024 } as const;
const MAX_WORDS = 16;
const MAX_WORD_CHARS = 40;
const MAX_SAFETY_CHARS = 500;
const MAX_TRANSCRIPT_CHARS = 500;

type Json = Record<string, unknown>;
const isObj = (x: unknown): x is Json => typeof x === "object" && x !== null && !Array.isArray(x);
const isStr = (x: unknown, max: number): x is string => typeof x === "string" && x.length <= max;
const isWords = (x: unknown): x is string[] => Array.isArray(x) && x.length <= MAX_WORDS && x.every((w) => isStr(w, MAX_WORD_CHARS));
const isNat = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0;
const onlyKeys = (o: Json, keys: readonly string[]): boolean => Object.keys(o).every((k) => keys.includes(k));

interface KohaiBody {
  problem_id: string;
  intent: "read" | "which" | "restate";
  lang: "ja" | "en";
  kohaiWorld: WorldScene;
  childOps: { holderIds: string[]; words: string[] };
  failing?: { statement_index: number; words: string[] }[];
}

function kohaiBody(x: unknown): KohaiBody | null {
  if (!isObj(x) || !onlyKeys(x, ["problem_id", "intent", "lang", "kohaiWorld", "childOps", "failing"])) return null;
  const { problem_id, intent, lang, childOps, failing } = x;
  if (!isStr(problem_id, 80) || (intent !== "read" && intent !== "which" && intent !== "restate") || (lang !== "ja" && lang !== "en")) return null;
  const world = schemas.worldScene.safeParse(x.kohaiWorld);
  if (!world.success) return null;
  if (!isObj(childOps) || !onlyKeys(childOps, ["holderIds", "words"])) return null;
  const holderIds = childOps.holderIds;
  if (!Array.isArray(holderIds) || holderIds.length > 4 || !holderIds.every((h) => isStr(h, 80)) || !isWords(childOps.words)) return null;
  let fails: KohaiBody["failing"];
  if (failing !== undefined) {
    if (!Array.isArray(failing) || failing.length > 8) return null;
    if (!failing.every((f) => isObj(f) && onlyKeys(f, ["statement_index", "words"]) && isNat(f.statement_index) && isWords(f.words))) return null;
    fails = failing as KohaiBody["failing"];
  }
  return {
    problem_id,
    intent,
    lang,
    kohaiWorld: world.data,
    childOps: { holderIds: holderIds as string[], words: childOps.words as string[] },
    ...(fails === undefined ? {} : { failing: fails }),
  };
}

interface ResearchBody {
  pool: ResearchState["pool"];
  weights: ResearchState["weights"];
  unscored: number;
  unexpressible: boolean;
  readings: { problem_id: string; childWorld: WorldScene; referencePlaced: boolean; afterFix: boolean; wordbookOpenedBefore: boolean; words: string[] }[];
}

const hypothesisSchema = schemas.readingRule.shape.hypotheses.element;

function researchBody(x: unknown): ResearchBody | null {
  if (!isObj(x) || !onlyKeys(x, ["pool", "weights", "unscored", "unexpressible", "readings"])) return null;
  const { pool, weights, unscored, unexpressible, readings } = x;
  if (!Array.isArray(pool) || pool.length > 8 || !Array.isArray(readings) || readings.length > 12) return null;
  if (!isNat(unscored) || typeof unexpressible !== "boolean" || !isObj(weights)) return null;
  if (!Object.entries(weights).every(([k, v]) => k.length <= 80 && typeof v === "number" && Number.isFinite(v) && v >= 0)) return null;
  const outPool: ResearchState["pool"] = [];
  for (const e of pool) {
    if (!isObj(e) || !onlyKeys(e, ["hypothesis", "status", "splitObservations"])) return null;
    const h = hypothesisSchema.safeParse(e.hypothesis);
    if (!h.success || (e.status !== "hypothesis" && e.status !== "confirmed") || !isNat(e.splitObservations)) return null;
    outPool.push({ hypothesis: h.data, status: e.status, splitObservations: e.splitObservations });
  }
  const outReadings: ResearchBody["readings"] = [];
  for (const r of readings) {
    if (!isObj(r) || !onlyKeys(r, ["problem_id", "childWorld", "referencePlaced", "afterFix", "wordbookOpenedBefore", "words"])) return null;
    const w = schemas.worldScene.safeParse(r.childWorld);
    if (!isStr(r.problem_id, 80) || !w.success || !isWords(r.words)) return null;
    if (typeof r.referencePlaced !== "boolean" || typeof r.afterFix !== "boolean" || typeof r.wordbookOpenedBefore !== "boolean") return null;
    outReadings.push({ problem_id: r.problem_id, childWorld: w.data, referencePlaced: r.referencePlaced, afterFix: r.afterFix, wordbookOpenedBefore: r.wordbookOpenedBefore, words: r.words });
  }
  return { pool: outPool, weights: weights as ResearchState["weights"], unscored, unexpressible, readings: outReadings };
}

function safetyBody(x: unknown): { text: string } | null {
  return isObj(x) && onlyKeys(x, ["text"]) && isStr(x.text, MAX_SAFETY_CHARS) ? { text: x.text } : null;
}

/** POST /scenes: the reading (a rule of the reading language), the screen's language and the kinds of the tapped words (never the words). */
function scenesBody(x: unknown): { rule: Hypothesis; lang: "ja" | "en"; wordKinds: WordKind[] } | null {
  if (!isObj(x) || !onlyKeys(x, ["rule", "lang", "word_kinds"])) return null;
  const rule = hypothesisSchema.safeParse(x.rule);
  const kinds = x.word_kinds;
  if (!rule.success || (x.lang !== "ja" && x.lang !== "en")) return null;
  if (!Array.isArray(kinds) || kinds.length > MAX_WORDS || !kinds.every((k) => (WORD_KINDS as readonly unknown[]).includes(k))) return null;
  return { rule: rule.data, lang: x.lang, wordKinds: kinds as WordKind[] };
}

/** POST /interpret: the problem by id, what the browser heard, and the screen's language. No world, no record. */
function interpretBody(x: unknown): { problemId: string; transcript: string; lang: "ja" | "en" } | null {
  if (!isObj(x) || !onlyKeys(x, ["problem_id", "transcript", "lang"])) return null;
  const { problem_id, transcript, lang } = x;
  if (!isStr(problem_id, 80) || !isStr(transcript, MAX_TRANSCRIPT_CHARS) || transcript.trim() === "" || (lang !== "ja" && lang !== "en")) return null;
  return { problemId: problem_id, transcript, lang };
}

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

async function jsonOf(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export function createApp(deps: WorkerDeps): Hono {
  const bank = deps.bank ?? PREPARED_BANK;
  const recordOf = (id: string): ProblemRecord | undefined => bank.find((r) => r.world.problem_id === id);
  const app = new Hono();
  const tooLarge = (c: { json: (b: unknown, s: 413) => Response }) => c.json({ error: "too_large" }, 413);
  const now = deps.now ?? (() => Date.now());
  const roomFor = {
    kohai: limiter(RATE_LIMITS.kohai.max, RATE_LIMITS.windowMs, now),
    research: limiter(RATE_LIMITS.research.max, RATE_LIMITS.windowMs, now),
    scenes: limiter(RATE_LIMITS.scenes.max, RATE_LIMITS.windowMs, now),
    interpret: limiter(RATE_LIMITS.interpret.max, RATE_LIMITS.windowMs, now),
  };
  // The scenes keep away from every bank problem's answer and one part (a superset of the current and next problem's).
  const sceneAvoid = sceneAvoidValues(bank);

  app.use("*", cors({ origin: (o) => (LOCAL_ORIGIN.test(o) ? o : null), allowMethods: ["POST"], allowHeaders: ["content-type"] }));
  // Only this device's pages may spend the key: a page from elsewhere (Origin), a name that resolves here
  // from elsewhere (Host, DNS rebinding) and a simple form post (no JSON) are all refused before parsing.
  app.use("/:route{kohai|research|safety|scenes|interpret}", async (c, next) => {
    if (c.req.method === "OPTIONS") return next();
    const origin = c.req.header("origin");
    const host = c.req.header("host") ?? new URL(c.req.url).host;
    const type = (c.req.header("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
    if (origin !== undefined && !LOCAL_ORIGIN.test(origin)) return c.json({ error: "forbidden" }, 403);
    if (!LOCAL_HOST.test(host)) return c.json({ error: "forbidden" }, 403);
    if (c.req.method === "POST" && type !== "application/json") return c.json({ error: "unsupported" }, 415);
    return next();
  });
  app.onError((_err, c) => c.json({ error: "failed" }, 500));
  app.notFound((c) => c.json({ error: "not_found" }, 404));

  app.post("/kohai", bodyLimit({ maxSize: BODY_LIMITS.kohai, onError: tooLarge }), async (c) => {
    const client = deps.client();
    if (client === null) return c.json({ error: "no_key" }, 503);
    const b = kohaiBody(await jsonOf(c.req.raw));
    if (b === null) return c.json({ error: "bad_request" }, 400);
    const record = recordOf(b.problem_id);
    if (record === undefined || b.kohaiWorld.problem_id !== b.problem_id || !validateWorld(b.kohaiWorld).ok) return c.json({ error: "bad_request" }, 400);
    // The junior's world is never the correct one: the generator must not be handed it.
    if (sameWorld(b.kohaiWorld, record.world)) return c.json({ error: "bad_request" }, 400);
    if (!roomFor.kohai()) return c.json({ error: "too_many" }, 429);
    // The gates know the correct world (from the bank, never from the client); the generator does not.
    const gateCtx: GateContext = {
      correct: record.world,
      lang: b.lang,
      childSaid: { numbers: [], words: b.childOps.words },
      grade: record.world.grade,
      interpretationRecorded: true,
      prediction: "disabled",
    };
    const out = await kohai(
      {
        intent: b.intent,
        lang: b.lang,
        kohaiWorld: b.kohaiWorld,
        statements: record.statements,
        childOps: b.childOps,
        ...(b.failing === undefined ? {} : { failing: b.failing }),
      },
      client,
      gateCtx,
    );
    return c.json({ text: out.text, source: out.source, rejected: out.rejected });
  });

  app.post("/research", bodyLimit({ maxSize: BODY_LIMITS.research, onError: tooLarge }), async (c) => {
    const agent = deps.agent();
    if (agent === null) return c.json({ error: "no_key" }, 503);
    const b = researchBody(await jsonOf(c.req.raw));
    if (b === null) return c.json({ error: "bad_request" }, 400);
    const readings: ResearchReading[] = [];
    for (const r of b.readings) {
      const record = recordOf(r.problem_id);
      if (record === undefined || !validateWorld(r.childWorld).ok) return c.json({ error: "bad_request" }, 400);
      readings.push({ record, childWorld: r.childWorld, referencePlaced: r.referencePlaced, afterFix: r.afterFix, wordbookOpenedBefore: r.wordbookOpenedBefore, words: r.words });
    }
    if (!roomFor.research()) return c.json({ error: "too_many" }, 429);
    const state: ResearchState = {
      pool: b.pool,
      weights: b.weights,
      readings: readings.map((r) => ({ record: r.record, childWorld: r.childWorld, referencePlaced: r.referencePlaced, afterFix: r.afterFix, wordbookOpenedBefore: r.wordbookOpenedBefore })),
      unscored: b.unscored,
      unexpressible: b.unexpressible,
    };
    // When the device gives up (8 s) and closes the request, the run stops before its next turn.
    const out = await writeHypotheses(agent, { state, readings, bank: [...bank] }, { signal: c.req.raw.signal });
    if (out.kind !== "submitted") return c.json({ kind: "failed" });
    // Only the hypotheses go back; the device checks them again with core before it uses any.
    return c.json({ kind: "submitted", pool: out.revision.state.pool.map((e) => e.hypothesis) });
  });

  app.post("/scenes", bodyLimit({ maxSize: BODY_LIMITS.scenes, onError: tooLarge }), async (c) => {
    const client = deps.client();
    if (client === null) return c.json({ error: "no_key" }, 503);
    const b = scenesBody(await jsonOf(c.req.raw));
    if (b === null) return c.json({ error: "bad_request" }, 400);
    if (!roomFor.scenes()) return c.json({ error: "too_many" }, 429);
    const out = await proposeScenes({ rule: b.rule, lang: b.lang, wordKinds: b.wordKinds, avoid: sceneAvoid }, client);
    // Only the choices go back; the device builds and checks the scenes again with core before it shows any.
    return c.json({ source: out.source, proposal: out.proposal, reason: out.reason });
  });

  // The child's voice as ops on the bank's correct world (指示書 第6.1節). interpret() checks Claude's reply with the
  // per-problem schema and core validateOps; only those ops go back, with the child's words taken out by core.
  app.post("/interpret", bodyLimit({ maxSize: BODY_LIMITS.interpret, onError: tooLarge }), async (c) => {
    const client = deps.client();
    if (client === null) return c.json({ error: "no_key" }, 503);
    const b = interpretBody(await jsonOf(c.req.raw));
    if (b === null) return c.json({ error: "bad_request" }, 400);
    const record = recordOf(b.problemId);
    if (record === undefined) return c.json({ error: "bad_request" }, 400);
    if (!roomFor.interpret()) return c.json({ error: "too_many" }, 429);
    const out = await interpret({ record, transcript: b.transcript, fingerOps: [], wordCues: [], lang: b.lang }, client, { timeoutMs: INTERPRET_TIMEOUT_MS });
    if (out.status !== "ok") return c.json({ status: out.status, ops: [] });
    return c.json({ status: "ok", ops: redactInterpretation(out.interpretation).ops });
  });

  app.post("/safety", bodyLimit({ maxSize: BODY_LIMITS.safety, onError: tooLarge }), async (c) => {
    const client = deps.client();
    if (client === null) return c.json({ error: "no_key" }, 503);
    const b = safetyBody(await jsonOf(c.req.raw));
    if (b === null) return c.json({ error: "bad_request" }, 400);
    const out = await checkSafety(b.text, client);
    return c.json({ flag: out.flag });
  });

  return app;
}
