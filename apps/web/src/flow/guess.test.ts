// 指示書 第7.1節 手順2, 第6.7節 手順2 (i): the child's own first prediction, before the junior shows its world. The
// child reads the problem, may put the "1" card on one of two plain outlines, and taps who has more (or "not
// yet"). Nothing judges it; core observes it. Written before the implementation.
import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import { COMMON_FRACTION_READINGS, initialState, observePrediction, revisePool, FRACTION_BANK, type ResearchState } from "@kimi/core";
import { flowMachine, guessHolders, helpHolders, predictionOrder, type FlowInput, type ProblemState } from "./machine.ts";
import { childTexts, viewOf } from "./view.ts";
import { hasForbiddenPhrase } from "./text.ts";

const ANI = "h_ani";
const OTOUTO = "h_otouto";

function run(input: FlowInput = { introSeen: true, consented: true }) {
  const actor = createActor(flowMachine, { input });
  actor.start();
  return actor;
}

/** A pool of three common readings, so the observation has something to move. */
function pooled(): ResearchState {
  const hs = COMMON_FRACTION_READINGS.filter((h) => ["c_correct", "c_swap", "c_invert"].includes(h.id));
  const sign = FRACTION_BANK.find((r) => r.world.problem_id === "p_signboard");
  if (sign === undefined) throw new Error("no signboard");
  return revisePool(initialState(), hs.map((hypothesis) => ({ kind: "add" as const, hypothesis })), [sign]).state;
}

describe("the child's first prediction (before the junior's world)", () => {
  it("opens every problem on it: no junior's world, no junior's line, plain outlines with no lengths or segments", () => {
    const actor = run();
    const s = actor.getSnapshot();
    expect(s.matches({ active: { problem: "guess" } })).toBe(true);
    const v = viewOf(s);
    expect(v.screen).toBe("guess");
    if (v.screen !== "guess") return;
    expect(v.line).toBeNull();
    expect(v.statements.length).toBeGreaterThan(0);
    // One outline per end of the relation, all the same; only the problem's own number or "？" on them.
    expect(v.tapes.map((t) => t.holderId).sort()).toEqual([ANI, OTOUTO]);
    for (const t of v.tapes) expect(["？", "6匹"]).toContain(t.value);
    expect(v.tapes.find((t) => t.holderId === OTOUTO)?.value).toBe("？");
    expect(v.choices.map((c) => c.holderId)).toEqual([ANI, OTOUTO, null]);
    expect(v.one).toBeNull();
    for (const t of childTexts(v)) expect(hasForbiddenPhrase(t), t).toBe(false);
    expect(childTexts(v).join("")).toContain("どっちが多い");
  });

  it("the 1 card may go on an outline, move, or come off; a holder that is not an end is refused", () => {
    const actor = run();
    actor.send({ type: "GUESS_ONE", holderId: ANI });
    expect(actor.getSnapshot().context.problem?.guessOne).toBe(ANI);
    actor.send({ type: "GUESS_ONE", holderId: "h_nobody" });
    expect(actor.getSnapshot().context.problem?.guessOne).toBe(ANI);
    actor.send({ type: "GUESS_ONE", holderId: OTOUTO });
    expect(actor.getSnapshot().context.problem?.guessOne).toBe(OTOUTO);
    const v = viewOf(actor.getSnapshot());
    expect(v.screen === "guess" && v.one).toBe(OTOUTO);
    actor.send({ type: "GUESS_ONE", holderId: null });
    expect(actor.getSnapshot().context.problem?.guessOne).toBeNull();
    expect(actor.getSnapshot().matches({ active: { problem: "guess" } })).toBe(true);
  });

  it("one tap on who has more moves on to the junior's world; the answer and the card are kept and logged", () => {
    const actor = run({ introSeen: true, consented: true, maxProblems: 1 });
    actor.send({ type: "GUESS_ONE", holderId: ANI });
    actor.send({ type: "GUESS", larger: ANI });
    const s = actor.getSnapshot();
    expect(s.matches({ active: { problem: "reading" } })).toBe(true);
    expect(s.context.problem?.guess).toEqual({ larger: ANI, oneOn: ANI });
    const v = viewOf(s);
    expect(v.screen === "problem" && v.line).toMatch(/読/);
    actor.send({ type: "STOP" });
    expect(actor.getSnapshot().context.log[0]?.guess).toEqual({ larger: ANI, oneOn: ANI });
  });

  it("a second answer, or a holder that is not an end, is refused", () => {
    const actor = run();
    actor.send({ type: "GUESS", larger: "h_nobody" });
    expect(actor.getSnapshot().matches({ active: { problem: "guess" } })).toBe(true);
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "GUESS", larger: ANI });
    expect(actor.getSnapshot().context.problem?.guess).toEqual({ larger: null, oneOn: null });
  });

  it("is observed by core's observePrediction, with the card as the 1", () => {
    const research = pooled();
    const actor = run({ introSeen: true, consented: true, research });
    const record = actor.getSnapshot().context.problem?.record;
    actor.send({ type: "GUESS_ONE", holderId: OTOUTO });
    actor.send({ type: "GUESS", larger: ANI });
    const expected = observePrediction(research, { record: record as never, larger: ANI, oneOn: OTOUTO });
    expect(actor.getSnapshot().context.research.weights).toEqual(expected.weights);
    expect(actor.getSnapshot().context.research.weights).not.toEqual(research.weights);
  });

  it("「まだわからない」 with no card observes nothing", () => {
    const research = pooled();
    const actor = run({ introSeen: true, consented: true, research });
    actor.send({ type: "GUESS", larger: null });
    expect(actor.getSnapshot().context.research).toEqual(research);
    expect(actor.getSnapshot().matches({ active: { problem: "reading" } })).toBe(true);
  });

  it("whatever the answer, the junior says the same and shows the same world (nothing judges it)", () => {
    const shown = [ANI, OTOUTO, null].map((larger) => {
      const actor = run();
      actor.send({ type: "GUESS", larger });
      const v = viewOf(actor.getSnapshot());
      if (v.screen !== "problem") throw new Error("not on the problem");
      return JSON.stringify([v.line, v.world, v.statements]);
    });
    expect(new Set(shown).size).toBe(1);
  });

  it("the research request of the first problem carries the child's world from the card placed in the prediction", () => {
    const actor = run();
    actor.send({ type: "GUESS_ONE", holderId: ANI });
    actor.send({ type: "GUESS", larger: ANI });
    actor.send({ type: "PREDICT", answer: "odd" });
    const p = actor.getSnapshot().context.problem;
    const rel = p?.record.world.relations[0];
    actor.send({ type: "PLACE_ONE", quantityId: rel?.reference as string });
    actor.send({ type: "CONFIRM_YES" });
    const req = actor.getSnapshot().context.researchRequest;
    expect(req?.readings).toHaveLength(2);
    const first = req?.readings[0];
    const ref = first?.childWorld.relations[0]?.reference;
    expect(first?.childWorld.quantities.find((q) => q.id === ref)?.holder).toBe(ANI);
    expect(first?.words).toEqual([]);
    expect(req?.unscored).toBe(2);
  });

  it("without a card, the request carries the first placement only", () => {
    const actor = run();
    actor.send({ type: "GUESS", larger: ANI });
    actor.send({ type: "PREDICT", answer: "odd" });
    const rel = actor.getSnapshot().context.problem?.record.world.relations[0];
    actor.send({ type: "PLACE_ONE", quantityId: rel?.reference as string });
    actor.send({ type: "CONFIRM_YES" });
    expect(actor.getSnapshot().context.researchRequest?.readings).toHaveLength(1);
  });

  it("「わからない」 opens the waiting screen and comes back to the prediction; stop and 「つらい」 work here", () => {
    const a = run();
    a.send({ type: "DONT_KNOW" });
    expect(viewOf(a.getSnapshot()).screen).toBe("stuck");
    a.send({ type: "RESUME" });
    expect(a.getSnapshot().matches({ active: { problem: "guess" } })).toBe(true);
    a.send({ type: "STOP" });
    expect(a.getSnapshot().context.endedBy).toBe("stop");
    expect(a.getSnapshot().context.log[0]?.guess).toBeNull();
    const b = run();
    b.send({ type: "HARD" });
    expect(viewOf(b.getSnapshot()).screen).toBe("hard");
  });

  it("speaks English on the English screen, with no forbidden phrase", () => {
    const v = viewOf(run({ introSeen: true, consented: true, lang: "en" }).getSnapshot());
    expect(v.screen).toBe("guess");
    if (v.screen !== "guess") return;
    expect(v.question).toMatch(/more/i);
    expect(v.choices.at(-1)?.label).toMatch(/not sure/i);
    for (const t of childTexts(v)) expect(hasForbiddenPhrase(t), t).toBe(false);
  });
});

describe("the order of the holder buttons (safety review, 2026-11-07)", () => {
  // In the order the problem names them, the holder with more sat second on 9 of 13 problems: a child who always
  // taps the second button would be recorded as reading correctly. The order flips with the problem's number, as
  // the prediction buttons do, so no holder keeps one place.
  const stub = (record: (typeof FRACTION_BANK)[number], n: number): ProblemState =>
    ({ record, relationId: record.world.relations[0]?.id ?? "", predictionOrder: predictionOrder(n) }) as unknown as ProblemState;

  it.each(FRACTION_BANK.map((r) => [r.world.problem_id, r] as const))("%s: flips between one problem and the next", (_id, r) => {
    const first = guessHolders(stub(r, 1));
    expect(first).toHaveLength(2);
    expect(guessHolders(stub(r, 2))).toEqual([...first].reverse());
    expect(guessHolders(stub(r, 3))).toEqual(first);
  });

  it("the help's \"which is longer?\" buttons use the same order", () => {
    const r = FRACTION_BANK[0];
    if (r === undefined) throw new Error("empty bank");
    for (const n of [1, 2]) expect(helpHolders(stub(r, n))).toEqual(guessHolders(stub(r, n)));
  });
});

describe("the junior's first line is made once (safety review, 2026-11-07)", () => {
  it("going to \"don't know\" and back to the junior's world keeps the same line (no new request)", () => {
    const a = run();
    a.send({ type: "GUESS", larger: null });
    expect(a.getSnapshot().matches({ active: { problem: "reading" } })).toBe(true);
    const seq = a.getSnapshot().context.line?.seq;
    expect(seq).toBeDefined();
    a.send({ type: "DONT_KNOW" });
    a.send({ type: "RESUME" });
    expect(a.getSnapshot().matches({ active: { problem: "reading" } })).toBe(true);
    expect(a.getSnapshot().context.line?.seq).toBe(seq);
    a.stop();
  });
});
