// The problem one sentence at a time on the child's route (Q62): the number sentence, who is compared with whom, one
// part, then the answer; a wrong answer branches at that step, and the log keeps where the child stopped.
import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import { CHILD_FIRST_PROBLEM_ID, PREPARED_BANK } from "@kimi/core";
import { flowMachine } from "./machine.ts";

const r = (num: number, den = 1) => ({ num, den });

function run() {
  const actor = createActor(flowMachine, { input: { introSeen: true, consented: true, bank: PREPARED_BANK, firstProblemId: CHILD_FIRST_PROBLEM_ID, stepFlow: true } });
  actor.start();
  return actor;
}
const steps = (a: ReturnType<typeof run>) => a.getSnapshot().context.problem?.steps;

describe("the step flow", () => {
  it("opens the first problem (the child's 8 is the whole) on its number sentence, with no guess and no prediction", () => {
    const a = run();
    expect(a.getSnapshot().context.problem?.record.world.problem_id).toBe("p_festival_whole");
    expect(a.getSnapshot().matches({ active: { problem: "steps" } })).toBe(true);
    expect(steps(a)?.steps[steps(a)?.index ?? 0]?.kind).toBe("fact");
  });

  it("goes through the four steps when every answer is right, and logs them as ok", () => {
    const a = run();
    a.send({ type: "STEP_NUMBER", value: r(8) });
    a.send({ type: "STEP_CHOOSE", holderId: "h_me" });
    a.send({ type: "STEP_NUMBER", value: r(2) });
    a.send({ type: "STEP_NUMBER", value: r(6) });
    const s = a.getSnapshot();
    expect(s.matches({ active: { problem: "solved" } })).toBe(true);
    const log = s.context.log.at(-1);
    expect(log?.outcome).toBe("solved");
    expect(log?.steps?.map((e) => [e.kind, e.outcome])).toEqual([
      ["fact", "ok"],
      ["relation", "ok"],
      ["unit", "ok"],
      ["total", "ok"],
    ]);
  });

  it("a wrong number lights the sentence's number; twice wrong passes the number sentence on as stopped", () => {
    const a = run();
    a.send({ type: "STEP_NUMBER", value: r(6) });
    expect(steps(a)?.hint).toBe(true);
    a.send({ type: "STEP_NUMBER", value: r(6) });
    expect(steps(a)?.entries[0]).toEqual({ kind: "fact", tries: 2, outcome: "stopped" });
    expect(steps(a)?.steps[steps(a)?.index ?? 0]?.kind).toBe("relation");
  });

  it("choosing the other holder shows that reading's world, then the question again; the relation is kept as helped", () => {
    const a = run();
    a.send({ type: "STEP_NUMBER", value: r(8) });
    a.send({ type: "STEP_CHOOSE", holderId: "h_ai" });
    expect(steps(a)?.misread).toBe("q_ai");
    // The first choice is the research observation, as the first placement of the card was.
    expect(a.getSnapshot().context.problem?.firstPlacement).toBe("q_ai");
    a.send({ type: "STEP_AGAIN" });
    expect(steps(a)?.misread).toBeNull();
    a.send({ type: "STEP_CHOOSE", holderId: "h_me" });
    expect(steps(a)?.entries[1]).toEqual({ kind: "relation", tries: 2, outcome: "helped", choices: ["h_ai", "h_me"] });
  });

  it("わからない at the relation lights its words and asks again", () => {
    const a = run();
    a.send({ type: "STEP_NUMBER", value: r(8) });
    a.send({ type: "STEP_CHOOSE", holderId: null });
    expect(steps(a)?.hint).toBe(true);
    expect(steps(a)?.choices).toEqual(["unknown"]);
  });

  it("a wrong one part opens the smaller step (the dealing to count); the answer twice wrong keeps the problem for later", () => {
    const a = run();
    a.send({ type: "STEP_NUMBER", value: r(8) });
    a.send({ type: "STEP_CHOOSE", holderId: "h_me" });
    a.send({ type: "STEP_NUMBER", value: r(4) });
    expect(steps(a)?.help).toBe(true);
    a.send({ type: "STEP_NUMBER", value: r(2) });
    expect(steps(a)?.entries[2]).toEqual({ kind: "unit", tries: 2, outcome: "helped" });
    a.send({ type: "STEP_NUMBER", value: r(5) });
    a.send({ type: "STEP_NUMBER", value: r(5) });
    expect(a.getSnapshot().matches({ active: { problem: "held" } })).toBe(true);
    expect(a.getSnapshot().context.log.at(-1)?.steps?.at(-1)).toEqual({ kind: "total", tries: 2, outcome: "stopped" });
  });

  it("the second problem is the festival story where the child's count is a part, on the same steps", () => {
    const a = run();
    for (const e of [
      { type: "STEP_NUMBER", value: r(8) },
      { type: "STEP_CHOOSE", holderId: "h_me" },
      { type: "STEP_NUMBER", value: r(2) },
      { type: "STEP_NUMBER", value: r(6) },
      { type: "NEXT" },
      // The research request of the first problem is answered (here: none), as the controller would.
      { type: "RESEARCH_RESULT", pool: null },
    ] as const)
      a.send(e);
    expect(a.getSnapshot().context.problem?.record.world.problem_id).toBe("p_festival");
    expect(a.getSnapshot().matches({ active: { problem: "steps" } })).toBe(true);
  });

  it("「この問題をさいしょから」 starts the steps again from the first sentence", () => {
    const a = run();
    a.send({ type: "STEP_NUMBER", value: r(8) });
    a.send({ type: "RESTART_PROBLEM" });
    expect(steps(a)?.index).toBe(0);
    expect(steps(a)?.entries).toEqual([]);
  });

  it("is off on the adults' route: the old steps stay", () => {
    const a = createActor(flowMachine, { input: { introSeen: true, consented: true, bank: PREPARED_BANK, firstProblemId: CHILD_FIRST_PROBLEM_ID } });
    a.start();
    expect(a.getSnapshot().matches({ active: { problem: "guess" } })).toBe(true);
  });
});
