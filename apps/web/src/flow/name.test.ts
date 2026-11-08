// The child's name on the screen (Q60): the festival problem's child is a placeholder in core, and the screen shows
// the child's own name in its place. The name is only ever shown: it stays on the device and is never in what the
// session sends (the sends are built from the session, not from the view this changes).
import { describe, expect, it } from "vitest";
import { FESTIVAL_PLACEHOLDER } from "@kimi/core";
import { cleanName, namedView, unnamed } from "./name.ts";

describe("cleanName", () => {
  it("keeps a short name in kana, kanji or letters, trimmed", () => {
    expect(cleanName("  ゆい ")).toBe("ゆい");
    expect(cleanName("ハルト")).toBe("ハルト");
    expect(cleanName("結衣")).toBe("結衣");
    expect(cleanName("Mia")).toBe("Mia");
    expect(cleanName("ゆいちゃん")).toBe("ゆいちゃん");
  });

  it("refuses an empty, short, long, numbered or marked name (a number must never look like part of the problem)", () => {
    for (const bad of ["", "   ", "ら", "ゆい1", "ゆい６", "1/2", "あいうえおかきくけこさ", "ゆい!", "<b>", "ゆい ちゃん"]) expect(cleanName(bad), bad).toBeNull();
  });

  // Safety review, 2026-11-08 (Q60): a name is shown in the problem and in AI-kun's lines without the gate.
  it("refuses a name that says a number, an operation, a word of distress or a stop word", () => {
    for (const bad of ["はち", "八重", "eight", "かける", "たす", "たすけて", "つらい", "しにたい", "ツライ", "やめる", "わからない", "stop"]) expect(cleanName(bad), bad).toBeNull();
  });

  it("refuses a name that is a word of the problem or AI-kun", () => {
    for (const bad of ["AIくん", "金魚", "すくい", "これ"]) expect(cleanName(bad), bad).toBeNull();
  });
});

describe("unnamed", () => {
  it("puts the placeholder back where the child said or typed the name, before the words leave the screen", () => {
    expect(unnamed("ゆいの金魚が1だよ", "ゆい")).toBe(`${FESTIVAL_PLACEHOLDER}の金魚が1だよ`);
    expect(unnamed("AIくんが1", "ゆい")).toBe("AIくんが1");
    expect(unnamed("ゆいの金魚", null)).toBe("ゆいの金魚");
    // Speech recognition may write a kana name in the other kana.
    expect(unnamed("ユイの金魚", "ゆい")).toBe(`${FESTIVAL_PLACEHOLDER}の金魚`);
    expect(unnamed("ゆいの金魚", "ユイ")).toBe(`${FESTIVAL_PLACEHOLDER}の金魚`);
  });
});

describe("namedView", () => {
  const view = {
    screen: "problem",
    statements: [{ text: `なつまつりの金魚すくいで、${FESTIVAL_PLACEHOLDER}は金魚を6匹すくいました。`, tokens: ["で", "、", FESTIVAL_PLACEHOLDER, "は"] }],
    world: { holders: [{ id: "h_me", label: FESTIVAL_PLACEHOLDER }, { id: "h_ai", label: "AIくん" }] },
    line: `${FESTIVAL_PLACEHOLDER}が1、ですね`,
    gate: { problemText: `${FESTIVAL_PLACEHOLDER}は6匹` },
    value: { num: 6, den: 1 },
    nothing: null,
  };

  it("puts the name where the placeholder is, in sentences, tokens, labels and lines", () => {
    const v = namedView(view, "ゆい");
    expect(v.statements[0]?.text).toBe("なつまつりの金魚すくいで、ゆいは金魚を6匹すくいました。");
    expect(v.statements[0]?.tokens).toEqual(["で", "、", "ゆい", "は"]);
    expect(v.world.holders.map((h) => h.label)).toEqual(["ゆい", "AIくん"]);
    expect(v.line).toBe("ゆいが1、ですね");
    expect(v.value).toEqual({ num: 6, den: 1 });
    expect(v.nothing).toBeNull();
  });

  it("leaves the gate context as core wrote it (the screen's own gate calls see core's text)", () => {
    expect(namedView(view, "ゆい").gate).toBe(view.gate);
  });

  it("changes nothing without a name, and never changes the view it was given", () => {
    expect(namedView(view, null)).toBe(view);
    const before = JSON.stringify(view);
    namedView(view, "ゆい");
    expect(JSON.stringify(view)).toBe(before);
  });
});
