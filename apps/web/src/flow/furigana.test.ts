// Furigana over every fixed line a child sees (指示書 第8.4b節 読みの配慮; whole-screen review, 2026-11-08: the app's
// title, the junior's template lines and the 「つらい」 screen's helplines had kanji without readings). Every kanji of
// these lines must get a reading from core's UI_READINGS, so RubyText draws ruby over all of them. Written before the
// readings were added.
import { describe, expect, it } from "vitest";
import { TEMPLATES, UI_READINGS, rubySegments } from "@kimi/core";
import { ui } from "./text.ts";
import { checkText } from "../check/text.ts";

const KANJI = /[一-鿿々]/;

/** The Japanese lines the child's screens show as they are (the grown-up's consent, details and parent screen aside). */
function childLines(): { where: string; text: string }[] {
  const t = ui("ja");
  const c = checkText("ja");
  const p = t.problem;
  const out: [string, string][] = [
    ["title", t.title],
    ["langSwitch", t.langSwitch.ja],
    ["reading", t.reading.aloud],
    ["reading", t.reading.stop],
    ["reading", t.reading.furigana],
    ["buttons", t.buttons.stop],
    ["buttons", t.buttons.dontKnow],
    ["buttons", t.buttons.hard],
    ["intro", t.intro.start],
    ["consent", t.consent.child],
    ...t.intro.cards.flatMap((card): [string, string][] => [
      ["intro card", card.title],
      ...card.lines.map((l): [string, string] => ["intro card", l]),
    ]),
    ["guess", p.guess.label],
    ["guess", p.guess.question],
    ["guess", p.guess.unknown],
    ["guess", p.guess.card],
    ["guess", p.guess.optional],
    ["predict", p.predict.question],
    ["predict", p.predict.fits],
    ["predict", p.predict.odd],
    ["predict", p.predict.unknown],
    ["problem", p.looking],
    ["problem", p.yes],
    ["problem", p.no],
    ["problem", p.next],
    ["problem", p.nextProblem],
    ["problem", p.unitPad],
    ["problem", p.totalPad],
    ...Object.values(p.voice).map((v): [string, string] => ["voice", v]),
    ["pad", t.pad.clear],
    ["pad", t.pad.ok],
    ["research", t.research.wait],
    ["ruleCard", t.ruleCard.label],
    ...t.ruleCard.lines.map((l): [string, string] => ["ruleCard", l]),
    ["ruleCard", t.ruleCard.slot],
    ["ruleCard", t.ruleCard.gallery],
    ["ruleCard", t.ruleCard.next],
    ["ruleCard", t.ruleCard.scenes],
    ["ruleCard", t.ruleCard.scenesNote],
    ...t.finished.lines.map((l): [string, string] => ["finished", l]),
    ["finished", t.finished.end],
    ["stuck", t.stuck.resume],
    ["stuck", t.stuck.hold],
    ["help", t.help.read],
    ["help", t.help.open],
    ["help", t.help.later],
    ["wordbook", t.wordbook.label],
    ["wordbook", t.wordbook.one],
    ["wordbook", t.wordbook.close],
    ["hard", t.hard.talk],
    ["hard", t.hard.close],
    ["rest", t.rest.first],
    ["helpline", t.helpline.title],
    ["helpline", t.helpline.pending],
    ...t.helpline.entries.flatMap((h): [string, string][] => [
      ["helpline", h.name],
      ["helpline", h.when],
    ]),
    ["ended", t.ended.line],
    ["parentDoor", t.parentDoor],
    ["check", c.entry],
    ["check", c.title],
    ["check", c.lead],
    ["check", c.progress(1, 3)],
    ["check", c.pad],
    ["check", c.kept],
    ["check", c.next],
    ...c.done.map((l): [string, string] => ["check", l]),
    ["check", c.back],
    ["check", c.close],
  ];
  // The junior's fixed lines (core's templates), their slots taken out: a slot is a holder's name (the problem's own
  // readings), a number or the child's own words.
  for (const [key, tpl] of Object.entries(TEMPLATES))
    for (const l of tpl.ja)
      out.push([`template ${key}`, l.replace(/\{[a-z]+\}/g, "")]);
  return out.map(([where, text]) => ({ where, text }));
}

describe("furigana over the child's fixed lines", () => {
  it("covers the screens the whole-screen review found without readings", () => {
    const wheres = new Set(childLines().map((l) => l.where));
    for (const w of [
      "title",
      "intro card",
      "helpline",
      "template kohai.unit",
      "template distress.reply",
      "check",
    ])
      expect(wheres, w).toContain(w);
  });

  it("gives every kanji of every line a reading", () => {
    const missing: string[] = [];
    for (const { where, text } of childLines()) {
      for (const seg of rubySegments(text, UI_READINGS))
        if (seg.ruby === null && KANJI.test(seg.text))
          missing.push(`${where}: ${seg.text} in ${text}`);
    }
    expect(missing).toEqual([]);
  });

  it("reads the words that change with what follows them as they are said here", () => {
    const said = (text: string) =>
      rubySegments(text, UI_READINGS)
        .map((s) => s.ruby ?? s.text)
        .join("");
    expect(said(ui("ja").title)).toBe("AIくんともんだいをよもう");
    expect(said("ひと区切りの大きさは、いくつでしょう")).toBe(
      "ひとくぎりのおおきさは、いくつでしょう",
    );
    expect(said("休みの日")).toBe("やすみのひ");
    expect(said("午前8時30分〜午後5時15分")).toBe(
      "ごぜん8じ30ぷん〜ごご5じ15ふん",
    );
    expect(said("12月29日〜1月3日")).toBe("12がつ29にち〜1がつ3か");
    expect(said("子どもの人権110番")).toBe("こどものじんけん110ばん");
    expect(said("児童相談所 虐待対応ダイヤル")).toBe(
      "じどうそうだんじょ ぎゃくたいたいおうダイヤル",
    );
  });
});
