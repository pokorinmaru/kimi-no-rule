// Furigana and the read-aloud text (指示書 第8.4b節 読みの配慮). The screen draws ruby from these segments and the
// browser reads the spoken form; neither changes a word of the problem (no paraphrase), and nothing here judges
// or computes a number: a fraction is only said the way the problem writes it (3/4 is said 4分の3).
import { PROBLEM_READINGS, type Readings } from "../../fixtures/problems/readings.ts";
import { TEMPLATES } from "./index.ts";

export type { Readings } from "../../fixtures/problems/readings.ts";

/** A piece of text and its reading (null: printed as it is). */
export interface RubySegment {
  text: string;
  ruby: string | null;
}

/**
 * The readings of the fixed Japanese lines the screen puts ruby on (the problem screen's words), and of the
 * junior's fixed lines.
 * Okurigana after a kanji is context (「話し」: はな over 話); a bare 「話」 is はなし.
 */
export const UI_READINGS: Readings = {
  問題: "もんだい",
  金魚: "きんぎょ",
  世界: "せかい",
  後輩: "こうはい",
  先輩: "せんぱい",
  文: "ぶん",
  聞: "き",
  合: "あ",
  重: "かさ",
  同: "おな",
  見: "み",
  見直: "み|なお",
  成: "な",
  立: "た",
  言葉: "ことば",
  言: "い",
  決: "き",
  別: "べつ",
  考: "かんが",
  方: "かた",
  形: "かたち",
  読: "よ",
  指: "ゆび",
  教: "おし",
  書: "か",
  教わ: "おそ",
  長: "なが",
  思: "おも",
  動: "うご",
  手: "て",
  数: "かず",
  最後: "さいご",
  最初: "さいしょ",
  多: "おお",
  少: "すく",
  差: "さ",
  倍: "ばい",
  何倍: "なん|ばい",
  話: "はなし",
  話し: "はな",
  人: "ひと",
  大人: "おとな",
  大: "おお",
  直: "なお",
  自分: "じぶん",
  出: "で",
  札: "ふだ",
  絵本: "えほん",
  意味: "いみ",
  待: "ま",
  時間: "じかん",
  急: "いそ",
  区切: "く|ぎ",
  今日: "きょう",
  新: "あたら",
  次: "つぎ",
  信: "しん",
  先生: "せんせい",
  伝: "つた",
  手伝: "て|つだ",
  作: "つく",
  声: "こえ",
  使: "つか",
  上げ: "あ",
  止: "と",
  // The intro's cards, the rule card, the junior's lines, the AI-free check and the 「つらい」 screen (whole-screen
  // review, 2026-11-08). A counter or a date after a digit is keyed with the digit, so it is read as said there.
  心: "こころ",
  気持ち: "き|も",
  置い: "お",
  場所: "ば|しょ",
  場面: "ば|めん",
  身近: "み|ぢか",
  文字: "も|じ",
  送り: "おく",
  記録: "き|ろく",
  の中: "なか",
  日本語: "に|ほん|ご",
  回: "かい",
  持っ: "も",
  光っ: "ひか",
  一度: "いち|ど",
  入れ: "い",
  問目: "もん|め",
  問の: "もん",
  家の: "いえ",
  休み: "やす",
  の日: "ひ",
  近く: "ちか",
  電話: "でん|わ",
  電話代: "でん|わ|だい",
  相談: "そう|だん",
  児童相談所: "じ|どう|そう|だん|じょ",
  虐待対応: "ぎゃく|たい|たい|おう",
  子ども: "こ",
  子供: "こ|ども",
  人権: "じん|けん",
  番: "ばん",
  毎日: "まい|にち",
  月曜日: "げつ|よう|び",
  金曜日: "きん|よう|び",
  午前: "ご|ぜん",
  午後: "ご|ご",
  一部: "いち|ぶ",
  "4時間": "じ|かん",
  "0時": "じ",
  "1時": "じ",
  "2時": "じ",
  "3時": "じ",
  "4時": "じ",
  "5時": "じ",
  "6時": "じ",
  "7時": "じ",
  "8時": "じ",
  "9時": "じ",
  "30分": "ぷん",
  "15分": "ふん",
  "1月": "がつ",
  "2月": "がつ",
  "29日": "にち",
  "3日": "か",
};

/** The readings of a prepared problem's sentences; a problem without written readings gets none (no guessing). */
export function readingsFor(problemId: string): Readings {
  return PROBLEM_READINGS[problemId] ?? {};
}

const KANJI = /[一-鿿々]/;

interface Entry {
  key: string;
  prefix: string;
  parts: RubySegment[];
  suffix: string;
}

function entryOf(key: string, kana: string): Entry | null {
  const chars = [...key];
  const first = chars.findIndex((c) => KANJI.test(c));
  if (first < 0 || kana === "") return null;
  let last = first;
  while (last + 1 < chars.length && KANJI.test(chars[last + 1] ?? "")) last++;
  // The kanji of a key are one run; context is plain text around it.
  if (chars.slice(last + 1).some((c) => KANJI.test(c))) return null;
  const kanji = chars.slice(first, last + 1);
  const split = kana.split("|");
  const parts =
    split.length === 1
      ? [{ text: kanji.join(""), ruby: kana }]
      : split.length === kanji.length && split.every((x) => x !== "")
        ? kanji.map((c, i) => ({ text: c, ruby: split[i] ?? null }))
        : null;
  if (parts === null) return null;
  return { key, prefix: chars.slice(0, first).join(""), parts, suffix: chars.slice(last + 1).join("") };
}

const entriesCache = new WeakMap<Readings, Entry[]>();
function entries(readings: Readings): Entry[] {
  const hit = entriesCache.get(readings);
  if (hit !== undefined) return hit;
  const out = Object.entries(readings)
    .map(([k, v]) => entryOf(k, v))
    .filter((e): e is Entry => e !== null)
    .sort((a, b) => b.key.length - a.key.length);
  entriesCache.set(readings, out);
  return out;
}

function pushPlain(out: RubySegment[], text: string): void {
  if (text === "") return;
  const last = out.at(-1);
  if (last !== undefined && last.ruby === null) last.text += text;
  else out.push({ text, ruby: null });
}

/** The text cut into plain pieces and kanji with their readings (the longest word first, left to right). */
export function rubySegments(text: string, readings: Readings): RubySegment[] {
  const list = entries(readings);
  const out: RubySegment[] = [];
  let i = 0;
  while (i < text.length) {
    const e = list.find((x) => text.startsWith(x.key, i));
    if (e === undefined) {
      pushPlain(out, text[i] ?? "");
      i++;
      continue;
    }
    pushPlain(out, e.prefix);
    for (const p of e.parts) out.push({ ...p });
    pushPlain(out, e.suffix);
    i += e.key.length;
  }
  return out;
}

/**
 * The ruby of a sentence, token by token (each token stays one button). A reading that would cross two tokens
 * is dropped and its kanji are printed plain.
 */
export function rubyTokens(tokens: readonly string[], readings: Readings): RubySegment[][] {
  const segs = rubySegments(tokens.join(""), readings);
  const out: RubySegment[][] = tokens.map(() => []);
  const ends: number[] = [];
  let acc = 0;
  for (const t of tokens) ends.push((acc += t.length));
  let pos = 0;
  let ti = 0;
  for (const s of segs) {
    const start = pos;
    const stop = pos + s.text.length;
    while (ti < tokens.length && (ends[ti] ?? 0) <= start) ti++;
    if (s.ruby !== null && stop <= (ends[ti] ?? 0)) {
      out[ti]?.push({ ...s });
    } else {
      // Plain text (or a reading across tokens, made plain), cut at the token ends.
      let p = start;
      let k = ti;
      while (p < stop && k < tokens.length) {
        const end = Math.min(stop, ends[k] ?? stop);
        const piece = s.text.slice(p - start, end - start);
        const row = out[k];
        if (row !== undefined) pushPlain(row, piece);
        p = end;
        if (p >= (ends[k] ?? 0)) k++;
      }
    }
    pos = stop;
  }
  return out;
}

/** What the browser reads for a Japanese line: kanji by their readings, a fraction as the problem says it. */
export function spokenText(text: string, readings: Readings): string {
  // A reading right after a digit is a counter's sound-changed form (8本 → ぽん): the voice reads "8本" itself
  // correctly (はっぽん) but "8ぽん" as はちぽん, so the kanji stays as written there.
  let said = "";
  for (const s of rubySegments(text, readings)) said += s.ruby !== null && /\d$/.test(said) ? s.text : (s.ruby ?? s.text);
  return said
    .replace(/(\d+)\/(\d+)/g, "$2分の$1")
    .replace(/dL/g, "デシリットル")
    .replace(/%/g, "パーセント");
}

interface TemplateShape {
  re: RegExp;
  fixed: string[];
  slots: string[];
}

let shapes: TemplateShape[] | null = null;
function templateShapes(): TemplateShape[] {
  if (shapes !== null) return shapes;
  const esc = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  shapes = Object.values(TEMPLATES).flatMap((t) =>
    t.ja.map((v: string) => {
      const parts = v.split(/\{(holder|item|number|transcript)\}/);
      const fixed = parts.filter((_, i) => i % 2 === 0);
      const slots = parts.filter((_, i) => i % 2 === 1);
      return {
        re: new RegExp(`^${fixed.map(esc).join("(.+?)")}$`, "u"),
        fixed,
        slots,
      };
    }),
  );
  return shapes;
}

function oneTemplate(
  text: string,
  slotReadings: Readings,
): RubySegment[] | null {
  for (const s of templateShapes()) {
    const m = s.re.exec(text);
    if (m === null) continue;
    const out: RubySegment[] = [];
    const add = (segs: RubySegment[]): void => {
      for (const g of segs)
        if (g.ruby === null) pushPlain(out, g.text);
        else out.push({ ...g });
    };
    s.fixed.forEach((f, i) => {
      add(rubySegments(f, UI_READINGS));
      const value = m[i + 1];
      if (value === undefined) return;
      const kind = s.slots[i];
      // A holder's or a thing's name is the problem's own word; the child's words and a number stay as they are.
      add(
        kind === "holder" || kind === "item"
          ? rubySegments(value, slotReadings)
          : [{ text: value, ruby: null }],
      );
    });
    return out;
  }
  return null;
}

/**
 * The furigana of a junior's line in Japanese when it is made of core's templates (one, or several joined by a space):
 * the fixed words by UI_READINGS, a holder's or a thing's name by the problem's readings, the child's own words and
 * the numbers plain. Any other line (generated words) gets null: no reading is guessed for words not written here.
 */
export function templateRuby(
  text: string,
  lang: "ja" | "en",
  slotReadings: Readings,
): RubySegment[] | null {
  if (lang !== "ja") return null;
  const whole = oneTemplate(text, slotReadings);
  if (whole !== null) return whole;
  for (let i = text.indexOf(" "); i > 0; i = text.indexOf(" ", i + 1)) {
    const head = oneTemplate(text.slice(0, i), slotReadings);
    if (head === null) continue;
    const rest = templateRuby(text.slice(i + 1), lang, slotReadings);
    if (rest === null) continue;
    const out = head.map((x) => ({ ...x }));
    pushPlain(out, " ");
    for (const g of rest)
      if (g.ruby === null) pushPlain(out, g.text);
      else out.push(g);
    return out;
  }
  return null;
}
