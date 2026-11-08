// The ten gates on what the junior says, on the signboard problem (指示書 第6.8節, 第11節 M1b).
// Each gate has an utterance it stops and one it lets through. The junior world is the procedural
// reading (the younger brother is 3/4 of the older one), so its tape for the younger brother is shorter.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { KohaiUtterance } from "@kimi/core";
import { kohaiGates, type GateRule, type KohaiInput, type KohaiIntent } from "./kohai.ts";
import { READ_OK, RESTATE_OK, WHICH_OK, gateCtx, kohaiWorld, record } from "./test-support.ts";

function input(intent: KohaiIntent, over: Partial<KohaiInput> = {}): KohaiInput {
  return {
    intent,
    lang: "ja",
    kohaiWorld: kohaiWorld(),
    statements: record().statements,
    childOps: { holderIds: ["h_otouto"], words: ["の"] },
    ...over,
  };
}

const say = (intent: KohaiIntent, utterance: string, refers_to: string[] = [], lang: "ja" | "en" = "ja"): KohaiUtterance => ({
  intent,
  utterance,
  refers_to,
  lang,
});

function rules(u: KohaiUtterance, inp: KohaiInput = input(u.intent)): GateRule[] {
  return kohaiGates(u, inp, gateCtx(inp.lang));
}


describe("kohaiGates: utterances that pass every gate", () => {
  it.each([
    ["read", READ_OK],
    ["which", WHICH_OK],
    ["restate", RESTATE_OK],
  ] as const)("%s", (_name, u) => {
    expect(rules(u)).toEqual([]);
  });

  it("a number and words from the problem pass", () => {
    expect(rules(say("read", "この読み方だと、兄の金魚は6匹です。", ["q_ani"]))).toEqual([]);
  });

  it("is pure: the same answer twice, and the input is left as it was", () => {
    const inp = input("read");
    const before = structuredClone(inp);
    const u = say("read", "弟の金魚は8匹です。", ["q_otouto"]);
    expect(rules(u, inp)).toEqual(rules(u, inp));
    expect(inp).toEqual(before);
  });
});

describe("gate 1: answer_leak", () => {
  it.each(["この読み方だと、弟の金魚は8匹です。", "弟の金魚は、はっぴきです。", "弟の金魚は八匹です。", "弟は、はちです。"])(
    "stops %s",
    (t) => {
      expect(rules(say("read", t, ["q_otouto"]))).toContain("answer_leak");
    },
  );

  it("lets the given numbers through", () => {
    expect(rules(say("read", "この読み方だと、兄の金魚は6匹です。", ["q_ani"]))).not.toContain("answer_leak");
    expect(rules(say("read", "兄の金魚は、ろっぴきです。", ["q_ani"]))).not.toContain("answer_leak");
  });

  it("property: the answer in any form, anywhere in a sentence, is stopped", () => {
    const forms = ["8", "８", "八", "はち", "はっぴき", "8匹"];
    const parts = ["この読み方だと、", "弟の金魚は", "テープが", "です。", ""];
    fc.assert(
      fc.property(fc.constantFrom(...forms), fc.constantFrom(...parts), fc.constantFrom(...parts), (form, before, after) => {
        const got = rules(say("read", `${before}${form}${after}`, ["q_otouto"]));
        expect(got).toContain("answer_leak");
      }),
    );
  });
});

describe("gate 2: relation_word", () => {
  it.each(["弟の金魚は、兄より多いはずです。", "本当は、弟のテープが長いです。", "弟の金魚は、兄の倍です。"])("stops %s", (t) => {
    expect(rules(say("read", t, ["q_otouto"]))).toContain("relation_word");
  });

  it("stops an English word for the right direction", () => {
    const inp = input("read", { lang: "en" });
    expect(rules(say("read", "The tape of 弟 should be longer.", ["q_otouto"], "en"), inp)).toContain("relation_word");
  });

  // Live eval (leak judge, 2026-11-07) and the safety review after it: listing the phrasings that name a base
  // could not close the hole (をもとにすると, に対して, を1とみると, full-width or kana fractions, English variants).
  // A generated reading or "which" line now says no relation figure and no "1" outside a sentence quoted as written.
  const BASE_SAID = [
    "弟は兄の3/4、こう読んだよ。",
    "兄の金魚は、弟の金魚の数の3/4です。",
    "兄は弟の4分の3だと読みました。",
    "兄は、弟をもとにすると3/4です。",
    "兄は弟にたいして3/4です。",
    "兄は弟とくらべて3/4です。",
    "兄は弟のながさの3/4です。",
    "兄は弟の、3/4です。",
    "兄は弟の３／４です。",
    "兄は弟のよんぶんのさんです。",
    "兄は弟の0.75です。",
    "弟を1とみると、兄は短いです。",
  ];
  it.each(BASE_SAID)("stops a relation figure or a 1 in a reading line: %s", (t) => {
    expect(rules(say("read", t, ["q_ani"]))).toContain("relation_word");
  });

  it.each(["兄は弟の3/4の世界です。どの文が合わない？", "兄を弟の3/4にした世界、どの文が合わない？"])("stops it in a which line too: %s", (t) => {
    expect(rules(say("which", t, ["q_ani"]))).toContain("relation_word");
  });

  it.each(["I read 兄 as 3/4 of 弟.", "兄 is 3/4 the length of 弟.", "Compared with 弟, 兄 is 3/4.", "兄 is 0.75 of 弟."])("stops it in English: %s", (t) => {
    const inp = input("read", { lang: "en" });
    expect(rules(say("read", t, ["q_ani"], "en"), inp)).toContain("relation_word");
  });

  it("lets a sentence quoted as the problem writes it through (naming the sentence that does not fit)", () => {
    const st = record().statements.find((x) => x.text.includes("3/4"));
    if (st === undefined) throw new Error("no 3/4 sentence");
    expect(rules(say("which", `「${st.text}」は、この世界と合うかな？`, [`s_${String(st.index)}`]))).not.toContain("relation_word");
  });

  it("lets words for the shape of the junior world through", () => {
    expect(rules(READ_OK)).not.toContain("relation_word");
    expect(rules(say("read", "この読み方だと、弟のテープの区切りが足りないです。", ["q_otouto"]))).not.toContain("relation_word");
  });
});

describe("gate 3: operation_name", () => {
  it.each(["6に3/4をかけると、こうなります。", "6から3をひいてみました。", "わり算で読みました。"])("stops %s", (t) => {
    expect(rules(say("read", t, ["q_ani"]))).toContain("operation_name");
  });

  it("lets a sentence without an operation through", () => {
    expect(rules(READ_OK)).not.toContain("operation_name");
  });
});

describe("gate 4: judging", () => {
  it.each([
    ["read", "その読み方は正しいです。"],
    ["which", "惜しいです。どの文が合わないでしょう？"],
    ["read", "すごい読み方ですね。"],
    ["read", "えー、弟のテープが短いです。"],
  ] as const)("stops (%s) %s", (intent, t) => {
    expect(rules(say(intent, t, ["q_otouto"]))).toContain("judging");
  });

  it("stops an English word that judges", () => {
    const inp = input("read", { lang: "en" });
    expect(rules(say("read", "That is correct.", [], "en"), inp)).toContain("judging");
  });

  it("lets a sentence about the world through", () => {
    expect(rules(READ_OK)).not.toContain("judging");
    expect(rules(WHICH_OK)).not.toContain("judging");
  });
});

describe("gate 5: feeling", () => {
  it.each(["先輩に会えてうれしいです。", "また来てくださいね。", "先輩と友だちになりたいです。"])("stops %s", (t) => {
    expect(rules(say("read", t))).toContain("feeling");
  });

  it("lets a sentence about the world through", () => {
    expect(rules(READ_OK)).not.toContain("feeling");
  });
});

describe("gate 6: off_topic", () => {
  // Q60: AI-kun calls the child by no title; a generated 「先輩」 is not let through (the child has a name on screen).
  it.each(["合わない文が出てきました。先輩、どこがおかしいでしょう", "せんぱい、この文を見てください。"])("stops a line that calls the child senpai: %s", (t) => {
    expect(rules(say("which", t))).toContain("off_topic");
  });

  it.each([
    ["which", "先輩の学校はどこですか？"],
    ["read", "きょうは雨がふっています。"],
  ] as const)("stops (%s) %s", (intent, t) => {
    expect(rules(say(intent, t))).toContain("off_topic");
  });

  it("lets a question about a sentence and the world through", () => {
    expect(rules(WHICH_OK)).not.toContain("off_topic");
    expect(rules(READ_OK)).not.toContain("off_topic");
  });
});

describe("gate 7: refers_to", () => {
  it("stops an id that is not in the junior world", () => {
    expect(rules({ ...READ_OK, refers_to: ["h_nobody"] })).toContain("refers_to");
  });

  it("stops a restatement of a holder the child did not touch", () => {
    expect(rules(say("restate", "兄が「1」、ですね。合っていますか？", ["h_ani"]))).toContain("refers_to");
  });

  it("stops a restatement whose ids do not match the latest op of the child", () => {
    expect(rules({ ...RESTATE_OK, refers_to: ["h_ani"] })).toContain("refers_to");
  });

  it("lets ids of the junior world through, and a restatement of what the child touched", () => {
    expect(rules(READ_OK)).not.toContain("refers_to");
    expect(rules(RESTATE_OK)).not.toContain("refers_to");
  });

  it("follows the child: the same sentence about the older brother passes once the child touched him", () => {
    const inp = input("restate", { childOps: { holderIds: ["h_ani"], words: [] } });
    expect(rules(say("restate", "兄が「1」、ですね。合っていますか？", ["h_ani"]), inp)).not.toContain("refers_to");
  });
});

describe("gate 8: length", () => {
  it("stops more than 40 characters", () => {
    const t = "この読み方だと、弟のテープが兄のテープより短いです。弟の区切りが足りないですよね。";
    expect([...t].length).toBeGreaterThan(40);
    expect(rules(say("read", t, ["q_otouto"]))).toContain("length");
  });

  it("lets exactly 40 characters or fewer through", () => {
    const t = "この読み方だと、弟のテープが兄のテープより短いです。弟の区切りが足りないです。";
    expect([...t].length).toBeLessThanOrEqual(40);
    expect(rules(say("read", t, ["q_otouto"]))).not.toContain("length");
  });

  it("stops three sentences", () => {
    expect(rules(say("read", "兄のテープです。弟のテープです。短いです。", ["q_otouto"]))).toContain("length");
  });

  it("stops kanji above grade 4 that are not words of the problem", () => {
    expect(rules(say("read", "この読み方だと、弟のテープは曖昧です。", ["q_otouto"]))).toContain("length");
  });

  it("lets the kanji of the problem through", () => {
    expect(rules(say("read", "この読み方だと、兄の金魚は6匹です。", ["q_ani"]))).not.toContain("length");
  });

  it("stops a language other than the one asked for", () => {
    expect(rules({ ...READ_OK, lang: "en" })).toContain("length");
    expect(rules(say("read", "With this reading, the tape is short.", ["q_otouto"], "ja"))).toContain("length");
  });
});

describe("gate 9: intent_shape", () => {
  it("stops a question where a statement is wanted (read)", () => {
    expect(rules(say("read", "この読み方だと、弟のテープが短いですか？", ["q_otouto"]))).toContain("intent_shape");
  });

  it("stops a statement where a question is wanted (which)", () => {
    expect(rules(say("which", "この世界では弟のテープが短いです。", ["q_otouto"]))).toContain("intent_shape");
  });

  it("stops a restatement without the check at the end", () => {
    expect(rules(say("restate", "弟が「1」、ですね。", ["h_otouto"]))).toContain("intent_shape");
  });

  it("stops a restatement that adds a reason the child did not give", () => {
    expect(rules(say("restate", "弟が「1」、金魚が多いからですね。合っていますか？", ["h_otouto"]))).toContain("intent_shape");
  });

  it("stops an utterance whose intent is not the one asked for", () => {
    expect(rules(WHICH_OK, input("read"))).toContain("intent_shape");
  });

  it("lets each intent in its own shape through", () => {
    expect(rules(READ_OK)).not.toContain("intent_shape");
    expect(rules(WHICH_OK)).not.toContain("intent_shape");
    expect(rules(RESTATE_OK)).not.toContain("intent_shape");
  });
});

describe("gate 10: mind", () => {
  it.each(["ぼくは、弟のテープが短いと思いました。", "なんだか弟のテープが短い気がします。"])("stops %s", (t) => {
    expect(rules(say("read", t, ["q_otouto"]))).toContain("mind");
  });

  it("stops an English sentence that gives the junior a mind", () => {
    const inp = input("read", { lang: "en" });
    expect(rules(say("read", "I think the tape is short.", ["q_otouto"], "en"), inp)).toContain("mind");
  });

  it("lets a sentence put on the side of the world through", () => {
    expect(rules(READ_OK)).not.toContain("mind");
  });
});
