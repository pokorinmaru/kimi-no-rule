// The reading-research agent (指示書 第6.7節 手順1, kept to the submission). Once a problem is done, Claude
// Opus reads the child's first readings and the words of this session and edits the pool of hypotheses,
// written in the reading language. Its tools are core functions; the pool it hands in goes through
// core's revisePool. Weights, the choice of the next problem and confirmation stay in core.
import {
  infoGain,
  predict,
  revisePool,
  runRule,
  sameReading,
  schemas,
  solve,
  type FirstReading,
  type Hypothesis,
  type PoolEdit,
  type ProblemRecord,
  type ResearchState,
  type Revision,
  type WorldScene,
} from "@kimi/core";
import { z } from "zod";
import { runAgent, type AgentClient, type AgentTool } from "./agent.ts";
import { MODELS } from "./client.ts";

export const RESEARCH_TOOLS: readonly string[] = ["run_rule", "score_rule", "predict", "info_gain", "submit_pool"];

/** One reading as the agent sees it: the problem, the child's world, and this session's words (never stored). */
export interface ResearchReading extends FirstReading {
  /** The child's words on this problem in this session (evidence and tapped phrases). Memory only. */
  words: string[];
}

export interface ResearchInput {
  state: ResearchState;
  /** The readings with this session's words; their order and records match state.readings. */
  readings: ResearchReading[];
  /** Every prepared problem of the type, for merging hypotheses that build the same worlds. */
  bank: ProblemRecord[];
}

export interface ResearchOptions {
  maxTurns: number;
  maxRejections: number;
  model: string;
  /** Aborts the run when the caller stops waiting (no further turn is started or paid for). */
  signal?: AbortSignal;
}

export const DEFAULT_RESEARCH_OPTIONS: Omit<ResearchOptions, "signal"> = { maxTurns: 12, maxRejections: 3, model: MODELS.build };

/** The kinds of word cue Claude names; only the kind is kept, never the child's words. */
const cueKind = z.enum([
  "operation_by_size",
  "keyword_multiply",
  "keyword_subtract",
  "first_mentioned_as_whole",
  "known_as_whole",
  "additive_reading",
  "none",
]);

const poolEdit = z.union([
  z.strictObject({ kind: z.literal("add"), hypothesis: schemas.readingRule.shape.hypotheses.element }),
  z.strictObject({ kind: z.literal("modify"), hypothesis: schemas.readingRule.shape.hypotheses.element }),
  z.strictObject({ kind: z.literal("delete"), id: z.string() }),
]);
const submission = z.strictObject({ edits: z.array(poolEdit), cue_kinds: z.array(cueKind) });

export type ResearchOutcome =
  | { kind: "submitted"; revision: Revision; cueKinds: z.infer<typeof cueKind>[] }
  | { kind: "agent_failed" | "too_many_rejections"; revision: null; cueKinds: [] };

export const RESEARCH_SYSTEM = [
  "You study how one child reads fraction-as-a-multiple word problems. You never talk to the child.",
  "Write each candidate reading as a hypothesis of the reading language: clauses of {when, then}, checked in order; the first clause whose condition holds acts.",
  "Actions: no_change, swap_reference, choose_reference (by first_mentioned, second_mentioned, known_value, asked, larger_number, smaller_number, or {holder: before_word|after_word, word}), set_relation_type_additive (amount numerator|ratio_value), number_op (mode divide_large_by_small|multiply_always|divide_always|percent_as_count), invert_ratio, flip_event, misread_question (target other_holder).",
  "Conditions: and/or/not over predicates relation_operator_is, ratio_kind_is, problem_type_is, consistency_is, word_in_statement, word_before_ratio, word_after_holder, reference_is, numbers_compare, ratio_is_unit_fraction, true.",
  "Keep the pool between 2 and 5 hypotheses: add, modify or delete. A reading not in any known list may be written too. Do not write a candidate the child's words contradict; the words are the only way to tell apart readings that build the same world.",
  "Check candidates with score_rule (how many first readings each reproduces) and run_rule, then hand in the edits with submit_pool. If it refuses some, fix them and submit again.",
  "In cue_kinds name only the kind of word cue you relied on. Never copy the child's words into any field: a word a rule names must be a word of a problem text, and a hypothesis that repeats the child's words is refused.",
].join("\n");

const jsonInput = (name: string, description: string): Record<string, unknown> => ({
  type: "object",
  properties: { [name]: { type: "string", description } },
  required: [name],
  additionalProperties: false,
});

const RULE = "A hypothesis of the reading language as JSON text.";
const SCHEMAS: Record<string, Record<string, unknown>> = {
  run_rule: {
    type: "object",
    properties: { rule_json: { type: "string", description: RULE }, problem_id: { type: "string" } },
    required: ["rule_json", "problem_id"],
    additionalProperties: false,
  },
  score_rule: jsonInput("rule_json", RULE),
  predict: {
    type: "object",
    properties: { rules_json: { type: "string", description: "A JSON array of hypotheses." }, problem_id: { type: "string" } },
    required: ["rules_json", "problem_id"],
    additionalProperties: false,
  },
  info_gain: {
    type: "object",
    properties: {
      rules_json: { type: "string", description: "A JSON array of hypotheses." },
      weights_json: { type: "string", description: "A JSON object from hypothesis id (and other) to weight." },
      problem_id: { type: "string" },
    },
    required: ["rules_json", "weights_json", "problem_id"],
    additionalProperties: false,
  },
  submit_pool: jsonInput("submission_json", "JSON text {edits: [{kind: add|modify, hypothesis} | {kind: delete, id}], cue_kinds: [...]}."),
};

/** The input schemas of the agent's tools (for the request-shape test). Every parameter is a string. */
export const researchToolSchemas = (): Record<string, unknown>[] => RESEARCH_TOOLS.map((n) => SCHEMAS[n] as Record<string, unknown>);

const field = (input: unknown, name: string): string => {
  const v = (input as Record<string, unknown> | null)?.[name];
  if (typeof v !== "string") throw new Error(`${name} must be a string`);
  return v;
};
const parseRule = (text: string): Hypothesis => schemas.readingRule.shape.hypotheses.element.parse(JSON.parse(text));
const parseRules = (text: string): Hypothesis[] => z.array(schemas.readingRule.shape.hypotheses.element).parse(JSON.parse(text));

/** A world in short: each quantity's value as solved, or why it does not solve. */
function summary(w: WorldScene): unknown {
  const res = solve(w);
  const values =
    res.kind === "unique" || res.kind === "underdetermined"
      ? Object.fromEntries([...res.values].map(([k, v]) => [k, `${v.num}/${v.den}`]))
      : {};
  return { kind: res.kind, values, relations: w.relations.map((r) => ({ id: r.id, operator: r.operator, subject: r.subject, reference: r.reference })) };
}

const NOTE_MAX = 200;
const squash = (s: string): string => s.normalize("NFKC").replace(/\s+/g, "").toLowerCase();

/** The words a rule names: condition arguments that are words, the by-word holder, and problem-word cues. */
function namedWords(h: Hypothesis): string[] {
  const out: string[] = [];
  const walk = (e: Hypothesis["clauses"][number]["when"]): void => {
    if ("op" in e) {
      if (e.op === "not") walk(e.arg);
      else e.args.forEach(walk);
      return;
    }
    if (e.pred === "word_in_statement" || e.pred === "word_before_ratio") out.push(...e.args.slice(0, 1));
    if (e.pred === "word_after_holder") out.push(...e.args.slice(1, 2));
  };
  for (const c of h.clauses) {
    walk(c.when);
    if (c.then.action === "choose_reference" && typeof c.then.by !== "string") out.push(c.then.by.word);
  }
  for (const w of h.word_cues) if (typeof w !== "string") out.push(w.word);
  return out;
}

/**
 * Why a hypothesis would carry the child's words into the stored pool, if it would (指示書 第6.7節 入力:
 * only the kind of cue is kept). Every string it holds must be free of the session's words, the words it
 * names must come from the problem texts, and the note for adults is short.
 */
export function leakOf(h: Hypothesis, words: readonly string[], problemTexts: readonly string[]): string[] {
  const why: string[] = [];
  const said = words.map(squash).filter((w) => w.length >= 2);
  const strings: string[] = [];
  JSON.stringify(h, (_k, v: unknown) => {
    if (typeof v === "string") strings.push(v);
    return v;
  });
  if (strings.some((s) => said.some((w) => squash(s).includes(w)))) why.push("it repeats the child's words");
  const texts = problemTexts.map(squash);
  for (const w of namedWords(h)) if (w === "" || !texts.some((t) => t.includes(squash(w)))) why.push(`the word ${JSON.stringify(w)} is not in a problem text`);
  if (h.note_for_adult.length > NOTE_MAX) why.push(`note_for_adult is longer than ${NOTE_MAX}`);
  return why;
}

/** What the agent is told: the problems and the child's first worlds, the words, and the current pool. */
function prompt(input: ResearchInput): string {
  const readings = input.readings.map((r, i) => ({
    n: i + 1,
    problem_id: r.record.world.problem_id,
    problem_text: r.record.world.problem_text,
    child_world: summary(r.childWorld),
    reference_placed: r.referencePlaced,
    child_words: r.words,
  }));
  const pool = input.state.pool.map((e) => ({ hypothesis: e.hypothesis, weight: input.state.weights[e.hypothesis.id] ?? 0, status: e.status }));
  return JSON.stringify({ readings, pool, other_weight: input.state.weights.other ?? 0, bank: input.bank.map((b) => b.world.problem_id) }, null, 1);
}

export async function writeHypotheses(
  agent: AgentClient,
  input: ResearchInput,
  options: Partial<ResearchOptions> = {},
): Promise<ResearchOutcome> {
  const opts = { ...DEFAULT_RESEARCH_OPTIONS, ...options };
  const problems = new Map([...input.bank, ...input.readings.map((r) => r.record)].map((r) => [r.world.problem_id, r]));
  const problem = (id: string): ProblemRecord => {
    const r = problems.get(id);
    if (r === undefined) throw new Error(`unknown problem ${id}`);
    return r;
  };
  const words = input.readings.flatMap((r) => r.words);
  const texts = [...problems.values()].map((r) => r.world.problem_text);
  let accepted: { revision: Revision; cueKinds: z.infer<typeof cueKind>[] } | null = null;
  let rejections = 0;

  const tools: AgentTool[] = [
    {
      name: "run_rule",
      description: "The world the rule builds on one problem, solved.",
      inputSchema: SCHEMAS.run_rule as Record<string, unknown>,
      run: async (i) => summary(runRule(parseRule(field(i, "rule_json")), problem(field(i, "problem_id")))),
    },
    {
      name: "score_rule",
      description: "How many of the child's first readings the rule reproduces, and which it misses.",
      inputSchema: SCHEMAS.score_rule as Record<string, unknown>,
      run: async (i) => {
        const h = parseRule(field(i, "rule_json"));
        const missed = input.readings
          .filter((r) => !sameReading(runRule(h, r.record), r.childWorld, r.referencePlaced))
          .map((r) => r.record.world.problem_id);
        return { reproduced: input.readings.length - missed.length, missed };
      },
    },
    {
      name: "predict",
      description: "On one problem, the class of world each rule builds (same number, same world).",
      inputSchema: SCHEMAS.predict as Record<string, unknown>,
      run: async (i) => {
        const pred = predict(parseRules(field(i, "rules_json")), problem(field(i, "problem_id")), true);
        return pred.predictions.map((p) => ({ id: p.hypothesisId, world_class: p.worldClass }));
      },
    },
    {
      name: "info_gain",
      description: "How well one problem tells the rules apart under the weights, in bits.",
      inputSchema: SCHEMAS.info_gain as Record<string, unknown>,
      run: async (i) => {
        const weights = z.record(z.string(), z.number().nonnegative()).parse(JSON.parse(field(i, "weights_json")));
        return { bits: infoGain(weights, predict(parseRules(field(i, "rules_json")), problem(field(i, "problem_id")), true)) };
      },
    },
    {
      name: "submit_pool",
      description: "Hand in the edits to the pool. Refused edits come back with the reason.",
      inputSchema: SCHEMAS.submit_pool as Record<string, unknown>,
      run: async (i) => {
        let parsed: z.infer<typeof submission>;
        try {
          parsed = submission.parse(JSON.parse(field(i, "submission_json")));
        } catch (e) {
          rejections++;
          throw new Error(`refused: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
        }
        const leaks = parsed.edits.flatMap((e, index) => (e.kind === "delete" ? [] : leakOf(e.hypothesis, words, texts).map((why) => `edit ${index}: ${why}`)));
        if (leaks.length > 0) {
          rejections++;
          throw new Error(`refused: ${leaks.join("; ")}`);
        }
        const revision = revisePool(input.state, parsed.edits as PoolEdit[], input.bank);
        if (revision.rejected.length > 0) {
          rejections++;
          throw new Error(`refused: ${revision.rejected.map((r) => `edit ${r.index}: ${r.reason}`).join("; ")}`);
        }
        accepted = { revision, cueKinds: parsed.cue_kinds };
        return { pool: revision.state.pool.map((e) => e.hypothesis.id), merged: revision.merged };
      },
    },
  ];

  try {
    await runAgent(agent, { model: opts.model, system: RESEARCH_SYSTEM, prompt: prompt(input), tools, maxTurns: opts.maxTurns, ...(opts.signal === undefined ? {} : { signal: opts.signal }) });
  } catch {
    // the outcome below says the agent failed
  }
  const done = accepted as { revision: Revision; cueKinds: z.infer<typeof cueKind>[] } | null;
  if (done !== null) return { kind: "submitted", revision: done.revision, cueKinds: done.cueKinds };
  return { kind: rejections >= opts.maxRejections ? "too_many_rejections" : "agent_failed", revision: null, cueKinds: [] };
}
