// Expression and reason with a fake Claude (指示書 第6.3節, 第11節 M1b).
import { describe, expect, it } from "vitest";
import { problemScopedSchemas, type Explanation } from "@kimi/core";
import { MODELS } from "./client.ts";
import { explain } from "./explain.ts";
import type { InterpretInput } from "./interpret.ts";
import { FakeClaude, fails, json, stopped, text } from "./fake.ts";
import { record } from "./test-support.ts";

function input(over: Partial<InterpretInput> = {}): InterpretInput {
  return { record: record(), transcript: "ろくわるよんぶんのさん", fingerOps: [], wordCues: [], lang: "ja", ...over };
}

const good: Explanation = {
  schema_version: "2",
  utterance_lang: "ja",
  kind: "expression",
  tokens: [
    { type: "number", number: { num: 6, den: 1 }, operator: null },
    { type: "operator", number: null, operator: "/" },
    { type: "number", number: { num: 3, den: 4 }, operator: null },
  ],
  answer: null,
  mentioned_elements: ["q_ani", "r_ratio"],
  evidence: "",
};
const foreignId: Explanation = { ...good, mentioned_elements: ["q_nobody"] };
const badDen: Explanation = {
  ...good,
  tokens: [{ type: "number", number: { num: 3, den: 0 }, operator: null }],
};

describe("explain", () => {
  it("returns an explanation that passes the per-problem shape", async () => {
    const client = new FakeClaude([json(good)]);
    const res = await explain(input(), client);
    expect(res).toEqual({ status: "ok", explanation: good });
    const rec = record();
    expect(problemScopedSchemas(rec.world, rec.statements).explanation.safeParse(good).success).toBe(true);
  });

  it("asks one of the named models with a JSON Schema, keeping the transcript out of the cached part", async () => {
    const said = "zz-explain-words-77";
    const client = new FakeClaude([json(good)]);
    await explain(input({ transcript: said }), client);
    const req = client.requests[0];
    expect(Object.values(MODELS)).toContain(req?.model);
    expect(typeof req?.schema).toBe("object");
    expect(req?.userText).toContain(said);
    expect(req?.cachedContext).not.toContain(said);
    expect(req?.system).not.toContain(said);
  });

  it("retries once after an id outside the problem, then returns the second answer", async () => {
    const client = new FakeClaude([json(foreignId), json(good)]);
    const res = await explain(input(), client);
    expect(client.requests).toHaveLength(2);
    expect(res.status).toBe("ok");
  });

  it("retries once after text that is not JSON", async () => {
    const client = new FakeClaude([text("{"), json(good)]);
    expect((await explain(input(), client)).status).toBe("ok");
    expect(client.requests).toHaveLength(2);
  });

  it("asks back after two failed checks, with no third call", async () => {
    const client = new FakeClaude([json(foreignId), json(foreignId), json(good)]);
    const res = await explain(input(), client);
    expect(res.status).toBe("ask_back");
    expect(client.requests).toHaveLength(2);
  });

  it("a zero denominator is a failed check, never ok", async () => {
    const client = new FakeClaude([json(badDen), json(badDen)]);
    expect((await explain(input(), client)).status).toBe("ask_back");
  });

  it("asks back on a refusal without retrying", async () => {
    const client = new FakeClaude([stopped("refusal"), json(good)]);
    expect(await explain(input(), client)).toMatchObject({ status: "ask_back", reason: "refusal" });
    expect(client.requests).toHaveLength(1);
  });

  it("asks back on max_tokens without retrying", async () => {
    const client = new FakeClaude([stopped("max_tokens"), json(good)]);
    expect(await explain(input(), client)).toMatchObject({ status: "ask_back", reason: "max_tokens" });
    expect(client.requests).toHaveLength(1);
  });

  it("asks back on a time out and aborts the call", async () => {
    const client = new FakeClaude([json(good, 400)]);
    expect(await explain(input(), client, { timeoutMs: 40 })).toMatchObject({ status: "ask_back", reason: "timeout" });
    expect(client.requests[0]?.signal?.aborted).toBe(true);
  });

  it("does not return ok when the client keeps throwing", async () => {
    expect((await explain(input(), new FakeClaude([fails()]))).status).not.toBe("ok");
  });
});
