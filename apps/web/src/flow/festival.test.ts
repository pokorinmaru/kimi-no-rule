// The festival story the child's route opens with (Q60): AI-kun reads it as 6 x 3/4 and scoops four and a half
// goldfish; a fix that makes every sentence fit goes straight to the rebuilt world (no word book by itself there).
import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import { CHILD_FIRST_PROBLEM_ID, PREPARED_BANK } from "@kimi/core";
import { flowMachine } from "./machine.ts";

function run() {
  const actor = createActor(flowMachine, { input: { introSeen: true, consented: true, bank: PREPARED_BANK, firstProblemId: CHILD_FIRST_PROBLEM_ID } });
  actor.start();
  actor.send({ type: "GUESS", larger: null });
  actor.send({ type: "PREDICT", answer: "odd" });
  return actor;
}

describe("the festival story", () => {
  it("opens the child's route, with AI-kun's world that does not fit", () => {
    const p = run().getSnapshot().context.problem;
    expect(p?.record.world.problem_id).toBe("p_festival");
    expect(p?.shown.failing.length).toBeGreaterThan(0);
  });

  it("a fix that makes every sentence fit goes straight to the rebuilt world", () => {
    const actor = run();
    actor.send({ type: "PLACE_ONE", quantityId: "q_ai" });
    actor.send({ type: "CONFIRM_YES" });
    const s = actor.getSnapshot();
    expect(s.context.problem?.shown.failing).toEqual([]);
    expect(s.matches({ active: { problem: "rebuilt" } })).toBe(true);
  });

  // Code review, 2026-11-08: the story's wording, met without its book, does not make the next 「の」 problem old.
  it("the next problem with the same wording still opens the book after its first fix", () => {
    const actor = run();
    actor.send({ type: "PLACE_ONE", quantityId: "q_ai" });
    actor.send({ type: "CONFIRM_YES" });
    actor.send({ type: "NEXT" });
    actor.send({ type: "ANSWER_UNIT", value: { num: 2, den: 1 } });
    actor.send({ type: "ANSWER_TOTAL", value: { num: 8, den: 1 } });
    expect(actor.getSnapshot().matches({ active: { problem: "solved" } })).toBe(true);
    actor.send({ type: "NEXT" });
    // The research layer may be asked after the first problem; with no answer it goes on with the common readings.
    if (actor.getSnapshot().context.problem?.record.world.problem_id === "p_festival") actor.send({ type: "RESEARCH_RESULT", pool: null });
    const snap = actor.getSnapshot();
    const next = snap.context.problem;
    if (next === null || next.record.world.problem_id === "p_festival") throw new Error(`no second problem: ${JSON.stringify(snap.value)}`);
    expect(snap.context.wordbookOpened).toEqual([]);
    if (next.pages[0] === "no") expect(next.newWording).toBe(true);
  });
});
