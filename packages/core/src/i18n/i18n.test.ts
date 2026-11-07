// M1 step (8): the fixed sentences of the guide and the junior, in Japanese and English, with typed slots
// (keys and roles from 指示書 第5.6節; the gates of 第5.5節). Written before the implementation.
import { describe, expect, it } from "vitest";
import { signboardCorrect } from "../../fixtures/problems/signboard.ts";
import { num } from "../apply/test-worlds.ts";
import { gate, type GateContext } from "../gates/index.ts";
import {
  TEMPLATE_KEYS,
  TEMPLATES,
  holderName,
  itemName,
  problemNumber,
  render,
  transcript,
  type Lang,
  type TemplateKey,
} from "./index.ts";

const LANGS: Lang[] = ["ja", "en"];
const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();

function ctx(lang: Lang, words: string[] = []): GateContext {
  return {
    correct: structuredClone(signboardCorrect),
    lang,
    childSaid: { numbers: [], words },
    grade: 5,
    interpretationRecorded: true,
    prediction: "answered",
  };
}

/** Slots filled from the signboard problem: the older brother, goldfish, the given 6, and the child's words. */
function slotsFor(key: TemplateKey, lang: Lang) {
  const w = signboardCorrect;
  const words = lang === "ja" ? "弟が1だよ" : "the little brother is one";
  const all = {
    holder: holderName(w, "h_otouto"),
    item: itemName(w, "k_kingyo"),
    number: problemNumber(w, num(6)),
    transcript: transcript(words),
  };
  const needed = TEMPLATES[key].slots;
  return { slots: Object.fromEntries(needed.map((k) => [k, all[k]])), words };
}

describe("every key has at least three ways of saying it, in both languages", () => {
  it.each(TEMPLATE_KEYS)("%s", (key) => {
    for (const lang of LANGS) {
      const variants = TEMPLATES[key][lang];
      expect(variants.length).toBeGreaterThanOrEqual(3);
      expect(new Set(variants).size).toBe(variants.length);
      for (const v of variants) expect(placeholders(v)).toEqual([...TEMPLATES[key].slots].sort());
    }
  });

  it("covers the keys the guide and the junior need", () => {
    for (const key of ["confirm.transcript", "statement.fails", "kohai.read", "kohai.which", "kohai.restate", "distress.reply"]) {
      expect(TEMPLATE_KEYS).toContain(key);
    }
  });
});

describe("every sentence passes the gates when its slots are filled", () => {
  for (const key of TEMPLATE_KEYS) {
    for (const lang of LANGS) {
      it(`${key} (${lang})`, () => {
        const { slots, words } = slotsFor(key, lang);
        for (let i = 0; i < TEMPLATES[key][lang].length; i++) {
          const action = render(key, lang, i, slots);
          expect(gate(action, ctx(lang, [words]))).toEqual({ ok: true });
          expect(action.text).not.toMatch(/\{\w+\}/);
        }
      });
    }
  }
});

describe("words the child should never hear from the app", () => {
  const JUDGING =
    /間違|まちが|正解|せいかい|ルール|だめ|ダメ|ずれ|ズレ|キーワード|決め手|\bwrong\b|\bcorrect\b|\bmistake|\brule\b|\bbad\b|\bkey ?word\b/i;
  const PRAISE = /ありがと|すごい|えらい|さすが|\bthank|\bgreat\b|\bgood job\b|\bwell done\b|\bawesome\b/i;

  it.each(TEMPLATE_KEYS)("%s judges nothing", (key) => {
    for (const lang of LANGS) for (const v of TEMPLATES[key][lang]) expect(v).not.toMatch(JUDGING);
  });

  it.each(TEMPLATE_KEYS.filter((k) => k.startsWith("kohai.")))("%s neither thanks nor praises", (key) => {
    for (const lang of LANGS) for (const v of TEMPLATES[key][lang]) expect(v).not.toMatch(PRAISE);
  });

  it("the distress reply lets the child stop, without assuming the child said anything", () => {
    for (const lang of LANGS) {
      const variants = TEMPLATES["distress.reply"][lang];
      expect(variants.some((v) => (lang === "ja" ? /やめていい/ : /\bstop\b/i).test(v))).toBe(true);
      for (const v of variants) expect(v).not.toMatch(/話してくれ|教えてくれ|telling me|sounds hard|near you|そばにいる/i);
    }
  });

  it("the junior's restating sentences add nothing to the child's words", () => {
    for (const lang of LANGS) {
      for (const v of TEMPLATES["kohai.restate"][lang]) expect(v).toMatch(/「1」|"1"|\bas 1\b/);
      for (const v of TEMPLATES["kohai.restate_word"][lang]) expect(v).not.toMatch(/決め手|key/i);
    }
  });

  it("the distress reply holds no phone number of its own (helplines are shown from a checked list)", () => {
    for (const lang of LANGS) for (const v of TEMPLATES["distress.reply"][lang]) expect(v).not.toMatch(/\d/);
  });
});

describe("slots take only checked values", () => {
  it("a number of the problem may be filled in, the answer may not", () => {
    expect(() => problemNumber(signboardCorrect, num(6))).not.toThrow();
    expect(() => problemNumber(signboardCorrect, num(3, 4))).not.toThrow();
    expect(() => problemNumber(signboardCorrect, num(8))).toThrow();
  });

  it("a holder and an item must exist in the world", () => {
    expect(() => holderName(signboardCorrect, "h_nobody")).toThrow();
    expect(() => itemName(signboardCorrect, "k_nothing")).toThrow();
  });

  it("a slot cannot be faked with a plain object", () => {
    const fake = { kind: "number", text: "8" } as unknown as ReturnType<typeof problemNumber>;
    expect(() => render("unit.mismatch", "ja", 0, { holder: holderName(signboardCorrect, "h_ani"), number: fake })).toThrow();
  });

  it("a missing slot is an error", () => {
    expect(() => render("kohai.restate", "ja", 0, {})).toThrow();
  });

  it("the child's words are handed back as an echo, so the gate treats them as the child's own", () => {
    const action = render("confirm.transcript", "ja", 0, { transcript: transcript("8ひき") });
    expect(action.echo).toBe(true);
    expect(render("kohai.wait", "ja", 0, {}).echo).toBe(false);
  });

  it("the variant wraps around and is the same for the same index", () => {
    const n = TEMPLATES["kohai.wait"].ja.length;
    expect(render("kohai.wait", "ja", n, {}).text).toBe(render("kohai.wait", "ja", 0, {}).text);
  });
});

// Voice input (指示書 第7.1節 手順5, 第11節 M6): the junior acknowledges at once, hands back what it heard as the
// child's own words, and asks for the card when it could not make out the words. Written before the implementation.
describe("the junior's lines for the child's voice", () => {
  it("has a fixed acknowledgement and a fixed ask for the card, with no slot for the child's words", () => {
    for (const key of ["kohai.listening", "kohai.show_card"] as const) {
      expect(TEMPLATE_KEYS).toContain(key);
      expect(TEMPLATES[key].slots).toEqual([]);
    }
    for (const v of TEMPLATES["kohai.show_card"].ja) expect(v).toMatch(/札|カード/);
    for (const v of TEMPLATES["kohai.show_card"].en) expect(v).toMatch(/card/i);
  });

  it("hands back what it heard only through the transcript slot (an echo)", () => {
    expect(TEMPLATES["kohai.restate_heard"].slots).toEqual(["transcript"]);
    const action = render("kohai.restate_heard", "ja", 0, { transcript: transcript("弟が1だよ") });
    expect(action.echo).toBe(true);
    expect(action.text).toContain("弟が1だよ");
  });

  it("an echo of what was heard that holds the answer is refused by the gate", () => {
    const action = render("kohai.restate_heard", "ja", 0, { transcript: transcript("弟は8匹だよ") });
    expect(gate(action, ctx("ja")).ok).toBe(false);
  });
});
