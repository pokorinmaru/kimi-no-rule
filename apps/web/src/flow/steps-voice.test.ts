// The relation step in the child's own words (Q62): at 「だれの 金魚と くらべている？」 the child may say or type why,
// the words go to /safety and /interpret as on the old screens, core validates the ops, and a reference op on an end
// of the relation is the same as tapping that holder's button (the same research observation, the same teaching or
// the other reading's world). The words stay in memory only. Nothing usable back: a fixed line, the buttons stay.
// Also: 「この問題をさいしょから」 before anything was observed keeps the problem observable. Written before the code.
import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import { CHILD_FIRST_PROBLEM_ID, PREPARED_BANK, type AnyOp } from "@kimi/core";
import { MAX_VOICE_TURNS, flowMachine } from "./machine.ts";
import { viewOf } from "./view.ts";

const r = (num: number, den = 1) => ({ num, den });
const SAID = "AIくんの金魚の数の3/4だから";
const toAi: AnyOp = { op: "set_relation_reference", target_id: "r_ratio", reference: "q_ai", evidence: "" };
const toMe: AnyOp = { op: "set_relation_reference", target_id: "r_ratio", reference: "q_me", evidence: "" };

function atRelation() {
  const a = createActor(flowMachine, { input: { introSeen: true, consented: true, bank: PREPARED_BANK, firstProblemId: CHILD_FIRST_PROBLEM_ID, stepFlow: true } });
  a.start();
  a.send({ type: "STEP_NUMBER", value: r(8) });
  expect(a.getSnapshot().context.problem?.steps?.steps[a.getSnapshot().context.problem?.steps?.index ?? 0]?.kind).toBe("relation");
  return a;
}
const p = (a: ReturnType<typeof atRelation>) => a.getSnapshot().context.problem;
const stepKind = (a: ReturnType<typeof atRelation>) => {
  const s = p(a)?.steps;
  return s?.steps[s.index]?.kind;
};

describe("the relation step in the child's own words", () => {
  it("hears only at the relation step", () => {
    const a = createActor(flowMachine, { input: { introSeen: true, consented: true, bank: PREPARED_BANK, firstProblemId: CHILD_FIRST_PROBLEM_ID, stepFlow: true } });
    a.start();
    a.send({ type: "VOICE_HEARD", transcript: SAID });
    expect(p(a)?.listening).toBe(false);
    expect(p(a)?.heard).toBeNull();
    a.send({ type: "STEP_NUMBER", value: r(8) });
    a.send({ type: "VOICE_HEARD", transcript: SAID });
    expect(p(a)?.listening).toBe(true);
    const v = viewOf(a.getSnapshot());
    expect(v.screen === "steps" && v.voice?.listening).toBe(true);
    expect(v.screen === "steps" && v.voice?.canTalk).toBe(false);
  });

  it("a reference op on the holder compared with teaches as its button does, keeps the heard words and sends them for research", () => {
    const a = atRelation();
    a.send({ type: "VOICE_HEARD", transcript: SAID });
    a.send({ type: "VOICE_OPS", ops: [toMe, { op: "word_cue", statement_index: 1, tokens: [9, 10], evidence: "" }] });
    expect(p(a)?.listening).toBe(false);
    expect(stepKind(a)).toBe("unit");
    expect(p(a)?.firstPlacement).toBe("q_me");
    expect(p(a)?.words).toEqual(expect.arrayContaining([{ statementIndex: 1, token: 9 }, { statementIndex: 1, token: 10 }]));
    expect(p(a)?.steps?.entries[1]).toEqual({ kind: "relation", tries: 1, outcome: "ok", choices: ["h_me"], firstRight: true });
    // The research request of the first problem carries the words, in memory only.
    const req = a.getSnapshot().context.researchRequest;
    expect(req?.readings.at(-1)?.words.length).toBeGreaterThan(0);
    // The next screen restates what was understood, and nothing in the log keeps the words.
    const v = viewOf(a.getSnapshot());
    expect(v.screen === "steps" && v.heard).toBe("AIくんは、「そらの 金魚と くらべる」と うけとったよ。");
    expect(JSON.stringify(a.getSnapshot().context.log)).not.toContain(SAID);
  });

  it("a reference op on the other holder shows that reading's world, as its button does, with what was heard on top", () => {
    const a = atRelation();
    a.send({ type: "VOICE_HEARD", transcript: SAID });
    a.send({ type: "VOICE_OPS", ops: [toAi] });
    expect(p(a)?.steps?.misread).toBe("q_ai");
    expect(p(a)?.firstPlacement).toBe("q_ai");
    const v = viewOf(a.getSnapshot());
    expect(v.screen === "steps" && v.heard).toBe("AIくんは、「AIくんの 金魚と くらべる」と うけとったよ。");
    // Back to the question: the heard line is gone.
    a.send({ type: "STEP_AGAIN" });
    const w = viewOf(a.getSnapshot());
    expect(w.screen === "steps" && w.heard).toBeNull();
  });

  it("nothing usable back: a fixed line, listening ends, the buttons still choose", () => {
    const a = atRelation();
    a.send({ type: "VOICE_HEARD", transcript: SAID });
    a.send({ type: "VOICE_OPS", ops: null });
    expect(p(a)?.listening).toBe(false);
    expect(p(a)?.heard).toBeNull();
    const v = viewOf(a.getSnapshot());
    expect(v.screen === "steps" && v.voice?.missed).toBe("うまく 聞きとれなかったよ。ボタンでも えらべるよ");
    expect(v.screen === "steps" && v.voice?.canTalk).toBe(true);
    expect(a.getSnapshot().context.voiceOff).toBe(false);
    a.send({ type: "STEP_CHOOSE", holderId: "h_me" });
    expect(stepKind(a)).toBe("unit");
  });

  it("offline turns the voice off for the session, with the fixed line; the buttons stay", () => {
    const a = atRelation();
    a.send({ type: "VOICE_HEARD", transcript: SAID });
    a.send({ type: "VOICE_OPS", ops: null, offline: true });
    expect(a.getSnapshot().context.voiceOff).toBe(true);
    const v = viewOf(a.getSnapshot());
    expect(v.screen === "steps" && v.voice?.off).toBe(true);
    expect(v.screen === "steps" && v.voice?.missed).not.toBeNull();
    expect(v.screen === "steps" && v.choices?.length).toBe(3);
  });

  it("an op core refuses (another relation, not an end) is nothing usable", () => {
    const a = atRelation();
    a.send({ type: "VOICE_HEARD", transcript: SAID });
    a.send({ type: "VOICE_OPS", ops: [{ op: "set_relation_reference", target_id: "r_none", reference: "q_ai", evidence: "" }] });
    expect(p(a)?.steps?.misread).toBeNull();
    expect(stepKind(a)).toBe("relation");
    expect(p(a)?.firstPlacement).toBeNull();
  });

  it("a tap while waiting replaces the words, and a late reply is dropped", () => {
    const a = atRelation();
    a.send({ type: "VOICE_HEARD", transcript: SAID });
    a.send({ type: "STEP_CHOOSE", holderId: "h_ai" });
    expect(p(a)?.listening).toBe(false);
    a.send({ type: "STEP_AGAIN" });
    a.send({ type: "VOICE_OPS", ops: [toMe] });
    expect(stepKind(a)).toBe("relation");
    expect(p(a)?.steps?.choices).toEqual(["h_ai"]);
  });

  it("「わからない」 while waiting stops the waiting: back on the step, the voice is not stuck listening (safety review)", () => {
    const a = atRelation();
    a.send({ type: "VOICE_HEARD", transcript: SAID });
    expect(p(a)?.listening).toBe(true);
    a.send({ type: "DONT_KNOW" });
    expect(p(a)?.listening).toBe(false);
    expect(p(a)?.heard).toBeNull();
  });

  it("is offered only while turns are left, and not on the other reading's world", () => {
    const a = atRelation();
    for (let i = 0; i < MAX_VOICE_TURNS; i++) {
      a.send({ type: "VOICE_HEARD", transcript: SAID });
      a.send({ type: "VOICE_OPS", ops: null });
    }
    const v = viewOf(a.getSnapshot());
    expect(v.screen === "steps" && v.voice?.canTalk).toBe(false);
    a.send({ type: "STEP_CHOOSE", holderId: "h_ai" });
    const w = viewOf(a.getSnapshot());
    expect(w.screen === "steps" && w.voice).toBeNull();
  });
});

describe("「この問題をさいしょから」 on the step flow and the research observation", () => {
  it("before the relation was chosen: the choice after the restart is still observed", () => {
    const a = atRelation();
    a.send({ type: "RESTART_PROBLEM" });
    expect(p(a)?.restarted).toBe(false);
    a.send({ type: "STEP_NUMBER", value: r(8) });
    a.send({ type: "STEP_CHOOSE", holderId: "h_ai" });
    expect(a.getSnapshot().context.research.readings).toHaveLength(1);
    expect(a.getSnapshot().context.researchRequest).not.toBeNull();
  });

  it("after a choice was observed: nothing more is observed on this problem", () => {
    const a = atRelation();
    a.send({ type: "STEP_CHOOSE", holderId: "h_ai" });
    expect(a.getSnapshot().context.research.readings).toHaveLength(1);
    a.send({ type: "RESTART_PROBLEM" });
    expect(p(a)?.restarted).toBe(true);
    a.send({ type: "STEP_NUMBER", value: r(8) });
    a.send({ type: "STEP_CHOOSE", holderId: "h_me" });
    expect(a.getSnapshot().context.research.readings).toHaveLength(1);
  });
});
