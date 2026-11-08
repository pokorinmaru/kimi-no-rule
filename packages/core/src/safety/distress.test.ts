import { describe, expect, it } from "vitest";
import { DISTRESS_WORDS, hasDistressWord } from "./distress.ts";

describe("hasDistressWord", () => {
  it("finds every listed word, in katakana and full width too", () => {
    for (const w of [...DISTRESS_WORDS.ja, ...DISTRESS_WORDS.en]) expect(hasDistressWord(`きょうは${w}よ`), w).toBe(true);
    expect(hasDistressWord("ツライ")).toBe(true);
    expect(hasDistressWord("ＨＥＬＰ ＭＥ")).toBe(true);
  });

  it("finds none in words about the problem", () => {
    expect(hasDistressWord("AIくんの金魚を1とみるんだよ")).toBe(false);
  });
});
