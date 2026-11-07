// make:discriminating's progress lines: one per Claude call (counted by model, errors shown at once with class and
// message, never the key), one per finished pair with done/total, pct, elapsed, eta. Fakes only.
import { describe, expect, it } from "vitest";
import { MODELS, type AgentClient, type ClaudeClient } from "@kimi/interpret";
import { makeProgress } from "./make-progress.ts";

const req = (model: string) => ({ model, system: "", cachedContext: "", userText: "", schema: {}, effort: "low" as const, maxTokens: 1 });

describe("makeProgress", () => {
  it("prints a start line, a line per call counted by model, error lines, and a line per pair with an eta", async () => {
    const lines: string[] = [];
    let t = 0;
    const p = makeProgress({ sink: { write: (l) => void lines.push(l) }, now: () => t, pairs: 2, plannedCalls: "Opus about 30, at most 60; Haiku at most 80" });
    expect(lines[0]).toMatch(/^\[make:discriminating\] start: 2 pairs; planned calls Opus about 30/);
    const ok: ClaudeClient = { complete: async () => ({ stopReason: "end_turn", text: "{}" }) };
    const bad: ClaudeClient = { complete: () => Promise.reject(Object.assign(new Error("grammar too large"), { status: 400 })) };
    const agent: AgentClient = { step: async () => ({ stopReason: "end_turn", text: "", toolCalls: [] }) };
    t = 1000;
    await p.client(ok).complete(req(MODELS.listen));
    expect(lines.at(-1)).toBe("[make:discriminating] calls 1 (opus 0, haiku 1) elapsed 00:01 failures 0");
    await p.agent(agent).step({ model: MODELS.build, system: "", messages: [], tools: [] });
    await expect(p.client(bad).complete(req(MODELS.build))).rejects.toThrow();
    expect(lines.some((l) => /error .*BadRequestError|error .*Error 400 grammar too large/.test(l))).toBe(true);
    expect(lines.at(-1)).toBe("[make:discriminating] calls 3 (opus 2, haiku 1) elapsed 00:01 failures 1");
    t = 60_000;
    p.pairDone("c_swap / c_known", 1, 1);
    expect(lines.at(-1)).toBe("[make:discriminating] pair 1/2 (50.0%) c_swap / c_known: kept 1, refused 1; elapsed 01:00 eta 01:00 failures 1");
  });
});
