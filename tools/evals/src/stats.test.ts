// Confidence intervals and summaries for EVALS.md (指示書 第10.1節).
// Reference values were computed independently (closed-form Wilson score; Clopper-Pearson by bisection
// on the binomial CDF, P(X <= k | n, p) = alpha) and are written here as numbers.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { clopperPearsonUpper, median, percentile, wilson } from "./stats.ts";

describe("wilson", () => {
  const cases: [number, number, number, number][] = [
    [0, 10, 0, 0.2775],
    [5, 10, 0.2366, 0.7634],
    [10, 10, 0.7225, 1],
    [3, 60, 0.0171, 0.137],
    [45, 50, 0.7864, 0.9565],
  ];
  for (const [k, n, low, high] of cases) {
    it(`${k}/${n} -> [${low}, ${high}]`, () => {
      const ci = wilson(k, n);
      expect(ci.low).toBeCloseTo(low, 3);
      expect(ci.high).toBeCloseTo(high, 3);
    });
  }

  it("n = 0 gives the whole range", () => {
    expect(wilson(0, 0)).toEqual({ low: 0, high: 1 });
  });

  it("stays inside [0, 1] and holds k/n", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 500 }).chain((n) => fc.tuple(fc.integer({ min: 0, max: n }), fc.constant(n))), ([k, n]) => {
        const { low, high } = wilson(k, n);
        expect(low).toBeGreaterThanOrEqual(0);
        expect(high).toBeLessThanOrEqual(1);
        expect(low).toBeLessThanOrEqual(k / n + 1e-12);
        expect(high).toBeGreaterThanOrEqual(k / n - 1e-12);
      }),
    );
  });

  it("a wider z gives a wider interval", () => {
    const a = wilson(5, 10, 1.96);
    const b = wilson(5, 10, 2.576);
    expect(b.low).toBeLessThan(a.low);
    expect(b.high).toBeGreaterThan(a.high);
  });

  it("rejects bad input", () => {
    expect(() => wilson(11, 10)).toThrow();
    expect(() => wilson(-1, 10)).toThrow();
    expect(() => wilson(0, -1)).toThrow();
    expect(() => wilson(1.5, 10)).toThrow();
  });
});

describe("clopperPearsonUpper (one-sided)", () => {
  it("0 misses in 60 -> about 0.0487, the closed form 1 - alpha^(1/n)", () => {
    expect(clopperPearsonUpper(0, 60)).toBeCloseTo(0.0487, 4);
    expect(clopperPearsonUpper(0, 60)).toBeCloseTo(1 - Math.pow(0.05, 1 / 60), 9);
  });

  it("k = n -> 1", () => {
    expect(clopperPearsonUpper(10, 10)).toBe(1);
    expect(clopperPearsonUpper(60, 60)).toBe(1);
  });

  // Reference: bisection on P(X <= k | n, p) = 0.05 gives 3/60 -> 0.12419, 1/20 -> 0.21611, 5/10 -> 0.77756.
  it("mid values match the reference", () => {
    expect(clopperPearsonUpper(3, 60)).toBeCloseTo(0.12419, 4);
    expect(clopperPearsonUpper(1, 20)).toBeCloseTo(0.21611, 4);
    expect(clopperPearsonUpper(5, 10)).toBeCloseTo(0.77756, 4);
  });

  it("the bound is where P(X <= k) equals alpha", () => {
    const cdf = (k: number, n: number, p: number) => {
      let s = 0;
      let c = 1;
      for (let i = 0; i <= k; i++) {
        s += c * Math.pow(p, i) * Math.pow(1 - p, n - i);
        c = (c * (n - i)) / (i + 1);
      }
      return s;
    };
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 80 }).chain((n) => fc.tuple(fc.integer({ min: 0, max: n - 1 }), fc.constant(n))), ([k, n]) => {
        const u = clopperPearsonUpper(k, n);
        expect(u).toBeGreaterThan(k / n);
        expect(u).toBeLessThan(1);
        expect(cdf(k, n, u)).toBeCloseTo(0.05, 4);
      }),
      { numRuns: 100 },
    );
  });

  it("a smaller alpha gives a higher bound", () => {
    expect(clopperPearsonUpper(0, 60, 0.01)).toBeCloseTo(1 - Math.pow(0.01, 1 / 60), 9);
    expect(clopperPearsonUpper(3, 60, 0.01)).toBeGreaterThan(clopperPearsonUpper(3, 60));
  });

  it("rejects bad input", () => {
    expect(() => clopperPearsonUpper(11, 10)).toThrow();
    expect(() => clopperPearsonUpper(-1, 10)).toThrow();
    expect(() => clopperPearsonUpper(0, 0)).toThrow();
    expect(() => clopperPearsonUpper(0, 10, 0)).toThrow();
    expect(() => clopperPearsonUpper(0, 10, 1)).toThrow();
  });
});

describe("median and percentile (nearest rank)", () => {
  it("median of an odd list is the middle value, whatever the order", () => {
    expect(median([30, 10, 20])).toBe(20);
    expect(median([5])).toBe(5);
    expect(median([9, 1, 7, 3, 5])).toBe(5);
  });

  it("does not change its input", () => {
    const xs = [3, 1, 2];
    median(xs);
    percentile(xs, 95);
    expect(xs).toEqual([3, 1, 2]);
  });

  it("percentile takes the value at rank ceil(p/100 * n), p in 0..100", () => {
    const xs = [15, 20, 35, 40, 50];
    expect(percentile(xs, 30)).toBe(20);
    expect(percentile(xs, 40)).toBe(20);
    expect(percentile(xs, 50)).toBe(35);
    expect(percentile(xs, 100)).toBe(50);
    expect(percentile(xs, 0)).toBe(15);
    const hundred = Array.from({ length: 100 }, (_, i) => 100 - i);
    expect(percentile(hundred, 95)).toBe(95);
    expect(percentile([30, 10, 20], 95)).toBe(30);
  });

  it("the percentile is always one of the values", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 10_000 }), { minLength: 1, maxLength: 50 }), fc.integer({ min: 0, max: 100 }), (xs, p) => {
        expect(xs).toContain(percentile(xs, p));
      }),
    );
  });

  it("rejects bad input", () => {
    expect(() => median([])).toThrow();
    expect(() => percentile([], 50)).toThrow();
    expect(() => percentile([1, 2], -1)).toThrow();
    expect(() => percentile([1, 2], 101)).toThrow();
    expect(() => median([1, Number.NaN])).toThrow();
  });
});
