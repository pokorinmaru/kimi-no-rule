// Interpreting the turn of the child with a fake Claude (指示書 第6.1節, 第11節 M1b).
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { problemScopedSchemas, validateOps, type AnyOp } from "@kimi/core";
import { MODELS } from "./client.ts";
import { interpret, type InterpretInput } from "./interpret.ts";
import { FakeClaude, fails, json, stopped, text } from "./fake.ts";
import { fingerReference, interpretationOf, record, requestText } from "./test-support.ts";

function input(over: Partial<InterpretInput> = {}): InterpretInput {
  return {
    record: record(),
    transcript: "おとうとのほうがおおいとおもう",
    fingerOps: [],
    wordCues: [],
    lang: "ja",
    ...over,
  };
}

const goodOps: AnyOp[] = [{ op: "set_relation_reference", target_id: "r_ratio", reference: "q_otouto", evidence: "おとうと" }];
const good = interpretationOf(goodOps);
/** Fails the per-problem shape: the id is not in this problem. */
const badShape = interpretationOf([{ op: "swap_relation_direction", target_id: "r_nowhere", evidence: "" }] as AnyOp[]);
/** Passes the shape but not the meaning check: a zero denominator. */
const badMeaning = interpretationOf([
  { op: "set_relation_amount", target_id: "r_ratio", number: { num: 3, den: 0 }, evidence: "" },
]);

describe("interpret: a good answer", () => {
  it("returns the interpretation when it passes both checks", async () => {
    const client = new FakeClaude([json(good)]);
    const res = await interpret(input(), client);
    expect(res).toEqual({ status: "ok", interpretation: good, claudeUsed: true });
    expect(client.requests).toHaveLength(1);
  });

  it("asks the listening model, with low effort and a JSON Schema for the output", async () => {
    const client = new FakeClaude([json(good)]);
    await interpret(input(), client);
    const req = client.requests[0];
    expect(req?.model).toBe(MODELS.listen);
    expect(req?.effort).toBe("low");
    expect(req?.maxTokens).toBeGreaterThan(0);
    expect(typeof req?.schema).toBe("object");
    // The schema is narrowed to this problem: its ids are listed, a foreign id is not.
    const schemaText = JSON.stringify(req?.schema);
    expect(schemaText).toContain("r_ratio");
    expect(schemaText).toContain("q_otouto");
    expect(schemaText).not.toContain("r_nowhere");
  });

  it("still calls Claude when there is no voice and no tapped word (fingers only)", async () => {
    const client = new FakeClaude([json(interpretationOf([fingerReference]))]);
    const res = await interpret(input({ transcript: null, fingerOps: [fingerReference], wordCues: [] }), client);
    expect(client.requests).toHaveLength(1);
    expect(res.status).toBe("ok");
  });
});

describe("interpret: failed checks and the one retry", () => {
  it("retries once after a shape failure and returns the second answer", async () => {
    const client = new FakeClaude([json(badShape), json(good)]);
    const res = await interpret(input(), client);
    expect(client.requests).toHaveLength(2);
    expect(res).toEqual({ status: "ok", interpretation: good, claudeUsed: true });
  });

  it("retries once after a meaning failure and returns the second answer", async () => {
    const client = new FakeClaude([json(badMeaning), json(good)]);
    const res = await interpret(input(), client);
    expect(client.requests).toHaveLength(2);
    expect(res.status).toBe("ok");
  });

  it("retries once after text that is not JSON", async () => {
    const client = new FakeClaude([text("not json {"), json(good)]);
    const res = await interpret(input(), client);
    expect(client.requests).toHaveLength(2);
    expect(res.status).toBe("ok");
  });

  it.each([
    ["shape, shape", [json(badShape), json(badShape)]],
    ["meaning, meaning", [json(badMeaning), json(badMeaning)]],
    ["shape, meaning", [json(badShape), json(badMeaning)]],
    ["not json, not json", [text("..."), text("{")]],
  ])("asks back after two failures (%s) and never calls a third time", async (_name, replies) => {
    const client = new FakeClaude([...replies, json(good)]);
    const res = await interpret(input(), client);
    expect(client.requests).toHaveLength(2);
    expect(res).toMatchObject({ status: "ask_back", reason: "invalid" });
  });

  it("property: whatever comes back twice, an ok result always passes the per-problem shape and the meaning check", async () => {
    const opArb = fc.oneof(
      fc.record({ op: fc.constant("swap_relation_direction"), target_id: fc.constantFrom("r_ratio", "r_x", "q_ani"), evidence: fc.constant("") }),
      fc.record({
        op: fc.constant("set_relation_amount"),
        target_id: fc.constantFrom("r_ratio", "r_x"),
        number: fc.record({ num: fc.integer({ min: -3, max: 9 }), den: fc.integer({ min: -1, max: 4 }) }),
        evidence: fc.constant(""),
      }),
      fc.record({ op: fc.constant("set_quantity"), target_id: fc.constantFrom("q_ani", "q_otouto", "q_x"), number: fc.constant({ num: 6, den: 1 }), evidence: fc.constant("") }),
    );
    const replyArb = fc.array(opArb, { maxLength: 3 }).map((ops) => json(interpretationOf(ops as AnyOp[])));
    await fc.assert(
      fc.asyncProperty(replyArb, replyArb, async (a, b) => {
        const res = await interpret(input(), new FakeClaude([a, b]));
        if (res.status === "ok") {
          const rec = record();
          const scoped = problemScopedSchemas(rec.world, rec.statements);
          expect(scoped.interpretation.safeParse(res.interpretation).success).toBe(true);
          expect(validateOps(rec.world, res.interpretation.ops as AnyOp[]).ok).toBe(true);
        } else {
          expect(res).toMatchObject({ status: "ask_back", reason: "invalid" });
        }
      }),
      { numRuns: 60 },
    );
  });
});

describe("interpret: stop reasons", () => {
  it("asks back on a refusal without retrying", async () => {
    const client = new FakeClaude([stopped("refusal"), json(good)]);
    const res = await interpret(input(), client);
    expect(res).toMatchObject({ status: "ask_back", reason: "refusal" });
    expect(client.requests).toHaveLength(1);
  });

  it("asks back when the answer was cut at max_tokens, without retrying", async () => {
    const client = new FakeClaude([stopped("max_tokens"), json(good)]);
    const res = await interpret(input(), client);
    expect(res).toMatchObject({ status: "ask_back", reason: "max_tokens" });
    expect(client.requests).toHaveLength(1);
  });

  it("does not return ok when the client keeps throwing", async () => {
    const res = await interpret(input(), new FakeClaude([fails(), fails()]));
    expect(res.status).not.toBe("ok");
  });
});

describe("interpret: running out of time", () => {
  it("with finger ops, returns the finger ops alone, marked as not using Claude", async () => {
    const client = new FakeClaude([json(good, 500)]);
    const res = await interpret(input({ fingerOps: [fingerReference] }), client, { timeoutMs: 50 });
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.claudeUsed).toBe(false);
    expect(res.interpretation.ops).toEqual([fingerReference]);
    expect(res.interpretation.phrases).toEqual([]);
    const rec = record();
    expect(problemScopedSchemas(rec.world, rec.statements).interpretation.safeParse(res.interpretation).success).toBe(true);
  });

  it("without finger ops, asks back with the reason timeout", async () => {
    const res = await interpret(input(), new FakeClaude([json(good, 500)]), { timeoutMs: 50 });
    expect(res).toMatchObject({ status: "ask_back", reason: "timeout" });
  });

  it("the limit covers the retry too: a slow retry after a failure runs out of time", async () => {
    const client = new FakeClaude([json(badShape, 60), json(good, 120)]);
    const started = Date.now();
    const res = await interpret(input(), client, { timeoutMs: 100 });
    expect(Date.now() - started).toBeLessThan(170);
    expect(res).toMatchObject({ status: "ask_back", reason: "timeout" });
  });

  it("aborts the call it gave up on", async () => {
    const client = new FakeClaude([json(good, 500)]);
    await interpret(input(), client, { timeoutMs: 50 });
    expect(client.requests[0]?.signal).toBeDefined();
    expect(client.requests[0]?.signal?.aborted).toBe(true);
  });

  describe.concurrent("the default limit is 3500 ms", () => {
    it("an answer after 3700 ms is too late", { timeout: 10_000 }, async () => {
      const started = Date.now();
      const res = await interpret(input(), new FakeClaude([json(good, 3700)]));
      expect(res).toMatchObject({ status: "ask_back", reason: "timeout" });
      expect(Date.now() - started).toBeLessThan(3700);
    });

    it("an answer after 3200 ms is in time", { timeout: 10_000 }, async () => {
      const res = await interpret(input(), new FakeClaude([json(good, 3200)]));
      expect(res.status).toBe("ok");
    });
  });
});

describe("interpret: never against the fingers", () => {
  it("an answer that leaves out the finger op counts as a failed check", async () => {
    const swapped = interpretationOf([{ op: "swap_relation_direction", target_id: "r_ratio", evidence: "" }]);
    const client = new FakeClaude([json(swapped), json(swapped)]);
    const res = await interpret(input({ fingerOps: [fingerReference] }), client);
    expect(client.requests).toHaveLength(2);
    expect(res).toMatchObject({ status: "ask_back", reason: "invalid" });
  });

  it("an answer whose op points at another target counts as a failed check, then the retry can fix it", async () => {
    const elsewhere = interpretationOf([{ op: "set_quantity", target_id: "q_ani", number: { num: 6, den: 1 }, evidence: "" }]);
    const client = new FakeClaude([json(elsewhere), json(interpretationOf([fingerReference]))]);
    const res = await interpret(input({ fingerOps: [fingerReference] }), client);
    expect(client.requests).toHaveLength(2);
    expect(res.status).toBe("ok");
  });

  // Ops the fingers can make on the signboard world, each on its own (op, target).
  const pool: AnyOp[] = [
    fingerReference,
    { op: "swap_relation_direction", target_id: "r_ratio", evidence: "" },
    { op: "set_quantity", target_id: "q_otouto", number: { num: 9, den: 2 }, evidence: "" },
    { op: "set_quantity", target_id: "q_ani", number: { num: 6, den: 1 }, evidence: "" },
    { op: "set_relation_operator", target_id: "r_ratio", operator: "less_by", evidence: "" },
  ];
  const key = (o: AnyOp) => `${o.op}:${"target_id" in o ? o.target_id : ""}`;

  it("property: when the answer holds every finger op, the result is ok and holds them all", async () => {
    await fc.assert(
      fc.asyncProperty(fc.subarray(pool, { minLength: 1 }), fc.subarray(pool), fc.boolean(), async (fingers, extra, reverse) => {
        const ops = [...fingers, ...extra.filter((e) => !fingers.includes(e))];
        if (reverse) ops.reverse();
        const res = await interpret(input({ fingerOps: fingers }), new FakeClaude([json(interpretationOf(ops))]));
        expect(res.status).toBe("ok");
        if (res.status !== "ok") return;
        const got = new Set(res.interpretation.ops.map((o) => key(o as AnyOp)));
        for (const f of fingers) expect(got.has(key(f))).toBe(true);
      }),
      { numRuns: 40 },
    );
  });

  it("property: when the answer misses a finger op both times, the result is never ok", async () => {
    await fc.assert(
      fc.asyncProperty(fc.subarray(pool, { minLength: 1 }), fc.nat(), async (fingers, pick) => {
        const missing = fingers[pick % fingers.length] as AnyOp;
        const ops = pool.filter((o) => key(o) !== key(missing));
        const reply = json(interpretationOf(ops));
        const res = await interpret(input({ fingerOps: fingers }), new FakeClaude([reply, reply]));
        expect(res).toMatchObject({ status: "ask_back", reason: "invalid" });
      }),
      { numRuns: 40 },
    );
  });
});

describe("interpret: the words of the child go last, outside the cached part", () => {
  it("the transcript is in the last part and not in the cached part", async () => {
    const said = "zz-child-words-1234";
    const client = new FakeClaude([json(good)]);
    await interpret(input({ transcript: said }), client);
    const req = client.requests[0];
    expect(req?.userText).toContain(said);
    expect(req?.cachedContext).not.toContain(said);
    expect(req?.system).not.toContain(said);
  });

  it("the cached part carries the world of the problem", async () => {
    const client = new FakeClaude([json(good)]);
    await interpret(input(), client);
    expect(client.requests[0]?.cachedContext).toContain("p_signboard");
  });

  it("property: system and cached part stay the same for one problem whatever the child said or did", async () => {
    const cueArb = fc.array(
      fc.record({ statement_index: fc.constantFrom(0, 1, 2), tokens: fc.array(fc.nat({ max: 6 }), { maxLength: 2 }) }),
      { maxLength: 2 },
    );
    const sayArb = fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null });
    const first = new FakeClaude([json(good)]);
    await interpret(input(), first);
    const base = first.requests[0];
    await fc.assert(
      fc.asyncProperty(sayArb, fc.subarray([fingerReference]), cueArb, async (said, fingers, cues) => {
        const client = new FakeClaude([json(interpretationOf([fingerReference]))]);
        await interpret(input({ transcript: said, fingerOps: fingers, wordCues: cues }), client);
        const req = client.requests[0];
        expect(req?.system).toBe(base?.system);
        expect(req?.cachedContext).toBe(base?.cachedContext);
      }),
      { numRuns: 50 },
    );
  });

  it("the retry also sends the transcript only in the last part", async () => {
    const said = "zz-child-words-5678";
    const client = new FakeClaude([json(badShape), json(good)]);
    await interpret(input({ transcript: said }), client);
    expect(client.requests).toHaveLength(2);
    for (const req of client.requests) {
      expect(req.userText).toContain(said);
      expect(requestText({ ...req, userText: "" })).not.toContain(said);
    }
  });
});

describe("the fingers' ops are matched by content, not by the order of their keys (found in review)", () => {
  it("a finger op written with its keys in another order still matches Claude's op", async () => {
    const reordered = { evidence: "", reference: "q_otouto", target_id: "r_ratio", op: "set_relation_reference" } as unknown as AnyOp;
    const client = new FakeClaude([json(interpretationOf([fingerReference]))]);
    const input: InterpretInput = { record: record(), transcript: "弟", fingerOps: [reordered], wordCues: [], lang: "ja" };
    expect((await interpret(input, client)).status).toBe("ok");
  });
});
