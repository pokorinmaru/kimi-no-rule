// 「この問題をさいしょから」 (Q60): the child can go back to the start of the problem they are on, from any step of it,
// and nothing they did on it stays (the card, the words, the prediction, the junior's world after a fix). The problem
// itself, its reading and the other problems already done stay the same. Once the problem is logged (solved or left),
// there is nothing to restart.
import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import { flowMachine } from "./machine.ts";

function run() {
  const actor = createActor(flowMachine, { input: { introSeen: true, consented: true } });
  actor.start();
  return actor;
}

describe("RESTART_PROBLEM", () => {
  it("takes the child from the middle of a problem back to its first step, with nothing kept", () => {
    const actor = run();
    const first = actor.getSnapshot().context.problem;
    if (first === null) throw new Error("no problem");
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "PREDICT", answer: "odd" });
    const rel = first.record.world.relations.find((x) => x.id === first.relationId);
    actor.send({ type: "TAP_WORD", statementIndex: 1, token: 0 });
    actor.send({ type: "PLACE_ONE", quantityId: rel?.reference as string });
    actor.send({ type: "CONFIRM_YES" });
    expect(actor.getSnapshot().context.problem?.fixes).toBeGreaterThan(0);

    actor.send({ type: "RESTART_PROBLEM" });
    const s = actor.getSnapshot();
    const p = s.context.problem;
    expect(s.matches({ active: { problem: "guess" } })).toBe(true);
    expect(p?.record.world.problem_id).toBe(first.record.world.problem_id);
    expect(p?.reading).toEqual(first.reading);
    expect(p?.shown).toEqual(first.shown);
    expect(p?.guess).toBeNull();
    expect(p?.prediction).toBeNull();
    expect(p?.placement).toBeNull();
    expect(p?.words).toEqual([]);
    expect(p?.fixes).toBe(0);
    expect(p?.taughtOps).toEqual([]);
    expect(s.context.done).toEqual([first.record.world.problem_id]);
  });

  it("does nothing on the intro, before any problem is open", () => {
    const actor = createActor(flowMachine, { input: { introSeen: false, consented: false } });
    actor.start();
    actor.send({ type: "RESTART_PROBLEM" });
    expect(actor.getSnapshot().matches({ active: "intro" })).toBe(true);
  });
});
