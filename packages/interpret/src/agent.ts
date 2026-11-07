// M1b: the tool loop of the agents that build worlds and study readings (M2, M3). Claude proposes;
// the tools are core functions that run and check. A step's assistant content is appended unchanged,
// so thinking blocks go back as they came.
import Anthropic from "@anthropic-ai/sdk";
import { toStructuredSchema, type ClaudeResponse } from "./client.ts";

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(input: unknown): Promise<unknown>;
}

export interface AgentStep {
  stopReason: ClaudeResponse["stopReason"];
  text: string;
  toolCalls: { id: string; name: string; input: unknown }[];
  /** The assistant content as the API returned it; appended unchanged when present. */
  assistantContent?: unknown[];
}

export interface AgentClient {
  step(req: { model: string; system: string; messages: unknown[]; tools: AgentTool[]; signal?: AbortSignal }): Promise<AgentStep>;
}

export async function runAgent(
  client: AgentClient,
  opts: { model: string; system: string; prompt: string; tools: AgentTool[]; maxTurns: number; signal?: AbortSignal },
): Promise<{ text: string; turns: number; stopReason: string }> {
  const messages: unknown[] = [{ role: "user", content: opts.prompt }];
  let turns = 0;
  let last: AgentStep = { stopReason: "end_turn", text: "", toolCalls: [] };
  while (turns < opts.maxTurns) {
    // A caller that gave up (the device's deadline) stops the run before the next turn is paid for.
    if (opts.signal?.aborted === true) return { text: last.text, turns, stopReason: "aborted" };
    last = await client.step({ model: opts.model, system: opts.system, messages, tools: opts.tools, ...(opts.signal === undefined ? {} : { signal: opts.signal }) });
    turns++;
    if (last.stopReason === "refusal" || last.stopReason === "max_tokens") break;
    if (last.toolCalls.length === 0) break;
    messages.push({
      role: "assistant",
      content:
        last.assistantContent ?? last.toolCalls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: c.input })),
    });
    // Every tool call gets a result in one user message; a failure is a result with is_error.
    const results = await Promise.all(
      last.toolCalls.map(async (c) => {
        const tool = opts.tools.find((t) => t.name === c.name);
        if (tool === undefined) return { type: "tool_result", tool_use_id: c.id, content: `unknown tool ${c.name}`, is_error: true };
        try {
          return { type: "tool_result", tool_use_id: c.id, content: JSON.stringify(await tool.run(c.input)) };
        } catch (e) {
          return { type: "tool_result", tool_use_id: c.id, content: e instanceof Error ? e.message : String(e), is_error: true };
        }
      }),
    );
    messages.push({ role: "user", content: results });
  }
  return { text: last.text, turns, stopReason: last.stopReason };
}

/** An AgentClient over the Anthropic SDK (strict tools, high effort; no thinking parameter is sent, so the model default applies). */
export function anthropicAgentClient(options: { apiKey?: string } = {}): AgentClient {
  const sdk = new Anthropic(options.apiKey === undefined ? {} : { apiKey: options.apiKey });
  return {
    async step(req) {
      const res = await sdk.messages.create({
        model: req.model,
        max_tokens: 16000,
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        messages: req.messages as Anthropic.MessageParam[],
        tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: toStructuredSchema(t.inputSchema) as Anthropic.Tool.InputSchema, strict: true })),
        output_config: { effort: "high" },
      }, req.signal === undefined ? {} : { signal: req.signal });
      const toolCalls = res.content.flatMap((b) => (b.type === "tool_use" ? [{ id: b.id, name: b.name, input: b.input }] : []));
      const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      return { stopReason: (res.stop_reason ?? "end_turn") as ClaudeResponse["stopReason"], text, toolCalls, assistantContent: res.content };
    },
  };
}
