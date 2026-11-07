// 指示書 第7.5節・第9節 (HANDOFF §3 F8・F9): the records stay on the device, without the child's words,
// and the grown-up can delete everything. Written before the implementation.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { COMMON_FRACTION_READINGS, FRACTION_BANK, initialState, observe, readingLine, runRule, type AnyOp } from "@kimi/core";
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
    prediction: "odd",
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
    expect(await s.getSettings()).toEqual({ consented: false, introSeen: false, lang: "ja" });
    await s.setConsent(true);
    await s.setIntroSeen(true);
    expect(await s.getSettings()).toEqual({ consented: true, introSeen: true, lang: "ja" });
  });

  // HANDOFF §7 の4: the screen's language is chosen on the device and remembered there.
  it("remembers the screen's language on the device, across a reopen", async () => {
    const name = `kimi-test-lang-${++n}`;
    const a = openStore(name);
    await a.setLang("en");
    expect((await a.getSettings()).lang).toBe("en");
    await a.close();
    const b = openStore(name);
    stores.push(b);
    expect((await b.getSettings()).lang).toBe("en");
    await b.setLang("ja");
    expect((await b.getSettings()).lang).toBe("ja");
  });

  it("deleting every record keeps the language: it is how the screen reads, not a record of the child", async () => {
    const s = fresh();
    await s.setLang("en");
    await s.setConsent(true);
    await s.deleteAll();
    expect(await s.getSettings()).toEqual({ consented: false, introSeen: false, lang: "en" });
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

  it("keeps the child's prediction about the junior's world (指示書 第7.1節 手順4)", async () => {
    const s = fresh();
    await s.addAttempt(log([]));
    await s.addAttempt({ ...log([]), prediction: null });
    expect((await s.listAttempts()).map((r) => r.prediction)).toEqual(["odd", null]);
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

// 指示書 第7.4節 (the grown-up's trend): which reading became the way of reading for now, went back to a
// guess or left the pool, kept as ids, statuses and core's adult lines with a date. No child's words.
describe("research history for the grown-up's trend", () => {
  const known = COMMON_FRACTION_READINGS.find((h) => h.id === "c_known_whole");
  if (known === undefined) throw new Error("no c_known_whole");
  const withPool = (entries: { h: typeof swap; status: "hypothesis" | "confirmed" }[], unexpressible = false) => ({
    ...initialState(),
    pool: entries.map((e) => ({ hypothesis: e.h as NonNullable<typeof swap>, status: e.status, splitObservations: 0 })),
    unexpressible,
  });

  it("keeps a dated snapshot only when a status, the pool or unexpressible changes", async () => {
    const s = fresh();
    expect(await s.listResearchLog()).toEqual([]);
    await s.saveResearch(initialState());
    expect(await s.listResearchLog()).toEqual([]);
    await s.saveResearch(withPool([{ h: swap, status: "hypothesis" }]));
    await s.saveResearch(withPool([{ h: swap, status: "hypothesis" }]));
    await s.saveResearch(withPool([{ h: swap, status: "confirmed" }]));
    await s.saveResearch(withPool([{ h: known, status: "hypothesis" }]));
    await s.saveResearch(withPool([{ h: known, status: "hypothesis" }], true));
    const rows = await s.listResearchLog();
    expect(rows.map((r) => r.pool.map((e) => `${e.id}:${e.status}`).join(","))).toEqual(["c_swap:hypothesis", "c_swap:confirmed", "c_known_whole:hypothesis", "c_known_whole:hypothesis"]);
    expect(rows.map((r) => r.unsettled)).toEqual([false, false, false, true]);
    for (const r of rows) expect(Number.isNaN(Date.parse(r.at))).toBe(false);
    // Each entry carries core's adult line in both languages, nothing else.
    const first = rows[0]?.pool[0];
    expect(first).toEqual({ id: "c_swap", status: "hypothesis", line: { ja: readingLine(swap as never, "ja"), en: readingLine(swap as never, "en") } });
  });

  it("is removed by delete everything", async () => {
    const s = fresh();
    await s.saveResearch(withPool([{ h: swap, status: "hypothesis" }]));
    await s.deleteAll();
    expect(await s.listResearchLog()).toEqual([]);
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

describe("AI-free checks (指示書 第7.3節)", () => {
  it("keeps each check's outcomes with its date, and only ids, kinds and outcomes", async () => {
    const s = fresh();
    expect(await s.listChecks()).toEqual([]);
    await s.addCheck([
      { problemId: "p_bank_card", consistency: "consistent", outcome: "right" },
      { problemId: "p_bank_tulip", consistency: "inconsistent", outcome: "not_right" },
      { problemId: "p_bank_sticker", consistency: "consistent", outcome: "skipped" },
    ]);
    await s.addCheck([{ problemId: "p_bank_motoni", consistency: "inconsistent", outcome: "right" }]);
    const rows = await s.listChecks();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.items.map((i) => i.outcome)).toEqual(["right", "not_right", "skipped"]);
    expect(Number.isNaN(Date.parse(rows[0]?.at ?? ""))).toBe(false);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["at", "id", "items"]);
    expect(Object.keys(rows[0]?.items[0] ?? {}).sort()).toEqual(["consistency", "outcome", "problemId"]);
  });
});

describe("the junior's rule card (指示書 第7.1節 後輩のルールカード)", () => {
  it("keeps the card the child left: rule ids, the number of picks, whether every world fit and the problems, with a date", async () => {
    const s = fresh();
    await s.addCard({ afterProblemId: "p_bank_card", startRuleId: "c_swap", leftRuleId: "c_correct", picks: 2, fitsAll: true, galleryIds: ["p_signboard", "p_bank_card"] });
    const rows = await s.listCards();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ afterProblemId: "p_bank_card", startRuleId: "c_swap", leftRuleId: "c_correct", picks: 2, fitsAll: true, galleryIds: ["p_signboard", "p_bank_card"] });
    expect(Number.isNaN(Date.parse(rows[0]?.at ?? ""))).toBe(false);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["afterProblemId", "at", "fitsAll", "galleryIds", "id", "leftRuleId", "picks", "startRuleId"]);
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
    await s.addCheck([{ problemId: "p_bank_card", consistency: "consistent", outcome: "right" }]);
    await s.addCard({ afterProblemId: "p_bank_card", startRuleId: "c_swap", leftRuleId: "c_swap", picks: 0, fitsAll: false, galleryIds: ["p_bank_card"] });
    await s.deleteAll();
    expect(await s.getSettings()).toEqual({ consented: false, introSeen: false, lang: "ja" });
    expect(await s.listAttempts()).toEqual([]);
    expect(await s.listGateLog()).toEqual([]);
    expect(await s.listSafety()).toEqual([]);
    expect(await s.listChecks()).toEqual([]);
    expect(await s.listCards()).toEqual([]);
    expect(await s.loadResearch()).toEqual(initialState());
  });
});
