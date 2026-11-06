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

/** Schema words structured output does not take; the reply is still checked with zod afterwards. */
const UNSUPPORTED = new Set([
  "$schema",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "minItems",
  "maxItems",
  "uniqueItems",
  "format",
  "default",
]);

/** A JSON Schema as structured output takes it: unsupported words removed, every object closed. */
export function toStructuredSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const clean = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(clean);
    if (x === null || typeof x !== "object") return x;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x)) {
      if (UNSUPPORTED.has(k)) continue;
      // properties hold names, not schema words: clean the values only.
      if (k === "properties" && v !== null && typeof v === "object") {
        out[k] = Object.fromEntries(Object.entries(v).map(([name, s]) => [name, clean(s)]));
      } else out[k] = clean(v);
    }
    if (out.type === "object" && out.additionalProperties === undefined) out.additionalProperties = false;
    return out;
  };
  return clean(schema) as Record<string, unknown>;
}

/** Thinking per model: off when listening (Haiku, low effort) and for the junior (Sonnet), effort only when building. */
function thinkingFor(model: string): { type: string } | undefined {
  if (model === MODELS.listen) return { type: "disabled" };
  if (model === MODELS.kohai) return { type: "between_tools" };
  return undefined;
}

interface SdkLike {
  messages: { create(params: never, options?: never): Promise<unknown> };
}

/** A ClaudeClient over the Anthropic SDK. Credentials come from the environment (never from code). */
export function anthropicClient(options: { apiKey?: string; sdk?: SdkLike } = {}): ClaudeClient {
  const sdk: SdkLike = options.sdk ?? (new Anthropic(options.apiKey === undefined ? {} : { apiKey: options.apiKey }) as unknown as SdkLike);
  return {
    async complete(req) {
      const thinking = thinkingFor(req.model);
      const system = [
        { type: "text", text: req.system },
        ...(req.cachedContext === "" ? [] : [{ type: "text", text: req.cachedContext, cache_control: { type: "ephemeral" } }]),
      ];
      const params = {
        model: req.model,
        max_tokens: req.maxTokens,
        system,
        messages: [{ role: "user", content: req.userText }],
        output_config: { effort: req.effort, format: { type: "json_schema", schema: toStructuredSchema(req.schema) } },
        ...(thinking === undefined ? {} : { thinking }),
      };
      const res = (await sdk.messages.create(params as never, { maxRetries: 0, ...(req.signal === undefined ? {} : { signal: req.signal }) } as never)) as {
        stop_reason: string | null;
        content: { type: string; text?: string }[];
      };
      const text = res.content.flatMap((b) => (b.type === "text" && typeof b.text === "string" ? [b.text] : [])).join("");
      return { stopReason: (res.stop_reason ?? "end_turn") as ClaudeResponse["stopReason"], text };
    },
  };
}

/** Resolves with the call, or with "timeout" when the deadline passes first (the call is then aborted). */
export async function withDeadline<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T | "timeout"> {
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
