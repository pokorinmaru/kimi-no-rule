// The child's own first prediction, before the junior's world (指示書 第7.1節 手順2, 第6.7節 手順2 (i)): which
// holder has more, and, when the child places it, who is taken as 1. A constructive observation whose
// likelihood is a distribution over the answers the worlds of W give. Written before the implementation.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { ProblemRecord } from "../schema/index.ts";
import { FRACTION_BANK } from "../../fixtures/problems/fraction-bank.ts";
import { runRule, type Hypothesis } from "../rules/run.ts";
import { EPSILON_CONSTRUCTIVE, type Weights } from "../rules/weights.ts";
import {
  COMMON_FRACTION_READINGS,
  CORRECT_READING_ID,
  guessOf,
  guessAnswers,
  guessLikelihoods,
  initialState,
  observePrediction,
  OTHER,
  type PoolEntry,
  type ResearchState,
} from "./index.ts";

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
const entry = (h: Hypothesis, splitObservations = 0): PoolEntry => ({ hypothesis: h, status: "hypothesis", splitObservations });
const stateOf = (pool: PoolEntry[], weights: Weights): ResearchState => ({ pool, weights, readings: [], unscored: 0, unexpressible: false });

// On the signboard problem (兄 6, 兄 is 3/4 of 弟): the correct reading makes 弟 larger with 弟 as 1; taking the
// other holder as 1 makes 兄 larger with 兄 as 1; turning the fraction over makes 兄 larger with 弟 as 1.
const SIGN = () => bank("p_signboard");
const ANI = "h_ani";
const OTOUTO = "h_otouto";
const CORRECT = () => common(CORRECT_READING_ID);
const SWAP = () => common("c_swap");
const INVERT = () => common("c_invert");
const even = (): ResearchState => stateOf([entry(CORRECT()), entry(SWAP()), entry(INVERT())], { c_correct: 0.25, c_swap: 0.25, c_invert: 0.25, [OTHER]: 0.25 });

describe("guessOf", () => {
  it("reads which holder is larger (core solve) and who is 1 (the relation's reference) from a world", () => {
    const both = { larger: true, oneOn: true };
    expect(guessOf(runRule(CORRECT(), SIGN()), SIGN(), both)).toEqual({ larger: OTOUTO, oneOn: OTOUTO });
    expect(guessOf(runRule(SWAP(), SIGN()), SIGN(), both)).toEqual({ larger: ANI, oneOn: ANI });
    expect(guessOf(runRule(INVERT(), SIGN()), SIGN(), both)).toEqual({ larger: ANI, oneOn: OTOUTO });
  });

  it("leaves out a part the child did not give", () => {
    expect(guessOf(runRule(INVERT(), SIGN()), SIGN(), { larger: true, oneOn: false })).toEqual({ larger: ANI, oneOn: null });
    expect(guessOf(runRule(INVERT(), SIGN()), SIGN(), { larger: false, oneOn: true })).toEqual({ larger: null, oneOn: OTOUTO });
  });
});

describe("guessLikelihoods", () => {
  it.each([
    ["the larger holder only", { larger: true, oneOn: false }],
    ["the larger holder and the 1", { larger: true, oneOn: true }],
    ["the 1 only", { larger: false, oneOn: true }],
  ])("every model's likelihoods over the answers W gives sum to 1 (%s)", (_label, fields) => {
    const pool = [CORRECT(), SWAP(), INVERT(), common("c_additive")];
    const answers = guessAnswers(pool, SIGN(), fields);
    expect(answers.length).toBeGreaterThan(1);
    const totals: Record<string, number> = {};
    for (const a of answers) {
      for (const [k, v] of Object.entries(guessLikelihoods(pool, SIGN(), a))) totals[k] = (totals[k] ?? 0) + v;
    }
    for (const k of [...pool.map((h) => h.id), OTHER]) expect(totals[k]).toBeCloseTo(1, CLOSE);
  });

  it("gives 1−ε to the answer a model's world implies and ε shared among the others, and other 1/|answers|", () => {
    const pool = [CORRECT(), SWAP()];
    const fields = { larger: true, oneOn: true };
    const n = guessAnswers(pool, SIGN(), fields).length;
    const l = guessLikelihoods(pool, SIGN(), { larger: OTOUTO, oneOn: OTOUTO });
    expect(l.c_correct).toBeCloseTo(1 - EPSILON_CONSTRUCTIVE, CLOSE);
    expect(l.c_swap).toBeCloseTo(EPSILON_CONSTRUCTIVE / (n - 1), CLOSE);
    expect(l[OTHER]).toBeCloseTo(1 / n, CLOSE);
  });
});

describe("observePrediction", () => {
  it("moves the weights by who has more only: the card is observed by the first placement on the same problem (review, Q52)", () => {
    // The card in the guess and the first placement on one problem are not independent observations; counting both
    // would multiply the same evidence twice.
    const withCard = observePrediction(even(), { record: SIGN(), larger: ANI, oneOn: OTOUTO });
    const without = observePrediction(even(), { record: SIGN(), larger: ANI, oneOn: null });
    expect(withCard.weights).toEqual(without.weights);
    expect(sum(withCard.weights)).toBeCloseTo(1, CLOSE);
    // The card alone moves nothing.
    expect(observePrediction(even(), { record: SIGN(), larger: null, oneOn: OTOUTO }).weights).toEqual(even().weights);
  });

  it("with the larger holder only, raises every hypothesis that makes that holder larger alike", () => {
    const out = observePrediction(even(), { record: SIGN(), larger: ANI, oneOn: null });
    expect(out.weights.c_swap as number).toBeGreaterThan(0.25);
    expect(out.weights.c_invert as number).toBeCloseTo(out.weights.c_swap as number, CLOSE);
    expect(out.weights.c_correct as number).toBeLessThan(0.25);
  });

  it("an unknown answer (no larger holder, no 1) changes nothing", () => {
    const s = even();
    expect(observePrediction(s, { record: SIGN(), larger: null, oneOn: null })).toBe(s);
  });

  it("does not count after the word book showed the wording", () => {
    const s = even();
    expect(observePrediction(s, { record: SIGN(), larger: ANI, oneOn: OTOUTO, wordbookOpenedBefore: true })).toBe(s);
  });

  it("does not change the state or the record it was given", () => {
    const s = even();
    const rec = SIGN();
    const before = structuredClone({ s, rec });
    observePrediction(s, { record: rec, larger: ANI, oneOn: ANI });
    expect({ s, rec }).toEqual(before);
  });

  it("never counts toward the problems needed to confirm: the first placement on the same problem already counts it (Q52)", () => {
    // Confirming needs split observations on CONFIRM_OBSERVATIONS problems; the prediction and the first placement
    // are on one problem, so only the placement counts. The weights still move.
    const split = stateOf([entry(CORRECT(), 1), entry(SWAP(), 1)], { c_correct: 0.4, c_swap: 0.4, [OTHER]: 0.2 });
    const out = observePrediction(split, { record: SIGN(), larger: OTOUTO, oneOn: OTOUTO });
    expect(out.pool.map((e) => e.splitObservations)).toEqual([1, 1]);
    expect(out.weights.c_correct).toBeGreaterThan(0.4);
    expect(out.pool.every((e) => e.status === "hypothesis")).toBe(true);
    const lengthOnly = stateOf([entry(SWAP(), 0), entry(INVERT(), 0)], { c_swap: 0.4, c_invert: 0.4, [OTHER]: 0.2 });
    expect(observePrediction(lengthOnly, { record: SIGN(), larger: ANI, oneOn: null }).pool.map((e) => e.splitObservations)).toEqual([0, 0]);
  });

  it("keeps no reading, even with a placed 1: the first placement on the same problem keeps it, so a problem counts once (review, Q52)", () => {
    expect(observePrediction(initialState(), { record: SIGN(), larger: ANI, oneOn: ANI })).toEqual(initialState());
    const s = even();
    expect(observePrediction(s, { record: SIGN(), larger: ANI, oneOn: ANI }).readings).toEqual(s.readings);
  });

  it("with the larger holder only, keeps no reading (no world is fixed by it)", () => {
    const out = observePrediction(initialState(), { record: SIGN(), larger: ANI, oneOn: null });
    expect(out).toEqual(initialState());
  });

  it("refuses a holder that is not an end of the problem's relation", () => {
    expect(() => observePrediction(even(), { record: SIGN(), larger: "h_nobody", oneOn: null })).toThrow();
    expect(() => observePrediction(even(), { record: SIGN(), larger: null, oneOn: "h_nobody" })).toThrow();
  });

  it("keeps the weights summing to 1 and positive over any answers (property)", () => {
    const choice = fc.constantFrom(ANI, OTOUTO, null);
    fc.assert(
      fc.property(fc.array(fc.tuple(choice, choice), { maxLength: 4 }), (steps) => {
        let s = even();
        for (const [larger, oneOn] of steps) s = observePrediction(s, { record: SIGN(), larger, oneOn });
        expect(sum(s.weights)).toBeCloseTo(1, CLOSE);
        expect(Object.values(s.weights).every((v) => v > 0)).toBe(true);
      }),
      { numRuns: 20 },
    );
  });
});
