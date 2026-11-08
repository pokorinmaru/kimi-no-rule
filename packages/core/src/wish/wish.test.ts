// A child's wish to AI-kun reaches the developer only as Claude's rephrasing, and only when core lets it
// through: one short line about the app, with nothing in it that could name or reach a person (Q61).
import { describe, expect, it } from "vitest";
import { MAX_WISH_CHARS, wishGate } from "./index.ts";

describe("wishGate", () => {
  it("lets a short request about the app through", () => {
    for (const ok of [
      "問題の画面で、魚の絵がなぜ半分なのか分かりにくい",
      "「1」の札をどこに置けばいいか分からなかった",
      "AIくんの言葉が長くて読みにくい",
      "3/4のテープ図がどこを表しているか分からない",
      "12匹の金魚のうち、どれが1なのか分からない",
      "The fish picture on the problem screen is hard to understand",
    ]) {
      expect(wishGate(ok), ok).toEqual({ ok: true });
    }
  });

  it("refuses an empty, too long or multi-line text", () => {
    expect(wishGate("")).toEqual({ ok: false, reason: "empty" });
    expect(wishGate("   ")).toEqual({ ok: false, reason: "empty" });
    expect(wishGate("あ".repeat(MAX_WISH_CHARS + 1))).toEqual({ ok: false, reason: "too_long" });
    expect(wishGate("一行目\n二行目")).toEqual({ ok: false, reason: "multi_line" });
  });

  it("refuses anything that could reach a person: a long run of digits, an address of mail or the web", () => {
    expect(wishGate("ばんごうは012-345-678です")).toEqual({ ok: false, reason: "contact" });
    expect(wishGate("でんわ 1234567")).toEqual({ ok: false, reason: "contact" });
    expect(wishGate("ばんごう １２３ ４５６")).toEqual({ ok: false, reason: "contact" });
    expect(wishGate("メールは someone@example.com に")).toEqual({ ok: false, reason: "contact" });
    expect(wishGate("https://example.com を見て")).toEqual({ ok: false, reason: "contact" });
    expect(wishGate("www.example.com を見て")).toEqual({ ok: false, reason: "contact" });
  });

  it("refuses a person's name with an honorific, but not AI-kun", () => {
    for (const bad of ["たろうくんが言った", "はなこちゃんと一緒に", "山田さんに聞いた", "田中先生が", "すずきせんせいの宿題"]) {
      expect(wishGate(bad), bad).toEqual({ ok: false, reason: "person" });
    }
    expect(wishGate("AIくんがもっとゆっくり話してほしい")).toEqual({ ok: true });
    expect(wishGate("AI-kun should speak more slowly")).toEqual({ ok: true });
  });

  it("refuses more ways to name a person, a school or a place, and a handle", () => {
    for (const [bad, reason] of [
      ["たろう君がいっていた", "person"],
      ["山田様の意見", "person"],
      ["Mr Smith said so", "person"],
      ["ひかり学園のみんな", "place"],
      ["駅前塾の宿題", "place"],
      ["学童で使いたい", "place"],
      ["中央3丁目のあたり", "place"],
      ["さいたま市の子ども", "place"],
      ["@kimi_123 に連絡", "contact"],
      ["090と1234と5678", "contact"],
      ["〇九〇一二三四五六七八", "contact"],
    ] as const) {
      expect(wishGate(bad), bad).toEqual({ ok: false, reason });
    }
    // The app's own words stay fine.
    expect(wishGate("1区切りの絵が分かりにくい")).toEqual({ ok: true });
    expect(wishGate("学校の宿題みたいで分かりにくい")).toEqual({ ok: true });
  });

  it("refuses a sentence that pins a way of reading on the child (原則10)", () => {
    for (const bad of ["子どもは3/4をたし算と読み違えている", "倍をかけ算と読んでいる", "問題を勘違いしている"]) {
      expect(wishGate(bad), bad).toEqual({ ok: false, reason: "attribution" });
    }
  });

  it("refuses a request for answers: the app never gives them (原則1)", () => {
    for (const bad of ["答えを教えてほしい", "こたえをおしえて", "答えが見られるようにしてほしい", "正解を出してほしい", "Please show the answers"]) {
      expect(wishGate(bad), bad).toEqual({ ok: false, reason: "answers" });
    }
    expect(wishGate("答えを入れる画面のボタンが小さい")).toEqual({ ok: true });
  });

  it("refuses a school or class named", () => {
    for (const bad of ["さくら小学校のクラスで", "3年2組のみんな", "ひまわり幼稚園"]) {
      expect(wishGate(bad), bad).toEqual({ ok: false, reason: "place" });
    }
  });
});
