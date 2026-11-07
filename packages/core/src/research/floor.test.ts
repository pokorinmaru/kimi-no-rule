// The floor under Claude's pool (Q43): the common readings that reproduce every first reading so far stay
// candidates, and the pool has at least two, so a discriminating problem can always be chosen.
import { describe, expect, it } from "vitest";
import { FRACTION_BANK } from "../../fixtures/problems/fraction-bank.ts";
import { runRule, type Hypothesis } from "../rules/run.ts";
import { COMMON_FRACTION_READINGS, POOL_MAX, chooseNext, ensurePool, initialState, observe, revisePool } from "./index.ts";

const bank = (id: string) => FRACTION_BANK.find((r) => r.world.problem_id === id) as (typeof FRACTION_BANK)[number];
const common = (id: string) => COMMON_FRACTION_READINGS.find((h) => h.id === id) as Hypothesis;
const read = (h: Hypothesis, id: string) => ({ record: bank(id), childWorld: runRule(h, bank(id)), referencePlaced: true, afterFix: false, wordbookOpenedBefore: false });

describe("ensurePool", () => {
  it("adds the common readings that reproduce every reading, keeps Claude's, and never exceeds the cap", () => {
    const known = common("c_known_whole");
    let s = observe(initialState(), read(known, "p_signboard"));
    const odd: Hypothesis = { ...common("c_invert"), id: "h_claude_new" };
    s = revisePool(s, [{ kind: "add", hypothesis: odd }], FRACTION_BANK).state;
    const out = ensurePool(s, COMMON_FRACTION_READINGS, FRACTION_BANK);
    const ids = out.pool.map((e) => e.hypothesis.id);
    expect(ids).toContain("h_claude_new");
    expect(ids).toContain("c_known_whole");
    expect(out.pool.length).toBeLessThanOrEqual(POOL_MAX);
    const total = Object.values(out.weights).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("a pool of one gets a second candidate, so the next problem is chosen by information gain", () => {
    const known = common("c_known_whole");
    let s = observe(initialState(), read(known, "p_signboard"));
    s = revisePool(s, [{ kind: "add", hypothesis: { ...known, id: "h_only" } }], FRACTION_BANK).state;
    const out = ensurePool(s, COMMON_FRACTION_READINGS, FRACTION_BANK);
    expect(out.pool.length).toBeGreaterThanOrEqual(2);
    expect(chooseNext(out, FRACTION_BANK, new Set(["p_signboard"]))).not.toBeNull();
  });

  it("does not change a pool that already holds every consistent common reading", () => {
    const known = common("c_known_whole");
    let s = observe(initialState(), read(known, "p_signboard"));
    s = revisePool(s, COMMON_FRACTION_READINGS.slice(0, 5).map((h) => ({ kind: "add" as const, hypothesis: h })), FRACTION_BANK).state;
    expect(ensurePool(s, COMMON_FRACTION_READINGS, FRACTION_BANK)).toEqual(s);
  });
});

describe("ensurePool: a rewritten common id does not stand for the common reading", () => {
  it("adds the common reading again under a fresh id when the pool's same id builds other worlds", () => {
    const known = common("c_known_whole");
    let s = observe(initialState(), read(known, "p_signboard"));
    const rewritten: Hypothesis = { ...common("c_invert"), id: "c_known_whole" };
    s = revisePool(s, [{ kind: "add", hypothesis: rewritten }], FRACTION_BANK).state;
    const out = ensurePool(s, COMMON_FRACTION_READINGS, FRACTION_BANK);
    const added = out.pool.find((e) => e.hypothesis.id !== "c_known_whole" && e.hypothesis.clauses[0]?.then.action === "choose_reference");
    expect(added?.hypothesis.id).toBe("c_known_whole_2");
  });
});

describe("ensurePool: one slip does not drop the child's own reading", () => {
  it("keeps a common reading that misses one of three readings", () => {
    const known = common("c_known_whole");
    const swap = common("c_swap");
    let s = observe(initialState(), read(known, "p_signboard"));
    s = revisePool(s, [{ kind: "add", hypothesis: { ...common("c_invert"), id: "h_other" } }], FRACTION_BANK).state;
    s = observe(s, read(swap, "p_bank_tulip"));
    s = observe(s, read(known, "p_bank_card"));
    const out = ensurePool(s, COMMON_FRACTION_READINGS, FRACTION_BANK);
    expect(out.pool.some((e) => e.hypothesis.clauses[0]?.then.action === "choose_reference" && e.hypothesis.clauses[0]?.then.by === "known_value")).toBe(true);
  });
});
