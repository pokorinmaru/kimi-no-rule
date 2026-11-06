// The request the real client builds, checked against a recording stand-in for the SDK (no network).
// Found in the M1b review: unsupported schema words, an empty cached block, and thinking per model.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { schemas } from "@kimi/core";
import { MODELS, anthropicClient, toStructuredSchema, type ClaudeRequest } from "./client.ts";

function recordingSdk() {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    sdk: {
      messages: {
        create: async (params: Record<string, unknown>) => {
          calls.push(params);
          return { stop_reason: "end_turn", content: [{ type: "text", text: "{}" }] };
        },
      },
    },
  };
}

const req = (over: Partial<ClaudeRequest> = {}): ClaudeRequest => ({
  model: MODELS.listen,
  system: "sys",
  cachedContext: "context",
  userText: "words",
  schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  effort: "low",
  maxTokens: 100,
  ...over,
});

const UNSUPPORTED = ["$schema", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "pattern", "minItems", "maxItems"];

function keysOf(x: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(x)) for (const v of x) keysOf(v, out);
  else if (x !== null && typeof x === "object") {
    for (const [k, v] of Object.entries(x)) {
      out.add(k);
      keysOf(v, out);
    }
  }
  return out;
}

describe("the schema sent for structured output", () => {
  it("holds none of the words the API does not take, for every schema we send", () => {
    for (const s of [schemas.kohaiUtterance, schemas.safety, schemas.interpretation, schemas.explanation]) {
      const sent = toStructuredSchema(z.toJSONSchema(s, { target: "draft-2020-12" }) as Record<string, unknown>);
      const keys = keysOf(sent);
      for (const k of UNSUPPORTED) expect(keys.has(k)).toBe(false);
    }
  });

  it("keeps every object closed", () => {
    const sent = toStructuredSchema(z.toJSONSchema(schemas.kohaiUtterance, { target: "draft-2020-12" }) as Record<string, unknown>);
    expect(sent.additionalProperties).toBe(false);
  });
});

describe("the request the real client builds", () => {
  it("puts the cache breakpoint on the stable part and the child's words last", async () => {
    const { sdk, calls } = recordingSdk();
    await anthropicClient({ sdk }).complete(req());
    const params = calls[0] as { system: { text: string; cache_control?: unknown }[]; messages: { content: string }[] };
    expect(params.system.at(-1)).toMatchObject({ text: "context", cache_control: { type: "ephemeral" } });
    expect(params.messages.at(-1)?.content).toBe("words");
  });

  it("sends no empty text block when there is nothing to cache", async () => {
    const { sdk, calls } = recordingSdk();
    await anthropicClient({ sdk }).complete(req({ cachedContext: "" }));
    const params = calls[0] as { system: { text: string }[] };
    for (const b of params.system) expect(b.text).not.toBe("");
  });

  it("turns thinking off for listening and for the junior, and leaves it to effort when building", async () => {
    const { sdk, calls } = recordingSdk();
    const client = anthropicClient({ sdk });
    await client.complete(req({ model: MODELS.listen }));
    await client.complete(req({ model: MODELS.kohai }));
    await client.complete(req({ model: MODELS.build, effort: "high" }));
    expect(calls[0]?.thinking).toEqual({ type: "disabled" });
    expect(calls[1]?.thinking).toEqual({ type: "between_tools" });
    expect(calls[2]?.thinking).toBeUndefined();
    expect(calls[2]?.output_config).toMatchObject({ effort: "high" });
  });

  it("asks for structured output with the cleaned schema", async () => {
    const { sdk, calls } = recordingSdk();
    const schema = z.toJSONSchema(schemas.kohaiUtterance, { target: "draft-2020-12" }) as Record<string, unknown>;
    await anthropicClient({ sdk }).complete(req({ schema }));
    const format = (calls[0]?.output_config as { format: { type: string; schema: unknown } }).format;
    expect(format.type).toBe("json_schema");
    expect(keysOf(format.schema).has("maxLength")).toBe(false);
  });
});
