// The research layer's program side (指示書 第6.7節 手順1・2・4, 第11節 M1・M3): the hypothesis pool and its
// weights, the next discriminating problem from the prepared bank, confirming and going back, which reading
// the junior uses, and the one-line card. Written before the implementation.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { ProblemRecord } from "../schema/index.ts";
import { FRACTION_BANK } from "../../fixtures/problems/fraction-bank.ts";
import { predict } from "../rules/predict.ts";
import { runRule, type Hypothesis } from "../rules/run.ts";
import { sameReading } from "../rules/same-reading.ts";
import { gate, numbersIn } from "../gates/index.ts";
import { addHypothesis, agreementLikelihoods, constructiveLikelihoods, infoGain, update, type Weights } from "../rules/weights.ts";
import { act, always, clause, hyp, p, ALWAYS } from "../rules/test-rules.ts";
import {
  chooseNext,
  COMMON_FRACTION_READINGS,
  COMMON_MISREADINGS,
  CORRECT_READING_ID,
  GAIN_THRESHOLD,
  initialState,
  kohaiReading,
  observe,
  observeAgreement,
  OTHER,
  POOL_MAX,
  readingCard,
  revisePool,
  type FirstReading,
  type PoolEdit,
  type PoolEntry,
  type ResearchState,
} from "./index.ts";

const PROPERTY_RUNS = { numRuns: 30 };
const CLOSE = 9;

const common = (id: string): Hypothesis => {
  const h = COMMON_FRACTION_READINGS.find((x) => x.id === id);
  if (h === undefined) throw new Error("no common reading " + id);
  return structuredClone(h);
};
const bank = (id: string): ProblemRecord => {
  const r = FRACTION_BANK.find((x) => x.world.problem_id === id);
  if (r === undefined) throw new Error("no bank problem " + id);
  return structuredClone(r);
};
const sum = (w: Weights): number => Object.values(w).reduce((a, b) => a + b, 0);
const ids = (s: ResearchState): string[] => s.pool.map((e) => e.hypothesis.id);
const KNOWN = (): Hypothesis => common("c_known_whole");

/** A simulated child's first reading: the world the rule builds, with the "1" card placed. */
function readingBy(h: Hypothesis, record: ProblemRecord, referencePlaced = true): FirstReading {
  return { record, childWorld: runRule(h, record), referencePlaced, afterFix: false, wordbookOpenedBefore: false };
}

const entry = (h: Hypothesis, status: PoolEntry["status"] = "hypothesis", splitObservations = 0): PoolEntry => ({
  hypothesis: h,
  status,
  splitObservations,
});

function stateOf(pool: PoolEntry[], weights: Weights, readings: FirstReading[] = [], unscored = 0): ResearchState {
  return { pool, weights, readings, unscored, unexpressible: false };
}

const add = (h: Hypothesis): PoolEdit => ({ kind: "add", hypothesis: h });
const modify = (h: Hypothesis): PoolEdit => ({ kind: "modify", hypothesis: h });
const del = (id: string): PoolEdit => ({ kind: "delete", id });

/** A record whose sentence marks are broken, so running any rule on it throws. */
function brokenRecord(): ProblemRecord {
  return { ...bank("p_signboard"), syntax_marks: null as never };
}

function splitsOn(pool: readonly Hypothesis[], r: ProblemRecord): boolean {
  return new Set(predict(pool, r, true).predictions.map((x) => x.worldClass)).size > 1;
}

// ---------------------------------------------------------------------------------------------
// 指示書 第6.7節 手順2: the starting state and observations
// ---------------------------------------------------------------------------------------------

describe("initialState", () => {
  it("starts with no hypothesis and every weight on other", () => {
    expect(initialState()).toEqual({ pool: [], weights: { [OTHER]: 1 }, readings: [], unscored: 0, unexpressible: false });
  });
});

describe("observe", () => {
  it.each([
    ["after a fix", { afterFix: true, wordbookOpenedBefore: false }],
    ["after opening the word book", { afterFix: false, wordbookOpenedBefore: true }],
  ])("a reading %s does not count and leaves the state as it was", (_label, flags) => {
    const s = stateOf([entry(common(CORRECT_READING_ID)), entry(common("c_swap"))], { c_correct: 0.4, c_swap: 0.4, other: 0.2 });
    const before = structuredClone(s);
    const out = observe(s, { ...readingBy(KNOWN(), bank("p_signboard")), ...flags });
    expect(out).toEqual(before);
  });

  it("with no hypothesis yet, keeps the reading unscored and the weights as they were", () => {
    const out = observe(initialState(), readingBy(KNOWN(), bank("p_signboard")));
    expect(out.readings).toHaveLength(1);
    expect(out.unscored).toBe(1);
    expect(out.weights).toEqual({ [OTHER]: 1 });
    expect(out.pool).toEqual([]);
  });

  it("updates the weights by the constructive likelihoods of the pool's predictions", () => {
    const pool = [common(CORRECT_READING_ID), common("c_swap"), KNOWN()];
    const w: Weights = { c_correct: 0.25, c_swap: 0.25, c_known_whole: 0.25, other: 0.25 };
    const rec = bank("p_bank_tulip");
    const r = readingBy(KNOWN(), rec);
    const expected = update(w, constructiveLikelihoods(predict(pool, rec, true), r.childWorld, true));
    const out = observe(stateOf(pool.map((h) => entry(h)), w, [readingBy(KNOWN(), bank("p_signboard"))], 1), r);
    for (const [k, v] of Object.entries(expected)) expect(out.weights[k]).toBeCloseTo(v, CLOSE);
    expect(sum(out.weights)).toBeCloseTo(1, CLOSE);
    expect(out.readings).toHaveLength(2);
    expect(out.unscored).toBe(1);
  });

  it("counts an observation on a problem where the predictions split, for every entry", () => {
    const pool = [common(CORRECT_READING_ID), KNOWN()];
    const w: Weights = { c_correct: 0.4, c_known_whole: 0.4, other: 0.2 };
    const out = observe(stateOf(pool.map((h) => entry(h, "hypothesis", 1)), w), readingBy(KNOWN(), bank("p_bank_tulip")));
    expect(out.pool.map((e) => e.splitObservations)).toEqual([2, 2]);
  });

  it("does not count one where every hypothesis predicts the same world", () => {
    // On p_fraction_c the known number belongs to the whole, so both readings build the correct world.
    const pool = [common(CORRECT_READING_ID), KNOWN()];
    expect(splitsOn(pool, bank("p_fraction_c"))).toBe(false);
    const w: Weights = { c_correct: 0.4, c_known_whole: 0.4, other: 0.2 };
    const out = observe(stateOf(pool.map((h) => entry(h, "hypothesis", 1)), w), readingBy(KNOWN(), bank("p_fraction_c")));
    expect(out.pool.map((e) => e.splitObservations)).toEqual([1, 1]);
  });

  it("confirms a heavy hypothesis seen on two splitting problems", () => {
    const pool = [common(CORRECT_READING_ID), common("c_swap"), KNOWN()];
    const w: Weights = { c_correct: 0.2, c_swap: 0.1, c_known_whole: 0.6, other: 0.1 };
    const out = observe(stateOf(pool.map((h) => entry(h, "hypothesis", 1)), w), readingBy(KNOWN(), bank("p_bank_tulip")));
    expect(out.weights.c_known_whole as number).toBeGreaterThanOrEqual(0.8);
    expect(out.pool.find((e) => e.hypothesis.id === "c_known_whole")?.status).toBe("confirmed");
    expect(out.pool.find((e) => e.hypothesis.id === "c_correct")?.status).toBe("hypothesis");
  });

  it("does not confirm on weight alone, with fewer than two splitting observations", () => {
    const pool = [common(CORRECT_READING_ID), KNOWN()];
    const w: Weights = { c_correct: 0.05, c_known_whole: 0.9, other: 0.05 };
    const out = observe(stateOf(pool.map((h) => entry(h)), w), readingBy(KNOWN(), bank("p_bank_tulip")));
    expect(out.pool.find((e) => e.hypothesis.id === "c_known_whole")?.status).toBe("hypothesis");
  });

  it("sends a confirmed hypothesis back when a new observation drops it below one half", () => {
    const pool = [entry(common(CORRECT_READING_ID), "hypothesis", 3), entry(KNOWN(), "confirmed", 3)];
    const w: Weights = { c_correct: 0.35, c_known_whole: 0.55, other: 0.1 };
    // The child now reads tulip as written; the known-number reading predicts another world there.
    const out = observe(stateOf(pool, w), readingBy(common(CORRECT_READING_ID), bank("p_bank_tulip")));
    expect(out.weights.c_known_whole as number).toBeLessThan(0.5);
    expect(out.pool.find((e) => e.hypothesis.id === "c_known_whole")?.status).toBe("hypothesis");
  });

  it("marks the reading unexpressible when other weighs most", () => {
    const pool = [entry(common(CORRECT_READING_ID)), entry(common("c_swap"))];
    const w: Weights = { c_correct: 0.25, c_swap: 0.25, other: 0.5 };
    // Neither candidate builds the inverted world.
    const out = observe(stateOf(pool, w), readingBy(common("c_invert"), bank("p_signboard")));
    expect(out.weights.other as number).toBeGreaterThan(Math.max(out.weights.c_correct ?? 0, out.weights.c_swap ?? 0));
    expect(out.unexpressible).toBe(true);
    expect(out.pool.every((e) => e.status === "hypothesis")).toBe(true);
  });

  it("does not change the state it was given", () => {
    const s = stateOf([entry(common(CORRECT_READING_ID)), entry(KNOWN())], { c_correct: 0.4, c_known_whole: 0.4, other: 0.2 });
    const before = structuredClone(s);
    observe(s, readingBy(KNOWN(), bank("p_bank_tulip")));
    expect(s).toEqual(before);
  });
});

// ---------------------------------------------------------------------------------------------
// 指示書 第6.7節 手順2 (ii): the child's prediction about the junior's world (an agreement observation)
// ---------------------------------------------------------------------------------------------

describe("observeAgreement", () => {
  const tulip = () => bank("p_bank_tulip");
  const pool = () => [common(CORRECT_READING_ID), KNOWN()];
  const w: Weights = { c_correct: 0.4, c_known_whole: 0.4, other: 0.2 };
  const start = () => stateOf(pool().map((h) => entry(h, "hypothesis", 1)), { ...w }, [readingBy(KNOWN(), bank("p_signboard"))], 1);
  const shownBy = (h: Hypothesis) => runRule(h, tulip());

  it("each model's likelihoods over fits and odd sum to 1", () => {
    const pred = predict(pool(), tulip(), true);
    for (let shownClass = 0; shownClass < pred.worlds.length + 1; shownClass++) {
      const fits = agreementLikelihoods(pred, shownClass, "fits");
      const odd = agreementLikelihoods(pred, shownClass, "odd");
      for (const k of Object.keys(fits)) expect((fits[k] as number) + (odd[k] as number)).toBeCloseTo(1, CLOSE);
    }
  });

  it("a fits answer on the world a hypothesis predicts raises that hypothesis", () => {
    const out = observeAgreement(start(), { record: tulip(), shownWorld: shownBy(KNOWN()), answer: "fits", referencePlaced: true });
    expect(out.weights.c_known_whole as number).toBeGreaterThan(w.c_known_whole as number);
    expect(out.weights.c_correct as number).toBeLessThan(w.c_correct as number);
    expect(sum(out.weights)).toBeCloseTo(1, CLOSE);
  });

  it("an odd answer on that world lowers it", () => {
    const out = observeAgreement(start(), { record: tulip(), shownWorld: shownBy(KNOWN()), answer: "odd", referencePlaced: true });
    expect(out.weights.c_known_whole as number).toBeLessThan(w.c_known_whole as number);
    expect(out.weights.c_correct as number).toBeGreaterThan(w.c_correct as number);
  });

  it("weighs by the agreement likelihoods of the pool's predictions and the shown world's class", () => {
    const pred = predict(pool(), tulip(), true);
    const shown = shownBy(KNOWN());
    const shownClass = pred.worlds.findIndex((x) => sameReading(x, shown, true));
    const expected = update(w, agreementLikelihoods(pred, shownClass, "fits"));
    const out = observeAgreement(start(), { record: tulip(), shownWorld: shown, answer: "fits", referencePlaced: true });
    for (const [k, v] of Object.entries(expected)) expect(out.weights[k]).toBeCloseTo(v, CLOSE);
  });

  it("a fits answer on a world no hypothesis predicts lowers every hypothesis against other", () => {
    const out = observeAgreement(start(), { record: tulip(), shownWorld: shownBy(common("c_invert")), answer: "fits", referencePlaced: true });
    expect(out.weights.other as number).toBeGreaterThan(w.other as number);
  });

  it("an unknown answer changes nothing", () => {
    const s = start();
    const out = observeAgreement(s, { record: tulip(), shownWorld: shownBy(KNOWN()), answer: "unknown", referencePlaced: true });
    expect(out).toEqual(s);
  });

  it("with no hypothesis yet, changes nothing", () => {
    const out = observeAgreement(initialState(), { record: tulip(), shownWorld: shownBy(KNOWN()), answer: "fits", referencePlaced: true });
    expect(out).toEqual(initialState());
  });

  it("does not count toward the constructive observations that confirm, nor add a reading", () => {
    const s = start();
    const out = observeAgreement(s, { record: tulip(), shownWorld: shownBy(KNOWN()), answer: "fits", referencePlaced: true });
    expect(out.pool.map((e) => e.splitObservations)).toEqual([1, 1]);
    expect(out.readings).toEqual(s.readings);
    expect(out.unscored).toBe(s.unscored);
    // Agreement alone never confirms, however heavy the hypothesis grows.
    let heavy = s;
    for (let i = 0; i < 10; i++) heavy = observeAgreement(heavy, { record: tulip(), shownWorld: shownBy(KNOWN()), answer: "fits", referencePlaced: true });
    expect(heavy.weights.c_known_whole as number).toBeGreaterThan(0.8);
    expect(heavy.pool.every((e) => e.status === "hypothesis")).toBe(true);
  });

  it("does not change the state or the world it was given", () => {
    const s = start();
    const shown = shownBy(KNOWN());
    const before = structuredClone({ s, shown });
    observeAgreement(s, { record: tulip(), shownWorld: shown, answer: "odd", referencePlaced: true });
    expect({ s, shown }).toEqual(before);
  });

  it("keeps the weights summing to 1 over any answers (property)", () => {
    const worlds = [KNOWN(), common("c_swap"), common("c_invert"), common(CORRECT_READING_ID)].map(shownBy);
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.integer({ min: 0, max: worlds.length - 1 }), fc.constantFrom("fits", "odd", "unknown") as fc.Arbitrary<"fits" | "odd" | "unknown">), { maxLength: 6 }), (steps) => {
        let s = start();
        for (const [i, answer] of steps) s = observeAgreement(s, { record: tulip(), shownWorld: worlds[i] as never, answer, referencePlaced: true });
        expect(sum(s.weights)).toBeCloseTo(1, CLOSE);
        expect(Object.values(s.weights).every((v) => v > 0)).toBe(true);
      }),
      PROPERTY_RUNS,
    );
  });
});

// ---------------------------------------------------------------------------------------------
// 指示書 第6.7節 手順1: the pool is edited by add, modify and delete
// ---------------------------------------------------------------------------------------------

describe("revisePool", () => {
  it("gives the first hypotheses and other equal weights and leaves the earlier readings unscored", () => {
    const s = observe(initialState(), readingBy(KNOWN(), bank("p_signboard")));
    const rev = revisePool(s, [add(common(CORRECT_READING_ID)), add(common("c_swap")), add(KNOWN())], FRACTION_BANK);
    expect(rev.rejected).toEqual([]);
    expect(ids(rev.state)).toEqual(["c_correct", "c_swap", "c_known_whole"]);
    for (const k of ["c_correct", "c_swap", "c_known_whole", OTHER]) expect(rev.state.weights[k]).toBeCloseTo(1 / 4, CLOSE);
    expect(rev.state.unscored).toBe(1);
    expect(rev.state.readings).toHaveLength(1);
    expect(rev.state.pool.every((e) => e.status === "hypothesis" && e.splitObservations === 0)).toBe(true);
  });

  it("rejects a hypothesis that is not a valid rule", () => {
    const noClause = { ...common("c_swap"), clauses: [] } as Hypothesis;
    const extraKey = { ...common("c_invert"), extra: 1 } as unknown as Hypothesis;
    const rev = revisePool(initialState(), [add(noClause), add(common(CORRECT_READING_ID)), add(extraKey)], FRACTION_BANK);
    expect(rev.rejected).toEqual([
      { index: 0, reason: "invalid" },
      { index: 2, reason: "invalid" },
    ]);
    expect(ids(rev.state)).toEqual(["c_correct"]);
  });

  it("rejects a hypothesis that cannot be run on the given problems", () => {
    const rev = revisePool(initialState(), [add(common("c_swap"))], [brokenRecord()]);
    expect(rev.rejected).toEqual([{ index: 0, reason: "run_failed" }]);
    expect(rev.state.pool).toEqual([]);
    expect(rev.state.weights).toEqual({ [OTHER]: 1 });
  });

  it("rejects an add of an id already in the pool, and a modify or delete of an unknown id", () => {
    const first = revisePool(initialState(), [add(common(CORRECT_READING_ID)), add(common("c_swap"))], FRACTION_BANK).state;
    const rev = revisePool(
      first,
      [add(common("c_swap")), modify(always("h_nobody", act.invert())), del("h_nobody"), add(KNOWN()), add(KNOWN())],
      FRACTION_BANK,
    );
    expect(rev.rejected).toEqual([
      { index: 0, reason: "duplicate_id" },
      { index: 1, reason: "unknown_id" },
      { index: 2, reason: "unknown_id" },
      { index: 4, reason: "duplicate_id" },
    ]);
    expect(ids(rev.state)).toEqual(["c_correct", "c_swap", "c_known_whole"]);
  });

  it("gives a later hypothesis half of other and keeps the ratios of the others", () => {
    const s = stateOf([entry(common(CORRECT_READING_ID)), entry(common("c_swap"))], { c_correct: 0.5, c_swap: 0.1, other: 0.4 });
    const rev = revisePool(s, [add(KNOWN())], FRACTION_BANK);
    expect(rev.state.weights.c_known_whole).toBeCloseTo(0.2, CLOSE);
    expect(rev.state.weights.other).toBeCloseTo(0.2, CLOSE);
    expect(rev.state.weights.c_correct).toBeCloseTo(0.5, CLOSE);
    expect(rev.state.weights.c_swap).toBeCloseTo(0.1, CLOSE);
  });

  it("returns the weight of a deleted hypothesis to other", () => {
    const s = stateOf([entry(common(CORRECT_READING_ID)), entry(common("c_swap"))], { c_correct: 0.5, c_swap: 0.1, other: 0.4 });
    const rev = revisePool(s, [del("c_swap")], FRACTION_BANK);
    expect(ids(rev.state)).toEqual(["c_correct"]);
    expect(rev.state.weights).not.toHaveProperty("c_swap");
    expect(rev.state.weights.other).toBeCloseTo(0.5, CLOSE);
    expect(rev.state.weights.c_correct).toBeCloseTo(0.5, CLOSE);
  });

  describe("modify", () => {
    // The child takes the known number as the whole; h_x starts as another reading and is rewritten.
    const before = (): ResearchState => {
      let s = observe(initialState(), readingBy(KNOWN(), bank("p_signboard")));
      s = revisePool(s, [add(common(CORRECT_READING_ID)), add(common("c_swap")), add(always("h_x", act.invert()))], FRACTION_BANK).state;
      s = observe(s, readingBy(KNOWN(), bank("p_bank_tulip")));
      s = observe(s, readingBy(KNOWN(), bank("p_bank_fish_back")));
      return s;
    };
    const fits = (): Hypothesis => always("h_x", act.chooseBy("known_value"));
    const misses = (): Hypothesis => always("h_x", act.numberOp("divide_always"));

    /** The weights after a modify: rejoin as a new hypothesis, then score it on the scored readings. */
    function expectedWeights(s: ResearchState, h: Hypothesis): Weights {
      const { [h.id]: old = 0, ...rest } = s.weights;
      let w: Weights = addHypothesis({ ...rest, [OTHER]: (rest[OTHER] ?? 0) + old }, h.id);
      for (const r of s.readings.slice(s.unscored)) {
        const l = constructiveLikelihoods(predict([h], r.record, r.referencePlaced), r.childWorld, r.referencePlaced);
        w = { ...w, [h.id]: (w[h.id] ?? 0) * ((l[h.id] as number) / (l[OTHER] as number)) };
      }
      const t = sum(w);
      return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / t]));
    }

    it("recomputes the weight of the modified rule from the scored readings", () => {
      const s = before();
      expect(s.unscored).toBe(1);
      expect(s.readings).toHaveLength(3);
      const rev = revisePool(s, [modify(fits())], FRACTION_BANK);
      expect(rev.rejected).toEqual([]);
      const expected = expectedWeights(s, fits());
      for (const [k, v] of Object.entries(expected)) expect(rev.state.weights[k]).toBeCloseTo(v, CLOSE);
    });

    it("a modified rule that reproduces the readings ends heavier than one that does not", () => {
      const s = before();
      const good = revisePool(s, [modify(fits())], FRACTION_BANK).state;
      const bad = revisePool(s, [modify(misses())], FRACTION_BANK).state;
      expect(good.weights.h_x as number).toBeGreaterThan(bad.weights.h_x as number);
      expect(good.weights.h_x as number).toBeGreaterThan(s.weights.h_x as number);
    });

    it("keeps the ratios between the untouched hypotheses and sums to 1", () => {
      const s = before();
      const out = revisePool(s, [modify(fits())], FRACTION_BANK).state;
      const ratio = (w: Weights): number => (w.c_correct as number) / (w.c_swap as number);
      expect(ratio(out.weights)).toBeCloseTo(ratio(s.weights), CLOSE);
      expect(sum(out.weights)).toBeCloseTo(1, CLOSE);
    });

    it("replaces the rule, sends it back to a hypothesis and recounts its splitting observations", () => {
      const s = before();
      const confirmed: ResearchState = {
        ...s,
        pool: s.pool.map((e) => (e.hypothesis.id === "h_x" ? { ...e, status: "confirmed", splitObservations: 9 } : e)),
      };
      const out = revisePool(confirmed, [modify(fits())], FRACTION_BANK).state;
      const x = out.pool.find((e) => e.hypothesis.id === "h_x");
      expect(x?.hypothesis).toEqual(fits());
      expect(x?.status).toBe("hypothesis");
      // c_correct and c_swap build different worlds on every bank problem, so both scored readings count.
      expect(x?.splitObservations).toBe(2);
      expect(ids(out)).toEqual(["c_correct", "c_swap", "h_x"]);
    });
  });

  it("merges hypotheses that build the same worlds on every given problem, keeping the first", () => {
    // On the signboard alone, the known number and the first-mentioned holder are the same holder,
    // and always dividing builds the correct world.
    const rev = revisePool(
      initialState(),
      [add(common(CORRECT_READING_ID)), add(KNOWN()), add(common("c_first_whole")), add(common("c_divide"))],
      [bank("p_signboard")],
    );
    expect(rev.rejected).toEqual([]);
    expect(new Set(rev.merged.map((m) => m.kept + "<-" + m.dropped))).toEqual(
      new Set(["c_known_whole<-c_first_whole", "c_correct<-c_divide"]),
    );
    expect(rev.merged).toHaveLength(2);
    expect(ids(rev.state)).toEqual(["c_correct", "c_known_whole"]);
    // Q28 (review fix): duplicates are dropped before the first weights, so each distinct reading and other start alike.
    expect(rev.state.weights.c_correct).toBeCloseTo(1 / 3, CLOSE);
    expect(rev.state.weights.c_known_whole).toBeCloseTo(1 / 3, CLOSE);
    expect(rev.state.weights.other).toBeCloseTo(1 / 3, CLOSE);
  });

  it("does not merge readings the bank tells apart", () => {
    const rev = revisePool(initialState(), [add(KNOWN()), add(common("c_first_whole"))], FRACTION_BANK);
    expect(rev.merged).toEqual([]);
    expect(ids(rev.state)).toEqual(["c_known_whole", "c_first_whole"]);
  });

  it("never holds more than POOL_MAX: the extra adds are rejected in edit order", () => {
    const rev = revisePool(initialState(), COMMON_FRACTION_READINGS.map((h) => add(structuredClone(h))), FRACTION_BANK);
    expect(POOL_MAX).toBe(5);
    expect(ids(rev.state)).toEqual(COMMON_FRACTION_READINGS.slice(0, 5).map((h) => h.id));
    expect(rev.rejected).toEqual([
      { index: 5, reason: "pool_full" },
      { index: 6, reason: "pool_full" },
    ]);
  });

  it("makes room by a delete earlier in the same edits", () => {
    const full = revisePool(initialState(), COMMON_FRACTION_READINGS.slice(0, 5).map((h) => add(structuredClone(h))), FRACTION_BANK).state;
    const rev = revisePool(full, [del("c_swap"), add(common("c_invert"))], FRACTION_BANK);
    expect(rev.rejected).toEqual([]);
    expect(rev.state.pool).toHaveLength(5);
    expect(ids(rev.state)).toContain("c_invert");
    expect(ids(rev.state)).not.toContain("c_swap");
  });

  it("keeps the weights summing to 1 and the pool within its size, over any edits (property)", () => {
    const hand: Hypothesis[] = [
      hyp("h_gt1_swap", [clause(p("ratio_kind_is", "gt1"), act.swap()), clause(ALWAYS, act.noChange())]),
      hyp("h_word_motoni", [clause(p("word_in_statement", "もとに"), act.chooseBy("first_mentioned"))]),
      always("h_large_by_small", act.numberOp("divide_large_by_small")),
    ];
    const rules = [...COMMON_FRACTION_READINGS, ...hand];
    const ruleIds = rules.map((h) => h.id);
    const editArb: fc.Arbitrary<PoolEdit> = fc.oneof(
      fc.constantFrom(...rules).map((h) => add(structuredClone(h))),
      fc.tuple(fc.constantFrom(...ruleIds), fc.constantFrom(...rules)).map(([id, h]) => modify({ ...structuredClone(h), id })),
      fc.constantFrom(...ruleIds).map((id) => del(id)),
    );
    const problems = [bank("p_signboard"), bank("p_bank_sticker"), bank("p_bank_tulip")];
    fc.assert(
      fc.property(fc.array(fc.array(editArb, { maxLength: 6 }), { minLength: 1, maxLength: 3 }), fc.boolean(), (rounds, seen) => {
        let s = seen ? observe(initialState(), readingBy(KNOWN(), problems[0] as ProblemRecord)) : initialState();
        for (const edits of rounds) {
          s = revisePool(s, edits, problems).state;
          s = observe(s, readingBy(KNOWN(), problems[2] as ProblemRecord));
          expect(sum(s.weights)).toBeCloseTo(1, CLOSE);
          expect(s.pool.length).toBeLessThanOrEqual(POOL_MAX);
          expect(Object.keys(s.weights).sort()).toEqual([...ids(s), OTHER].sort());
          expect(new Set(ids(s)).size).toBe(s.pool.length);
          for (const v of Object.values(s.weights)) expect(v).toBeGreaterThanOrEqual(0);
        }
        return true;
      }),
      PROPERTY_RUNS,
    );
  });
});

// ---------------------------------------------------------------------------------------------
// 指示書 第6.7節 手順3 (the prepared bank only): the next problem that tells the candidates apart
// ---------------------------------------------------------------------------------------------

describe("chooseNext", () => {
  const twoState = (a: string, b: string, wa = 0.4, wb = 0.4): ResearchState =>
    stateOf([entry(common(a)), entry(common(b))], { [a]: wa, [b]: wb, [OTHER]: 1 - wa - wb });

  it("chooses a problem where the candidates build different worlds, first in bank order on a tie", () => {
    const c = chooseNext(twoState("c_correct", "c_swap"), FRACTION_BANK, new Set());
    expect(c).not.toBeNull();
    expect(c?.problemId).toBe(FRACTION_BANK[0]?.world.problem_id);
    expect(c?.predictions.map((x) => x.hypothesisId)).toEqual(["c_correct", "c_swap"]);
    expect(new Set(c?.predictions.map((x) => x.worldClass)).size).toBe(2);
    expect(c?.gain as number).toBeGreaterThanOrEqual(GAIN_THRESHOLD);
  });

  it("reports the gain and the predicted classes that predict and infoGain give", () => {
    const s = twoState("c_correct", "c_known_whole", 0.5, 0.3);
    const c = chooseNext(s, FRACTION_BANK, new Set());
    const r = FRACTION_BANK.find((x) => x.world.problem_id === c?.problemId) as ProblemRecord;
    const pred = predict([common("c_correct"), KNOWN()], r, true);
    expect(c?.gain).toBeCloseTo(infoGain(s.weights, pred), CLOSE);
    expect(c?.predictions).toEqual(pred.predictions.map((x) => ({ hypothesisId: x.hypothesisId, worldClass: x.worldClass })));
    expect(splitsOn([common("c_correct"), KNOWN()], r)).toBe(true);
  });

  it("skips the problems already done", () => {
    const done = new Set([FRACTION_BANK[0]?.world.problem_id as string]);
    const c = chooseNext(twoState("c_correct", "c_swap"), FRACTION_BANK, done);
    expect(c?.problemId).toBe(FRACTION_BANK[1]?.world.problem_id);
  });

  it("returns null when every splitting problem is done", () => {
    const pool = [common("c_correct"), KNOWN()];
    const done = new Set(FRACTION_BANK.filter((r) => splitsOn(pool, r)).map((r) => r.world.problem_id));
    expect(done.size).toBeGreaterThan(0);
    expect(done.size).toBeLessThan(FRACTION_BANK.length);
    expect(chooseNext(twoState("c_correct", "c_known_whole"), FRACTION_BANK, done)).toBeNull();
    // c_correct and c_swap split everywhere, so only an exhausted bank stops them.
    const all = new Set(FRACTION_BANK.map((r) => r.world.problem_id));
    expect(chooseNext(twoState("c_correct", "c_swap"), FRACTION_BANK, all)).toBeNull();
  });

  it("returns null below the threshold", () => {
    expect(chooseNext(twoState("c_correct", "c_swap"), FRACTION_BANK, new Set(), 10)).toBeNull();
  });

  it("returns null with fewer than two hypotheses of positive weight", () => {
    const one = stateOf([entry(common("c_correct"))], { c_correct: 0.6, other: 0.4 });
    expect(chooseNext(one, FRACTION_BANK, new Set())).toBeNull();
    expect(chooseNext(twoState("c_correct", "c_swap", 0.6, 0), FRACTION_BANK, new Set())).toBeNull();
    expect(chooseNext(initialState(), FRACTION_BANK, new Set())).toBeNull();
  });

  it("chooses the largest gain, the earliest in the bank among equals (property)", () => {
    const names = ["c_correct", "c_swap", "c_known_whole", "c_first_whole"];
    const pool = names.map((n) => common(n));
    const allIds = FRACTION_BANK.map((r) => r.world.problem_id);
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 20 }), { minLength: 4, maxLength: 4 }),
        fc.integer({ min: 1, max: 20 }),
        fc.subarray(allIds),
        (ws, other, doneList) => {
          const total = ws.reduce((a, b) => a + b, 0) + other;
          const weights: Weights = Object.fromEntries([...names.map((n, i) => [n, (ws[i] as number) / total]), [OTHER, other / total]]);
          const done = new Set(doneList);
          const gains = FRACTION_BANK.filter((r) => !done.has(r.world.problem_id)).map(
            (r) => [r.world.problem_id, infoGain(weights, predict(pool, r, true))] as const,
          );
          const c = chooseNext(stateOf(pool.map((h) => entry(h)), weights), FRACTION_BANK, done);
          const best = Math.max(-1, ...gains.map((g) => g[1]));
          if (best < GAIN_THRESHOLD) {
            expect(c).toBeNull();
            return true;
          }
          const first = gains.find((g) => Math.abs(g[1] - best) < 1e-12);
          expect(c?.problemId).toBe(first?.[0]);
          return true;
        },
      ),
      PROPERTY_RUNS,
    );
  });
});

// ---------------------------------------------------------------------------------------------
// 指示書 第6.7節 手順4: which reading the junior uses
// ---------------------------------------------------------------------------------------------

describe("kohaiReading", () => {
  const firstDiffering = (rec: ProblemRecord): Hypothesis =>
    COMMON_MISREADINGS.find((h) => !sameReading(runRule(h, rec), rec.world, true)) as Hypothesis;

  it("uses what the child taught, keeping the session misreading as it was", () => {
    const taught = always("h_taught", act.chooseBy("asked"));
    const s = stateOf([entry(KNOWN())], { c_known_whole: 0.7, other: 0.3 });
    for (const sessionMisreadId of [null, "c_swap"]) {
      const k = kohaiReading({ state: s, record: bank("p_signboard"), sessionMisreadId, taught });
      expect(k).toEqual({ hypothesis: taught, source: "taught", sessionMisreadId, changesWorld: false }); // "asked" is the whole here: the taught reading is right
    }
  });

  it("on the first problem, with no hypothesis, borrows the first common misreading that changes the world", () => {
    const rec = bank("p_signboard");
    const k = kohaiReading({ state: initialState(), record: rec, sessionMisreadId: null, taught: null });
    const expected = firstDiffering(rec);
    expect(k.source).toBe("competitor");
    expect(k.hypothesis).toEqual(expected);
    expect(k.sessionMisreadId).toBe(expected.id);
    expect(sameReading(runRule(k.hypothesis, rec), rec.world, true)).toBe(false);
  });

  it("never borrows a misreading that builds the correct world on this problem", () => {
    // Always dividing builds the correct world on the signboard.
    const rec = bank("p_signboard");
    expect(sameReading(runRule(common("c_divide"), rec), rec.world, true)).toBe(true);
    for (const top of [null, "c_correct"]) {
      const s = top === null ? initialState() : stateOf([entry(common(top))], { [top]: 0.8, other: 0.2 });
      const k = kohaiReading({ state: s, record: rec, sessionMisreadId: null, taught: null });
      expect(k.hypothesis.id).not.toBe("c_divide");
      expect(k.hypothesis.id).not.toBe(CORRECT_READING_ID);
    }
  });

  it("mirrors the heaviest hypothesis when it changes the world, and fixes it for the session", () => {
    const s = stateOf([entry(common("c_correct")), entry(KNOWN())], { c_correct: 0.2, c_known_whole: 0.6, other: 0.2 });
    const k = kohaiReading({ state: s, record: bank("p_bank_tulip"), sessionMisreadId: null, taught: null });
    expect(k).toEqual({ hypothesis: KNOWN(), source: "mirror", sessionMisreadId: "c_known_whole", changesWorld: true });
  });

  it("on a tie, the earlier hypothesis in the pool is the top", () => {
    const s = stateOf([entry(KNOWN()), entry(common("c_swap"))], { c_known_whole: 0.4, c_swap: 0.4, other: 0.2 });
    const k = kohaiReading({ state: s, record: bank("p_bank_tulip"), sessionMisreadId: null, taught: null });
    expect(k.hypothesis.id).toBe("c_known_whole");
    expect(k.source).toBe("mirror");
  });

  it("when the child reads as written, borrows a competitor instead of the correct reading", () => {
    const rec = bank("p_bank_tulip");
    const s = stateOf([entry(common("c_correct")), entry(KNOWN())], { c_correct: 0.7, c_known_whole: 0.1, other: 0.2 });
    const k = kohaiReading({ state: s, record: rec, sessionMisreadId: null, taught: null });
    expect(k.source).toBe("competitor");
    expect(k.hypothesis).toEqual(firstDiffering(rec));
    expect(k.sessionMisreadId).toBe(k.hypothesis.id);
  });

  it("keeps the session misreading: mirror while it is still the top", () => {
    const s = stateOf([entry(common("c_correct")), entry(KNOWN())], { c_correct: 0.2, c_known_whole: 0.6, other: 0.2 });
    const k = kohaiReading({ state: s, record: bank("p_bank_tulip"), sessionMisreadId: "c_known_whole", taught: null });
    expect(k).toEqual({ hypothesis: KNOWN(), source: "mirror", sessionMisreadId: "c_known_whole", changesWorld: true });
  });

  it("keeps the session misreading: competitor when another hypothesis is now the top", () => {
    const s = stateOf([entry(common("c_swap")), entry(KNOWN())], { c_swap: 0.6, c_known_whole: 0.2, other: 0.2 });
    const k = kohaiReading({ state: s, record: bank("p_bank_tulip"), sessionMisreadId: "c_known_whole", taught: null });
    expect(k).toEqual({ hypothesis: KNOWN(), source: "competitor", sessionMisreadId: "c_known_whole", changesWorld: true });
  });

  it("finds the session misreading among the common ones when it is not in the pool", () => {
    const s = stateOf([entry(KNOWN())], { c_known_whole: 0.8, other: 0.2 });
    const k = kohaiReading({ state: s, record: bank("p_bank_tulip"), sessionMisreadId: "c_invert", taught: null });
    expect(k).toEqual({ hypothesis: common("c_invert"), source: "competitor", sessionMisreadId: "c_invert", changesWorld: true });
  });

  it("uses only one kind of misreading in a session (property)", () => {
    const problemIds = FRACTION_BANK.map((r) => r.world.problem_id);
    const readingIds = COMMON_FRACTION_READINGS.map((h) => h.id);
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.constantFrom(...problemIds), fc.constantFrom(...readingIds)), { minLength: 1, maxLength: 5 }), (steps) => {
        let session: string | null = null;
        const used = new Set<string>();
        for (const [pid, topId] of steps) {
          const s = stateOf([entry(common(topId))], { [topId]: 0.7, [OTHER]: 0.3 });
          const k = kohaiReading({ state: s, record: bank(pid), sessionMisreadId: session, taught: null });
          if (session !== null) expect(k.sessionMisreadId).toBe(session);
          session = k.sessionMisreadId;
          used.add(k.hypothesis.id);
        }
        expect(used.size).toBe(1);
        expect(used.has(CORRECT_READING_ID)).toBe(false);
        return true;
      }),
      PROPERTY_RUNS,
    );
  });
});

// ---------------------------------------------------------------------------------------------
// The one-line card (指示書 第6.7節 手順4, 第1節 原則10・11)
// ---------------------------------------------------------------------------------------------

describe("readingCard", () => {
  type Action = Hypothesis["clauses"][number]["then"];
  const CARD_KNOWN = "後輩の読み方：わかっている数の人を、1とみる";
  const CARD_FIRST = "後輩の読み方：先に出てきた人を、1とみる";
  const CARD_SWAP = "後輩の読み方：1とみる人を、入れかえて読む";
  const EVERY_ACTION: Action[] = [
    act.chooseBy("first_mentioned"),
    act.chooseBy("second_mentioned"),
    act.chooseBy("known_value"),
    act.chooseBy("asked"),
    act.chooseBy("larger_number"),
    act.chooseBy("smaller_number"),
    act.chooseByWord("before_word", "の"),
    act.chooseByWord("after_word", "に対して"),
    act.swap(),
    act.additive("numerator"),
    act.additive("ratio_value"),
    act.numberOp("divide_large_by_small"),
    act.numberOp("multiply_always"),
    act.numberOp("divide_always"),
    act.numberOp("percent_as_count"),
    act.invert(),
    act.flipEvent(),
    act.misreadQuestion(),
  ];
  // Words that place the reading on the child or judge it (原則10・11), and names of operations.
  const BANNED = ["君", "きみ", "まちがい", "間違", "つられ", "たす", "ひく", "かける", "わる", "足し", "引き", "掛け", "割"];

  it("pins the cards for the common reference readings", () => {
    expect(readingCard(always("h", act.chooseBy("known_value")))).toBe(CARD_KNOWN);
    expect(readingCard(always("h", act.chooseBy("first_mentioned")))).toBe(CARD_FIRST);
    expect(readingCard(always("h", act.swap()))).toBe(CARD_SWAP);
  });

  it("the list below covers every action of the rule language except no_change", () => {
    expect(new Set(EVERY_ACTION.map((a) => a.action))).toEqual(
      new Set(["choose_reference", "swap_reference", "set_relation_type_additive", "number_op", "invert_ratio", "flip_event", "misread_question"]),
    );
  });

  it.each(EVERY_ACTION.map((a) => [JSON.stringify(a), a] as const))("the card for %s is one safe line", (_label, a) => {
    const card = readingCard(always("h", a));
    expect(card).not.toBeNull();
    const text = card as string;
    expect(text.startsWith("後輩の読み方：")).toBe(true);
    expect(text.length).toBeGreaterThan("後輩の読み方：".length);
    expect(text).not.toMatch(/\n/);
    expect(text.split("1とみる").join("")).not.toMatch(/[0-9０-９一二三四五六七八九十]/);
    for (const w of BANNED) expect(text, w).not.toContain(w);
  });

  it("reads the first clause that changes something", () => {
    const h = hyp("h", [clause(p("ratio_kind_is", "gt1"), act.noChange()), clause(ALWAYS, act.swap())]);
    expect(readingCard(h)).toBe(CARD_SWAP);
    const g = hyp("g", [clause(p("ratio_kind_is", "lt1"), act.chooseBy("first_mentioned")), clause(ALWAYS, act.swap())]);
    expect(readingCard(g)).toBe(CARD_FIRST);
  });

  it("gives no card for a rule that changes nothing", () => {
    expect(readingCard(common(CORRECT_READING_ID))).toBeNull();
    expect(readingCard(hyp("h", [clause(p("ratio_kind_is", "gt1"), act.noChange()), clause(ALWAYS, act.noChange())]))).toBeNull();
  });

  it("covers the common misreadings", () => {
    for (const h of COMMON_MISREADINGS) expect(readingCard(h), h.id).not.toBeNull();
    expect(readingCard(KNOWN())).toBe(CARD_KNOWN);
  });

  // HANDOFF §7 の4: the English screen (指示書 第11節 M8). The same rules in English: no operation name, no
  // number but the 1 of "as 1" / "the one", no judging word, nothing placed on the child (原則1・10・11).
  describe("in English", () => {
    const EN_PREFIX = "Junior's reading: ";
    const EN_BANNED =
      /\b(?:you|your|yours|wrong|mistakes?|mistaken|correct(?:ly)?|incorrect|right|error|fooled|tricked|add|adds|added|plus|subtract\w*|minus|multipl\w*|times|divid\w*|division|sum|product|quotient|difference|half|halves|twice|double)\b/i;
    const JAPANESE = /[\u3040-\u30ff\u3400-\u9fff\uff01-\uff60]/;
    const strip1 = (t: string): string => t.replace(/\bas 1\b/g, "").replace(/\bthe one\b/gi, "").replace(/"1"/g, "");
    const EN_KNOWN = "Junior's reading: takes the person whose count is given as 1";

    it("defaults to Japanese", () => {
      expect(readingCard(always("h", act.chooseBy("known_value")))).toBe(CARD_KNOWN);
      expect(readingCard(always("h", act.chooseBy("known_value")), undefined, "ja")).toBe(CARD_KNOWN);
    });

    it("pins the card for the known-number reading", () => {
      expect(readingCard(always("h", act.chooseBy("known_value")), undefined, "en")).toBe(EN_KNOWN);
    });

    it.each(EVERY_ACTION.map((a) => [JSON.stringify(a), a] as const))("the English card for %s is one safe line", (_label, a) => {
      const card = readingCard(always("h", a), undefined, "en");
      expect(card).not.toBeNull();
      const text = card as string;
      expect(text.startsWith(EN_PREFIX)).toBe(true);
      expect(text.length).toBeGreaterThan(EN_PREFIX.length);
      expect(text).not.toMatch(/\n/);
      expect(text).not.toMatch(EN_BANNED);
      // A quoted word of the problem may be Japanese; nothing else is.
      expect(text.replace(/"[^"]*"/g, "")).not.toMatch(JAPANESE);
      expect(numbersIn(strip1(text))).toEqual([]);
      expect(strip1(text)).not.toMatch(/[0-9０-９]/);
    });

    it("every English card passes core's gate on the signboard problem", () => {
      const record = bank("p_signboard");
      for (const a of EVERY_ACTION) {
        const text = readingCard(always("h", a), undefined, "en") as string;
        const said = { kind: "say" as const, text: strip1(text) };
        const ctx = { correct: record.world, lang: "en" as const, childSaid: { numbers: [], words: [] }, grade: 6, interpretationRecorded: false, prediction: "disabled" as const };
        expect(gate(said, ctx), text).toEqual({ ok: true });
      }
    });

    it("a word Claude wrote is quoted only when it carries no number or operation", () => {
      for (const word of ["3倍", "わる", "three", "四分の三", "a\nb"]) {
        expect(readingCard(always("h_w", act.chooseByWord("before_word", word)), undefined, "en"), word).toBe(
          "Junior's reading: takes the person before a certain word as 1",
        );
      }
      expect(readingCard(always("h_w", act.chooseByWord("after_word", "の")), undefined, "en")).toBe('Junior\'s reading: takes the person after "の" as 1');
    });

    it("gives no card for a rule that changes nothing, and names the acting clause on a problem", () => {
      expect(readingCard(common(CORRECT_READING_ID), undefined, "en")).toBeNull();
      const h = hyp("h_two", [clause(p("ratio_kind_is", "gt1"), act.swap()), clause(ALWAYS, act.chooseBy("known_value"))]);
      expect(readingCard(h, bank("p_signboard"), "en")).toBe(EN_KNOWN);
      for (const m of COMMON_MISREADINGS) expect(readingCard(m, undefined, "en"), m.id).not.toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------------------------
// A worked example in the spirit of the confirmation example of 指示書 第11節 M1: a hypothesis after
// the first problem, then problems chosen from the bank, then confirmed.
// ---------------------------------------------------------------------------------------------

describe("a simulated child who takes the known number as the whole", () => {
  it("is confirmed after the first problem and two chosen problems, and the card shows that reading", () => {
    const child = KNOWN();
    const first = bank("p_signboard");
    let s = observe(initialState(), readingBy(child, first));
    expect(s.unscored).toBe(1);
    const rev = revisePool(s, [add(common(CORRECT_READING_ID)), add(common("c_swap")), add(KNOWN())], FRACTION_BANK);
    expect(rev.rejected).toEqual([]);
    s = rev.state;
    const done = new Set([first.world.problem_id]);
    const chosen: string[] = [];
    // Two chosen problems are enough with this bank: the weight passes 0.8 only just, after the second.
    for (let round = 0; round < 2; round++) {
      const c = chooseNext(s, FRACTION_BANK, done);
      expect(c).not.toBeNull();
      const rec = bank((c as { problemId: string }).problemId);
      expect(splitsOn(s.pool.map((e) => e.hypothesis), rec)).toBe(true);
      done.add(rec.world.problem_id);
      chosen.push(rec.world.problem_id);
      s = observe(s, readingBy(child, rec));
      expect(s.pool.find((e) => e.hypothesis.id === "c_known_whole")?.status).toBe(round === 0 ? "hypothesis" : "confirmed");
    }
    expect(new Set(chosen).size).toBe(2);
    expect(s.weights.c_known_whole as number).toBeGreaterThanOrEqual(0.8);
    expect(s.unexpressible).toBe(false);
    const known = s.pool.find((e) => e.hypothesis.id === "c_known_whole") as PoolEntry;
    expect(known.splitObservations).toBe(2);
    expect(readingCard(known.hypothesis)).toBe("後輩の読み方：わかっている数の人を、1とみる");
  });
});

describe("review fixes (Q28)", () => {
  const sign = () => FRACTION_BANK.find((r) => r.world.problem_id === "p_signboard") as ProblemRecord;
  const read = (h: Hypothesis, r: ProblemRecord) => ({ record: r, childWorld: runRule(h, r), referencePlaced: true, afterFix: false, wordbookOpenedBefore: false });
  const swap = COMMON_FRACTION_READINGS.find((h) => h.id === "c_swap") as Hypothesis;
  const correct = COMMON_FRACTION_READINGS.find((h) => h.id === CORRECT_READING_ID) as Hypothesis;

  it("adding the same reading under a new id does not raise its weight", () => {
    let s = observe(initialState(), read(swap, sign()));
    s = revisePool(s, [{ kind: "add", hypothesis: swap }, { kind: "add", hypothesis: correct }], FRACTION_BANK).state;
    const tulip = FRACTION_BANK.find((r) => r.world.problem_id === "p_bank_tulip") as ProblemRecord;
    s = observe(s, read(swap, tulip));
    const before = s.weights.c_swap as number;
    const clone = { ...swap, id: "h_clone" };
    const rev = revisePool(s, [{ kind: "add", hypothesis: clone }], FRACTION_BANK);
    expect(rev.merged).toEqual([{ kept: "c_swap", dropped: "h_clone" }]);
    expect(rev.state.weights.c_swap).toBeCloseTo(before, 10);
  });

  it("the last hypothesis of a pool cannot be deleted", () => {
    let s = observe(initialState(), read(swap, sign()));
    s = revisePool(s, [{ kind: "add", hypothesis: swap }], FRACTION_BANK).state;
    const rev = revisePool(s, [{ kind: "delete", id: "c_swap" }], FRACTION_BANK);
    expect(rev.rejected).toEqual([{ index: 0, reason: "pool_empty" }]);
    expect(rev.state.pool.map((e) => e.hypothesis.id)).toEqual(["c_swap"]);
  });

  it("a session misreading written by Claude and later deleted from the pool is kept by the flow", () => {
    const mine = { ...swap, id: "h_mine" };
    const k = kohaiReading({ state: initialState(), record: sign(), sessionMisreadId: "h_mine", sessionMisread: mine, taught: null });
    expect(k.hypothesis).toEqual(mine);
    expect(k.sessionMisreadId).toBe("h_mine");
  });

  it("the card names the clause that acted on the problem, and none when the world does not change", () => {
    const h = hyp("h_two", [clause(p("ratio_kind_is", "gt1"), act.swap()), clause(ALWAYS, act.chooseBy("known_value"))]);
    expect(readingCard(h, sign())).toBe("後輩の読み方：わかっている数の人を、1とみる");
    expect(readingCard(correct, sign())).toBeNull();
  });

  it("a word Claude wrote is quoted on the card only when it carries no number or operation", () => {
    for (const word of ["3倍", "わる", "three", "四分の三", "a\nb", "とても長い言葉のかたまりです"]) {
      const card = readingCard(always("h_w", act.chooseByWord("before_word", word)));
      expect(card, word).toBe("後輩の読み方：ある言葉の前の人を、1とみる");
    }
    expect(readingCard(always("h_w", act.chooseByWord("before_word", "の")))).toBe("後輩の読み方：「の」の前の人を、1とみる");
  });
});
