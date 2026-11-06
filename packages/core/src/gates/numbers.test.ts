// M1 step (6): reading numbers out of text for the gates (指示書 第5.5節; criteria from 第11節 M1).
// Written before the implementation.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Rational } from "../schema/index.ts";
import { signboardCorrect } from "../../fixtures/problems/signboard.ts";
import { numbersIn } from "./index.ts";

/** A rational as "n/d" in lowest terms, so values compare without caring how they were reduced. */
function key(r: Rational): string {
  const g = (a: number, b: number): number => (b === 0 ? Math.abs(a) : g(b, a % b));
  const d = g(r.num, r.den) || 1;
  const sign = r.den < 0 ? -1 : 1;
  return `${(sign * r.num) / d}/${(sign * r.den) / d}`;
}
const keys = (text: string): string[] => numbersIn(text).map(key);
const k = (n: number, d = 1): string => key({ num: n, den: d });

const KANJI_DIGITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** 1..9999 written in kanji numerals (one ten is 十, not 一十). */
function kanji(n: number): string {
  let out = "";
  const places: [number, string][] = [
    [1000, "千"],
    [100, "百"],
    [10, "十"],
  ];
  let rest = n;
  for (const [size, unit] of places) {
    const d = Math.floor(rest / size);
    rest %= size;
    if (d === 0) continue;
    out += (d === 1 ? "" : KANJI_DIGITS[d]) + unit;
  }
  return out + KANJI_DIGITS[rest];
}

/** Arabic digits turned into full-width digits. */
const fullWidth = (n: number): string =>
  String(n).replace(/[0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0));

const ENGLISH: [string, number][] = [
  ["zero", 0], ["one", 1], ["two", 2], ["three", 3], ["four", 4], ["five", 5], ["six", 6], ["seven", 7],
  ["eight", 8], ["nine", 9], ["ten", 10], ["eleven", 11], ["twelve", 12], ["thirteen", 13], ["fourteen", 14],
  ["fifteen", 15], ["sixteen", 16], ["seventeen", 17], ["eighteen", 18], ["nineteen", 19], ["twenty", 20],
  ["thirty", 30], ["forty", 40], ["fifty", 50], ["sixty", 60], ["seventy", 70], ["eighty", 80], ["ninety", 90],
  ["hundred", 100], ["thousand", 1000],
];

describe("numbersIn: one number", () => {
  it.each([
    ["8", 8],
    ["15", 15],
    ["八", 8],
    ["十五", 15],
    ["百二十", 120],
    ["８", 8],
    ["１５", 15],
    ["eight", 8],
    ["fifteen", 15],
  ])("%s reads as %d", (text, n) => {
    expect(keys(text)).toEqual([k(n)]);
  });

  it.each(ENGLISH)("the English word %s reads as %d", (word, n) => {
    expect(keys(word)).toEqual([k(n)]);
  });

  it("a fraction a/b is one number, not two", () => {
    expect(keys("3/4")).toEqual([k(3, 4)]);
  });

  it("decimals read as their exact value", () => {
    expect(keys("0.5")).toEqual([k(1, 2)]);
    expect(keys("1.25")).toEqual([k(5, 4)]);
  });

  it("values come back in the schema form with a positive denominator", () => {
    for (const r of numbersIn("3/4 と 0.5 と 八")) {
      expect(Number.isInteger(r.num)).toBe(true);
      expect(Number.isInteger(r.den)).toBe(true);
      expect(r.den).toBeGreaterThan(0);
    }
  });
});

describe("numbersIn: numbers inside sentences", () => {
  it("finds the number in a Japanese sentence, in any of the four ways of writing it", () => {
    for (const x of ["8", "八", "８"]) expect(keys(`弟の金魚は${x}匹です。`)).toEqual([k(8)]);
  });

  it("finds an English number word in an English sentence", () => {
    expect(keys("I think there are eight fish.")).toEqual([k(8)]);
  });

  it("finds every number in a sentence with several", () => {
    expect(keys("兄は6匹、弟は八匹かな。")).toEqual(expect.arrayContaining([k(6), k(8)]));
    expect(keys("兄は6匹、弟は八匹かな。")).toHaveLength(2);
  });

  it("finds 6 and 3/4 in the signboard problem text", () => {
    const found = keys(signboardCorrect.problem_text);
    expect(found).toEqual(expect.arrayContaining([k(6), k(3, 4)]));
  });

  it("a sentence without numbers gives nothing", () => {
    expect(numbersIn("どう読んだのかな。")).toEqual([]);
    expect(numbersIn("Let us look at the picture.")).toEqual([]);
  });
});

describe("numbersIn: property", () => {
  const templatesJa = ["{}", "弟は{}匹です。", "ぼくは{}だと思う", "答えは{}かな"];

  it("an integer written in Arabic, full-width or kanji gives the same value, alone or in a sentence", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9999 }), fc.constantFrom(...templatesJa), (n, t) => {
        const expected = [k(n)];
        for (const written of [String(n), fullWidth(n), kanji(n)]) {
          expect(keys(t.replace("{}", written))).toEqual(expected);
        }
      }),
    );
  });

  it("an English number word gives the same value as its Arabic digits", () => {
    fc.assert(
      fc.property(fc.constantFrom(...ENGLISH), fc.constantFrom("{}", "It is {} fish.", "Maybe {}?"), ([word, n], t) => {
        expect(keys(t.replace("{}", word))).toEqual(keys(t.replace("{}", String(n))));
        expect(keys(t.replace("{}", word))).toEqual([k(n)]);
      }),
    );
  });

  it("a fraction a/b gives the value a/b", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 99 }), fc.integer({ min: 1, max: 99 }), (a, b) => {
        expect(keys(`${a}/${b}`)).toEqual([k(a, b)]);
      }),
    );
  });
});
