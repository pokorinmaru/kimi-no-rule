// M3: the reading-research agent, step 1 (指示書 第6.7節 入力・言葉の手がかり・道具・手順1; 第11節 M1b and M3).
// Only fake Claude is used; every tool answer and every pool change comes from the real core.
// Written from the design, before reading the draft's choices into expectations.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  COMMON_FRACTION_READINGS,
  FRACTION_BANK,
  POOL_MAX,
  initialState,
  observe,
  runRule,
  type FirstReading,
  type Hypothesis,
  type ProblemRecord,
  type ResearchState,
} from "@kimi/core";
import { RESEARCH_TOOLS, researchToolSchemas, writeHypotheses, type ResearchInput, type ResearchReading } from "./research.ts";
import type { AgentClient, AgentStep } from "./agent.ts";
import { MODELS, toStructuredSchema } from "./client.ts";
import { FakeAgent } from "./fake.ts";

// ---------------------------------------------------------------------------------------------
// Fixtures

const reading = (id: string): Hypothesis => {
  const h = COMMON_FRACTION_READINGS.find((x) => x.id === id);
  if (h === undefined) throw new Error("no common reading " + id);
  return structuredClone(h) as Hypothesis;
};

const bankProblem = (id: string): ProblemRecord => {
  const p = FRACTION_BANK.find((r) => r.world.problem_id === id);
  if (p === undefined) throw new Error("no bank problem " + id);
  return structuredClone(p);
};

const SIGNBOARD = "p_signboard";
const otherBankId = (): string => {
  const p = FRACTION_BANK.find((r) => r.world.problem_id !== SIGNBOARD);
  if (p === undefined) throw new Error("the bank has one problem only");
  return p.world.problem_id;
};

/** Test-only markers standing in for what was said in this session. Not real words of any child. */
const WORDS_A = ["zz-child-word-alpha", "zz-child-tap-beta"];
const WORDS_B = ["zz-child-word-gamma"];

/** A first reading of a bank problem, as if read with the given rule. */
function firstReading(problemId: string, rule: string): FirstReading {
  const record = bankProblem(problemId);
  return { record, childWorld: runRule(reading(rule), record), referencePlaced: true, afterFix: false, wordbookOpenedBefore: false };
}

/** The input after the given readings, on a pool that is still empty. */
function inputOf(readings: { problemId: string; rule: string; words: string[] }[]): ResearchInput {
  let state: ResearchState = initialState();
  const out: ResearchReading[] = [];
  for (const r of readings) {
    const fr = firstReading(r.problemId, r.rule);
    state = observe(state, fr);
    out.push({ ...fr, words: [...r.words] });
  }
  return { state, readings: out, bank: FRACTION_BANK.map((p) => structuredClone(p)) };
}

const oneReading = (): ResearchInput => inputOf([{ problemId: SIGNBOARD, rule: "c_known_whole", words: WORDS_A }]);
const twoReadings = (): ResearchInput =>
  inputOf([
    { problemId: SIGNBOARD, rule: "c_known_whole", words: WORDS_A },
    { problemId: otherBankId(), rule: "c_known_whole", words: WORDS_B },
  ]);

// ---------------------------------------------------------------------------------------------
// Scripting the fake agent

let callId = 0;
const call = (name: string, input: unknown): AgentStep => ({ stopReason: "tool_use", text: "", toolCalls: [{ id: "rc" + String(++callId), name, input }] });
const done = (t = "done"): AgentStep => ({ stopReason: "end_turn", text: t, toolCalls: [] });

const ruleJson = (h: unknown): string => JSON.stringify(h);
const runRuleCall = (h: unknown, problemId: string): AgentStep => call("run_rule", { rule_json: ruleJson(h), problem_id: problemId });
const scoreCall = (h: unknown): AgentStep => call("score_rule", { rule_json: ruleJson(h) });
const predictCall = (hs: unknown[], problemId: string): AgentStep => call("predict", { rules_json: JSON.stringify(hs), problem_id: problemId });
const gainCall = (hs: unknown[], weights: Record<string, number>, problemId: string): AgentStep =>
  call("info_gain", { rules_json: JSON.stringify(hs), weights_json: JSON.stringify(weights), problem_id: problemId });

type Edit = { kind: "add" | "modify"; hypothesis: unknown } | { kind: "delete"; id: string };
const submitRaw = (body: unknown): AgentStep => call("submit_pool", { submission_json: JSON.stringify(body) });
const submit = (edits: Edit[], cueKinds: string[] = ["none"]): AgentStep => submitRaw({ edits, cue_kinds: cueKinds });
const adds = (...ids: string[]): Edit[] => ids.map((id) => ({ kind: "add" as const, hypothesis: reading(id) }));

interface ToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: unknown;
  is_error?: boolean;
}

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

/** The tool results the run got back, in order (the last recorded step carries them all). */
const resultsOf = (agent: FakeAgent): ToolResult[] => toolResults(agent.steps[agent.steps.length - 1]?.messages ?? []);
const contentText = (r: ToolResult | undefined): string => (typeof r?.content === "string" ? r.content : JSON.stringify(r?.content ?? null));
const isError = (r: ToolResult | undefined): boolean => r?.is_error === true;
const inJson = (s: string): string => JSON.stringify(s).slice(1, -1);

/** A number in a tool answer: the answer itself, or the one number field of an object. */
function numberIn(r: ToolResult | undefined): number {
  const v: unknown = JSON.parse(contentText(r));
  if (typeof v === "number") return v;
  const nums = Object.values(v as Record<string, unknown>).filter((x): x is number => typeof x === "number");
  if (nums.length !== 1) throw new Error("expected one number in " + contentText(r));
  return nums[0] as number;
}

/** How many a field counts: a number as it is, a list by its length. */
const countOf = (v: unknown): number => (Array.isArray(v) ? v.length : (v as number));

type Outcome = Awaited<ReturnType<typeof writeHypotheses>>;
function submitted(o: Outcome): Extract<Outcome, { kind: "submitted" }> {
  if (o.kind !== "submitted") throw new Error("not submitted: " + o.kind);
  return o;
}
const poolIds = (o: Outcome): string[] => submitted(o).revision.state.pool.map((e) => e.hypothesis.id);

// ---------------------------------------------------------------------------------------------
// What the agent is given

describe("writeHypotheses: the tools and the model", () => {
  it("offers exactly the five research tools on every step, with the build model by default", async () => {
    expect([...RESEARCH_TOOLS]).toEqual(["run_rule", "score_rule", "predict", "info_gain", "submit_pool"]);
    const agent = new FakeAgent([scoreCall(reading("c_known_whole")), submit(adds("c_correct", "c_known_whole")), done()]);
    await writeHypotheses(agent, oneReading());
    expect(agent.steps.length).toBeGreaterThanOrEqual(3);
    for (const step of agent.steps) {
      expect(step.model).toBe(MODELS.build);
      expect(step.toolNames).toEqual([...RESEARCH_TOOLS]);
    }
  });

  it("the model can be set by the options", async () => {
    const agent = new FakeAgent([done()]);
    await writeHypotheses(agent, oneReading(), { model: "zz-model" });
    for (const step of agent.steps) expect(step.model).toBe("zz-model");
  });

  it("every tool takes only string parameters, so no union-typed parameter reaches the API (Q27)", () => {
    const schemas = researchToolSchemas();
    expect(schemas).toHaveLength(RESEARCH_TOOLS.length);
    const unions = (x: unknown): number => {
      if (Array.isArray(x)) return x.reduce((n: number, v) => n + unions(v), 0);
      if (x === null || typeof x !== "object") return 0;
      const o = x as Record<string, unknown>;
      const here = "anyOf" in o || "oneOf" in o || Array.isArray(o["type"]) ? 1 : 0;
      return here + Object.values(o).reduce((n: number, v) => n + unions(v), 0);
    };
    for (const s of schemas) {
      expect(s["type"]).toBe("object");
      const props = s["properties"] as Record<string, { type: unknown }>;
      expect(Object.keys(props).length).toBeGreaterThan(0);
      for (const p of Object.values(props)) expect(p.type).toBe("string");
      expect(unions(s)).toBe(0);
      expect(unions(toStructuredSchema(s))).toBe(0);
    }
  });
});

describe("writeHypotheses: the words of this session (指示書 第6.7節 入力・言葉の手がかり)", () => {
  it("the first message holds every reading's problem text and the words of this session", async () => {
    const input = twoReadings();
    const agent = new FakeAgent([done()]);
    await writeHypotheses(agent, input);
    const first = JSON.stringify(agent.steps[0]?.messages);
    expect(agent.steps[0]?.messages).toHaveLength(1);
    for (const r of input.readings) expect(first).toContain(inJson(r.record.world.problem_text));
    for (const w of [...WORDS_A, ...WORDS_B]) expect(first).toContain(w);
  });

  it("the outcome holds none of the words; only the cue kinds come back", async () => {
    const agent = new FakeAgent([submit(adds("c_correct", "c_known_whole"), ["none"]), done()]);
    const outcome = await writeHypotheses(agent, twoReadings());
    expect(submitted(outcome).cueKinds).toEqual(["none"]);
    const all = JSON.stringify(outcome);
    for (const w of [...WORDS_A, ...WORDS_B]) expect(all).not.toContain(w);
  });

  it("a cue written as free text is refused, even when the rest is valid", async () => {
    const agent = new FakeAgent([submit(adds("c_correct", "c_known_whole"), [WORDS_A[0] as string]), done()]);
    const outcome = await writeHypotheses(agent, oneReading());
    expect(isError(resultsOf(agent)[0])).toBe(true);
    expect(outcome.kind).not.toBe("submitted");
    expect(JSON.stringify(outcome)).not.toContain(WORDS_A[0] as string);
  });

  it("a free-text cue refused, then the same pool with a kind from the list is accepted", async () => {
    const agent = new FakeAgent([
      submit(adds("c_correct", "c_known_whole"), ["zz-some free text"]),
      submit(adds("c_correct", "c_known_whole"), ["none"]),
      done(),
    ]);
    const outcome = await writeHypotheses(agent, oneReading());
    const [a, b] = resultsOf(agent);
    expect(isError(a)).toBe(true);
    expect(isError(b)).toBe(false);
    expect(submitted(outcome).cueKinds).toEqual(["none"]);
  });
});

// ---------------------------------------------------------------------------------------------
// The tools answer with core

describe("writeHypotheses: run_rule, score_rule, predict and info_gain run core", () => {
  it("score_rule: the rule the reading was made with reproduces it; the correct rule misses it", async () => {
    const agent = new FakeAgent([scoreCall(reading("c_known_whole")), scoreCall(reading("c_correct")), done()]);
    await writeHypotheses(agent, oneReading());
    const [hit, miss] = resultsOf(agent);
    expect(isError(hit)).toBe(false);
    expect(isError(miss)).toBe(false);
    const h = JSON.parse(contentText(hit)) as Record<string, unknown>;
    const m = JSON.parse(contentText(miss)) as Record<string, unknown>;
    expect(countOf(h["reproduced"])).toBe(1);
    expect(countOf(h["missed"])).toBe(0);
    expect(countOf(m["reproduced"])).toBe(0);
    expect(countOf(m["missed"])).toBe(1);
  });

  it("score_rule counts over every reading of the record", async () => {
    const agent = new FakeAgent([scoreCall(reading("c_known_whole")), done()]);
    await writeHypotheses(agent, twoReadings());
    const h = JSON.parse(contentText(resultsOf(agent)[0])) as Record<string, unknown>;
    expect(countOf(h["reproduced"])).toBe(2);
    expect(countOf(h["missed"])).toBe(0);
  });

  it("run_rule answers with the world the rule builds: two readings give different worlds on the signboard", async () => {
    const agent = new FakeAgent([runRuleCall(reading("c_correct"), SIGNBOARD), runRuleCall(reading("c_known_whole"), SIGNBOARD), done()]);
    await writeHypotheses(agent, oneReading());
    const [right, known] = resultsOf(agent);
    expect(isError(right)).toBe(false);
    expect(isError(known)).toBe(false);
    // The correct world of the signboard has the younger brother at 8 (指示書 第11節 M1).
    expect(contentText(right)).toContain("8/1");
    expect(contentText(known)).not.toEqual(contentText(right));
  });

  it("predict: two readings that differ on a problem get different classes; a copy gets the same class", async () => {
    const copy = { ...reading("c_correct"), id: "h_copy_of_correct" };
    const agent = new FakeAgent([predictCall([reading("c_correct"), reading("c_known_whole"), copy], SIGNBOARD), done()]);
    await writeHypotheses(agent, oneReading());
    const r = resultsOf(agent)[0];
    expect(isError(r)).toBe(false);
    const body = contentText(r);
    for (const id of ["c_correct", "c_known_whole", "h_copy_of_correct"]) expect(body).toContain(id);
    // Each entry names a hypothesis and a class; read the class by the id, whatever the field names are.
    const rows = JSON.parse(body) as Record<string, unknown>[];
    const classOf = (id: string): unknown => {
      const row = rows.find((x) => Object.values(x).includes(id));
      if (row === undefined) throw new Error("no prediction for " + id);
      const nums = Object.values(row).filter((v) => typeof v === "number");
      expect(nums).toHaveLength(1);
      return nums[0];
    };
    expect(classOf("c_correct")).not.toBe(classOf("c_known_whole"));
    expect(classOf("c_correct")).toBe(classOf("h_copy_of_correct"));
  });

  it("info_gain: zero when the rules do not split on the problem, above zero when they do", async () => {
    const copy = { ...reading("c_correct"), id: "h_copy_of_correct" };
    const agent = new FakeAgent([
      gainCall([reading("c_correct"), copy], { c_correct: 0.5, h_copy_of_correct: 0.5, other: 0 }, SIGNBOARD),
      gainCall([reading("c_correct"), reading("c_known_whole")], { c_correct: 0.5, c_known_whole: 0.5, other: 0 }, SIGNBOARD),
      done(),
    ]);
    await writeHypotheses(agent, oneReading());
    const [same, split] = resultsOf(agent);
    expect(isError(same)).toBe(false);
    expect(isError(split)).toBe(false);
    expect(numberIn(same)).toBeCloseTo(0, 10);
    expect(numberIn(split)).toBeGreaterThan(0);
  });

  it("an unknown problem id comes back as a tool error and the loop goes on", async () => {
    const agent = new FakeAgent([
      runRuleCall(reading("c_correct"), "p_zz_no_such_problem"),
      predictCall([reading("c_correct")], "p_zz_no_such_problem"),
      submit(adds("c_correct", "c_known_whole")),
      done(),
    ]);
    const outcome = await writeHypotheses(agent, oneReading());
    const [a, b, c] = resultsOf(agent);
    expect(isError(a)).toBe(true);
    expect(isError(b)).toBe(true);
    expect(isError(c)).toBe(false);
    expect(agent.steps).toHaveLength(4);
    expect(outcome.kind).toBe("submitted");
  });

  it("rule JSON that does not parse, or is not a rule, comes back as a tool error and the loop goes on", async () => {
    const agent = new FakeAgent([
      call("score_rule", { rule_json: "{not json" }),
      call("run_rule", { rule_json: JSON.stringify({ id: "h_zz" }), problem_id: SIGNBOARD }),
      call("predict", { rules_json: "[{", problem_id: SIGNBOARD }),
      call("info_gain", { rules_json: "[]", weights_json: "{nope", problem_id: SIGNBOARD }),
      scoreCall(reading("c_known_whole")),
      done(),
    ]);
    await writeHypotheses(agent, oneReading());
    const results = resultsOf(agent);
    expect(results).toHaveLength(5);
    for (const r of results.slice(0, 4)) expect(isError(r)).toBe(true);
    expect(isError(results[4])).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// submit_pool goes through revisePool of core

const badAction = (): Hypothesis =>
  ({ ...reading("c_correct"), id: "h_zz_bad", clauses: [{ when: { pred: "true", args: [] }, then: { action: "zz_no_such_action" } }] }) as unknown as Hypothesis;
const notARule = (): unknown => ({ id: "h_zz_half", clauses: "zz" });

describe("writeHypotheses: submit_pool", () => {
  it("a valid submission: submitted, the pool as handed in", async () => {
    const agent = new FakeAgent([submit(adds("c_correct", "c_known_whole")), done()]);
    const outcome = await writeHypotheses(agent, oneReading());
    expect(poolIds(outcome)).toEqual(["c_correct", "c_known_whole"]);
    expect(submitted(outcome).revision.merged).toEqual([]);
    expect(submitted(outcome).revision.rejected).toEqual([]);
    const r = resultsOf(agent)[0];
    expect(isError(r)).toBe(false);
    expect(contentText(r)).toContain("c_correct");
    expect(contentText(r)).toContain("c_known_whole");
  });

  it("two rules that build the same worlds are folded into one, and the merge is reported", async () => {
    const copy = { ...reading("c_known_whole"), id: "h_copy_of_known" };
    const agent = new FakeAgent([submit([...adds("c_correct", "c_known_whole"), { kind: "add", hypothesis: copy }]), done()]);
    const outcome = await writeHypotheses(agent, oneReading());
    const rev = submitted(outcome).revision;
    expect(rev.merged).toEqual([{ kept: "c_known_whole", dropped: "h_copy_of_known" }]);
    expect(poolIds(outcome)).toEqual(["c_correct", "c_known_whole"]);
    expect(contentText(resultsOf(agent)[0])).toContain("h_copy_of_known");
  });

  it("an action the language does not have is refused with the reason; the corrected pool is accepted", async () => {
    const agent = new FakeAgent([
      submit([{ kind: "add", hypothesis: reading("c_correct") }, { kind: "add", hypothesis: badAction() }]),
      submit(adds("c_correct", "c_known_whole")),
      done(),
    ]);
    const outcome = await writeHypotheses(agent, oneReading());
    const [first, second] = resultsOf(agent);
    expect(isError(first)).toBe(true);
    expect(contentText(first)).toMatch(/invalid|action/);
    expect(isError(second)).toBe(false);
    expect(poolIds(outcome)).toEqual(["c_correct", "c_known_whole"]);
  });

  it("a hypothesis that fails the schema is refused; the corrected pool is accepted", async () => {
    const agent = new FakeAgent([
      submit([{ kind: "add", hypothesis: reading("c_correct") }, { kind: "add", hypothesis: notARule() }]),
      submit(adds("c_correct", "c_swap")),
      done(),
    ]);
    const outcome = await writeHypotheses(agent, oneReading());
    const [first, second] = resultsOf(agent);
    expect(isError(first)).toBe(true);
    expect(contentText(first).length).toBeGreaterThan(0);
    expect(isError(second)).toBe(false);
    expect(poolIds(outcome)).toEqual(["c_correct", "c_swap"]);
  });

  it("a refusal from core names its reason: deleting an id not in the pool says unknown_id", async () => {
    const agent = new FakeAgent([submit([...adds("c_correct"), { kind: "delete", id: "h_zz_absent" }]), done()]);
    await writeHypotheses(agent, oneReading());
    const r = resultsOf(agent)[0];
    expect(isError(r)).toBe(true);
    expect(contentText(r)).toContain("unknown_id");
  });

  it("a submission that is not JSON is refused", async () => {
    const agent = new FakeAgent([call("submit_pool", { submission_json: "{zz" }), done()]);
    const outcome = await writeHypotheses(agent, oneReading());
    expect(isError(resultsOf(agent)[0])).toBe(true);
    expect(outcome.kind).toBe("agent_failed");
  });

  it("three refusals and nothing accepted: too_many_rejections", async () => {
    const bad = submit([{ kind: "add", hypothesis: badAction() }]);
    const agent = new FakeAgent([bad, bad, bad, done()]);
    const outcome = await writeHypotheses(agent, oneReading());
    expect(outcome.kind).toBe("too_many_rejections");
    expect(outcome.revision).toBeNull();
    const results = resultsOf(agent);
    expect(results).toHaveLength(3);
    for (const r of results) expect(isError(r)).toBe(true);
  });

  it("two refusals and nothing accepted is not yet too many: agent_failed", async () => {
    const bad = submit([{ kind: "add", hypothesis: badAction() }]);
    const agent = new FakeAgent([bad, bad, done()]);
    expect((await writeHypotheses(agent, oneReading())).kind).toBe("agent_failed");
  });

  it("no submit at all: agent_failed", async () => {
    const agent = new FakeAgent([scoreCall(reading("c_known_whole")), done("no pool")]);
    const outcome = await writeHypotheses(agent, oneReading());
    expect(outcome.kind).toBe("agent_failed");
    expect(outcome.revision).toBeNull();
  });

  it("an agent that refuses: agent_failed", async () => {
    const agent = new FakeAgent([{ stopReason: "refusal", text: "", toolCalls: [] }]);
    expect((await writeHypotheses(agent, oneReading())).kind).toBe("agent_failed");
  });

  it("a later accepted submit replaces an earlier one: the last one wins", async () => {
    const agent = new FakeAgent([submit(adds("c_correct", "c_swap")), submit(adds("c_correct", "c_known_whole")), done()]);
    const outcome = await writeHypotheses(agent, oneReading());
    for (const r of resultsOf(agent)) expect(isError(r)).toBe(false);
    expect(poolIds(outcome)).toEqual(["c_correct", "c_known_whole"]);
  });

  it("an accepted submit followed by a refused one keeps the accepted pool", async () => {
    const agent = new FakeAgent([submit(adds("c_correct", "c_known_whole")), submit([{ kind: "add", hypothesis: badAction() }]), done()]);
    const outcome = await writeHypotheses(agent, oneReading());
    expect(poolIds(outcome)).toEqual(["c_correct", "c_known_whole"]);
  });

  it("does not change the input", async () => {
    const input = twoReadings();
    const before = structuredClone(input);
    const agent = new FakeAgent([
      scoreCall(reading("c_known_whole")),
      submit(adds("c_correct", "c_known_whole")),
      submit(adds("c_correct", "c_swap", "c_first_whole")),
      done(),
    ]);
    const outcome = await writeHypotheses(agent, input);
    expect(outcome.kind).toBe("submitted");
    expect(input).toEqual(before);
    expect(input.state.pool).toEqual([]);
  });
});

describe("writeHypotheses: the pool never exceeds the limit", () => {
  it("adding six hypotheses is refused as pool_full", async () => {
    expect(POOL_MAX).toBe(5);
    const six = COMMON_FRACTION_READINGS.slice(0, 6).map((h) => h.id);
    const agent = new FakeAgent([submit(adds(...six)), done()]);
    const outcome = await writeHypotheses(agent, oneReading());
    const r = resultsOf(agent)[0];
    expect(isError(r)).toBe(true);
    expect(contentText(r)).toContain("pool_full");
    expect(outcome.kind).not.toBe("submitted");
  });

  it("for any set of common readings: accepted only up to five, and an accepted pool has at most five", async () => {
    const ids = COMMON_FRACTION_READINGS.map((h) => h.id);
    await fc.assert(
      fc.asyncProperty(fc.subarray(ids, { minLength: 1 }), async (chosen) => {
        const agent = new FakeAgent([submit(adds(...chosen)), done()]);
        const outcome = await writeHypotheses(agent, oneReading());
        const r = resultsOf(agent)[0];
        if (chosen.length > POOL_MAX) {
          expect(isError(r)).toBe(true);
          expect(outcome.kind).not.toBe("submitted");
        } else {
          expect(isError(r)).toBe(false);
          const pool = poolIds(outcome);
          expect(pool.length).toBeLessThanOrEqual(POOL_MAX);
          // Every hypothesis handed in is in the pool, or was folded into one that is.
          const merged = submitted(outcome).revision.merged;
          for (const id of chosen) expect(pool.includes(id) || merged.some((m) => m.dropped === id && pool.includes(m.kept))).toBe(true);
        }
      }),
      { numRuns: 25 },
    );
  });
});

describe("writeHypotheses: a failing agent client", () => {
  it("a client that throws: agent_failed, and nothing is thrown out", async () => {
    const throwing: AgentClient = {
      async step(): Promise<AgentStep> {
        throw new Error("zz-agent-down");
      },
    };
    const outcome = await writeHypotheses(throwing, oneReading());
    expect(outcome.kind).toBe("agent_failed");
    expect(outcome.revision).toBeNull();
  });

  it("a client that throws after an accepted submit does not throw out either", async () => {
    let n = 0;
    const script = [submit(adds("c_correct", "c_known_whole"))];
    const flaky: AgentClient = {
      async step(): Promise<AgentStep> {
        const s = script[n++];
        if (s === undefined) throw new Error("zz-agent-down");
        return structuredClone(s);
      },
    };
    const outcome = await writeHypotheses(flaky, oneReading());
    expect(["submitted", "agent_failed"]).toContain(outcome.kind);
    if (outcome.kind === "submitted") expect(outcome.revision.state.pool.length).toBeLessThanOrEqual(POOL_MAX);
  });
});
