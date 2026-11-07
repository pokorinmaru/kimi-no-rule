// Furigana and the read-aloud text (指示書 第8.4b節 読みの配慮). The readings are data written for the exact words
// of each prepared problem; the screen draws them as ruby and the browser reads the spoken form. Written before
// the implementation.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FRACTION_BANK } from "../../fixtures/problems/fraction-bank.ts";
import { PROBLEM_READINGS } from "../../fixtures/problems/readings.ts";
import { UI_READINGS, readingsFor, rubySegments, rubyTokens, spokenText } from "./furigana.ts";

const KANJI = /[一-鿿々]/;
const discDir = fileURLToPath(new URL("../../../../content/problems/discriminating/", import.meta.url));
const disc = readdirSync(discDir)
  .filter((f) => /^p_.*\.json$/.test(f))
  .map((f) => JSON.parse(readFileSync(discDir + f, "utf8")) as { world: { problem_id: string }; statements: { text: string; tokens: string[] }[]; expected_answer: { num: number; den: number } });

const problems = [
  ...FRACTION_BANK.map((r) => ({ id: r.world.problem_id, statements: r.statements, answer: r.expected_answer })),
  ...disc.map((r) => ({ id: r.world.problem_id, statements: r.statements, answer: r.expected_answer })),
];

describe("the readings of the prepared problems", () => {
  it("cover the nine bank problems and the four discriminating problems", () => {
    expect(FRACTION_BANK.length).toBe(9);
    expect(disc.length).toBe(4);
    for (const p of problems) expect(Object.keys(PROBLEM_READINGS), p.id).toContain(p.id);
  });

  it("give every kanji in every sentence a reading", () => {
    for (const p of problems) {
      for (const s of p.statements) {
        for (const seg of rubySegments(s.text, readingsFor(p.id))) {
          if (seg.ruby === null) expect(KANJI.test(seg.text), `${p.id}: ${seg.text} in ${s.text}`).toBe(false);
        }
      }
    }
  });

  it("only for words the problem's own sentences hold, in kana: never a word or number outside the text, so never the answer", () => {
    for (const p of problems) {
      const text = p.statements.map((s) => s.text).join("");
      for (const [word, kana] of Object.entries(PROBLEM_READINGS[p.id] ?? {})) {
        expect(text, `${p.id}: ${word}`).toContain(word);
        expect(kana, `${p.id}: ${word}`).toMatch(/^[ぁ-ゟ|]+$/);
      }
      // The asked number is not in the readings (as digits) nor in the spoken sentences.
      const answer = p.answer === null ? "" : String(p.answer.num);
      expect(answer).not.toBe("");
      for (const s of p.statements) {
        const said = spokenText(s.text, readingsFor(p.id));
        if (!s.text.includes(answer)) expect(said, `${p.id}: ${said}`).not.toContain(answer);
      }
    }
  });

  it("never put one reading across two of the problem's tokens (each word stays a button)", () => {
    for (const p of problems) {
      for (const s of p.statements) {
        const perToken = rubyTokens(s.tokens, readingsFor(p.id));
        expect(perToken.length).toBe(s.tokens.length);
        perToken.forEach((segs, i) => expect(segs.map((x) => x.text).join("")).toBe(s.tokens[i]));
        if (s.tokens.length > 1) {
          // The token-wise ruby is the same as the sentence-wise ruby.
          expect(perToken.flat().filter((x) => x.ruby !== null)).toEqual(rubySegments(s.text, readingsFor(p.id)).filter((x) => x.ruby !== null));
        }
      }
    }
  });
});

describe("rubySegments", () => {
  it("puts the reading on the kanji only; a number before it is context, printed plain", () => {
    expect(rubySegments("姉のリボンは8本です。", { 姉: "あね", "8本": "ぽん" })).toEqual([
      { text: "姉", ruby: "あね" },
      { text: "のリボンは8", ruby: null },
      { text: "本", ruby: "ぽん" },
      { text: "です。", ruby: null },
    ]);
  });

  it("takes the longest word first, and splits a word's reading per kanji when it is written with |", () => {
    expect(rubySegments("何本ですか", { 本: "ほん", 何本: "なん|ぼん" })).toEqual([
      { text: "何", ruby: "なん" },
      { text: "本", ruby: "ぼん" },
      { text: "ですか", ruby: null },
    ]);
  });

  it("keeps okurigana after the kanji plain (話し: はな over 話)", () => {
    expect(rubySegments("話して", { 話し: "はな", 話: "はなし" })).toEqual([
      { text: "話", ruby: "はな" },
      { text: "して", ruby: null },
    ]);
  });

  it("leaves a word with no reading as it is", () => {
    expect(rubySegments("ABC", {})).toEqual([{ text: "ABC", ruby: null }]);
    expect(rubySegments("", {})).toEqual([]);
  });

  it("drops a reading that would cross a token, rather than breaking a word button", () => {
    expect(rubyTokens(["金", "魚"], { 金魚: "きんぎょ" })).toEqual([[{ text: "金", ruby: null }], [{ text: "魚", ruby: null }]]);
  });
});

describe("spokenText", () => {
  it("reads the kanji with their readings and a fraction as the problem says it (b分のa)", () => {
    expect(spokenText("妹のリボンは、姉のリボンの3/4です。", readingsFor("p_fraction_c"))).toBe("いもうとのリボンは、あねのリボンの4分の3です。");
    expect(spokenText("弟の金魚は何匹ですか。", readingsFor("p_signboard"))).toBe("おとうとのきんぎょはなんびきですか。");
  });

  it("reads dL as a word", () => {
    expect(spokenText("小さいびんのジュースは6dLです。", readingsFor("p_disc_c_first_whole_s_motoni_plain_2"))).toContain("6デシリットル");
  });
});

describe("the readings of the fixed lines", () => {
  it("are kana only", () => {
    for (const [w, kana] of Object.entries(UI_READINGS)) {
      expect(KANJI.test(w), w).toBe(true);
      expect(kana, w).toMatch(/^[ぁ-ゟ|]+$/);
    }
  });
});
