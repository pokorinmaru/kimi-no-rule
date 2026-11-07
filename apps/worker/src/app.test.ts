// 指示書 第11節 M5 (submission scope, HANDOFF §3): the local worker's POST /kohai, /research and /safety.
// No network: the Claude clients are fakes. No key → 503 so the device falls back. Bodies are capped,
// never logged and never stored. Written before the implementation.
import { afterEach, describe, expect, it, vi } from "vitest";
import { COMMON_FRACTION_READINGS, FRACTION_BANK, apply, initialState, runRule } from "@kimi/core";
import type { AgentClient, AgentStep, ClaudeClient, ClaudeRequest } from "@kimi/interpret";
import { RATE_LIMITS, createApp, type WorkerDeps } from "./app.ts";
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

  it("refuses the bank's correct world as the junior's world, so the generator never gets it", async () => {
    const fake = new Fake({ text: "{}" });
    const a = createApp(deps({ client: () => fake }));
    expect((await post(a, "/kohai", { ...kohaiBody(), kohaiWorld: structuredClone(signboard.world) })).status).toBe(400);
    expect(fake.requests).toHaveLength(0);
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

describe("a runaway page cannot spend the key (per-process cap)", () => {
  const empty = { pool: [], weights: { other: 1 }, unscored: 0, unexpressible: false, readings: [] };

  it("answers 429 after 30 /research calls in an hour, and again after the hour", async () => {
    let now = 0;
    const a = createApp(deps({ now: () => now }));
    for (let i = 0; i < RATE_LIMITS.research.max; i++) expect((await post(a, "/research", empty)).status).toBe(200);
    expect(RATE_LIMITS.research.max).toBe(30);
    expect((await post(a, "/research", empty)).status).toBe(429);
    now += RATE_LIMITS.windowMs + 1;
    expect((await post(a, "/research", empty)).status).toBe(200);
  });

  it("answers 429 after 300 /kohai calls in an hour; the cap is per route", async () => {
    const a = createApp(deps());
    expect(RATE_LIMITS.kohai.max).toBe(300);
    for (let i = 0; i < RATE_LIMITS.kohai.max; i++) {
      const res = await post(a, "/kohai", kohaiBody());
      if (res.status !== 200) throw new Error(`call ${String(i)}: ${String(res.status)}`);
    }
    expect((await post(a, "/kohai", kohaiBody())).status).toBe(429);
    expect((await post(a, "/research", empty)).status).toBe(200);
  });
});

describe("only this device's pages may call (review fix)", () => {
  const app = createApp({ client: () => null, agent: () => null });
  const post = (headers: Record<string, string>) => app.request("/safety", { method: "POST", headers, body: JSON.stringify({ text: "x" }) });
  it("refuses another origin, a foreign host and a body that is not JSON", async () => {
    expect((await post({ "content-type": "application/json", origin: "https://evil.example" })).status).toBe(403);
    expect((await post({ "content-type": "application/json", host: "evil.example" })).status).toBe(403);
    expect((await post({ "content-type": "text/plain" })).status).toBe(415);
    expect((await post({ "content-type": "application/json", origin: "http://localhost:5173" })).status).not.toBe(403);
  });
});

// 指示書 第6.7節 手順5: POST /scenes. Opus proposes two everyday scenes for a reading; core checks them on the
// worker, and the device checks them again. The same rules as the other routes. Written before the implementation.
describe("POST /scenes", () => {
  const proposal = {
    breaks: { material: "cup_juice", frame: "within", known: "reference", order: "relation_first", known_value: 28, num: 3, den: 4, limit: null },
    keeps: { material: "tank_water", frame: "cap", known: "subject", order: "known_first", known_value: 21, num: 3, den: 4, limit: 29 },
    reason_for_adult: "The cup overflows when the juice is taken as 1.",
  };
  const body = (over: Record<string, unknown> = {}) => ({ rule: swap, lang: "ja", word_kinds: ["holder_mention"], ...over });

  it("answers 503 without a key", async () => {
    expect((await post(createApp({ client: () => null, agent: () => null }), "/scenes", body())).status).toBe(503);
  });

  it("returns a proposal core passed, as choices only", async () => {
    const fake = new Fake({ text: JSON.stringify(proposal) });
    const res = await post(createApp(deps({ client: () => fake })), "/scenes", body());
    expect(res.status).toBe(200);
    const out = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(out).sort()).toEqual(["proposal", "reason", "source"]);
    expect(out.source).toBe("claude");
    expect(out.proposal).toEqual({ breaks: proposal.breaks, keeps: proposal.keeps });
    expect(fake.requests).toHaveLength(1);
  });

  it("returns the program's choices when the proposal does not pass core", async () => {
    const fake = new Fake({ text: JSON.stringify({ ...proposal, breaks: proposal.keeps, keeps: proposal.breaks }) });
    const out = (await (await post(createApp(deps({ client: () => fake })), "/scenes", body())).json()) as { source: string; reason: unknown };
    expect(out.source).toBe("program");
    expect(out.reason).toBeNull();
  });

  it("refuses a bad rule, a bad language, unknown keys and word texts with 400", async () => {
    const a = createApp(deps());
    expect((await post(a, "/scenes", body({ rule: { id: "x" } }))).status).toBe(400);
    expect((await post(a, "/scenes", body({ lang: "fr" }))).status).toBe(400);
    expect((await post(a, "/scenes", body({ words: ["の"] }))).status).toBe(400);
    expect((await post(a, "/scenes", body({ word_kinds: ["兄"] }))).status).toBe(400);
    expect((await post(a, "/scenes", null, "{bad")).status).toBe(400);
  });

  it("is capped per process, refuses another origin, and logs nothing", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const a = createApp(deps({ client: () => ({ complete: () => Promise.reject(new Error("zz-secret-body")) }) }));
    expect(RATE_LIMITS.scenes.max).toBeGreaterThan(0);
    for (let i = 0; i < RATE_LIMITS.scenes.max; i++) expect((await post(a, "/scenes", body())).status).toBe(200);
    expect((await post(a, "/scenes", body())).status).toBe(429);
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    const res = await a.request("/scenes", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify(body()) });
    expect(res.status).toBe(403);
    expect((await post(a, "/scenes", { text: "x".repeat(100_000) })).status).toBe(413);
  });
});
