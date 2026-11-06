// M2: the world-building agent (指示書 第6.6節). Opus proposes a world through a tool loop; the tools are
// core functions that solve and check it. A world is used only when two independent builds agree, the
// restated sentences mean the problem text, the sentence list checks, the problem conditions hold and
// the listening layer reads Opus-written misreads as expected. Nothing here touches a child's words.
import { z } from "zod";
import {
  apply,
  misreadCandidates,
  problemConditions,
  problemScopedSchemas,
  restate,
  sameBuild,
  sameStructure,
  sameWorld,
  schemas,
  solve,
  validateOps,
  validateStatements,
  validateWorld,
  type AnyOp,
  type ProblemRecord,
  type WorldScene,
} from "@kimi/core";
import { runAgent, type AgentClient, type AgentTool } from "./agent.ts";
import { MODELS, withDeadline, type ClaudeClient } from "./client.ts";
import { interpret } from "./interpret.ts";

export interface BuildDeps {
  agent: AgentClient;
  judge: ClaudeClient;
  listen: ClaudeClient;
}

export interface BuildInput {
  problemId: string;
  problemText: string;
  lang: "ja" | "en";
  grade: number;
  consistency: ProblemRecord["consistency"];
  source: ProblemRecord["source"];
  pairId?: string | null;
}

export interface BuildOptions {
  maxRejections?: number;
  misreadThreshold?: number;
  misreadCount?: number;
  minValidMisreads?: number;
  maxTurns?: number;
}

export type BuildStep = "build_a" | "build_b" | "double_build" | "restate" | "statements" | "conditions" | "misread" | "adopt" | "reject";
export interface BuildLogEntry {
  step: BuildStep;
  tool?: string;
  ok: boolean;
  detail: string;
}
export type RejectReason =
  | "agent_failed"
  | "too_many_rejections"
  | "double_build_mismatch"
  | "restate_mismatch"
  | "statements_invalid"
  | "conditions_failed"
  | "misread_items_invalid"
  | "misread_below_threshold"
  | "structure_mismatch";
export type BuildOutcome =
  | { status: "adopted"; record: ProblemRecord; log: BuildLogEntry[] }
  | { status: "rejected"; reason: RejectReason; log: BuildLogEntry[] };

export const BUILD_TOOLS: readonly string[] = ["solve", "diagnose_candidates", "restate", "submit_world"];

const JUDGE_TIMEOUT_MS = 120_000;

export const BUILD_SYSTEM = [
  "You turn an elementary school word problem into a world-scene: holders, kinds of items, quantities, relations, events and the question.",
  "Only write what the problem text says. The relation's subject is the quantity the sentence talks about and its reference is the quantity it is compared with, as the words put it; never turn a relation around.",
  "Leave the asked quantity's value null. Use ids with the prefixes h_, k_, q_, r_, e_.",
  "Check your world with the tools solve, diagnose_candidates and restate, then hand it in with submit_world. If submit_world refuses it, read the reasons, fix the world and submit again.",
].join("\n");

const worldInput = { type: "object", properties: { world: z.toJSONSchema(schemas.worldScene, { target: "draft-2020-12" }) }, required: ["world"], additionalProperties: false } as Record<string, unknown>;

const ratText = (r: { num: bigint | number; den: bigint | number }): string => `${r.num}/${r.den}`;

function parseWorld(input: unknown): WorldScene {
  const w = schemas.worldScene.parse((input as { world?: unknown } | null)?.world);
  const v = validateWorld(w);
  if (!v.ok) throw new Error(v.errors.map((e) => `${e.path}: ${e.message}`).join("; "));
  return w;
}

function solveSummary(w: WorldScene): unknown {
  const r = solve(w);
  switch (r.kind) {
    case "unique":
      return { kind: r.kind, values: Object.fromEntries([...r.values].map(([k, v]) => [k, ratText(v)])), impossible: r.impossible };
    case "underdetermined":
      return { kind: r.kind, undetermined: r.undetermined };
    case "contradiction":
      return { kind: r.kind, minimal_sets: r.minimalSets };
    case "nonlinear":
      return { kind: r.kind, relations: r.relations };
  }
}

/**
 * The problem conditions before the sentences exist: one sentence per given element and one for the
 * question, so every element can be judged on its own.
 */
function provisionalRecord(w: WorldScene, input: BuildInput): ProblemRecord {
  const ids = [...w.quantities.filter((q) => q.value !== null).map((q) => q.id), ...w.relations.map((r) => r.id), ...w.events.map((e) => e.id)];
  const one = (index: number, element_ids: string[], is_question: boolean): ProblemRecord["statements"][number] => ({
    index,
    text: w.problem_text,
    element_ids,
    is_question,
    speaker_holder_id: null,
    tokens: [w.problem_text],
  });
  return {
    schema_version: "1",
    world: w,
    consistency: input.consistency,
    pair_id: input.pairId ?? null,
    source: input.source,
    checks: { double_build_match: false, restate_match: false, misread_pass_rate: null, human_checked: false },
    expected_answer: null,
    statements: [...ids.map((id, i) => one(i, [id], false)), one(ids.length, [w.question.target_id], true)],
    syntax_marks: [],
    companion_ids: [],
  };
}

/** One build: an agent run of its own, so the second build does not see the first. */
async function buildOnce(
  deps: BuildDeps,
  input: BuildInput,
  step: "build_a" | "build_b",
  log: BuildLogEntry[],
  opts: Required<BuildOptions>,
): Promise<{ world: WorldScene } | { reason: "agent_failed" | "too_many_rejections" }> {
  let accepted: WorldScene | null = null;
  let rejections = 0;
  const logged = (tool: string, ok: boolean, detail: string): void => {
    log.push({ step, tool, ok, detail });
  };
  const fixed = (w: WorldScene): WorldScene => ({ ...w, problem_id: input.problemId, problem_text: input.problemText, grade: input.grade, problem_lang: input.lang });
  const tools: AgentTool[] = [
    {
      name: "solve",
      description: "Solve a world: unique values, underdetermined, contradiction with minimal sets, or nonlinear; and values that cannot happen.",
      inputSchema: worldInput,
      async run(x) {
        const out = solveSummary(fixed(parseWorld(x)));
        logged("solve", true, JSON.stringify(out));
        return out;
      },
    },
    {
      name: "diagnose_candidates",
      description: "The misreadings the app knows for a world, and whether each gives an answer different from the correct one.",
      inputSchema: worldInput,
      async run(x) {
        const w = fixed(parseWorld(x));
        const r = solve(w);
        const correct = r.kind === "unique" ? r.values.get(w.question.target_id) : undefined;
        const out = misreadCandidates(w).map((c) => ({
          flips: c.flips,
          answer: c.answer === null ? null : ratText(c.answer),
          differs: correct === undefined || c.answer === null ? null : ratText(correct) !== ratText(c.answer),
          impossible: c.impossible,
        }));
        logged("diagnose_candidates", true, `${out.length} candidates`);
        return out;
      },
    },
    {
      name: "restate",
      description: "The world written back as plain sentences, to compare with the problem text.",
      inputSchema: worldInput,
      async run(x) {
        const out = restate(fixed(parseWorld(x)), input.lang).map((s) => s.text);
        logged("restate", true, out.join(" "));
        return out;
      },
    },
    {
      name: "submit_world",
      description: "Hand in the world. It is refused with the reasons when it does not meet the problem conditions.",
      inputSchema: worldInput,
      async run(x) {
        if (accepted !== null) return { accepted: true };
        if (rejections >= opts.maxRejections) throw new Error("no more submissions are taken for this build");
        let reasons: string[];
        try {
          const w = fixed(parseWorld(x));
          const c = problemConditions(provisionalRecord(w, input));
          if (c.ok) {
            accepted = w;
            logged("submit_world", true, "accepted");
            return { accepted: true };
          }
          reasons = c.failures.map((f) => (f.flip === undefined ? f.code : `${f.code} (${f.flip.kind} ${f.flip.element_id})`));
        } catch (e) {
          reasons = [e instanceof Error ? e.message : String(e)];
        }
        rejections++;
        logged("submit_world", false, reasons.join("; "));
        throw new Error(`refused: ${reasons.join("; ")}`);
      },
    },
  ];
  try {
    await runAgent(deps.agent, {
      model: MODELS.build,
      system: BUILD_SYSTEM,
      prompt: `Problem (${input.lang}, grade ${input.grade}, id ${input.problemId}):\n${input.problemText}`,
      tools,
      maxTurns: opts.maxTurns,
    });
  } catch (e) {
    log.push({ step, ok: false, detail: e instanceof Error ? e.message : String(e) });
  }
  if (accepted !== null) return { world: accepted };
  const reason = rejections >= opts.maxRejections ? "too_many_rejections" : "agent_failed";
  log.push({ step, ok: false, detail: reason });
  return { reason };
}

/** One structured call to the judge, checked with zod and `check`; one retry. */
async function judgeCall<T>(
  deps: BuildDeps,
  system: string,
  context: string,
  userText: string,
  schema: z.ZodType<T>,
  check: (v: T) => boolean = () => true,
  askWith: z.ZodType = schema,
): Promise<T | null> {
  const jsonSchema = z.toJSONSchema(askWith, { target: "draft-2020-12" }) as Record<string, unknown>;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await withDeadline(JUDGE_TIMEOUT_MS, (signal) =>
        deps.judge.complete({ model: MODELS.build, system, cachedContext: context, userText, schema: jsonSchema, effort: "high", maxTokens: 16000, signal }),
      );
      if (res === "timeout" || res.stopReason !== "end_turn") continue;
      const parsed = schema.safeParse(JSON.parse(res.text));
      if (parsed.success && check(parsed.data)) return parsed.data;
    } catch {
      // a failed call counts as a failed attempt
    }
  }
  return null;
}

const restateVerdict = z.strictObject({ same_meaning: z.boolean(), differences: z.array(z.string()) });
const statementsReply = z.strictObject({ statements: schemas.problemRecord.shape.statements, syntax_marks: schemas.problemRecord.shape.syntax_marks });
const problemTextReply = z.strictObject({ problem_text: z.string() });

const RESTATE_SYSTEM =
  "Compare a word problem with sentences a program wrote back from a world built for it. Say whether they mean the same: the same people and things, the same numbers, the same question, and every comparison in the same direction (who is compared with whom, which is the base). List each difference.";
const STATEMENTS_SYSTEM =
  "Split the problem text into its sentences, in order, so that they join back to the text exactly. Give each sentence its tokens (joining back to the sentence), the ids of the world elements it states, and whether it asks the question. Mark demonstratives, relation words, ratio notations, holder mentions, unit words and sentence patterns on their tokens.";
const MISREAD_SYSTEM =
  "Write what an elementary school child might say aloud when reading this problem in a wrong but common way (the base swapped, the direction turned, multiplying because of a fraction or the word for times, adding instead of comparing), and the ops a careful listener would make of each saying, on the given world. Say only what the child says; a reading given as a calculation is a state_procedure.";

/** The whole preparation of one problem (指示書 第6.6節 steps 1 to 5, 7 and 8). */
export async function buildProblem(deps: BuildDeps, input: BuildInput, options: BuildOptions = {}): Promise<BuildOutcome> {
  const opts: Required<BuildOptions> = {
    maxRejections: options.maxRejections ?? 3,
    misreadThreshold: options.misreadThreshold ?? 0.9,
    misreadCount: options.misreadCount ?? 20,
    minValidMisreads: options.minValidMisreads ?? 10,
    maxTurns: options.maxTurns ?? 12,
  };
  const log: BuildLogEntry[] = [];
  const reject = (reason: RejectReason, detail = reason): BuildOutcome => {
    log.push({ step: "reject", ok: false, detail });
    return { status: "rejected", reason, log };
  };

  const a = await buildOnce(deps, input, "build_a", log, opts);
  if (!("world" in a)) return reject(a.reason);
  const b = await buildOnce(deps, input, "build_b", log, opts);
  if (!("world" in b)) return reject(b.reason);
  const same = sameBuild(a.world, b.world);
  log.push({ step: "double_build", ok: same, detail: same ? "the two builds agree" : "the two builds differ" });
  if (!same) return reject("double_build_mismatch");
  const world = a.world;

  const restated = restate(world, input.lang).map((s) => s.text);
  const verdict = await judgeCall(deps, RESTATE_SYSTEM, `Problem text:\n${input.problemText}`, `Sentences written back from the world:\n${restated.join("\n")}`, restateVerdict);
  log.push({ step: "restate", ok: verdict?.same_meaning === true, detail: verdict === null ? "no valid verdict" : verdict.same_meaning ? restated.join(" ") : verdict.differences.join("; ") });
  if (verdict?.same_meaning !== true) return reject("restate_mismatch");

  const worldJson = JSON.stringify(world);
  const parts = await judgeCall(deps, STATEMENTS_SYSTEM, `World:\n${worldJson}`, `Problem text:\n${input.problemText}`, statementsReply, (s) => validateStatements(world, s.statements, s.syntax_marks).ok);
  log.push({ step: "statements", ok: parts !== null, detail: parts === null ? "no valid sentence list" : `${parts.statements.length} sentences, ${parts.syntax_marks.length} marks` });
  if (parts === null) return reject("statements_invalid");

  const solved = solve(world);
  const answer = solved.kind === "unique" ? solved.values.get(world.question.target_id) : undefined;
  const record: ProblemRecord = {
    ...provisionalRecord(world, input),
    expected_answer: answer === undefined ? null : { num: Number(answer.num), den: Number(answer.den) },
    statements: parts.statements,
    syntax_marks: parts.syntax_marks,
  };
  const conditions = problemConditions(record);
  log.push({ step: "conditions", ok: conditions.ok, detail: conditions.ok ? "met" : conditions.failures.map((f) => f.code).join("; ") });
  if (!conditions.ok) return reject("conditions_failed");

  const ops = problemScopedSchemas(world, record.statements).interpretation.shape.ops as unknown as z.ZodType<AnyOp[]>;
  // Asked with the scoped schema, but read item by item, so one bad item does not cost the others.
  const askReply = z.strictObject({ items: z.array(z.strictObject({ transcript: z.string(), expected_ops: ops })) });
  const looseReply = z.object({ items: z.array(z.object({ transcript: z.string(), expected_ops: z.array(z.unknown()) })) });
  const misreads = await judgeCall(deps, MISREAD_SYSTEM, `World:\n${worldJson}`, `Problem text:\n${input.problemText}\nWrite ${opts.misreadCount} sayings.`, looseReply, () => true, askReply);
  const valid = (misreads?.items ?? []).flatMap((m) => {
    const parsed = ops.safeParse(m.expected_ops);
    if (!parsed.success) return [];
    if (!validateOps(world, parsed.data).ok || apply({ correct: world, ops: parsed.data }).discarded.length > 0) return [];
    return [{ transcript: m.transcript, expected_ops: parsed.data }];
  });
  if (valid.length < opts.minValidMisreads) {
    log.push({ step: "misread", ok: false, detail: `${valid.length} usable sayings` });
    return reject("misread_items_invalid");
  }
  let matches = 0;
  for (const m of valid) {
    const got = await interpret({ record, transcript: m.transcript, fingerOps: [], wordCues: [], lang: input.lang }, deps.listen);
    if (got.status !== "ok") continue;
    const expected = apply({ correct: world, ops: m.expected_ops }).judgeWorld;
    const actual = apply({ correct: world, ops: got.interpretation.ops as AnyOp[] }).judgeWorld;
    if (sameWorld(expected, actual)) matches++;
  }
  const rate = matches / valid.length;
  log.push({ step: "misread", ok: rate >= opts.misreadThreshold, detail: `${matches}/${valid.length}` });
  if (rate < opts.misreadThreshold) return reject("misread_below_threshold");

  const adopted = schemas.problemRecord.parse({
    ...record,
    checks: { double_build_match: true, restate_match: true, misread_pass_rate: rate, human_checked: false },
  });
  log.push({ step: "adopt", ok: true, detail: input.problemId });
  return { status: "adopted", record: adopted, log };
}

const PAIR_SYSTEM =
  "Write a word problem for the same scene and the same kind of relation, in which the words and the calculation point the other way from the given problem (when the given problem's words suggest the operation it needs, the new one's words suggest the other one, and the reverse). Keep it at the same grade.";
const COMPANION_SYSTEM =
  "Write an everyday word problem with the same structure as the given one (the same kind of relations, the same question), set in the given scene with other numbers.";

/** The consistent/inconsistent pair of a prepared problem (指示書 第6.6節 step 6). */
export async function buildPair(deps: BuildDeps, record: ProblemRecord, options: BuildOptions = {}): Promise<{ outcome: BuildOutcome; original: ProblemRecord }> {
  // pair_id names the other problem of the pair (指示書 第5.1節).
  const pairId = record.pair_id ?? `${record.world.problem_id}-pair`;
  const original = { ...record, pair_id: pairId };
  const text = await judgeCall(deps, PAIR_SYSTEM, `World:\n${JSON.stringify(record.world)}`, `Problem text:\n${record.world.problem_text}`, problemTextReply);
  if (text === null) return { outcome: { status: "rejected", reason: "agent_failed", log: [{ step: "reject", ok: false, detail: "no pair text" }] }, original };
  const outcome = await buildProblem(
    deps,
    {
      problemId: pairId,
      problemText: text.problem_text,
      lang: record.world.problem_lang,
      grade: record.world.grade,
      consistency: record.consistency === "consistent" ? "inconsistent" : "consistent",
      source: record.source,
      pairId: record.world.problem_id,
    },
    options,
  );
  return { outcome: checkStructure(outcome, record.world), original };
}

/** An everyday world with the same structure in a scene from content/scenes (指示書 第6.6節 step 9). */
export async function buildCompanion(
  deps: BuildDeps,
  record: ProblemRecord,
  scene: { id: string; text: string },
  options: BuildOptions = {},
): Promise<{ outcome: BuildOutcome; original: ProblemRecord }> {
  const id = `${record.world.problem_id}-c-${scene.id}`;
  const text = await judgeCall(deps, COMPANION_SYSTEM, `World:\n${JSON.stringify(record.world)}`, `Problem text:\n${record.world.problem_text}\nScene:\n${scene.text}`, problemTextReply);
  if (text === null) return { outcome: { status: "rejected", reason: "agent_failed", log: [{ step: "reject", ok: false, detail: "no companion text" }] }, original: record };
  const outcome = checkStructure(
    await buildProblem(
      deps,
      { problemId: id, problemText: text.problem_text, lang: record.world.problem_lang, grade: record.world.grade, consistency: record.consistency, source: "companion", pairId: null },
      options,
    ),
    record.world,
  );
  const original = outcome.status === "adopted" ? { ...record, companion_ids: [...record.companion_ids, id] } : record;
  return { outcome, original };
}

function checkStructure(outcome: BuildOutcome, base: WorldScene): BuildOutcome {
  if (outcome.status !== "adopted") return outcome;
  if (sameStructure(base, outcome.record.world)) return outcome;
  const log: BuildLogEntry[] = [...outcome.log, { step: "reject", ok: false, detail: "structure_mismatch" }];
  return { status: "rejected", reason: "structure_mismatch", log };
}

/** The build record as markdown, for the README and the "look inside" view (指示書 第6.6節). */
export function formatBuildLog(problemId: string, log: readonly BuildLogEntry[]): string {
  const lines = [`### ${problemId}`, ""];
  for (const e of log) lines.push(`- ${e.ok ? "✓" : "✗"} ${e.step}${e.tool === undefined ? "" : ` / ${e.tool}`}: ${e.detail.replaceAll("\n", " ")}`);
  return `${lines.join("\n")}\n`;
}
