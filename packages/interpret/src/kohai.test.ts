// The junior speaking through a fake Claude: generated text only after the gates, a fixed sentence
// otherwise (指示書 第6.8節, 第11節 M1b).
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { TEMPLATES, gate, type KohaiUtterance } from "@kimi/core";
import { MODELS } from "./client.ts";
import { kohai, kohaiGates, type KohaiInput, type KohaiIntent } from "./kohai.ts";
import { FakeClaude, fails, json, stopped, text } from "./fake.ts";
import { CORRECT_MARKER, READ_OK, RESTATE_OK, WHICH_OK, gateCtx, kohaiWorld, record, requestText } from "./test-support.ts";

function input(intent: KohaiIntent, over: Partial<KohaiInput> = {}): KohaiInput {
  return {
    intent,
    lang: "ja",
    kohaiWorld: kohaiWorld(),
    statements: record().statements,
    childOps: { holderIds: ["h_otouto"], words: ["の"] },
    ...over,
  };
}

/** The fixed sentences of one intent, with the holder filled in as the child placed it. */
function fixed(intent: KohaiIntent, lang: "ja" | "en" = "ja", holder = "弟"): string[] {
  const key = intent === "read" ? "kohai.read" : intent === "which" ? "kohai.which" : "kohai.restate";
  return TEMPLATES[key][lang].map((v: string) => v.replaceAll("{holder}", holder));
}

const leak: KohaiUtterance = { intent: "read", utterance: "この読み方だと、弟の金魚は8匹です。", refers_to: ["q_otouto"], lang: "ja" };

describe("kohai: generated text that passes", () => {
  it.each([
    ["read", READ_OK],
    ["which", WHICH_OK],
    ["restate", RESTATE_OK],
  ] as const)("says the generated %s sentence", async (intent, u) => {
    const res = await kohai(input(intent), new FakeClaude([json(u)]), gateCtx());
    expect(res).toEqual({ text: u.utterance, source: "generated", rejected: [] });
  });

  it("asks the junior model with a JSON Schema for the output", async () => {
    const client = new FakeClaude([json(READ_OK)]);
    await kohai(input("read"), client, gateCtx());
    expect(client.requests).toHaveLength(1);
    expect(client.requests[0]?.model).toBe(MODELS.kohai);
    expect(typeof client.requests[0]?.schema).toBe("object");
  });
});

describe("kohai: a fixed sentence instead", () => {
  it("a sentence stopped by a gate becomes the fixed sentence of the same intent, with the rule kept", async () => {
    const res = await kohai(input("read"), new FakeClaude([json(leak)]), gateCtx());
    expect(res.source).toBe("template");
    expect(fixed("read")).toContain(res.text);
    expect(res.rejected).toContain("answer_leak");
    expect(res.rejected).toEqual(kohaiGates(leak, input("read"), gateCtx()));
  });

  it("which falls back to the which sentences", async () => {
    const bad: KohaiUtterance = { ...WHICH_OK, utterance: "惜しいです。どの文が合わないでしょう？" };
    const res = await kohai(input("which"), new FakeClaude([json(bad)]), gateCtx());
    expect(res.source).toBe("template");
    expect(fixed("which")).toContain(res.text);
    expect(res.rejected).toContain("judging");
  });

  it("restate falls back to the restate sentence about the holder the child touched", async () => {
    const bad: KohaiUtterance = { ...RESTATE_OK, utterance: "弟が「1」、ですね。", refers_to: ["h_otouto"] };
    const res = await kohai(input("restate"), new FakeClaude([json(bad)]), gateCtx());
    expect(res.source).toBe("template");
    expect(fixed("restate", "ja", "弟")).toContain(res.text);
  });

  it("restate about the older brother names the older brother", async () => {
    const inp = input("restate", { childOps: { holderIds: ["h_ani"], words: [] } });
    const res = await kohai(inp, new FakeClaude([stopped("refusal")]), gateCtx());
    expect(fixed("restate", "ja", "兄")).toContain(res.text);
  });

  it("in English, falls back to the English sentences", async () => {
    const res = await kohai(input("read", { lang: "en" }), new FakeClaude([json(READ_OK)]), gateCtx("en"));
    expect(res.source).toBe("template");
    expect(fixed("read", "en")).toContain(res.text);
  });

  it.each([
    ["a refusal", stopped("refusal")],
    ["max_tokens", stopped("max_tokens")],
    ["a thrown error", fails()],
    ["text that is not JSON", text("{")],
    ["an utterance outside the schema", json({ intent: "read", utterance: "", refers_to: [], lang: "ja" })],
    ["an intent other than the one asked", json(WHICH_OK)],
  ])("after %s, says the fixed sentence", async (_name, reply) => {
    const res = await kohai(input("read"), new FakeClaude([reply]), gateCtx());
    expect(res.source).toBe("template");
    expect(fixed("read")).toContain(res.text);
  });

  it("after a time out, says the fixed sentence and aborts the call", async () => {
    const client = new FakeClaude([json(READ_OK, 400)]);
    const res = await kohai(input("read"), client, gateCtx(), { timeoutMs: 40 });
    expect(res.source).toBe("template");
    expect(fixed("read")).toContain(res.text);
    expect(client.requests[0]?.signal?.aborted).toBe(true);
  });

  describe.concurrent("the default limit is 4000 ms", () => {
    it("an answer after 4300 ms is too late", { timeout: 10_000 }, async () => {
      const started = Date.now();
      const res = await kohai(input("read"), new FakeClaude([json(READ_OK, 4300)]), gateCtx());
      expect(res.source).toBe("template");
      expect(Date.now() - started).toBeLessThan(4300);
    });

    it("an answer after 3700 ms is in time", { timeout: 10_000 }, async () => {
      const res = await kohai(input("read"), new FakeClaude([json(READ_OK, 3700)]), gateCtx());
      expect(res.source).toBe("generated");
    });
  });

  it("the fixed sentence itself passes the general gate (no answer, no operation name)", async () => {
    for (const intent of ["read", "which", "restate"] as const) {
      const res = await kohai(input(intent), new FakeClaude([stopped("refusal")]), gateCtx());
      expect(gate({ kind: "say", text: res.text }, gateCtx())).toEqual({ ok: true });
    }
  });

  it("property: whatever is generated, a generated result passes all ten gates, and the answer never comes out", async () => {
    const pool = [
      READ_OK.utterance,
      leak.utterance,
      "弟の金魚は、はっぴきです。",
      "その読み方は正しいです。",
      "ぼくは、弟のテープが短いと思いました。",
      "6に3/4をかけると、こうなります。",
      "本当は、弟のテープが長いです。",
    ];
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...pool), fc.subarray(["q_otouto", "q_ani", "h_nobody"]), async (t, refs) => {
        const u: KohaiUtterance = { intent: "read", utterance: t, refers_to: refs, lang: "ja" };
        const res = await kohai(input("read"), new FakeClaude([json(u)]), gateCtx());
        if (res.source === "generated") {
          expect(kohaiGates(u, input("read"), gateCtx())).toEqual([]);
          expect(res.text).toBe(t);
        } else {
          expect(fixed("read")).toContain(res.text);
          expect(res.rejected.length).toBeGreaterThan(0);
        }
        expect(res.text).not.toMatch(/8|八|はっぴき|はち/);
      }),
      { numRuns: 60 },
    );
  });
});

describe("kohai: what the generator is not given", () => {
  it.each(["read", "which", "restate"] as const)("(%s) no correct world, no answer, no verdict", async (intent) => {
    const client = new FakeClaude([json(READ_OK)]);
    await kohai(input(intent), client, gateCtx());
    const sent = requestText(client.requests[0] as object);
    // The junior world is there.
    expect(sent).toContain("h_otouto");
    // The correct world is not: its marker, its answer 8 in any notation, the expected answer, the verdict fields.
    expect(sent).not.toContain(CORRECT_MARKER);
    expect(sent).not.toMatch(/(?<![0-9])8(?![0-9])|八|はち|はっぴき/);
    expect(sent).not.toContain("expected_answer");
    expect(sent).not.toContain("consistency");
  });

  it("the words the child said aloud are not sent, even when the gate context has them", async () => {
    const ctx = gateCtx();
    ctx.childSaid = { numbers: [], words: ["zz-said-aloud-99"] };
    const client = new FakeClaude([json(READ_OK)]);
    await kohai(input("read"), client, ctx);
    expect(requestText(client.requests[0] as object)).not.toContain("zz-said-aloud-99");
  });
});
