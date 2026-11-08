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
});
