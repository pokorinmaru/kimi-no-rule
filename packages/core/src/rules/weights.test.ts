// M1 step (7): weights on the hypotheses and "other", the observation models, the expected
// information gain and when a hypothesis counts as confirmed (指示書 第6.7節 手順2 and 手順4,
// 第11節 M1). Written before the implementation.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { ProblemRecord } from "../schema/index.ts";
import { signboardAdditive } from "../../fixtures/problems/signboard.ts";
import { signboardRecord } from "../../fixtures/problems/signboard-record.ts";
import { timesRecord } from "../diagnose/test-records.ts";
import { num } from "../apply/test-worlds.ts";
import { predict } from "./predict.ts";
import type { Hypothesis } from "./run.ts";
import {
  addHypothesis,
  agreementLikelihoods,
  constructiveLikelihoods,
  EPSILON_AGREEMENT,
  EPSILON_CONSTRUCTIVE,
  infoGain,
  mergeHypotheses,
  status,
  update,
  type Weights,
} from "./weights.ts";
import { H, withRelation, wordRecord } from "./test-rules.ts";

const PROPERTY_RUNS = { numRuns: 60 };
const signboard = (): ProblemRecord => structuredClone(signboardRecord);
const POOL: (() => Hypothesis)[] = [H.noChange, H.swap, H.invert, H.additive, H.multiplyAlways, H.divideAlways];
const sum = (r: Record<string, number>): number => Object.values(r).reduce((a, b) => a + b, 0);

const recordArb = fc.oneof(
  fc.constant(signboard()),
  fc.constant(wordRecord()),
  fc.tuple(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 2, max: 6 })).map(([a, k]) => timesRecord(a, k)),
);
const hsArb = fc.subarray(POOL, { minLength: 1 }).map((makers) => makers.map((m) => m()));

/** Positive weights on h_0.. and other, normalized. */
const weightsArb: fc.Arbitrary<Weights> = fc
  .tuple(fc.array(fc.double({ min: 0.01, max: 1, noNaN: true }), { minLength: 1, maxLength: 5 }), fc.double({ min: 0.01, max: 1, noNaN: true }))
  .map(([hs, other]) => {
    const total = hs.reduce((a, b) => a + b, other);
    const w: Weights = { other: other / total };
    hs.forEach((x, i) => {
      w["h_" + String(i)] = x / total;
    });
    return w;
  });

/**
 * Expected information gain of one constructive observation, by its definition: the mutual information
 * between the hypothesis and the observed world, each hypothesis putting 1 - eps on its own class.
 */
function gainByDefinition(weights: number[], classes: number[], n: number, eps: number): number {
  const like = (o: number, c: number): number => (o === c ? 1 - eps : eps / (n - 1));
  let gain = 0;
  for (let o = 0; o < n; o++) {
    const po = weights.reduce((acc, w, i) => acc + w * like(o, classes[i] as number), 0);
    weights.forEach((w, i) => {
      const l = like(o, classes[i] as number);
      gain += w * l * Math.log2(l / po);
    });
  }
  return gain;
}

describe("the constants", () => {
  it("slips are 0.1 for building and 0.2 for agreeing", () => {
    expect(EPSILON_CONSTRUCTIVE).toBe(0.1);
    expect(EPSILON_AGREEMENT).toBe(0.2);
  });
});

describe("constructiveLikelihoods", () => {
  it("1 - eps on the predicted world, eps shared over the others, and 1/|W| for other", () => {
    const pred = predict([H.additive(), H.swap()], signboard(), true);
    const n = pred.worlds.length;
    expect(n).toBe(4);
    const L = constructiveLikelihoods(pred, signboardAdditive, true);
    expect(L.h_additive).toBeCloseTo(1 - EPSILON_CONSTRUCTIVE, 12);
    expect(L.h_swap).toBeCloseTo(EPSILON_CONSTRUCTIVE / (n - 1), 12);
    expect(L.other).toBeCloseTo(1 / n, 12);
  });

  it("a world outside W is added to W before counting", () => {
    const pred = predict([H.additive(), H.swap()], signboard(), true);
    const n = pred.worlds.length;
    const outside = withRelation(signboard().world, "r_ratio", { operator: "more_by", amount: num(1) });
    const L = constructiveLikelihoods(pred, outside, true);
    expect(L.h_additive).toBeCloseTo(EPSILON_CONSTRUCTIVE / n, 12);
    expect(L.h_swap).toBeCloseTo(EPSILON_CONSTRUCTIVE / n, 12);
    expect(L.other).toBeCloseTo(1 / (n + 1), 12);
  });

  it("for every model, the likelihoods over the worlds of W add up to 1 (property)", () => {
    fc.assert(
      fc.property(hsArb, recordArb, fc.boolean(), (hs, rec, seen) => {
        const pred = predict(hs, rec, seen);
        const totals: Record<string, number> = {};
        for (const w of pred.worlds) {
          const L = constructiveLikelihoods(pred, w, seen);
          for (const [k, v] of Object.entries(L)) totals[k] = (totals[k] ?? 0) + v;
        }
        expect(Object.keys(totals).sort()).toEqual([...hs.map((h) => h.id), "other"].sort());
        for (const v of Object.values(totals)) expect(v).toBeCloseTo(1, 9);
      }),
      PROPERTY_RUNS,
    );
  });
});

describe("agreementLikelihoods", () => {
  const pred = () => predict([H.additive(), H.swap()], signboard(), true);
  const shown = () => pred().predictions[0]?.worldClass ?? -1;

  it("fits supports the hypotheses that predicted the shown world", () => {
    const L = agreementLikelihoods(pred(), shown(), "fits");
    expect(L.h_additive).toBeCloseTo(1 - EPSILON_AGREEMENT, 12);
    expect(L.h_swap).toBeCloseTo(EPSILON_AGREEMENT, 12);
    expect(L.other).toBeCloseTo(0.5, 12);
  });

  it("odd is the other way round", () => {
    const L = agreementLikelihoods(pred(), shown(), "odd");
    expect(L.h_additive).toBeCloseTo(EPSILON_AGREEMENT, 12);
    expect(L.h_swap).toBeCloseTo(1 - EPSILON_AGREEMENT, 12);
    expect(L.other).toBeCloseTo(0.5, 12);
  });

  it("unknown is no observation", () => {
    expect(agreementLikelihoods(pred(), shown(), "unknown")).toEqual({ h_additive: 1, h_swap: 1, other: 1 });
  });

  it("for every model, fits and odd add up to 1 (property)", () => {
    fc.assert(
      fc.property(hsArb, recordArb, fc.boolean(), fc.nat(), (hs, rec, seen, pick) => {
        const pr = predict(hs, rec, seen);
        const cls = pick % pr.worlds.length;
        const fits = agreementLikelihoods(pr, cls, "fits");
        const odd = agreementLikelihoods(pr, cls, "odd");
        for (const k of [...hs.map((h) => h.id), "other"]) {
          expect((fits[k] ?? NaN) + (odd[k] ?? NaN)).toBeCloseTo(1, 12);
        }
      }),
      PROPERTY_RUNS,
    );
  });
});

describe("update", () => {
  it("multiplies by the likelihoods and normalizes", () => {
    const w = update({ h_a: 0.5, h_b: 0.25, other: 0.25 }, { h_a: 0.9, h_b: 0.1, other: 0.5 });
    const z = 0.5 * 0.9 + 0.25 * 0.1 + 0.25 * 0.5;
    expect(w.h_a).toBeCloseTo((0.5 * 0.9) / z, 12);
    expect(w.h_b).toBeCloseTo((0.25 * 0.1) / z, 12);
    expect(w.other).toBeCloseTo((0.25 * 0.5) / z, 12);
  });

  it("keeps the sum at 1, and an observation of all ones changes nothing (property)", () => {
    fc.assert(
      fc.property(weightsArb, fc.array(fc.double({ min: 0.01, max: 1, noNaN: true }), { minLength: 6, maxLength: 6 }), (w, ls) => {
        const L: Record<string, number> = {};
        Object.keys(w).forEach((k, i) => {
          L[k] = ls[i] ?? 1;
        });
        expect(sum(update(w, L))).toBeCloseTo(1, 9);
        const ones = Object.fromEntries(Object.keys(w).map((k) => [k, 1]));
        const same = update(w, ones);
        for (const k of Object.keys(w)) expect(same[k]).toBeCloseTo(w[k] ?? NaN, 12);
      }),
      PROPERTY_RUNS,
    );
  });
});

describe("addHypothesis and mergeHypotheses", () => {
  it("a new hypothesis takes half of other", () => {
    const w = addHypothesis({ h_a: 0.5, h_b: 0.3, other: 0.2 }, "h_new");
    expect(w.h_new).toBeCloseTo(0.1, 12);
    expect(w.other).toBeCloseTo(0.1, 12);
    expect(w.h_a).toBeCloseTo(0.5, 12);
    expect(w.h_b).toBeCloseTo(0.3, 12);
  });

  it("adding keeps the ratios between the hypotheses already there, and the sum at 1 (property)", () => {
    fc.assert(
      fc.property(weightsArb, (w) => {
        const next = addHypothesis(w, "h_new");
        expect(sum(next)).toBeCloseTo(1, 9);
        expect(next.h_new).toBeCloseTo((w.other ?? NaN) / 2, 12);
        const old = Object.keys(w).filter((k) => k !== "other");
        for (const a of old) {
          for (const b of old) {
            expect((next[a] ?? NaN) / (next[b] ?? NaN)).toBeCloseTo((w[a] ?? NaN) / (w[b] ?? NaN), 9);
          }
        }
      }),
      PROPERTY_RUNS,
    );
  });

  it("merging adds the weight of the dropped hypothesis to the kept one", () => {
    const w = mergeHypotheses({ h_a: 0.2, h_b: 0.3, h_c: 0.1, other: 0.4 }, "h_a", "h_b");
    expect(Object.keys(w).sort()).toEqual(["h_a", "h_c", "other"]);
    expect(w.h_a).toBeCloseTo(0.5, 12);
    expect(w.h_c).toBeCloseTo(0.1, 12);
    expect(w.other).toBeCloseTo(0.4, 12);
  });
});

describe("infoGain", () => {
  it("is 0 when the hypotheses predict the same world", () => {
    const same = predict([H.swap(), H.multiplyAlways()], signboard(), true);
    expect(infoGain({ h_swap: 0.4, h_multiply: 0.4, other: 0.2 }, same)).toBe(0);
    // Without the 1 card, a swapped base and an inverted multiple cannot be told apart.
    const loose = predict([H.swap(), H.invert()], signboard(), false);
    expect(infoGain({ h_swap: 0.5, h_invert: 0.3, other: 0.2 }, loose)).toBe(0);
    // On a 3 times problem, multiplying always is doing nothing.
    const times = predict([H.noChange(), H.multiplyAlways()], timesRecord(), true);
    expect(infoGain({ h_no_change: 0.6, h_multiply: 0.2, other: 0.2 }, times)).toBe(0);
  });

  it("is 0 with a single hypothesis", () => {
    expect(infoGain({ h_additive: 0.7, other: 0.3 }, predict([H.additive()], signboard(), true))).toBe(0);
  });

  it("is above 0 when the predictions split", () => {
    const seen = predict([H.swap(), H.invert()], signboard(), true);
    expect(infoGain({ h_swap: 0.5, h_invert: 0.3, other: 0.2 }, seen)).toBeGreaterThan(0);
  });

  it("is the mutual information of the hypothesis and the observed world, without other", () => {
    const pred = predict([H.additive(), H.swap()], signboard(), true);
    const classes = pred.predictions.map((x) => x.worldClass);
    const expected = gainByDefinition([0.5, 0.5], classes, pred.worlds.length, EPSILON_CONSTRUCTIVE);
    expect(infoGain({ h_additive: 0.4, h_swap: 0.4, other: 0.2 }, pred)).toBeCloseTo(expected, 9);
    expect(infoGain({ h_additive: 0.25, h_swap: 0.25, other: 0.5 }, pred)).toBeCloseTo(expected, 9);
  });

  it("lies between 0 and the entropy of the hypotheses (property)", () => {
    fc.assert(
      fc.property(hsArb, recordArb, fc.boolean(), (hs, rec, seen) => {
        const pred = predict(hs, rec, seen);
        const w: Weights = { other: 0.1 };
        hs.forEach((h) => {
          w[h.id] = 0.9 / hs.length;
        });
        const g = infoGain(w, pred);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(Math.log2(hs.length) + 1e-9);
      }),
      PROPERTY_RUNS,
    );
  });
});

describe("status", () => {
  it("confirmed at weight 0.8 or more with two constructive observations on splitting problems", () => {
    expect(status(0.8, 2, "hypothesis")).toBe("confirmed");
    expect(status(0.95, 3, "hypothesis")).toBe("confirmed");
  });

  it("stays a hypothesis below 0.8 or with fewer than two such observations", () => {
    expect(status(0.79, 5, "hypothesis")).toBe("hypothesis");
    expect(status(0.99, 1, "hypothesis")).toBe("hypothesis");
    expect(status(0.99, 0, "hypothesis")).toBe("hypothesis");
  });

  it("once confirmed, goes back only below 0.5", () => {
    expect(status(0.6, 2, "confirmed")).toBe("confirmed");
    expect(status(0.5, 2, "confirmed")).toBe("confirmed");
    expect(status(0.49, 2, "confirmed")).toBe("hypothesis");
  });
});

describe("two hypotheses and other on four worlds: two splitting observations confirm", () => {
  it("the difference reading seen twice on the signboard", () => {
    const hs = [H.additive(), H.swap()];
    let w: Weights = { h_additive: 1 / 3, h_swap: 1 / 3, other: 1 / 3 };

    const first = predict(hs, signboard(), true);
    expect(first.worlds).toHaveLength(4);
    expect(first.predictions[0]?.worldClass).not.toBe(first.predictions[1]?.worldClass);
    w = update(w, constructiveLikelihoods(first, signboardAdditive, true));
    // 0.9 against 0.1/3 and 1/4.
    expect(w.h_additive).toBeCloseTo(0.9 / (0.9 + 0.1 / 3 + 0.25), 9);
    expect(status(w.h_additive ?? 0, 1, "hypothesis")).toBe("hypothesis");

    const second = predict(hs, signboard(), true);
    w = update(w, constructiveLikelihoods(second, signboardAdditive, true));
    expect(w.h_additive).toBeCloseTo(0.81 / (0.81 + (0.1 / 3) ** 2 + 0.0625), 9);
    expect(w.h_additive).toBeGreaterThan(0.8);
    expect(sum(w)).toBeCloseTo(1, 12);
    expect(status(w.h_additive ?? 0, 2, "hypothesis")).toBe("confirmed");
    expect(status(w.h_swap ?? 0, 2, "hypothesis")).toBe("hypothesis");
  });
});
