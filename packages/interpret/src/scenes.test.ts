// 指示書 第6.7節 手順5: Opus proposes the two everyday scenes (material and numbers) for the junior's reading;
// core checks the proposal (checkScenePair) and the program's pair (pickScenes) is used whenever it does not
// pass, does not arrive in time, or the call fails. No real API: the client is a fake. Written before the
// implementation.
import { describe, expect, it } from "vitest";
import { COMMON_FRACTION_READINGS, FRACTION_BANK, choiceOf, pickScenes, readingCard, sceneAvoidValues, type SceneProposal } from "@kimi/core";
import { MODELS } from "./client.ts";
import { FakeClaude, fails, json, stopped, text } from "./fake.ts";
import { proposeScenes, type ScenesInput } from "./scenes.ts";

const reading = (id: string) => {
  const h = COMMON_FRACTION_READINGS.find((x) => x.id === id);
  if (h === undefined) throw new Error(id);
  return h;
};
const avoid = sceneAvoidValues(FRACTION_BANK);
const swap = reading("c_swap");
const input = (over: Partial<ScenesInput> = {}): ScenesInput => ({ rule: swap, lang: "ja", wordKinds: ["holder_mention", "relation_word"], avoid, ...over });

/** A proposal core accepts for the swap that is not the program's own pick. */
const claudes: SceneProposal = {
  breaks: { material: "cup_juice", frame: "within", known: "reference", order: "relation_first", known_value: 28, num: 3, den: 4, limit: null },
  keeps: { material: "tank_water", frame: "cap", known: "subject", order: "known_first", known_value: 21, num: 3, den: 4, limit: 29 },
  reason_for_adult: "The cup overflows when the juice is taken as 1; the tanks stay within the limit.",
};

describe("proposeScenes", () => {
  it("uses a proposal that core's check passes, with its reason for adults", async () => {
    const client = new FakeClaude([json(claudes)]);
    const res = await proposeScenes(input(), client);
    expect(res.source).toBe("claude");
    expect(res.proposal?.breaks).toEqual(claudes.breaks);
    expect(res.proposal?.keeps).toEqual(claudes.keeps);
    expect(res.pair?.breaks.underRule.holds).toBe(false);
    expect(res.pair?.keeps.underRule.holds).toBe(true);
    expect(res.reason).toBe(claudes.reason_for_adult);
    const program = pickScenes(swap, avoid);
    expect(res.pair?.breaks.scene.key).not.toBe(program?.breaks.scene.key);
  });

  it("asks Opus once, with a JSON Schema, the card's line and the kinds of the tapped words only", async () => {
    const client = new FakeClaude([json(claudes)]);
    await proposeScenes(input({ lang: "en" }), client);
    expect(client.requests).toHaveLength(1);
    const req = client.requests[0];
    expect(req?.model).toBe(MODELS.build);
    expect(typeof req?.schema).toBe("object");
    const sent = JSON.parse(req?.userText ?? "{}") as Record<string, unknown>;
    expect(sent.card).toBe(readingCard(swap, undefined, "en", { forEdit: true }));
    expect(sent.word_kinds).toEqual(["holder_mention", "relation_word"]);
    expect(Object.keys(sent)).not.toContain("words");
    // The materials are the stable, cached part.
    expect(req?.cachedContext).toContain("cup_juice");
  });

  it("falls back to the program's pair when the proposal does not pass core (roles swapped)", async () => {
    const bad = { ...claudes, breaks: claudes.keeps, keeps: claudes.breaks };
    const res = await proposeScenes(input(), new FakeClaude([json(bad)]));
    const program = pickScenes(swap, avoid);
    expect(res.source).toBe("program");
    expect(res.rejected).toBe("failed_check");
    expect(res.pair?.breaks.scene.key).toBe(program?.breaks.scene.key);
    expect(res.proposal).toEqual({ breaks: choiceOf(program?.breaks as never), keeps: choiceOf(program?.keeps as never) });
    expect(res.reason).toBeNull();
  });

  it("falls back when a proposed number is one to avoid", async () => {
    const leak = { ...claudes, breaks: { ...claudes.breaks, known_value: 16 } };
    const res = await proposeScenes(input(), new FakeClaude([json(leak)]));
    expect(res.source).toBe("program");
  });

  it("falls back on text that is not the schema, a stop, a failure, and a timeout", async () => {
    for (const reply of [text("not json"), json({ breaks: 1 }), stopped("refusal"), fails()]) {
      const res = await proposeScenes(input(), new FakeClaude([reply]));
      expect(res.source).toBe("program");
      expect(res.pair).not.toBeNull();
    }
    const slow = await proposeScenes(input(), new FakeClaude([json(claudes, 200)]), { timeoutMs: 20 });
    expect(slow.source).toBe("program");
    expect(slow.rejected).toBe("timeout");
  });

  it("does not call Claude for a reading that never breaks a scene", async () => {
    const client = new FakeClaude([json(claudes)]);
    const res = await proposeScenes(input({ rule: reading("c_correct") }), client);
    expect(res.source).toBe("none");
    expect(res.pair).toBeNull();
    expect(client.requests).toHaveLength(0);
  });
});
