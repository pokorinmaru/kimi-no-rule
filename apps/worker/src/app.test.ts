// 指示書 第11節 M5 (submission scope, HANDOFF §3): the local worker's POST /kohai, /research and /safety.
// No network: the Claude clients are fakes. No key → 503 so the device falls back. Bodies are capped,
// never logged and never stored. Written before the implementation.
import { afterEach, describe, expect, it, vi } from "vitest";
import { COMMON_FRACTION_READINGS, FRACTION_BANK, apply, initialState, runRule } from "@kimi/core";
import type { AgentClient, AgentStep, ClaudeClient, ClaudeRequest } from "@kimi/interpret";
import { createApp, type WorkerDeps } from "./app.ts";
import { app as envApp } from "./index.ts";

const signboard = FRACTION_BANK.find((r) => r.world.problem_id === "p_signboard");
if (signboard === undefined) throw new Error("no signboard");
const swap = COMMON_FRACTION_READINGS.find((h) => h.id === "c_swap");
if (swap === undefined) throw new Error("no swap");

class Fake implements ClaudeClient {
  readonly requests: ClaudeRequest[] = [];
  constructor(private readonly reply: { text: string; stopReason?: "end_turn" | "refusal" }) {}
  async complete(req: ClaudeRequest) {
    this.requests.push(req);
    return { stopReason: this.reply.stopReason ?? "end_turn", text: this.reply.text };
  }
}

class FakeAgent implements AgentClient {
  private i = 0;
  constructor(private readonly steps: AgentStep[]) {}
  async step(): Promise<AgentStep> {
    const s = this.steps[Math.min(this.i, this.steps.length - 1)] as AgentStep;
    this.i++;
    return structuredClone(s);
  }
}

function deps(over: Partial<WorkerDeps> = {}): WorkerDeps {
  return { client: () => new Fake({ text: "{}" }), agent: () => new FakeAgent([{ stopReason: "end_turn", text: "", toolCalls: [] }]), ...over };
}

const post = (a: ReturnType<typeof createApp>, path: string, body: unknown, raw?: string) =>
  a.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: raw ?? JSON.stringify(body) });

const kohaiBody = () => ({
  problem_id: "p_signboard",
  intent: "read",
  lang: "ja",
  kohaiWorld: runRule(swap, signboard),
  childOps: { holderIds: [], words: [] },
});

afterEach(() => vi.restoreAllMocks());

describe("without a key", () => {
  it("answers 503 on every route so the device falls back", async () => {
    const a = createApp({ client: () => null, agent: () => null });
    for (const [path, body] of [
      ["/kohai", kohaiBody()],
      ["/research", { pool: [], weights: { other: 1 }, unscored: 0, unexpressible: false, readings: [] }],
      ["/safety", { text: "hi" }],
    ] as const) {
      expect((await post(a, path, body)).status).toBe(503);
    }
  });

  it("the exported app reads the key from the environment", async () => {
    const before = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect((await post(envApp, "/safety", { text: "hi" })).status).toBe(503);
    } finally {
      if (before !== undefined) process.env.ANTHROPIC_API_KEY = before;
    }
  });
});

describe("POST /kohai", () => {
  it("returns a generated line that passes the gates, built from the bank's problem (not the client's)", async () => {
    const fake = new Fake({ text: JSON.stringify({ intent: "read", utterance: "この読み方だと、こうなりました", refers_to: [], lang: "ja" }) });
    const a = createApp(deps({ client: () => fake }));
    const res = await post(a, "/kohai", kohaiBody());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { text: string; source: string; rejected: string[] };
    expect(["generated", "template"]).toContain(body.source);
    expect(typeof body.text).toBe("string");
    // The generator never sees the correct world's reference.
    expect(JSON.stringify(fake.requests)).not.toContain('"reference":"q_otouto"');
  });

  it("falls back to the template when the line names the answer", async () => {
    const fake = new Fake({ text: JSON.stringify({ intent: "read", utterance: "弟は8匹です", refers_to: [], lang: "ja" }) });
    const a = createApp(deps({ client: () => fake }));
    const body = (await (await post(a, "/kohai", kohaiBody())).json()) as { text: string; source: string; rejected: string[] };
    expect(body.source).toBe("template");
    expect(body.rejected).toContain("answer_leak");
    expect(body.text).not.toContain("8");
  });

  it("refuses an unknown problem, a bad world and a bad intent with 400", async () => {
    const a = createApp(deps());
    expect((await post(a, "/kohai", { ...kohaiBody(), problem_id: "nope" })).status).toBe(400);
    expect((await post(a, "/kohai", { ...kohaiBody(), kohaiWorld: { x: 1 } })).status).toBe(400);
    expect((await post(a, "/kohai", { ...kohaiBody(), intent: "teach" })).status).toBe(400);
    expect((await post(a, "/kohai", null, "{not json")).status).toBe(400);
  });
});

describe("POST /research", () => {
  it("runs the research agent on the bank's records and returns the accepted pool", async () => {
    const childWorld = apply({ correct: signboard.world, ops: [{ op: "set_relation_reference", target_id: "r_ratio", reference: "q_ani", evidence: "" }] }).judgeWorld;
    const submit: AgentStep = {
      stopReason: "tool_use",
      text: "",
      toolCalls: [
        {
          id: "t1",
          name: "submit_pool",
          input: { submission_json: JSON.stringify({ edits: [{ kind: "add", hypothesis: swap }, { kind: "add", hypothesis: COMMON_FRACTION_READINGS[0] }], cue_kinds: ["none"] }) },
        },
      ],
    };
    const a = createApp(deps({ agent: () => new FakeAgent([submit, { stopReason: "end_turn", text: "", toolCalls: [] }]) }));
    const s = initialState();
    const res = await post(a, "/research", {
      pool: s.pool,
      weights: s.weights,
      unscored: 1,
      unexpressible: false,
      readings: [{ problem_id: "p_signboard", childWorld, referencePlaced: true, afterFix: false, wordbookOpenedBefore: false, words: ["の"] }],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { kind: string; pool: { id: string }[] };
    expect(body.kind).toBe("submitted");
    expect(body.pool.map((h) => h.id).sort()).toEqual(["c_correct", "c_swap"]);
  });

  it("says failed when the agent hands in nothing", async () => {
    const a = createApp(deps());
    const res = await post(a, "/research", { pool: [], weights: { other: 1 }, unscored: 0, unexpressible: false, readings: [] });
    expect(await res.json()).toEqual({ kind: "failed" });
  });
});

describe("POST /safety", () => {
  it("returns the flag only", async () => {
    const a = createApp(deps({ client: () => new Fake({ text: JSON.stringify({ schema_version: "1", safety_flag: "none" }) }) }));
    const res = await post(a, "/safety", { text: "zz-child-words" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["flag"]);
  });
});

describe("bodies are capped and never logged", () => {
  it("refuses a body over the cap with 413", async () => {
    const a = createApp(deps());
    const res = await post(a, "/safety", { text: "x".repeat(100_000) });
    expect(res.status).toBe(413);
  });

  it("writes nothing to the console on any route, even on errors", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const a = createApp(deps({ client: () => ({ complete: () => Promise.reject(new Error("zz-secret-body")) }) }));
    await post(a, "/kohai", kohaiBody());
    await post(a, "/safety", { text: "zz-child-words" });
    await post(a, "/kohai", null, "{bad");
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });

  it("answers 404 for other routes", async () => {
    const a = createApp(deps());
    expect((await a.request("/interpret", { method: "POST" })).status).toBe(404);
  });
});
