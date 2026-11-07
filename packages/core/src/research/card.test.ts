// 指示書 第7.1節「後輩のルールカード」, 第2節「自分で直す」: the card the child edits with a finger. The options are
// a fixed set of core's common readings that change who is 1; each one's slot text keeps the card's rules
// (no number but the 1, no operation, no judging word, nothing placed on the child), in both languages; and
// whether a card makes a solved problem's world fit is decided here, by running the rule and checking the
// sentences. Written before the implementation.
import { describe, expect, it } from "vitest";
import type { ProblemRecord } from "../schema/index.ts";
import { FRACTION_BANK } from "../../fixtures/problems/fraction-bank.ts";
import { runRule } from "../rules/run.ts";
import { sameReading } from "../rules/same-reading.ts";
import { gate, numbersIn } from "../gates/index.ts";
import { act, always } from "../rules/test-rules.ts";
import { CARD_RULES, CORRECT_READING_ID, COMMON_FRACTION_READINGS, cardFailing, cardFits, cardSlot, readingCard } from "./index.ts";

const bank = (id: string): ProblemRecord => {
  const r = FRACTION_BANK.find((x) => x.world.problem_id === id);
  if (r === undefined) throw new Error("no bank problem " + id);
  return structuredClone(r);
};
const rule = (id: string) => {
  const h = CARD_RULES.find((x) => x.id === id);
  if (h === undefined) throw new Error("no card rule " + id);
  return h;
};

const BANNED_JA = ["君", "きみ", "あなた", "まちがい", "間違", "正し", "つられ", "すごい", "ありがとう", "たす", "ひく", "かける", "わる", "足し", "引き", "掛け", "割"];
const BANNED_EN =
  /\b(?:you|your|yours|wrong|mistakes?|mistaken|correct(?:ly)?|incorrect|right|error|fooled|tricked|great|thanks?|add|adds|added|plus|subtract\w*|minus|multipl\w*|times|divid\w*|division|sum|product|quotient|difference|half|halves|twice|double)\b/i;
const JAPANESE = /[぀-ヿ㐀-鿿！-｠]/;
const strip1 = (t: string): string => t.split("1とみる").join("").replace(/\bas 1\b/g, "");

describe("the rule card's options (指示書 第7.1節 後輩のルールカード)", () => {
  it("are core's common readings that change who is 1, and the reading that keeps the sentence's own", () => {
    expect(CARD_RULES.map((h) => h.id).sort()).toEqual([CORRECT_READING_ID, "c_first_whole", "c_known_whole", "c_swap"].sort());
    for (const h of CARD_RULES) expect(COMMON_FRACTION_READINGS.map((x) => x.id)).toContain(h.id);
    expect(new Set(CARD_RULES.map((h) => h.id)).size).toBe(CARD_RULES.length);
  });

  it("pins the slot of the reading that keeps who the sentence says, in both languages", () => {
    expect(cardSlot(rule(CORRECT_READING_ID), "ja")).toBe("文が言うとおりの人を、1とみる");
    expect(cardSlot(rule(CORRECT_READING_ID), "en")).toBe("takes as 1 the person the sentence says");
    expect(readingCard(rule(CORRECT_READING_ID), undefined, "ja", { forEdit: true })).toBe("後輩の読み方：文が言うとおりの人を、1とみる");
    expect(readingCard(rule(CORRECT_READING_ID), undefined, "en", { forEdit: true })).toBe("Junior's reading: takes as 1 the person the sentence says");
  });

  it("leaves the plain card as it was: a rule that changes nothing still has no card outside the editor", () => {
    expect(readingCard(rule(CORRECT_READING_ID))).toBeNull();
    expect(readingCard(rule(CORRECT_READING_ID), undefined, "en")).toBeNull();
    expect(readingCard(rule("c_known_whole"))).toBe("後輩の読み方：わかっている数の人を、1とみる");
  });

  it("the editor's card is the prefix and the slot, even on a problem where the reading builds the sentence's world", () => {
    const signboard = bank("p_signboard");
    for (const h of CARD_RULES) {
      for (const lang of ["ja", "en"] as const) {
        const slot = cardSlot(h, lang);
        expect(slot, h.id).not.toBeNull();
        const prefix = lang === "ja" ? "後輩の読み方：" : "Junior's reading: ";
        expect(readingCard(h, signboard, lang, { forEdit: true })).toBe(`${prefix}${slot as string}`);
      }
    }
  });

  it.each(CARD_RULES.map((h) => [h.id, h] as const))("the Japanese slot of %s keeps the card's rules", (_id, h) => {
    const text = cardSlot(h, "ja") as string;
    expect(text.length).toBeGreaterThan(0);
    expect(text.length).toBeLessThanOrEqual(20);
    expect(text).not.toMatch(/\n/);
    expect(strip1(text)).not.toMatch(/[0-9０-９一二三四五六七八九十百千]/);
    expect(numbersIn(strip1(text))).toEqual([]);
    for (const w of BANNED_JA) expect(text, w).not.toContain(w);
  });

  it.each(CARD_RULES.map((h) => [h.id, h] as const))("the English slot of %s keeps the card's rules", (_id, h) => {
    const text = cardSlot(h, "en") as string;
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/\n/);
    expect(text).not.toMatch(BANNED_EN);
    expect(text).not.toMatch(JAPANESE);
    expect(strip1(text)).not.toMatch(/[0-9０-９]/);
    expect(numbersIn(strip1(text))).toEqual([]);
  });

  it("every editor card passes core's gate as something the junior says, on every bank problem and in both languages", () => {
    for (const record of FRACTION_BANK) {
      for (const lang of ["ja", "en"] as const) {
        for (const h of CARD_RULES) {
          const text = readingCard(h, record, lang, { forEdit: true }) as string;
          const ctx = { correct: record.world, lang, childSaid: { numbers: [], words: [] }, grade: record.world.grade, interpretationRecorded: false, prediction: "disabled" as const };
          expect(gate({ kind: "say", text: strip1(text) }, ctx), `${record.world.problem_id} ${h.id} ${lang}`).toEqual({ ok: true });
        }
      }
    }
  });

  it("gives a slot only for the actions that choose who is 1 (and the one that keeps it)", () => {
    expect(cardSlot(always("h", act.additive("numerator")), "ja")).toBeNull();
    expect(cardSlot(always("h", act.invert()), "en")).toBeNull();
    expect(cardSlot(always("h", act.chooseBy("first_mentioned")), "ja")).toBe("先に出てきた人を、1とみる");
  });
});

describe("whether a card makes a problem's world fit (core runs the rule and checks every sentence)", () => {
  it("names the sentences that do not hold in the world the card's rule builds", () => {
    for (const record of FRACTION_BANK) {
      for (const h of CARD_RULES) {
        const failing = cardFailing(h, record);
        expect(failing, `${record.world.problem_id} ${h.id}`).not.toBeNull();
        const same = sameReading(runRule(h, record), record.world, true);
        // A rule that builds the sentence's own world leaves no sentence unlit; any other lights one.
        expect((failing as number[]).length === 0, `${record.world.problem_id} ${h.id}`).toBe(same);
        for (const i of failing as number[]) expect(record.statements.map((s) => s.index)).toContain(i);
      }
    }
  });

  it("the reading that keeps the sentence's own 1 fits every bank problem; swapping fits none", () => {
    expect(cardFits(rule(CORRECT_READING_ID), FRACTION_BANK)).toBe(true);
    for (const r of FRACTION_BANK) expect(cardFits(rule("c_swap"), [r]), r.world.problem_id).toBe(false);
  });

  it("the known-number reading fits a gallery only when it fits each problem of it", () => {
    const fits = FRACTION_BANK.filter((r) => cardFits(rule("c_known_whole"), [r]));
    const not = FRACTION_BANK.filter((r) => !cardFits(rule("c_known_whole"), [r]));
    expect(fits.length).toBeGreaterThan(0);
    expect(not.length).toBeGreaterThan(0);
    expect(cardFits(rule("c_known_whole"), fits)).toBe(true);
    expect(cardFits(rule("c_known_whole"), [...fits, not[0] as ProblemRecord])).toBe(false);
  });

  it("an empty gallery is never taken as fitting", () => {
    expect(cardFits(rule(CORRECT_READING_ID), [])).toBe(false);
  });

  it("a record core cannot run counts as not fitting (null), never as fitting", () => {
    const broken = { ...bank("p_signboard"), syntax_marks: null as never };
    expect(cardFailing(rule("c_known_whole"), broken)).toBeNull();
    expect(cardFits(rule(CORRECT_READING_ID), [broken])).toBe(false);
  });
});
