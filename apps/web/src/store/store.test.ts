// 指示書 第7.5節・第9節 (HANDOFF §3 F8・F9): the records stay on the device, without the child's words,
// and the grown-up can delete everything. Written before the implementation.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { COMMON_FRACTION_READINGS, FRACTION_BANK, initialState, observe, runRule, type AnyOp } from "@kimi/core";
import { openStore, type FlowStore } from "./store.ts";
import type { ProblemLog } from "../flow/machine.ts";

let n = 0;
const stores: FlowStore[] = [];
function fresh(): FlowStore {
  const s = openStore(`kimi-test-${++n}`);
  stores.push(s);
  return s;
}
afterEach(async () => {
  for (const s of stores.splice(0)) await s.close();
});

const signboard = FRACTION_BANK.find((r) => r.world.problem_id === "p_signboard");
if (signboard === undefined) throw new Error("no signboard");
const swap = COMMON_FRACTION_READINGS.find((h) => h.id === "c_swap");
if (swap === undefined) throw new Error("no c_swap");

function log(ops: AnyOp[]): ProblemLog {
  return {
    problemId: "p_signboard",
    consistency: "inconsistent",
    source: "competitor",
    readingId: "c_swap",
    reading: swap as never,
    firstPlacement: "q_ani",
    ops,
    fixes: 1,
    unitTries: 1,
    totalTries: 1,
    outcome: "solved",
  };
}

describe("settings", () => {
  it("starts with no consent and the intro not seen, and keeps what is set", async () => {
    const s = fresh();
    expect(await s.getSettings()).toEqual({ consented: false, introSeen: false });
    await s.setConsent(true);
    await s.setIntroSeen(true);
    expect(await s.getSettings()).toEqual({ consented: true, introSeen: true });
  });
});

describe("attempts", () => {
  it("stores a problem's record with the child's words removed (core redact)", async () => {
    const s = fresh();
    const ops: AnyOp[] = [
      { op: "set_relation_reference", target_id: "r_ratio", reference: "q_otouto", evidence: "zz-child-said-this" },
      { op: "word_cue", statement_index: 1, tokens: [4], evidence: "zz-child-said-that" },
    ];
    await s.addAttempt(log(ops));
    const rows = await s.listAttempts();
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain("zz-child");
    expect(rows[0]?.interpretation.ops.map((o) => o.op)).toEqual(["set_relation_reference", "word_cue"]);
    expect(rows[0]?.problemId).toBe("p_signboard");
    expect(typeof rows[0]?.at).toBe("string");
  });
});

describe("research state", () => {
  it("starts empty and comes back as it was saved", async () => {
    const s = fresh();
    expect(await s.loadResearch()).toEqual(initialState());
    const state = observe(initialState(), {
      record: signboard,
      childWorld: runRule(swap, signboard),
      referencePlaced: true,
      afterFix: false,
      wordbookOpenedBefore: false,
    });
    await s.saveResearch(state);
    expect(await s.loadResearch()).toEqual(state);
  });
});

describe("gate and safety logs keep kinds and dates only", () => {
  it("keeps the kinds of the junior's rejected lines and the safety events, never a text", async () => {
    const s = fresh();
    await s.logGate(["answer_leak", "judging"]);
    await s.logSafety("distress");
    const gates = await s.listGateLog();
    const safety = await s.listSafety();
    expect(gates.map((g) => g.kinds)).toEqual([["answer_leak", "judging"]]);
    expect(safety.map((x) => x.kind)).toEqual(["distress"]);
    expect(Object.keys(safety[0] ?? {}).sort()).toEqual(["at", "id", "kind"]);
  });
});

describe("delete everything (the grown-up's screen)", () => {
  it("removes every record and setting", async () => {
    const s = fresh();
    await s.setConsent(true);
    await s.setIntroSeen(true);
    await s.addAttempt(log([]));
    await s.saveResearch(initialState());
    await s.logGate(["length"]);
    await s.logSafety("hard_button");
    await s.deleteAll();
    expect(await s.getSettings()).toEqual({ consented: false, introSeen: false });
    expect(await s.listAttempts()).toEqual([]);
    expect(await s.listGateLog()).toEqual([]);
    expect(await s.listSafety()).toEqual([]);
    expect(await s.loadResearch()).toEqual(initialState());
  });
});
