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
  const JUDGING = /間違|まちが|正解|せいかい|ルール|だめ|ダメ|\bwrong\b|\bcorrect\b|\bmistake|\brule\b|\bbad\b/i;
  const PRAISE = /ありがと|すごい|えらい|さすが|\bthank|\bgreat\b|\bgood job\b|\bwell done\b|\bawesome\b/i;

  it.each(TEMPLATE_KEYS)("%s judges nothing", (key) => {
    for (const lang of LANGS) for (const v of TEMPLATES[key][lang]) expect(v).not.toMatch(JUDGING);
  });

  it.each(TEMPLATE_KEYS.filter((k) => k.startsWith("kohai.")))("%s neither thanks nor praises", (key) => {
    for (const lang of LANGS) for (const v of TEMPLATES[key][lang]) expect(v).not.toMatch(PRAISE);
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
