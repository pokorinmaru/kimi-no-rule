// POST /wish (Q61): a child's wish to AI-kun. The worker answers only the kind and, for a wish, core-checked
// rephrased words; it never echoes the child's words, keeps nothing, and writes nothing to the console.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentClient, AgentStep, ClaudeClient, ClaudeRequest } from "@kimi/interpret";
import { BODY_LIMITS, RATE_LIMITS, createApp, type WorkerDeps } from "./app.ts";

class Seq implements ClaudeClient {
  readonly requests: ClaudeRequest[] = [];
  private i = 0;
  constructor(private readonly texts: string[]) {}
  async complete(req: ClaudeRequest) {
    this.requests.push(req);
    const text = this.texts[Math.min(this.i, this.texts.length - 1)] as string;
    this.i++;
    return { stopReason: "end_turn" as const, text };
  }
}
class NoAgent implements AgentClient {
  async step(): Promise<AgentStep> {
    return { stopReason: "end_turn", text: "", toolCalls: [] };
  }
}
const deps = (client: ClaudeClient | null): WorkerDeps => ({ client: () => client, agent: () => new NoAgent() });
const post = (a: ReturnType<typeof createApp>, body: unknown, headers: Record<string, string> = {}) =>
  a.request("/wish", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

afterEach(() => vi.restoreAllMocks());

describe("POST /wish", () => {
  it("answers the rephrased request only, never the child's words", async () => {
    const a = createApp(deps(new Seq([JSON.stringify({ kind: "wish", request: "魚の絵が半分なのが分かりにくい" })])));
    const res = await post(a, { text: "zz-child-words なんで半分" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ kind: "wish", request: "魚の絵が半分なのが分かりにくい" });
    expect(JSON.stringify(body)).not.toContain("zz-child-words");
  });

  it("answers distress without a request", async () => {
    const a = createApp(deps(new Seq([JSON.stringify({ kind: "distress", request: "" })])));
    expect(await (await post(a, { text: "つらい" })).json()).toEqual({ kind: "distress" });
  });

  it("answers 503 without a key, 400 for a bad body, 413 over the cap, 403 from another origin", async () => {
    expect((await post(createApp(deps(null)), { text: "hi" })).status).toBe(503);
    const a = createApp(deps(new Seq([JSON.stringify({ kind: "not_about_app", request: "" })])));
    expect((await post(a, { text: 1 })).status).toBe(400);
    expect((await post(a, { text: "hi", extra: 1 })).status).toBe(400);
    expect((await post(a, { text: "" })).status).toBe(400);
    expect((await post(a, { text: "x".repeat(BODY_LIMITS.wish + 10) })).status).toBe(413);
    expect((await post(a, { text: "hi" }, { origin: "https://evil.example.com" })).status).toBe(403);
  });

  it("caps the calls per window", async () => {
    let t = 0;
    const a = createApp({ ...deps(new Seq([JSON.stringify({ kind: "not_about_app", request: "" })])), now: () => t });
    for (let i = 0; i < RATE_LIMITS.wish.max; i++) expect((await post(a, { text: "hi" })).status).toBe(200);
    expect((await post(a, { text: "hi" })).status).toBe(429);
    t += RATE_LIMITS.windowMs + 1;
    expect((await post(a, { text: "hi" })).status).toBe(200);
  });

  it("writes nothing to the console, even on errors", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const a = createApp(deps({ complete: () => Promise.reject(new Error("zz-secret-body")) }));
    await post(a, { text: "zz-child-words" });
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});
