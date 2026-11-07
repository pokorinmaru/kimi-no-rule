// The tool loop with a fake agent client (指示書 第11節 M1b).
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { runAgent, type AgentClient, type AgentStep, type AgentTool } from "./agent.ts";
import { FakeAgent } from "./fake.ts";

interface ToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: unknown;
  is_error?: boolean;
}

/** Every tool_result block anywhere in the messages, in order. */
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

const contentText = (r: ToolResult | undefined): string => JSON.stringify(r?.content ?? null);

function echoTool(seen: unknown[] = []): AgentTool {
  return {
    name: "echo",
    description: "returns what it was given",
    inputSchema: { type: "object", properties: { n: { type: "integer" } } },
    run: async (input: unknown) => {
      seen.push(input);
      return { echoed: input };
    },
  };
}

const boomTool: AgentTool = {
  name: "boom",
  description: "always throws",
  inputSchema: { type: "object" },
  run: async () => {
    throw new Error("zz-tool-broke");
  },
};

const call = (id: string, name: string, input: unknown): AgentStep => ({ stopReason: "tool_use", text: "", toolCalls: [{ id, name, input }] });
const done = (t: string): AgentStep => ({ stopReason: "end_turn", text: t, toolCalls: [] });

const opts = (tools: AgentTool[], maxTurns = 5) => ({ model: "claude-opus-5-5", system: "zz-system", prompt: "zz-prompt", tools, maxTurns });

describe("runAgent", () => {
  it("ends at once when the first step ends the turn", async () => {
    const client = new FakeAgent([done("finished")]);
    const res = await runAgent(client, opts([echoTool()]));
    expect(res).toEqual({ text: "finished", turns: 1, stopReason: "end_turn" });
    expect(JSON.stringify(client.steps[0]?.messages)).toContain("zz-prompt");
  });

  it("passes model, system and the tools on every step", async () => {
    const client = new FakeAgent([call("t1", "echo", { n: 1 }), done("ok")]);
    await runAgent(client, opts([echoTool(), boomTool]));
    for (const s of client.steps) {
      expect(s.model).toBe("claude-opus-5-5");
      expect(s.system).toBe("zz-system");
      expect(s.toolNames).toEqual(["echo", "boom"]);
    }
  });

  it("runs the tool, sends its result back under the same id, and goes on", async () => {
    const seen: unknown[] = [];
    const client = new FakeAgent([call("t1", "echo", { n: 7 }), done("after tool")]);
    const res = await runAgent(client, opts([echoTool(seen)]));
    expect(seen).toEqual([{ n: 7 }]);
    expect(res).toEqual({ text: "after tool", turns: 2, stopReason: "end_turn" });
    const results = toolResults(client.steps[1]?.messages);
    expect(results).toHaveLength(1);
    expect(results[0]?.tool_use_id).toBe("t1");
    expect(results[0]?.is_error ?? false).toBe(false);
    expect(contentText(results[0])).toContain("echoed");
  });

  it("keeps the earlier messages: the prompt is still first on the second step", async () => {
    const client = new FakeAgent([call("t1", "echo", { n: 1 }), done("ok")]);
    await runAgent(client, opts([echoTool()]));
    const second = client.steps[1]?.messages ?? [];
    expect(second.length).toBeGreaterThan(1);
    expect(JSON.stringify(second[0])).toContain("zz-prompt");
  });

  it("answers every call of one step, in order", async () => {
    const step: AgentStep = {
      stopReason: "tool_use",
      text: "",
      toolCalls: [
        { id: "a", name: "echo", input: { n: 1 } },
        { id: "b", name: "echo", input: { n: 2 } },
      ],
    };
    const client = new FakeAgent([step, done("ok")]);
    await runAgent(client, opts([echoTool()]));
    expect(toolResults(client.steps[1]?.messages).map((r) => r.tool_use_id)).toEqual(["a", "b"]);
  });

  it("an unknown tool comes back as an error result, and the loop goes on", async () => {
    const client = new FakeAgent([call("t1", "nope", {}), done("ok")]);
    const res = await runAgent(client, opts([echoTool()]));
    const r = toolResults(client.steps[1]?.messages)[0];
    expect(r?.tool_use_id).toBe("t1");
    expect(r?.is_error).toBe(true);
    expect(res.stopReason).toBe("end_turn");
  });

  it("a tool that throws comes back as an error result with its message, and the loop goes on", async () => {
    const client = new FakeAgent([call("t1", "boom", {}), done("ok")]);
    const res = await runAgent(client, opts([boomTool]));
    const r = toolResults(client.steps[1]?.messages)[0];
    expect(r?.is_error).toBe(true);
    expect(contentText(r)).toContain("zz-tool-broke");
    expect(res.turns).toBe(2);
  });

  it("stops at maxTurns when the model keeps calling tools", async () => {
    const client = new FakeAgent([call("t", "echo", { n: 0 })]);
    const res = await runAgent(client, opts([echoTool()], 3));
    expect(client.steps).toHaveLength(3);
    expect(res.turns).toBe(3);
    expect(res.stopReason).not.toBe("end_turn");
  });

  it("stops on a refusal without running tools", async () => {
    const seen: unknown[] = [];
    const refusal: AgentStep = { stopReason: "refusal", text: "", toolCalls: [{ id: "t", name: "echo", input: { n: 1 } }] };
    const client = new FakeAgent([refusal, done("never")]);
    const res = await runAgent(client, opts([echoTool(seen)]));
    expect(res.stopReason).toBe("refusal");
    expect(res.turns).toBe(1);
    expect(client.steps).toHaveLength(1);
    expect(seen).toEqual([]);
  });

  it("puts the assistant content back unchanged when the client gives it", async () => {
    const content = [{ type: "thinking", thinking: "zz-thought", signature: "zz-sig" }, { type: "tool_use", id: "t1", name: "echo", input: { n: 1 } }];
    const first: AgentStep = { ...call("t1", "echo", { n: 1 }), assistantContent: content };
    const client = new FakeAgent([first, done("ok")]);
    await runAgent(client, opts([echoTool()]));
    expect(JSON.stringify(client.steps[1]?.messages)).toContain(JSON.stringify(content));
  });

  it("property: with k tool steps before the end, there are k + 1 turns and k results, ids kept", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 6 }), async (k) => {
        const steps = [...Array.from({ length: k }, (_, i) => call(`id${i}`, "echo", { n: i })), done("end")];
        const client = new FakeAgent(steps);
        const res = await runAgent(client, opts([echoTool()], 10));
        expect(res.turns).toBe(k + 1);
        expect(res.text).toBe("end");
        const last = client.steps[client.steps.length - 1]?.messages;
        expect(toolResults(last).map((r) => r.tool_use_id)).toEqual(Array.from({ length: k }, (_, i) => `id${i}`));
      }),
      { numRuns: 20 },
    );
  });
});

describe("runAgent: a caller that stops waiting (review fix)", () => {
  it("starts no further turn once the signal is aborted, and passes the signal to the client", async () => {
    const ctrl = new AbortController();
    const seen: (AbortSignal | undefined)[] = [];
    const client: AgentClient = {
      step: async (req) => {
        seen.push(req.signal);
        ctrl.abort();
        return { stopReason: "tool_use", text: "", toolCalls: [{ id: "t1", name: "noop", input: {} }] };
      },
    };
    const tool: AgentTool = { name: "noop", description: "", inputSchema: { type: "object", properties: {}, additionalProperties: false }, run: async () => ({}) };
    const out = await runAgent(client, { model: "m", system: "s", prompt: "p", tools: [tool], maxTurns: 5, signal: ctrl.signal });
    expect(seen).toEqual([ctrl.signal]);
    expect(out).toMatchObject({ turns: 1, stopReason: "aborted" });
  });
});
