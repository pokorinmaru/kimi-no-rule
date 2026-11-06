// M2: the world-building agent (指示書 第6.6節; the M2 line of 第11節: the provisional problems built
// twice independently agree, and a world built the wrong way round is caught by the restated text).
// Only fake Claude is used here; every check runs the real core. Written before the implementation.
import { describe, expect, it } from "vitest";
import { problemConditions, restate, sameStructure, schemas, type AnyOp, type ProblemRecord, type WorldScene } from "@kimi/core";
import {
  BUILD_TOOLS,
  buildCompanion,
  buildPair,
  buildProblem,
  formatBuildLog,
  type BuildDeps,
  type BuildInput,
  type BuildLogEntry,
  type BuildOptions,
  type BuildOutcome,
} from "./build.ts";
import type { AgentClient, AgentStep, AgentTool } from "./agent.ts";
import { MODELS, type ClaudeClient, type ClaudeRequest, type ClaudeResponse } from "./client.ts";
import { fails, json, stopped, text, type FakeReply } from "./fake.ts";
import { interpretationOf, requestText } from "./test-support.ts";
import { PROVISIONAL } from "../../core/fixtures/problems/provisional.ts";
import { signboardProcedural } from "../../core/fixtures/problems/signboard.ts";
import { signboardRecord } from "../../core/fixtures/problems/signboard-record.ts";

// ---------------------------------------------------------------------------------------------
// Fixtures

const provisional = (id: string): ProblemRecord => {
  const p = PROVISIONAL.find((x) => x.record.world.problem_id === id);
  if (p === undefined) throw new Error("no provisional problem " + id);
  return structuredClone(p.record);
};

/** Every id of the world with a suffix, references included: what an independent build might write. */
function renamed(w: WorldScene, suffix = "zb"): WorldScene {
  const ids = new Set([...w.holders, ...w.item_kinds, ...w.quantities, ...w.relations, ...w.events].map((x) => x.id));
  const m = (id: string): string => (ids.has(id) ? id + suffix : id);
  const c = structuredClone(w);
  return {
    ...c,
    holders: c.holders.map((h) => ({ ...h, id: m(h.id) })),
    item_kinds: c.item_kinds.map((k) => ({ ...k, id: m(k.id) })),
    quantities: c.quantities.map((q) => ({ ...q, id: m(q.id), holder: m(q.holder), item_kind: m(q.item_kind), at_event: q.at_event === null ? null : m(q.at_event) })),
    relations: c.relations.map((r) => ({
      ...r,
      id: m(r.id),
      subject: m(r.subject),
      reference: r.reference === null ? null : m(r.reference),
      reference_list: r.reference_list === null ? null : r.reference_list.map(m),
    })),
    events: c.events.map((e) => ({ ...e, id: m(e.id), holder: m(e.holder), item_kind: m(e.item_kind), to_holder: e.to_holder === null ? null : m(e.to_holder) })),
    question: { ...c.question, target_id: m(c.question.target_id) },
    word_links: c.word_links.map((l) => ({ ...l, element_id: m(l.element_id) })),
  };
}

/** The relation of a world turned around: subject and reference swapped, the amount kept. */
function reversed(w: WorldScene, relationId: string): WorldScene {
  const c = structuredClone(w);
  c.relations = c.relations.map((r) => (r.id === relationId ? { ...r, subject: r.reference as string, reference: r.subject } : r));
  return c;
}

/** The signboard as an inverse relation: younger = 4/3 of older (same answer, written the other way). */
function signboardInverse(): WorldScene {
  const c = structuredClone(signboardRecord.world);
  c.relations = c.relations.map((r) => ({ ...r, subject: "q_otouto", reference: "q_ani", amount: { num: 4, den: 3 } }));
  return c;
}

/** The signboard world with the older brother's count taken away: it no longer has one answer. */
function signboardUnderdetermined(): WorldScene {
  const c = structuredClone(signboardRecord.world);
  c.quantities = c.quantities.map((q) => (q.id === "q_ani" ? { ...q, value: null } : q));
  return c;
}

/** A companion of p_fraction_c: the same structure in another scene with other numbers. Test-only text. */
function marblesRecord(): ProblemRecord {
  const base = provisional("p_fraction_c");
  const sentences = ["赤い箱のビー玉は12こです。", "青い箱のビー玉は、赤い箱のビー玉の3/4です。", "青い箱のビー玉は何こですか。"];
  const world: WorldScene = {
    ...base.world,
    problem_id: "p_fraction_c_marbles",
    problem_text: sentences.join(""),
    holders: [
      { id: "h_ane", label: "赤い箱" },
      { id: "h_imo", label: "青い箱" },
    ],
    item_kinds: [{ id: "k_ribbon", noun: "ビー玉", counter: "こ", asset_key: null, countable: true }],
    quantities: base.world.quantities.map((q) => (q.id === "q_ane" ? { ...q, value: { num: 12, den: 1 } } : q)),
  };
  return {
    ...base,
    world,
    pair_id: null,
    source: "companion",
    expected_answer: { num: 9, den: 1 },
    statements: base.statements.map((s, i) => ({ ...s, text: sentences[i] as string, tokens: [sentences[i] as string] })),
  };
}

const inputOf = (r: ProblemRecord): BuildInput => ({
  problemId: r.world.problem_id,
  problemText: r.world.problem_text,
  lang: r.world.problem_lang,
  grade: r.world.grade,
  consistency: r.consistency,
  source: r.source,
  pairId: r.pair_id,
});

// ---------------------------------------------------------------------------------------------
// Fake Claude for the three roles. Each one decides from the request it receives.

let callId = 0;
const call = (name: string, input: unknown): AgentStep => ({ stopReason: "tool_use", text: "", toolCalls: [{ id: "tc" + String(++callId), name, input }] });
const done = (t = "done"): AgentStep => ({ stopReason: "end_turn", text: t, toolCalls: [] });
// The world goes to every tool as JSON text (Q27: a world schema in each strict tool would pass the
// API's limit on union-typed parameters).
const asInput = (w: unknown): { world_json: string } => ({ world_json: JSON.stringify(w) });
const submit = (w: unknown): AgentStep => call("submit_world", asInput(w));

/** A build that looks at the world with every tool and then submits it. */
const fullBuild = (w: WorldScene): AgentStep[] => [
  call("solve", asInput(w)),
  call("diagnose_candidates", asInput(w)),
  call("restate", asInput(w)),
  submit(w),
  done(),
];

interface RecordedStep {
  model: string;
  system: string;
  messages: unknown[];
  toolNames: string[];
}

/**
 * The agent client: one script per runAgent call. A call to step with only the prompt in the messages
 * starts the next run; past the end of a script it ends the turn.
 */
class ScriptedAgent implements AgentClient {
  readonly runs: RecordedStep[][] = [];
  private at = 0;

  constructor(private readonly scripts: readonly AgentStep[][]) {}

  async step(req: { model: string; system: string; messages: unknown[]; tools: AgentTool[] }): Promise<AgentStep> {
    if (req.messages.length === 1) {
      this.runs.push([]);
      this.at = 0;
    }
    const run = this.runs[this.runs.length - 1] as RecordedStep[];
    run.push({ model: req.model, system: req.system, messages: structuredClone(req.messages), toolNames: req.tools.map((t) => t.name) });
    const script = this.scripts[this.runs.length - 1] ?? [];
    const reply = script[this.at] ?? done("script over");
    this.at++;
    return structuredClone(reply);
  }
}

interface ToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: unknown;
  is_error?: boolean;
}

/** Every tool_result block in the messages, in order. */
function toolResults(messages: unknown): ToolResult[] {
  const out: ToolResult[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    if (v === null || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (o["type"] === "tool_result") out.push(o as unknown as ToolResult);
    for (const x of Object.values(o)) walk(x);
  };
  walk(messages);
  return out;
}

/** The tool results a run got back, in order (taken from its last step, which carries them all). */
function resultsOf(run: readonly RecordedStep[] | undefined): ToolResult[] {
  const last = run?.[run.length - 1];
  return toolResults(last?.messages ?? []);
}

const contentText = (r: ToolResult | undefined): string => (typeof r?.content === "string" ? r.content : JSON.stringify(r?.content ?? null));

type JudgeKind = "restate" | "statements" | "misread" | "text";
type Handler = (req: ClaudeRequest, nth: number) => FakeReply;

/** Which judge call a request is, from the property names of the reply shape it asks for (design of step B). */
function kindOf(req: ClaudeRequest): JudgeKind {
  const s = JSON.stringify(req.schema);
  if (s.includes("same_meaning")) return "restate";
  if (s.includes("syntax_marks")) return "statements";
  if (s.includes("expected_ops")) return "misread";
  if (s.includes("problem_text")) return "text";
  throw new Error("a judge request of an unknown shape");
}

function answer(reply: FakeReply): ClaudeResponse {
  if (reply.kind === "throw") throw reply.error;
  return reply.response;
}

class RoutedJudge implements ClaudeClient {
  readonly requests: { kind: JudgeKind; req: ClaudeRequest }[] = [];

  constructor(private readonly handlers: Record<JudgeKind, Handler>) {}

  async complete(req: ClaudeRequest): Promise<ClaudeResponse> {
    const kind = kindOf(req);
    const nth = this.requests.filter((r) => r.kind === kind).length;
    this.requests.push({ kind, req });
    return answer(this.handlers[kind](req, nth));
  }

  of(kind: JudgeKind): ClaudeRequest[] {
    return this.requests.filter((r) => r.kind === kind).map((r) => r.req);
  }
}

/** A string as it appears inside JSON text. */
const inJson = (s: string): string => JSON.stringify(s).slice(1, -1);

const MARK = /zz-misread-\d\dz/g;
const MARK_ONE = /zz-misread-\d\dz/;
const transcriptOf = (i: number): string => "zz-misread-" + String(i).padStart(2, "0") + "z";

/** The misreading used for every item: the multiple turned around. */
function swapOps(w: WorldScene): AnyOp[] {
  const r = w.relations.find((x) => x.operator !== "total_of");
  if (r === undefined) throw new Error("no relation to turn around");
  return [{ op: "swap_relation_direction", target_id: r.id, evidence: "" }];
}

const BAD_OPS: AnyOp[] = [{ op: "swap_relation_direction", target_id: "r_nope", evidence: "" }];

function misreadItems(w: WorldScene, count = 20, invalid = 0): { transcript: string; expected_ops: AnyOp[] }[] {
  return Array.from({ length: count }, (_, i) => ({ transcript: transcriptOf(i), expected_ops: i < invalid ? BAD_OPS : swapOps(w) }));
}

/**
 * The judge that believes the given record is right: it calls the restated text the same meaning only
 * when every restated sentence of that world is in the request it gets, writes the statements of the
 * record, writes misreadings of it, and writes its text when asked for a problem text.
 */
function judgeFor(truth: ProblemRecord, over: Partial<Record<JudgeKind, Handler>> = {}): RoutedJudge {
  const sentences = restate(truth.world, truth.world.problem_lang).map((s) => s.text);
  return new RoutedJudge({
    restate: (req) => {
      const t = requestText(req);
      const same = sentences.every((s) => t.includes(inJson(s)));
      return json({ same_meaning: same, differences: same ? [] : ["zz-difference"] });
    },
    statements: () => json({ statements: truth.statements, syntax_marks: truth.syntax_marks }),
    misread: () => json({ items: misreadItems(truth.world) }),
    text: () => json({ problem_text: truth.world.problem_text }),
    ...over,
  });
}

/** The listening model: hears each misreading as it was meant, except the transcripts in misses. */
class Listener implements ClaudeClient {
  readonly requests: ClaudeRequest[] = [];

  constructor(
    private readonly world: WorldScene,
    private readonly misses: ReadonlySet<string> = new Set(),
  ) {}

  async complete(req: ClaudeRequest): Promise<ClaudeResponse> {
    this.requests.push(req);
    const heard = requestText(req).match(MARK)?.[0] ?? "";
    const ops = this.misses.has(heard) ? [] : swapOps(this.world);
    return { stopReason: "end_turn", text: JSON.stringify(interpretationOf(ops)) };
  }
}

interface Setup {
  deps: BuildDeps;
  agent: ScriptedAgent;
  judge: RoutedJudge;
  listen: Listener;
}

interface SetupOptions {
  a?: AgentStep[];
  b?: AgentStep[];
  judge?: Partial<Record<JudgeKind, Handler>>;
  misses?: number[];
  built?: WorldScene;
}

function setup(truth: ProblemRecord, o: SetupOptions = {}): Setup {
  const built = o.built ?? truth.world;
  const agent = new ScriptedAgent([o.a ?? fullBuild(built), o.b ?? fullBuild(renamed(built))]);
  const judge = judgeFor(truth, o.judge);
  const listen = new Listener(built, new Set((o.misses ?? []).map(transcriptOf)));
  return { deps: { agent, judge, listen }, agent, judge, listen };
}

function adopted(o: BuildOutcome): ProblemRecord {
  if (o.status !== "adopted") throw new Error("not adopted: " + o.reason + " / " + JSON.stringify(o.log));
  return o.record;
}

const reasonOf = (o: BuildOutcome): string => (o.status === "rejected" ? o.reason : "adopted");

const ORDER = ["build_a", "build_b", "double_build", "restate", "statements", "conditions", "misread", "adopt"] as const;

// ---------------------------------------------------------------------------------------------
// The happy path

describe("buildProblem: every provisional problem built twice with different ids is adopted", () => {
  it.each(PROVISIONAL.map((p) => [p.record.world.problem_id, p.record] as const))("%s", async (_id, fixture) => {
    const truth = structuredClone(fixture);
    const s = setup(truth);
    const record = adopted(await buildProblem(s.deps, inputOf(truth)));
    expect(() => schemas.problemRecord.parse(record)).not.toThrow();
    expect(record.expected_answer).toEqual(fixture.expected_answer);
    expect(record.checks).toEqual({ double_build_match: true, restate_match: true, misread_pass_rate: 1, human_checked: false });
    expect(record.consistency).toBe(fixture.consistency);
    expect(record.pair_id).toBe(fixture.pair_id);
    expect(record.source).toBe(fixture.source);
    expect(record.companion_ids).toEqual([]);
    // World A is kept as it was written; the statements and marks are the ones the judge wrote for it.
    expect(record.world).toEqual(fixture.world);
    expect(record.statements).toEqual(fixture.statements);
    expect(record.syntax_marks).toEqual(fixture.syntax_marks);
    expect(problemConditions(record)).toEqual({ ok: true, failures: [] });
    // The two builds really were two agent runs.
    expect(s.agent.runs).toHaveLength(2);
  });
});

describe("buildProblem: what the agent is given and what it gets back", () => {
  it("offers the four tools on every step, with the build model", async () => {
    expect(BUILD_TOOLS).toEqual(["solve", "diagnose_candidates", "restate", "submit_world"]);
    const s = setup(structuredClone(signboardRecord));
    adopted(await buildProblem(s.deps, inputOf(signboardRecord)));
    for (const run of s.agent.runs) {
      for (const step of run) {
        expect(step.model).toBe(MODELS.build);
        expect(step.toolNames).toEqual([...BUILD_TOOLS]);
      }
    }
    for (const r of s.judge.requests) expect(r.req.model).toBe(MODELS.build);
    expect(s.listen.requests.length).toBeGreaterThan(0);
    for (const r of s.listen.requests) expect(r.model).toBe(MODELS.listen);
  });

  it("both runs start from the problem text, and the second run never sees the first world", async () => {
    const truth = structuredClone(signboardRecord);
    const a = structuredClone(truth.world);
    a.word_links.push({ phrase: "zz-world-a-marker", lang: "ja", element_id: "h_ani" });
    const s = setup(truth, { a: fullBuild(a) });
    await buildProblem(s.deps, inputOf(truth));
    expect(s.agent.runs).toHaveLength(2);
    for (const run of s.agent.runs) expect(JSON.stringify(run[0]?.messages)).toContain(inJson(truth.world.problem_text));
    for (const step of s.agent.runs[1] ?? []) {
      expect(JSON.stringify(step.messages)).not.toContain("zz-world-a-marker");
      expect(step.system).not.toContain("zz-world-a-marker");
    }
  });

  it("the tools run core and answer in plain JSON: solve gives the kind and the values as num/den", async () => {
    const s = setup(structuredClone(signboardRecord));
    await buildProblem(s.deps, inputOf(signboardRecord));
    const [solved, candidates, restated, submitted] = resultsOf(s.agent.runs[0]);
    expect(solved?.is_error ?? false).toBe(false);
    expect(contentText(solved)).toContain("unique");
    expect(contentText(solved)).toContain("8/1");
    expect(candidates?.is_error ?? false).toBe(false);
    expect(restated?.is_error ?? false).toBe(false);
    expect(contentText(restated)).toContain(inJson("兄の金魚は、弟の金魚の3/4。"));
    expect(submitted?.is_error ?? false).toBe(false);
    expect(contentText(submitted)).toContain("accepted");
  });

  it("the problem id, text, grade and language of the input win over what the agent wrote", async () => {
    const truth = structuredClone(signboardRecord);
    const off = { ...structuredClone(truth.world), problem_id: "zz-other-id", problem_text: "zz-other-text", grade: 1, problem_lang: "en" as const };
    const s = setup(truth, { a: fullBuild(off), b: fullBuild(renamed(off)) });
    const record = adopted(await buildProblem(s.deps, inputOf(truth)));
    expect(record.world.problem_id).toBe(truth.world.problem_id);
    expect(record.world.problem_text).toBe(truth.world.problem_text);
    expect(record.world.grade).toBe(truth.world.grade);
    expect(record.world.problem_lang).toBe(truth.world.problem_lang);
  });

  it("the log goes through the steps in order, one entry or more each, and names the tools called", async () => {
    const s = setup(structuredClone(signboardRecord));
    const outcome = await buildProblem(s.deps, inputOf(signboardRecord));
    adopted(outcome);
    const steps = outcome.log.map((e) => e.step);
    for (const step of ORDER) expect(steps).toContain(step);
    const ranks = steps.filter((x) => (ORDER as readonly string[]).includes(x)).map((x) => (ORDER as readonly string[]).indexOf(x));
    expect(ranks).toEqual([...ranks].sort((p, q) => p - q));
    const tools = new Set(outcome.log.map((e) => e.tool).filter((t) => t !== undefined));
    for (const t of BUILD_TOOLS) expect(tools.has(t)).toBe(true);
  });

  it("does not change the input or the options", async () => {
    const input = inputOf(signboardRecord);
    const opts: BuildOptions = { maxRejections: 3 };
    const before = structuredClone({ input, opts });
    const s = setup(structuredClone(signboardRecord));
    await buildProblem(s.deps, input, opts);
    expect({ input, opts }).toEqual(before);
  });
});

// ---------------------------------------------------------------------------------------------
// Building: the agent fixes what the conditions send back, within a limit

const submitEntries = (log: readonly BuildLogEntry[]): BuildLogEntry[] => log.filter((e) => e.tool === "submit_world");

describe("buildProblem: submit_world checks the world with core", () => {
  it("a world with no single answer is sent back with the reason; the fixed world is adopted", async () => {
    const truth = structuredClone(signboardRecord);
    const s = setup(truth, { a: [submit(signboardUnderdetermined()), submit(truth.world), done()] });
    const outcome = await buildProblem(s.deps, inputOf(truth));
    adopted(outcome);
    const [first, second] = resultsOf(s.agent.runs[0]);
    expect(first?.is_error).toBe(true);
    expect(contentText(first)).toContain("not_unique");
    expect(second?.is_error ?? false).toBe(false);
    // The log shows the rejection, what it said, and the accepted world after it.
    const entries = submitEntries(outcome.log);
    const rejected = entries.findIndex((e) => !e.ok);
    const accepted = entries.findIndex((e) => e.ok);
    expect(rejected).toBeGreaterThanOrEqual(0);
    expect(entries[rejected]?.detail).toContain("not_unique");
    expect(accepted).toBeGreaterThan(rejected);
  });

  it("a submit that is not a world at all is sent back as an error", async () => {
    const truth = structuredClone(signboardRecord);
    const s = setup(truth, { a: [submit({ schema_version: "3" }), submit(truth.world), done()] });
    adopted(await buildProblem(s.deps, inputOf(truth)));
    expect(resultsOf(s.agent.runs[0])[0]?.is_error).toBe(true);
  });

  it("a world with dangling references is sent back as an error", async () => {
    const truth = structuredClone(signboardRecord);
    const broken = structuredClone(truth.world);
    broken.question = { target_type: "quantity", target_id: "q_nope" };
    const s = setup(truth, { a: [submit(broken), submit(truth.world), done()] });
    adopted(await buildProblem(s.deps, inputOf(truth)));
    expect(resultsOf(s.agent.runs[0])[0]?.is_error).toBe(true);
  });

  it("two rejections and then a good world: adopted", async () => {
    const truth = structuredClone(signboardRecord);
    const bad = signboardUnderdetermined();
    const s = setup(truth, { a: [submit(bad), submit(bad), submit(truth.world), done()] });
    adopted(await buildProblem(s.deps, inputOf(truth)));
  });

  it("after three rejections every later submit is refused and the build fails", async () => {
    const truth = structuredClone(signboardRecord);
    const bad = signboardUnderdetermined();
    const s = setup(truth, { a: [submit(bad), submit(bad), submit(bad), submit(truth.world), done()] });
    const outcome = await buildProblem(s.deps, inputOf(truth));
    expect(reasonOf(outcome)).toBe("too_many_rejections");
    const results = resultsOf(s.agent.runs[0]);
    expect(results).toHaveLength(4);
    for (const r of results) expect(r.is_error).toBe(true);
    expect(outcome.log.some((e) => e.step === "adopt")).toBe(false);
  });

  it("the limit can be set: with maxRejections 1, one rejection ends the build", async () => {
    const truth = structuredClone(signboardRecord);
    const s = setup(truth, { a: [submit(signboardUnderdetermined()), submit(truth.world), done()] });
    expect(reasonOf(await buildProblem(s.deps, inputOf(truth), { maxRejections: 1 }))).toBe("too_many_rejections");
  });

  it("an agent that never submits fails the build", async () => {
    const truth = structuredClone(signboardRecord);
    const s = setup(truth, { a: [call("solve", asInput(truth.world)), done("no world")] });
    const outcome = await buildProblem(s.deps, inputOf(truth));
    expect(reasonOf(outcome)).toBe("agent_failed");
    expect(s.judge.requests).toHaveLength(0);
  });

  it("an agent that refuses fails the build", async () => {
    const truth = structuredClone(signboardRecord);
    const refusal: AgentStep = { stopReason: "refusal", text: "", toolCalls: [] };
    const s = setup(truth, { a: [refusal] });
    expect(reasonOf(await buildProblem(s.deps, inputOf(truth)))).toBe("agent_failed");
  });

  it("a second build that never submits fails the build too", async () => {
    const truth = structuredClone(signboardRecord);
    const s = setup(truth, { b: [done("no world")] });
    expect(reasonOf(await buildProblem(s.deps, inputOf(truth)))).toBe("agent_failed");
  });
});

describe("buildProblem: two independent builds", () => {
  it("a second build that writes the inverse relation does not match, and nothing goes to the judge", async () => {
    const truth = structuredClone(signboardRecord);
    const s = setup(truth, { b: fullBuild(renamed(signboardInverse())) });
    const outcome = await buildProblem(s.deps, inputOf(truth));
    expect(reasonOf(outcome)).toBe("double_build_mismatch");
    expect(outcome.log.some((e) => e.step === "double_build" && !e.ok)).toBe(true);
    expect(outcome.log.some((e) => e.step === "restate")).toBe(false);
    expect(s.judge.of("restate")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------
// The restated text against the problem text

describe("buildProblem: a world built the wrong way round is caught by the restated text", () => {
  const truth = (): ProblemRecord => provisional("p_percent_c");
  const relationId = "r_p";
  const backwards = (): WorldScene => reversed(truth().world, relationId);

  it("the reversed world meets every condition of a problem, so only the restated text can catch it", () => {
    const r = truth();
    r.world = backwards();
    expect(problemConditions(r)).toEqual({ ok: true, failures: [] });
    const right = restate(truth().world, "ja").map((x) => x.text);
    const wrong = restate(backwards(), "ja").map((x) => x.text);
    expect(wrong).not.toEqual(right);
  });

  it("built the wrong way round twice: the builds agree, and the judge, reading the restated text, says no", async () => {
    const s = setup(truth(), { built: backwards() });
    const outcome = await buildProblem(s.deps, inputOf(truth()));
    expect(reasonOf(outcome)).toBe("restate_mismatch");
    expect(outcome.log.some((e) => e.step === "double_build" && e.ok)).toBe(true);
    expect(outcome.log.some((e) => e.step === "restate" && !e.ok)).toBe(true);
    // What the judge got: the restated sentences of the built world, and the problem text.
    const asked = s.judge.of("restate").map(requestText).join("\n");
    for (const sentence of restate(backwards(), "ja")) expect(asked).toContain(inJson(sentence.text));
    expect(asked).toContain(inJson(truth().world.problem_text));
    expect(s.judge.of("statements")).toHaveLength(0);
  });

  it("built the right way round: the same judge says yes", async () => {
    const s = setup(truth());
    adopted(await buildProblem(s.deps, inputOf(truth())));
    const asked = s.judge.of("restate").map(requestText).join("\n");
    for (const sentence of restate(truth().world, "ja")) expect(asked).toContain(inJson(sentence.text));
  });

  it("the signboard turned around has no whole answer, so submit_world already sends it back", async () => {
    const truthSign = structuredClone(signboardRecord);
    const s = setup(truthSign, { a: [submit(signboardProcedural), done()] });
    const outcome = await buildProblem(s.deps, inputOf(truthSign));
    expect(outcome.status).toBe("rejected");
    expect(resultsOf(s.agent.runs[0])[0]?.is_error).toBe(true);
    expect(contentText(resultsOf(s.agent.runs[0])[0])).toContain("impossible");
    expect(s.judge.requests).toHaveLength(0);
  });
});

describe("buildProblem: the restate judge", () => {
  const truth = (): ProblemRecord => structuredClone(signboardRecord);

  it("a refusal twice ends in restate_mismatch, after exactly one retry", async () => {
    const s = setup(truth(), { judge: { restate: () => stopped("refusal") } });
    expect(reasonOf(await buildProblem(s.deps, inputOf(truth())))).toBe("restate_mismatch");
    expect(s.judge.of("restate")).toHaveLength(2);
  });

  it("a failing call twice ends in restate_mismatch", async () => {
    const s = setup(truth(), { judge: { restate: () => fails("zz-judge-down") } });
    expect(reasonOf(await buildProblem(s.deps, inputOf(truth())))).toBe("restate_mismatch");
    expect(s.judge.of("restate")).toHaveLength(2);
  });

  it("one refusal and then a yes is adopted", async () => {
    const s = setup(truth(), {
      judge: { restate: (req, nth) => (nth === 0 ? stopped("refusal") : json({ same_meaning: true, differences: [] })) },
    });
    adopted(await buildProblem(s.deps, inputOf(truth())));
  });

  it("one reply that is not JSON and then a yes is adopted", async () => {
    const s = setup(truth(), {
      judge: { restate: (_req, nth) => (nth === 0 ? text("zz-not-json") : json({ same_meaning: true, differences: [] })) },
    });
    adopted(await buildProblem(s.deps, inputOf(truth())));
  });

  it("a reply of the wrong shape twice ends in restate_mismatch", async () => {
    const s = setup(truth(), { judge: { restate: () => json({ same: true }) } });
    expect(reasonOf(await buildProblem(s.deps, inputOf(truth())))).toBe("restate_mismatch");
  });
});

describe("buildProblem: statements and syntax marks", () => {
  const truth = (): ProblemRecord => structuredClone(signboardRecord);
  const broken = (): FakeReply => {
    const r = truth();
    r.statements = r.statements.map((x, i) => (i === 0 ? { ...x, tokens: x.tokens.slice(0, -1) } : x));
    return json({ statements: r.statements, syntax_marks: r.syntax_marks });
  };

  it("statements that do not check twice end in statements_invalid, after exactly one retry", async () => {
    const s = setup(truth(), { judge: { statements: () => broken() } });
    const outcome = await buildProblem(s.deps, inputOf(truth()));
    expect(reasonOf(outcome)).toBe("statements_invalid");
    expect(s.judge.of("statements")).toHaveLength(2);
    expect(outcome.log.some((e) => e.step === "statements" && !e.ok)).toBe(true);
  });

  it("statements naming an element the world does not have are not used", async () => {
    const r = truth();
    r.statements = r.statements.map((x, i) => (i === 0 ? { ...x, element_ids: [...x.element_ids, "q_nope"] } : x));
    const s = setup(truth(), { judge: { statements: () => json({ statements: r.statements, syntax_marks: r.syntax_marks }) } });
    expect(reasonOf(await buildProblem(s.deps, inputOf(truth())))).toBe("statements_invalid");
  });

  it("one bad reply and then good statements is adopted", async () => {
    const good = truth();
    const s = setup(truth(), {
      judge: { statements: (_req, nth) => (nth === 0 ? broken() : json({ statements: good.statements, syntax_marks: good.syntax_marks })) },
    });
    adopted(await buildProblem(s.deps, inputOf(truth())));
  });
});

// ---------------------------------------------------------------------------------------------
// The misreading check

describe("buildProblem: misreadings heard by the listening model", () => {
  const truth = (): ProblemRecord => structuredClone(signboardRecord);

  it("18 of 20 heard as meant: adopted with a pass rate of 0.9", async () => {
    const s = setup(truth(), { misses: [3, 11] });
    const record = adopted(await buildProblem(s.deps, inputOf(truth())));
    expect(record.checks.misread_pass_rate).toBeCloseTo(0.9, 10);
    expect(s.listen.requests.length).toBeGreaterThanOrEqual(20);
  });

  it("17 of 20: misread_below_threshold", async () => {
    const s = setup(truth(), { misses: [0, 9, 19] });
    const outcome = await buildProblem(s.deps, inputOf(truth()));
    expect(reasonOf(outcome)).toBe("misread_below_threshold");
    expect(outcome.log.some((e) => e.step === "misread" && !e.ok)).toBe(true);
  });

  it("the threshold can be set: 18 of 20 is below 0.95", async () => {
    const s = setup(truth(), { misses: [3, 11] });
    expect(reasonOf(await buildProblem(s.deps, inputOf(truth()), { misreadThreshold: 0.95 }))).toBe("misread_below_threshold");
  });

  it("items whose expected ops do not fit the world are dropped and not heard; the rate counts the rest", async () => {
    const w = truth().world;
    const s = setup(truth(), { judge: { misread: () => json({ items: misreadItems(w, 20, 2) }) } });
    const record = adopted(await buildProblem(s.deps, inputOf(truth())));
    expect(record.checks.misread_pass_rate).toBe(1);
    const heard = s.listen.requests.map(requestText).join("\n");
    expect(heard).not.toContain(transcriptOf(0));
    expect(heard).not.toContain(transcriptOf(1));
    expect(heard).toContain(transcriptOf(2));
  });

  it("with fewer than 10 usable items: misread_items_invalid", async () => {
    const w = truth().world;
    const s = setup(truth(), { judge: { misread: () => json({ items: misreadItems(w, 20, 11) }) } });
    expect(reasonOf(await buildProblem(s.deps, inputOf(truth())))).toBe("misread_items_invalid");
  });

  it("the transcripts go only to the listening model, and stay out of the record", async () => {
    const s = setup(truth());
    const outcome = await buildProblem(s.deps, inputOf(truth()));
    const record = adopted(outcome);
    for (const r of s.judge.requests) expect(requestText(r.req)).not.toMatch(MARK_ONE);
    for (const run of s.agent.runs) for (const step of run) expect(JSON.stringify(step)).not.toMatch(MARK_ONE);
    for (const r of s.listen.requests) expect(requestText(r).match(MARK)?.length).toBe(1);
    expect(JSON.stringify(record)).not.toMatch(MARK_ONE);
  });
});

// ---------------------------------------------------------------------------------------------
// Pairs and companions

describe("buildPair", () => {
  it("builds the pair with the other consistency, and the two point at each other", async () => {
    const original = provisional("p_percent_c");
    const pairTruth = provisional("p_percent_i");
    const s = setup(pairTruth);
    const before = structuredClone(original);
    const res = await buildPair(s.deps, original);
    const pair = adopted(res.outcome);
    expect(pair.consistency).toBe("inconsistent");
    expect(pair.world.problem_text).toBe(pairTruth.world.problem_text);
    expect(pair.world.problem_id).toBe("p_percent_i");
    expect(pair.pair_id).toBe("p_percent_c");
    expect(res.original.pair_id).toBe("p_percent_i");
    expect(res.original.consistency).toBe("consistent");
    expect(sameStructure(original.world, pair.world)).toBe(true);
    // The judge wrote the pair from the original problem.
    expect(s.judge.of("text").map(requestText).join("\n")).toContain(inJson(original.world.problem_text));
    expect(original).toEqual(before);
  });

  it("a problem without a pair id gets one made from its problem id", async () => {
    const original = structuredClone(signboardRecord);
    const pairTruth = provisional("p_fraction_c");
    const s = setup(pairTruth);
    const res = await buildPair(s.deps, original);
    const pair = adopted(res.outcome);
    expect(pair.consistency).toBe("consistent");
    expect(pair.world.problem_id).toBe("p_signboard-pair");
    expect(pair.pair_id).toBe("p_signboard");
    expect(res.original.pair_id).toBe("p_signboard-pair");
  });

  it("a pair of another structure is rejected", async () => {
    const original = provisional("p_percent_c");
    const s = setup(provisional("p_rate_i"));
    const res = await buildPair(s.deps, original);
    expect(reasonOf(res.outcome)).toBe("structure_mismatch");
  });
});

describe("buildCompanion", () => {
  const scene = { id: "scene_marbles", text: "zz-scene-marbles" };

  it("builds a companion in the scene and links it from the original", async () => {
    const original = provisional("p_fraction_c");
    const companionTruth = marblesRecord();
    const s = setup(companionTruth);
    const before = structuredClone(original);
    const res = await buildCompanion(s.deps, original, scene);
    const companion = adopted(res.outcome);
    expect(companion.source).toBe("companion");
    expect(companion.world.problem_text).toBe(companionTruth.world.problem_text);
    expect(companion.world.problem_id).not.toBe(original.world.problem_id);
    expect(res.original.companion_ids).toEqual([...original.companion_ids, companion.world.problem_id]);
    expect(sameStructure(original.world, companion.world)).toBe(true);
    expect(s.judge.of("text").map(requestText).join("\n")).toContain("zz-scene-marbles");
    expect(original).toEqual(before);
  });

  it("a companion of another structure is rejected and not linked", async () => {
    const original = provisional("p_fraction_c");
    const s = setup(provisional("p_ratio_c"));
    const res = await buildCompanion(s.deps, original, scene);
    expect(reasonOf(res.outcome)).toBe("structure_mismatch");
    expect(res.original.companion_ids).toEqual(original.companion_ids);
  });
});

// ---------------------------------------------------------------------------------------------
// The build log as text

describe("formatBuildLog", () => {
  const log: BuildLogEntry[] = [
    { step: "build_a", tool: "solve", ok: true, detail: "zz-unique" },
    { step: "build_a", tool: "submit_world", ok: false, detail: "zz-not-unique" },
    { step: "build_a", tool: "submit_world", ok: true, detail: "zz-accepted" },
    { step: "adopt", ok: true, detail: "zz-adopted" },
  ];

  it("is a markdown list with one item per entry, naming the problem, the steps, the tools and the details", () => {
    const md = formatBuildLog("p_zz_problem", log);
    expect(md).toContain("p_zz_problem");
    const items = md.split("\n").filter((l) => l.startsWith("- "));
    expect(items).toHaveLength(log.length);
    log.forEach((e, i) => {
      const line = items[i] as string;
      expect(line).toContain(e.step);
      expect(line).toContain(e.detail);
      if (e.tool !== undefined) expect(line).toContain(e.tool);
    });
    // A rejected entry reads differently from an accepted one with the same step and tool.
    expect((items[1] as string).replace("zz-not-unique", "")).not.toBe((items[2] as string).replace("zz-accepted", ""));
  });

  it("is deterministic and does not change the log", () => {
    const before = structuredClone(log);
    expect(formatBuildLog("p_zz_problem", log)).toBe(formatBuildLog("p_zz_problem", log));
    expect(log).toEqual(before);
  });

  it("writes a real build log, one item per entry", async () => {
    const s = setup(structuredClone(signboardRecord), { a: [submit(signboardUnderdetermined()), submit(signboardRecord.world), done()] });
    const outcome = await buildProblem(s.deps, inputOf(signboardRecord));
    const md = formatBuildLog("p_signboard", outcome.log);
    expect(md.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(outcome.log.length);
    expect(md).toContain("submit_world");
  });
});

describe("review fixes (Q27)", () => {
  const union = (x: unknown): number => {
    if (Array.isArray(x)) return x.reduce((n: number, v) => n + union(v), 0);
    if (x === null || typeof x !== "object") return 0;
    const o = x as Record<string, unknown>;
    const here = ("anyOf" in o || "oneOf" in o || Array.isArray(o["type"])) ? 1 : 0;
    return here + Object.values(o).reduce((n: number, v) => n + union(v), 0);
  };

  it("the four tools together stay far under the API's limit of 16 union-typed parameters", async () => {
    const { toStructuredSchema } = await import("./client.ts");
    const { buildToolSchemas } = await import("./build.ts");
    const total = buildToolSchemas().reduce((n, s) => n + union(toStructuredSchema(s)), 0);
    expect(total).toBe(0);
  });

  it("a later passing submit replaces the world it gave before (the agent was told it is accepted)", async () => {
    const truth = provisional("p_percent_c");
    const wrong = reversed(truth.world, "r_p");
    const s = setup(truth, { a: [submit(wrong), submit(truth.world), done()] });
    const r = adopted(await buildProblem(s.deps, inputOf(truth)));
    expect(r.world.relations).toEqual(truth.world.relations);
  });

  it("a verdict of the same meaning that still lists a difference is not taken as the same", async () => {
    const truth = provisional("p_percent_c");
    const s = setup(truth, { judge: { restate: () => json({ same_meaning: true, differences: ["the base is swapped"] }) } });
    expect(reasonOf(await buildProblem(s.deps, inputOf(truth)))).toBe("restate_mismatch");
  });
});
