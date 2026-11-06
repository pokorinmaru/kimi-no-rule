// M1 step (2): exact rational numbers for solve (指示書 第5.2節「数の表し方」).
// Written before the implementation; the API below is what src/rational/index.ts must provide.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  add,
  cmp,
  div,
  eq,
  fromSchema,
  inv,
  isInteger,
  isZero,
  mul,
  neg,
  rat,
  sub,
  toSchema,
  toString,
  type Rational,
} from "./index.ts";

const gcd = (a: bigint, b: bigint): bigint => {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
};

const bigintArb = fc.bigInt({ min: -10_000n, max: 10_000n });
const nonZeroBigint = bigintArb.filter((n) => n !== 0n);
const ratArb: fc.Arbitrary<Rational> = fc.tuple(bigintArb, nonZeroBigint).map(([n, d]) => rat(n, d));
const nonZeroRat = ratArb.filter((r) => !isZero(r));

function expectNormalized(r: Rational): void {
  expect(typeof r.num).toBe("bigint");
  expect(typeof r.den).toBe("bigint");
  expect(r.den > 0n).toBe(true);
  expect(gcd(r.num, r.den)).toBe(r.num === 0n ? r.den : 1n);
  if (r.num === 0n) expect(r.den).toBe(1n);
}

describe("rat: normalization", () => {
  it("reduces to lowest terms", () => {
    expect(rat(6, 4)).toEqual({ num: 3n, den: 2n });
    expect(rat(12n, 3n)).toEqual({ num: 4n, den: 1n });
  });

  it("keeps the sign in the numerator", () => {
    expect(rat(1, -2)).toEqual({ num: -1n, den: 2n });
    expect(rat(-1, -2)).toEqual({ num: 1n, den: 2n });
    expect(rat(-3, 6)).toEqual({ num: -1n, den: 2n });
  });

  it("has a single form for zero", () => {
    expect(rat(0, 5)).toEqual({ num: 0n, den: 1n });
    expect(rat(0, -7)).toEqual({ num: 0n, den: 1n });
    expect(rat(0)).toEqual({ num: 0n, den: 1n });
  });

  it("defaults the denominator to 1 and accepts mixed bigint/number", () => {
    expect(rat(5)).toEqual({ num: 5n, den: 1n });
    expect(rat(5n, 10)).toEqual({ num: 1n, den: 2n });
    expect(rat(5, 10n)).toEqual({ num: 1n, den: 2n });
  });

  it("throws on a zero denominator", () => {
    expect(() => rat(1, 0)).toThrow();
    expect(() => rat(1n, 0n)).toThrow();
  });

  it("throws on non-integer or non-finite numbers", () => {
    expect(() => rat(1.5)).toThrow();
    expect(() => rat(1, 2.5)).toThrow();
    expect(() => rat(Number.NaN)).toThrow();
    expect(() => rat(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("property: every result is normalized, and equal fractions have one representation", () => {
    fc.assert(
      fc.property(bigintArb, nonZeroBigint, nonZeroBigint, (n, d, k) => {
        const a = rat(n, d);
        expectNormalized(a);
        expect(rat(n * k, d * k)).toEqual(a);
      }),
    );
  });
});

describe("arithmetic and comparison on examples", () => {
  it("adds, subtracts, multiplies, divides", () => {
    expect(add(rat(1, 2), rat(1, 3))).toEqual(rat(5, 6));
    expect(sub(rat(1, 2), rat(3, 4))).toEqual(rat(-1, 4));
    expect(mul(rat(2, 3), rat(9, 4))).toEqual(rat(3, 2));
    expect(div(rat(6), rat(3, 4))).toEqual(rat(8));
    expect(div(rat(3, 4), rat(-3, 2))).toEqual(rat(-1, 2));
  });

  it("negates and inverts", () => {
    expect(neg(rat(3, 4))).toEqual(rat(-3, 4));
    expect(neg(rat(0))).toEqual(rat(0));
    expect(inv(rat(3, 4))).toEqual(rat(4, 3));
    expect(inv(rat(-2, 5))).toEqual({ num: -5n, den: 2n });
  });

  it("throws when inverting or dividing by zero", () => {
    expect(() => inv(rat(0))).toThrow();
    expect(() => div(rat(1), rat(0))).toThrow();
  });

  it("compares", () => {
    expect(Math.sign(cmp(rat(1, 2), rat(2, 3)))).toBe(-1);
    expect(Math.sign(cmp(rat(2, 3), rat(1, 2)))).toBe(1);
    expect(cmp(rat(2, 4), rat(1, 2))).toBe(0);
    expect(Math.sign(cmp(rat(-1, 2), rat(0)))).toBe(-1);
    expect(eq(rat(2, 4), rat(1, 2))).toBe(true);
    expect(eq(rat(1, 2), rat(-1, 2))).toBe(false);
  });

  it("isZero and isInteger", () => {
    expect(isZero(rat(0, 3))).toBe(true);
    expect(isZero(rat(1, 3))).toBe(false);
    expect(isInteger(rat(8, 2))).toBe(true);
    expect(isInteger(rat(-6))).toBe(true);
    expect(isInteger(rat(9, 2))).toBe(false);
  });

  it("toString", () => {
    expect(toString(rat(3, 2))).toBe("3/2");
    expect(toString(rat(-1, 2))).toBe("-1/2");
    expect(toString(rat(8))).toBe("8");
    expect(toString(rat(0))).toBe("0");
  });
});

describe("field laws (property)", () => {
  it("addition and multiplication are associative", () => {
    fc.assert(
      fc.property(ratArb, ratArb, ratArb, (a, b, c) => {
        expect(add(add(a, b), c)).toEqual(add(a, add(b, c)));
        expect(mul(mul(a, b), c)).toEqual(mul(a, mul(b, c)));
      }),
    );
  });

  it("addition and multiplication are commutative", () => {
    fc.assert(
      fc.property(ratArb, ratArb, (a, b) => {
        expect(add(a, b)).toEqual(add(b, a));
        expect(mul(a, b)).toEqual(mul(b, a));
      }),
    );
  });

  it("multiplication distributes over addition", () => {
    fc.assert(
      fc.property(ratArb, ratArb, ratArb, (a, b, c) => {
        expect(mul(a, add(b, c))).toEqual(add(mul(a, b), mul(a, c)));
      }),
    );
  });

  it("additive inverse and identity", () => {
    fc.assert(
      fc.property(ratArb, (a) => {
        expect(add(a, neg(a))).toEqual(rat(0));
        expect(isZero(add(a, neg(a)))).toBe(true);
        expect(add(a, rat(0))).toEqual(a);
        expect(sub(a, a)).toEqual(rat(0));
      }),
    );
  });

  it("multiplicative inverse and identity", () => {
    fc.assert(
      fc.property(nonZeroRat, (a) => {
        expect(mul(a, inv(a))).toEqual(rat(1));
        expect(inv(inv(a))).toEqual(a);
        expect(mul(a, rat(1))).toEqual(a);
      }),
    );
  });

  it("sub and div agree with add/neg and mul/inv", () => {
    fc.assert(
      fc.property(ratArb, nonZeroRat, (a, b) => {
        expect(sub(a, b)).toEqual(add(a, neg(b)));
        expect(div(a, b)).toEqual(mul(a, inv(b)));
      }),
    );
  });

  it("results stay normalized", () => {
    fc.assert(
      fc.property(ratArb, nonZeroRat, (a, b) => {
        for (const r of [add(a, b), sub(a, b), mul(a, b), div(a, b), neg(a), inv(b)]) expectNormalized(r);
      }),
    );
  });
});

describe("cmp is consistent with sub (property)", () => {
  it("sign of cmp(a, b) is the sign of a - b", () => {
    fc.assert(
      fc.property(ratArb, ratArb, (a, b) => {
        const d = sub(a, b);
        const expected = d.num === 0n ? 0 : d.num > 0n ? 1 : -1;
        expect(Math.sign(cmp(a, b))).toBe(expected);
        expect(Math.sign(cmp(b, a))).toBe(-expected);
        expect(eq(a, b)).toBe(expected === 0);
      }),
    );
  });

  it("isInteger matches den === 1", () => {
    fc.assert(fc.property(ratArb, (a) => expect(isInteger(a)).toBe(a.den === 1n)));
  });
});

describe("conversion to and from the schema form (指示書 第5.1節)", () => {
  it("fromSchema reads numbers and normalizes", () => {
    expect(fromSchema({ num: 6, den: 4 })).toEqual({ num: 3n, den: 2n });
    expect(fromSchema({ num: 3, den: 1 })).toEqual({ num: 3n, den: 1n });
    expect(fromSchema({ num: -2, den: 4 })).toEqual({ num: -1n, den: 2n });
  });

  it("fromSchema throws on a zero denominator", () => {
    expect(() => fromSchema({ num: 1, den: 0 })).toThrow();
  });

  it("toSchema writes plain numbers", () => {
    const s = toSchema(rat(9, 2));
    expect(s).toEqual({ num: 9, den: 2 });
    expect(typeof s.num).toBe("number");
    expect(typeof s.den).toBe("number");
  });

  it("toSchema throws when a part is outside the safe integer range", () => {
    expect(() => toSchema(rat(BigInt(Number.MAX_SAFE_INTEGER) + 2n, 1))).toThrow();
  });

  it("property: round trip in both directions", () => {
    fc.assert(fc.property(ratArb, (a) => expect(fromSchema(toSchema(a))).toEqual(a)));
    fc.assert(
      fc.property(fc.integer({ min: -10_000, max: 10_000 }), fc.integer({ min: 1, max: 10_000 }), (n, d) => {
        const once = toSchema(fromSchema({ num: n, den: d }));
        expect(fromSchema(once)).toEqual(rat(n, d));
        expect(toSchema(fromSchema(once))).toEqual(once);
      }),
    );
  });
});
