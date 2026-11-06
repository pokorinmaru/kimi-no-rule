// M1b: the one place that talks to Claude. Everything else takes a ClaudeClient, so tests use a fake.
// Request shapes follow the Claude API docs (structured outputs in output_config.format, effort in
// output_config, cache_control on the stable system part). Nothing of the request or the reply is logged.
import Anthropic from "@anthropic-ai/sdk";

export type Effort = "low" | "medium" | "high";

export interface ClaudeRequest {
  model: string;
  system: string;
  /** The stable part (instructions with examples, the problem's world): cached. */
  cachedContext: string;
  /** What changes on every call (the child's words): last, after the cache breakpoint. */
  userText: string;
  schema: Record<string, unknown>;
  effort: Effort;
  maxTokens: number;
  signal?: AbortSignal;
}

export interface ClaudeResponse {
  stopReason: "end_turn" | "max_tokens" | "refusal" | "tool_use" | "pause_turn" | "stop_sequence";
  text: string;
}

export interface ClaudeClient {
  complete(req: ClaudeRequest): Promise<ClaudeResponse>;
}

export const MODELS = {
  listen: "claude-haiku-5-5",
  kohai: "claude-sonnet-5-5",
  build: "claude-opus-5-5",
} as const;

/** A ClaudeClient over the Anthropic SDK. Credentials come from the environment (never from code). */
export function anthropicClient(options: { apiKey?: string } = {}): ClaudeClient {
  const sdk = new Anthropic(options.apiKey === undefined ? {} : { apiKey: options.apiKey });
  return {
    async complete(req) {
      // Haiku 5.5 may turn thinking off at low effort, which keeps listening fast; the other models
      // keep their default adaptive thinking and are steered by effort only.
      const thinking = req.model === MODELS.listen ? ({ type: "disabled" } as const) : undefined;
      const res = await sdk.messages.create(
        {
          model: req.model,
          max_tokens: req.maxTokens,
          system: [
            { type: "text", text: req.system },
            { type: "text", text: req.cachedContext, cache_control: { type: "ephemeral" } },
          ],
          messages: [{ role: "user", content: req.userText }],
          output_config: { effort: req.effort, format: { type: "json_schema", schema: req.schema } },
          ...(thinking === undefined ? {} : { thinking }),
        },
        { maxRetries: 0, ...(req.signal === undefined ? {} : { signal: req.signal }) },
      );
      const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      return { stopReason: (res.stop_reason ?? "end_turn") as ClaudeResponse["stopReason"], text };
    },
  };
}

/** Resolves with the call, or with "timeout" when the deadline passes first (the call is then aborted). */
export async function withDeadline<T>(
  ms: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T | "timeout"> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve("timeout");
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
