// Ways around the junior's gates found in the safety review, on the signboard problem. The junior's
// world is the procedural reading: the older brother 6, the younger 4.5, so the younger tape is shorter.
import { describe, expect, it } from "vitest";
import type { KohaiUtterance } from "@kimi/core";
import { kohaiGates, type KohaiInput, type KohaiIntent } from "./kohai.ts";
import { checkSafety } from "./safety.ts";
import { FakeClaude, fails, json, stopped } from "./fake.ts";
import { gateCtx, kohaiWorld, record } from "./test-support.ts";

function input(intent: KohaiIntent): KohaiInput {
  return {
    intent,
    lang: "ja",
    kohaiWorld: kohaiWorld(),
    statements: record().statements,
    childOps: { holderIds: ["h_otouto"], words: ["の"] },
  };
}
const say = (intent: KohaiIntent, utterance: string, refers_to: string[] = ["q_otouto"], lang: "ja" | "en" = "ja"): KohaiUtterance => ({
  intent,
  utterance,
  refers_to,
  lang,
});
const passes = (u: KohaiUtterance): boolean => kohaiGates(u, { ...input(u.intent), lang: u.lang }, gateCtx(u.lang)).length === 0;

describe("numbers the problem does not write are refused", () => {
  it.each(["弟の金魚は兄より2ひき多いです。", "この読み方だと、弟の金魚は4.5匹です。", "弟の金魚は、しちひきです。"])("%s", (text) => {
    expect(passes(say("read", text))).toBe(false);
  });

  it("the numbers of the problem pass", () => {
    expect(passes(say("read", "この読み方だと、弟が兄の6の3/4です。"))).toBe(true);
  });
});

describe("words that point to the right direction are refused", () => {
  it.each([
    "弟のほうが多いはず。",
    "弟のほうが多いはずなのに、どの文？",
    "弟のテープのほうが長いはずでは？",
    "弟を「1」とみるべきでしょうか？",
    "弟のテープは長くないとへんですよね？",
    "兄の金魚より弟の金魚が多いです。",
  ])("%s", (text) => {
    expect(passes(say(text.endsWith("？") ? "which" : "read", text))).toBe(false);
  });

  it("a length that matches the junior's own world passes, one that does not is refused", () => {
    expect(passes(say("read", "この読み方だと、弟のテープが兄より短いです。"))).toBe(true);
    expect(passes(say("read", "この読み方だと、弟のテープが兄より長いです。"))).toBe(false);
    expect(passes(say("read", "This reading: the younger tape is shorter than the older tape.", ["q_otouto"], "en"))).toBe(false);
  });
});

describe("the child's reading is not put in the junior's mouth", () => {
  it.each(["これは先輩の読み方です。弟のテープが短いです。", "先輩のまねをして、弟を短くしました。"])("%s", (text) => {
    expect(passes(say("read", text))).toBe(false);
  });
  it("in English too", () => {
    expect(passes(say("read", "Your reading: the younger tape is short.", ["q_otouto"], "en"))).toBe(false);
  });
});

describe("questions about the child are refused", () => {
  it.each(["兄の金魚のことで、先輩のおうちはどこですか？", "兄のテープ、先輩のなまえはなんですか？", "兄のテープ、先輩はなんねんせいですか？"])("%s", (text) => {
    expect(passes(say("which", text))).toBe(false);
  });
});

describe("judging, thanks, cheering, feelings and a mind are refused", () => {
  it.each([
    "ありがとうございます。弟のテープです。",
    "弟に「1」、合っています。",
    "よくできました。弟のテープです。",
    "弟のテープ、だいじょうぶ、先輩ならできます。",
    "いっしょにがんばろう。弟のテープです。",
    "弟のテープ、たのしいです。",
    "ぼくはかんがえました。弟のテープです。",
    "わかりました。弟のテープです。",
  ])("%s", (text) => {
    expect(passes(say("read", text))).toBe(false);
  });
});

describe("a sentence about a move the child did not make is refused", () => {
  it.each(["どうして兄が「1」なんですか？", "兄が「1」だと、弟のテープは長くなりますか？"])("%s", (text) => {
    expect(passes(say("which", text, ["h_ani"]))).toBe(false);
  });
});

describe("restating always asks the child to check", () => {
  it("without 合っていますか it is refused", () => {
    expect(passes(say("restate", "弟に「1」、ですね？", ["h_otouto"]))).toBe(false);
    expect(passes(say("restate", "弟が「1」、ですね。合っていますか？", ["h_otouto"]))).toBe(true);
  });
});

describe("distress is caught across ways of writing, and a refusal is treated as distress", () => {
  it.each(["もう辛い", "イジメられてる", "殴られた", "シニタイ", "いなくなりたい", "I wanna die", "it hurts"])("%s (dictionary)", async (text) => {
    const client = new FakeClaude([fails("down")]);
    expect((await checkSafety(text, client)).flag).toBe("distress");
  });

  it("a refusal to judge counts as distress", async () => {
    const client = new FakeClaude([stopped("refusal"), stopped("refusal")]);
    expect((await checkSafety("きょうのさんすう", client)).flag).toBe("distress");
  });
});

describe("distress outranks inappropriate", () => {
  it("a word of the dictionary makes it distress even when Claude says inappropriate", async () => {
    const client = new FakeClaude([json({ schema_version: "1", safety_flag: "inappropriate" })]);
    expect((await checkSafety("しにたい", client)).flag).toBe("distress");
  });
});
