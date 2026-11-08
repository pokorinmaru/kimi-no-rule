// Every word of the step screens through the checks (Q62, safety review S2): on every branch of both stories, no
// word that judges or pins a reading on the child, and no hidden value (the answer, one part) in a line the app says
// before the child has said it. The problem's own sentences are the problem's and are not checked here.
import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import { CHILD_FIRST_PROBLEM_ID, PREPARED_BANK, gate, type Rational } from "@kimi/core";
import { flowMachine, type FlowEvent } from "./machine.ts";
import { gateContext } from "./problem.ts";
import { childTexts, viewOf } from "./view.ts";
import { hasForbiddenPhrase } from "./text.ts";

const r = (num: number, den = 1): Rational => ({ num, den });
const n = (v: number): FlowEvent => ({ type: "STEP_NUMBER", value: r(v) });
const choose = (holderId: string | null): FlowEvent => ({ type: "STEP_CHOOSE", holderId });
const again: FlowEvent = { type: "STEP_AGAIN" };
const heard: FlowEvent = { type: "VOICE_HEARD", transcript: "AIくんの 金魚と くらべるから" };
const ops = (reference: string): FlowEvent => ({ type: "VOICE_OPS", ops: [{ op: "set_relation_reference", target_id: "r_ratio", reference, evidence: "" }] });
const miss: FlowEvent = { type: "VOICE_OPS", ops: null };

/** Problem 1 right through, then on to problem 2 (the research reply answered with none). */
const toSecond: FlowEvent[] = [n(8), choose("h_me"), n(2), n(6), { type: "NEXT" }, { type: "RESEARCH_RESULT", pool: null }];

const BRANCHES: Record<string, FlowEvent[]> = {
  "all right": [n(8), choose("h_me"), n(2), n(6)],
  "fact wrong twice": [n(1), n(1), choose("h_me"), n(2), n(6)],
  "relation: the other holder, again, don't know, right": [n(8), choose("h_ai"), again, choose(null), choose("h_me"), n(2), n(6)],
  "unit wrong once": [n(8), choose("h_me"), n(5), n(2), n(6)],
  "unit wrong twice": [n(8), choose("h_me"), n(5), n(5), n(6)],
  "total wrong twice": [n(8), choose("h_me"), n(2), n(7), n(7)],
  "second: all right": [...toSecond, n(6), choose("h_ai"), n(2), n(8)],
  "relation in words: nothing usable, then the other holder, then the holder compared with": [n(8), heard, miss, heard, ops("q_ai"), again, choose("h_me"), n(2), n(6)],
  "relation in words: the holder compared with": [n(8), heard, ops("q_me"), n(2), n(6)],
  "second: the other holder, unit and total helped": [...toSecond, n(6), choose("h_me"), again, choose("h_ai"), n(1), n(2), n(1), n(8)],
};

describe("the step screens' words (safety review S2)", () => {
  for (const [name, events] of Object.entries(BRANCHES)) {
    it(name, () => {
      const a = createActor(flowMachine, { input: { introSeen: true, consented: true, bank: PREPARED_BANK, firstProblemId: CHILD_FIRST_PROBLEM_ID, stepFlow: true } });
      a.start();
      const said: Rational[] = [];
      const check = () => {
        const s = a.getSnapshot();
        const v = viewOf(s, "ja");
        for (const t of childTexts(v)) expect(hasForbiddenPhrase(t), t).toBe(false);
        for (const t of childTexts(viewOf(s, "en"))) expect(hasForbiddenPhrase(t), t).toBe(false);
        if (v.screen !== "steps") return;
        const p = s.context.problem;
        if (p === null) return;
        const ctx = gateContext(p.record, "ja", p.steps?.said ?? []);
        for (const line of [v.lead, v.question, v.again, v.heard, v.voice?.lead ?? null, v.voice?.missed ?? null, ...(v.choices ?? []).map((c) => c.label)]) {
          if (line === null) continue;
          expect(gate({ kind: "say", text: line }, ctx).ok, `${name}: ${line}`).toBe(true);
        }
      };
      check();
      for (const e of events) {
        if (e.type === "STEP_NUMBER") said.push(e.value);
        a.send(e);
        check();
      }
    });
  }
});
