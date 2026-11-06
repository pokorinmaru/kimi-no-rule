// M1 step (7): the world each hypothesis predicts, and the set W of worlds a problem can make
// (指示書 第5.8節, 第6.7節). Written before the implementation.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { ProblemRecord } from "../schema/index.ts";
import { signboardCorrect } from "../../fixtures/problems/signboard.ts";
import { signboardRecord } from "../../fixtures/problems/signboard-record.ts";
import { misreadCandidates } from "../diagnose/candidates.ts";
import { timesRecord } from "../diagnose/test-records.ts";
import { predict } from "./predict.ts";
import { runRule, type Hypothesis } from "./run.ts";
import { sameReading } from "./same-reading.ts";
import { H, wordRecord } from "./test-rules.ts";

const signboard = (): ProblemRecord => structuredClone(signboardRecord);
const POOL: (() => Hypothesis)[] = [H.noChange, H.swap, H.invert, H.additive, H.multiplyAlways, H.divideAlways, H.chooseKnown];

describe("predict on the signboard", () => {
  it("one prediction per hypothesis, in the order given, with the world runRule makes", () => {
    const hs = [H.additive(), H.swap(), H.noChange()];
    const { predictions } = predict(hs, signboard(), true);
    expect(predictions.map((x) => x.hypothesisId)).toEqual(["h_additive", "h_swap", "h_no_change"]);
    predictions.forEach((x, i) => {
      expect(x.world).toEqual(runRule(hs[i] as Hypothesis, signboard()));
    });
  });

  it("with the 1 card seen, the correct, difference, swapped and inverted worlds are four", () => {
    const { predictions, worlds } = predict([H.additive(), H.swap(), H.invert(), H.noChange()], signboard(), true);
    expect(worlds).toHaveLength(4);
    expect(new Set(predictions.map((x) => x.worldClass)).size).toBe(4);
  });

  it("without the 1 card, the swapped and inverted worlds are one", () => {
    const { predictions, worlds } = predict([H.additive(), H.swap(), H.invert(), H.noChange()], signboard(), false);
    expect(worlds).toHaveLength(3);
    const cls = Object.fromEntries(predictions.map((x) => [x.hypothesisId, x.worldClass]));
    expect(cls.h_swap).toBe(cls.h_invert);
    expect(cls.h_swap).not.toBe(cls.h_additive);
  });

  it("the class of doing nothing is the correct world", () => {
    const { predictions, worlds } = predict([H.noChange()], signboard(), true);
    const cls = predictions[0]?.worldClass ?? -1;
    expect(sameReading(worlds[cls] ?? signboardCorrect, signboardCorrect, true)).toBe(true);
  });

  it("the sentences hold in the correct world and the multiple sentence fails in the misreadings", () => {
    const { predictions } = predict([H.noChange(), H.additive(), H.swap()], signboard(), true);
    for (const x of predictions) expect(x.verdicts).toHaveLength(signboardRecord.statements.length);
    expect(predictions[0]?.verdicts).not.toContain("fails");
    expect(predictions[1]?.verdicts[1]).toBe("fails");
    expect(predictions[2]?.verdicts[1]).toBe("fails");
  });

  it("is the same on every call", () => {
    const hs = [H.swap(), H.additive(), H.invert()];
    expect(predict(hs, signboard(), true)).toEqual(predict(hs, signboard(), true));
  });
});

describe("the set W (property)", () => {
  const recordArb = fc.oneof(
    fc.constant(signboard()),
    fc.constant(wordRecord()),
    fc.tuple(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 2, max: 6 })).map(([a, k]) => timesRecord(a, k)),
  );
  const hsArb = fc.subarray(POOL, { minLength: 1 }).map((makers) => makers.map((m) => m()));

  it("holds the correct world, every misreading candidate and every prediction, each once", () => {
    fc.assert(
      fc.property(hsArb, recordArb, fc.boolean(), (hs, rec, seen) => {
        const { predictions, worlds } = predict(hs, rec, seen);
        const inW = (w: ProblemRecord["world"]) => worlds.filter((x) => sameReading(x, w, seen)).length;
        expect(inW(rec.world)).toBe(1);
        for (const c of misreadCandidates(rec.world)) expect(inW(c.world)).toBe(1);
        for (const x of predictions) {
          expect(x.worldClass).toBeGreaterThanOrEqual(0);
          expect(x.worldClass).toBeLessThan(worlds.length);
          expect(sameReading(worlds[x.worldClass] ?? rec.world, x.world, seen)).toBe(true);
          expect(inW(x.world)).toBe(1);
        }
      }),
      { numRuns: 40 },
    );
  });
});
