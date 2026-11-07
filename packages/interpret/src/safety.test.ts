// The safety check with a fake Claude, and the switch to the word list on the device (指示書 第6.2節, 第11節 M1b).
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { MODELS } from "./client.ts";
import { DISTRESS_WORDS, SAFETY_RETRY_TIMEOUT_MS, SAFETY_TIMEOUT_MS, checkSafety } from "./safety.ts";
import { FakeClaude, fails, json, stopped, text } from "./fake.ts";

const flag = (f: "none" | "distress" | "inappropriate") => json({ schema_version: "1", safety_flag: f });
const plain = "あにのきんぎょはろっぴき";

describe("checkSafety: Claude answers", () => {
  it.each(["none", "distress", "inappropriate"] as const)("returns the flag %s from Claude", async (f) => {
    const client = new FakeClaude([flag(f)]);
    expect(await checkSafety(plain, client)).toEqual({ flag: f, source: "claude" });
    expect(client.requests).toHaveLength(1);
  });

  it("asks the listening model with the transcript as the input", async () => {
    const client = new FakeClaude([flag("none")]);
    await checkSafety("zz-said-4321", client);
    const req = client.requests[0];
    expect(req?.model).toBe(MODELS.listen);
    expect(req?.userText).toContain("zz-said-4321");
    expect(req?.cachedContext).not.toContain("zz-said-4321");
    expect(typeof req?.schema).toBe("object");
  });
});

describe("checkSafety: one retry", () => {
  it.each([
    ["a thrown error", fails()],
    ["text that is not JSON", text("nope")],
    ["a flag outside the schema", json({ schema_version: "1", safety_flag: "maybe" })],
    ["max_tokens", stopped("max_tokens")],
  ])("after %s, tries once more and uses the second answer", async (_name, first) => {
    const client = new FakeClaude([first, flag("distress")]);
    expect(await checkSafety(plain, client)).toEqual({ flag: "distress", source: "claude" });
    expect(client.requests).toHaveLength(2);
  });

  it("after a time out, tries once more", async () => {
    const slow = new FakeClaude([json({ schema_version: "1", safety_flag: "none" }, 300), flag("inappropriate")]);
    expect(await checkSafety(plain, slow, { timeoutMs: 50 })).toEqual({ flag: "inappropriate", source: "claude" });
    expect(slow.requests).toHaveLength(2);
    expect(slow.requests[0]?.signal?.aborted).toBe(true);
  });
});

describe("checkSafety: the word list on the device", () => {
  it("both lists are filled", () => {
    expect(DISTRESS_WORDS.ja.length).toBeGreaterThan(0);
    expect(DISTRESS_WORDS.en.length).toBeGreaterThan(0);
    for (const w of [...DISTRESS_WORDS.ja, ...DISTRESS_WORDS.en]) expect(w.trim().length).toBeGreaterThan(0);
  });

  it("after two failures, a word on the list gives distress from the dictionary", async () => {
    const word = DISTRESS_WORDS.ja[0] as string;
    const client = new FakeClaude([fails(), fails(), flag("none")]);
    expect(await checkSafety(`きょうは${word}`, client)).toEqual({ flag: "distress", source: "dictionary" });
    expect(client.requests).toHaveLength(2);
  });

  // Q26: the dictionary misses most oblique and other-language requests for help (EVALS.md), so a
  // miss there is never a sure "none": the screen gets "unchecked" and offers the stop buttons gently.
  it("after two failures, no word on the list gives unchecked (never none) from the dictionary", async () => {
    const client = new FakeClaude([fails(), fails()]);
    expect(await checkSafety(plain, client)).toEqual({ flag: "unchecked", source: "dictionary" });
  });

  it("after two time outs, uses the dictionary", async () => {
    const word = DISTRESS_WORDS.en[0] as string;
    const slow = new FakeClaude([json({ schema_version: "1", safety_flag: "none" }, 300)]);
    expect(await checkSafety(`today ${word}`, slow, { timeoutMs: 40 })).toEqual({ flag: "distress", source: "dictionary" });
    expect(slow.requests).toHaveLength(2);
  });

  it("a refusal to judge is taken as distress at once (Q24: heavy words are often what is declined)", async () => {
    const client = new FakeClaude([stopped("refusal"), stopped("refusal")]);
    expect(await checkSafety(plain, client)).toEqual({ flag: "distress", source: "claude" });
    expect(client.requests).toHaveLength(1);
  });

  it("property: any list word inside any text is distress when Claude never answers", async () => {
    const words = [...DISTRESS_WORDS.ja, ...DISTRESS_WORDS.en];
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...words), fc.string({ maxLength: 10 }), fc.string({ maxLength: 10 }), async (w, before, after) => {
        const res = await checkSafety(`${before} ${w} ${after}`, new FakeClaude([fails()]));
        expect(res).toEqual({ flag: "distress", source: "dictionary" });
      }),
      { numRuns: 80 },
    );
  });

  it("property: English list words are found in any letter case", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...DISTRESS_WORDS.en), fc.boolean(), async (w, upper) => {
        const said = upper ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1);
        const res = await checkSafety(`I ${said}`, new FakeClaude([fails()]));
        expect(res.flag).toBe("distress");
      }),
      { numRuns: 30 },
    );
  });

  it("property: text without any list word is unchecked, never none, when Claude never answers", async () => {
    const words = [...DISTRESS_WORDS.ja, ...DISTRESS_WORDS.en].map((w) => w.toLowerCase());
    const safeText = fc.string({ maxLength: 20 }).filter((s) => {
      const t = s.normalize("NFKC").toLowerCase();
      return !words.some((w) => t.includes(w.normalize("NFKC")));
    });
    await fc.assert(
      fc.asyncProperty(safeText, async (s) => {
        const res = await checkSafety(s, new FakeClaude([fails()]));
        expect(res).toEqual({ flag: "unchecked", source: "dictionary" });
      }),
      { numRuns: 80 },
    );
  });
});

describe("checkSafety: the second try waits longer (a new schema takes about 3 s the first time)", () => {
  it("a first try that times out and a slower second try that answers gives Claude's flag", async () => {
    let calls = 0;
    const client = {
      complete: async (req: { signal?: AbortSignal }) => {
        calls++;
        const wait = calls === 1 ? SAFETY_TIMEOUT_MS + 200 : SAFETY_TIMEOUT_MS + 500;
        await new Promise((r) => setTimeout(r, wait));
        if (req.signal?.aborted === true) throw new Error("aborted");
        return { stopReason: "end_turn" as const, text: JSON.stringify({ schema_version: "1", safety_flag: "none" }) };
      },
    };
    expect(SAFETY_RETRY_TIMEOUT_MS).toBeGreaterThan(SAFETY_TIMEOUT_MS + 500);
    expect(await checkSafety("きょうはたのしかった", client)).toEqual({ flag: "none", source: "claude" });
  }, 15_000);
});
