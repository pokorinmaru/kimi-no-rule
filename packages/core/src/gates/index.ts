// M1 step (6): gates before anything reaches the child (指示書 第5.5節, 第1節 原則1). Pure functions:
// an action is data, and a refused action is not shown. When in doubt the gates refuse: reading more
// numbers out of a text than it holds only makes them stricter.
import type { ApplyResult } from "../apply/index.ts";
import type { Rational } from "../schema/common.ts";
import { validateWorld } from "../schema/semantic.ts";
import type { WorldScene } from "../schema/world-scene.ts";
import { add, div, eq, fromSchema, neg, rat, toSchema, type Rational as Exact } from "../rational/index.ts";
import { solve } from "../solve/index.ts";

// ---------------------------------------------------------------------------------------------
// Numbers in any notation
// ---------------------------------------------------------------------------------------------

const KANJI_DIGIT: Record<string, number> = { 〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const SMALL_UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
const BIG_UNIT: Record<string, bigint> = { 万: 10_000n, 億: 100_000_000n };

/** A run of Arabic digits and kanji numerals, mixed as people write them (1万2千, 三百, 二〇二六). */
function jaValue(s: string): bigint {
  let total = 0n;
  let section = 0n;
  let digits: bigint | null = null;
  for (const c of s) {
    if (/[0-9]/.test(c)) digits = (digits ?? 0n) * 10n + BigInt(c);
    else if (c in KANJI_DIGIT) digits = (digits ?? 0n) * 10n + BigInt(KANJI_DIGIT[c] as number);
    else if (c in SMALL_UNIT) {
      section += (digits ?? 1n) * BigInt(SMALL_UNIT[c] as number);
      digits = null;
    } else if (c in BIG_UNIT) {
      total += (section + (digits ?? 0n) || 1n) * (BIG_UNIT[c] as bigint);
      section = 0n;
      digits = null;
    }
  }
  return total + section + (digits ?? 0n);
}

const EN_SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90, a: 1, an: 1,
};
const EN_WORDS = [...Object.keys(EN_SMALL).filter((w) => w !== "a" && w !== "an"), "hundred", "thousand"].join("|");
const EN_NUMBER = new RegExp(`\\b(?:${EN_WORDS})(?:[\\s-]+(?:and[\\s-]+)?(?:${EN_WORDS}))*\\b`, "gi");
const EN_FRACTION = new RegExp(
  `\\b(${EN_WORDS}|a|an)[\\s-]+(halves|half|thirds?|quarters?|fourths?|fifths?|sixths?|eighths?|tenths?)\\b`,
  "gi",
);
const EN_DENOMINATOR: Record<string, number> = { half: 2, halves: 2, third: 3, quarter: 4, fourth: 4, fifth: 5, sixth: 6, eighth: 8, tenth: 10 };

function englishValue(words: string): number {
  let total = 0;
  let current = 0;
  for (const w of words.toLowerCase().split(/[\s-]+/)) {
    if (w in EN_SMALL) current += EN_SMALL[w] as number;
    else if (w === "hundred") current = (current || 1) * 100;
    else if (w === "thousand") {
      total += (current || 1) * 1000;
      current = 0;
    }
  }
  return total + current;
}

const NUM = "[0-9〇零一二三四五六七八九十百千万億]+";
const DEC = "[0-9]*\\.[0-9]+";

const exact = (n: bigint, d = 1n): Exact => rat(n, d);
const decimal = (s: string): Exact => {
  const [whole = "", frac = ""] = s.split(".");
  return rat(BigInt((whole || "0") + frac), 10n ** BigInt(frac.length));
};

/**
 * Every number a text could be read as (指示書 第5.5節), kana readings included (Q20). Reading too many
 * numbers only makes the gate stricter for what is said to the child; never use this to collect what
 * the child said, where a word read as a number would let that number through.
 */
export function numbersIn(text: string): Rational[] {
  const t = kanaToDigits(text.normalize("NFKC"))
    .replace(/⁄/g, "/")
    .replace(/(\d),(?=\d{3}(?!\d))/g, "$1");
  const found: { at: number; value: Exact }[] = [];
  const push = (at: number, value: Exact | null): void => {
    if (value !== null) found.push({ at, value });
  };
  const frac = (n: Exact, d: Exact): Exact | null => (d.num === 0n ? null : div(n, d));
  const each = (re: RegExp, f: (m: RegExpMatchArray) => void): void => {
    for (const m of t.matchAll(re)) f(m);
  };

  // A fraction is one number: its numerator and denominator are not read on their own.
  const fractionSpans: [number, number][] = [];
  for (const re of [/\d+\s*\/\s*\d+/g, new RegExp(`${NUM}\\s*分の\\s*${NUM}`, "g")]) {
    for (const m of t.matchAll(re)) fractionSpans.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  }
  const insideFraction = (at: number, end: number): boolean => fractionSpans.some(([a, b]) => a <= at && end <= b);

  // Plain numbers: decimals, runs of digits and kanji, and a sign in front.
  each(new RegExp(`${DEC}|${NUM}`, "g"), (m) => {
    const at = m.index ?? 0;
    if (insideFraction(at, at + m[0].length)) return;
    const v = m[0].includes(".") ? decimal(m[0]) : exact(jaValue(m[0]));
    push(at, v);
    if (at > 0 && /[-−]/.test(t[at - 1] ?? "") && !/[0-9]/.test(t[at - 2] ?? "")) push(at - 1, neg(v));
  });
  // Fractions: a/b, b分のa, and mixed numbers (1と3/4, 2 1/2, 4と2分の1).
  each(/(\d+)\s*\/\s*(\d+)/g, (m) => push(m.index ?? 0, frac(exact(BigInt(m[1] ?? "0")), exact(BigInt(m[2] ?? "1")))));
  each(new RegExp(`(${NUM})\\s*分の\\s*(${NUM})`, "g"), (m) =>
    push(m.index ?? 0, frac(exact(jaValue(m[2] ?? "")), exact(jaValue(m[1] ?? "")))),
  );
  each(new RegExp(`(${NUM})\\s*(?:と|\\s)\\s*(\\d+)\\s*/\\s*(\\d+)`, "g"), (m) => {
    const f = frac(exact(BigInt(m[2] ?? "0")), exact(BigInt(m[3] ?? "1")));
    if (f !== null) push(m.index ?? 0, add(exact(jaValue(m[1] ?? "")), f));
  });
  each(new RegExp(`(${NUM})\\s*と\\s*(${NUM})\\s*分の\\s*(${NUM})`, "g"), (m) => {
    const f = frac(exact(jaValue(m[3] ?? "")), exact(jaValue(m[2] ?? "")));
    if (f !== null) push(m.index ?? 0, add(exact(jaValue(m[1] ?? "")), f));
  });
  // Percentages.
  each(new RegExp(`(${DEC}|${NUM})\\s*%`, "g"), (m) => {
    const s = m[1] ?? "0";
    push(m.index ?? 0, div(s.includes(".") ? decimal(s) : exact(jaValue(s)), exact(100n)));
  });
  // Tenths: 3割.
  each(new RegExp(`(${NUM})\\s*割`, "g"), (m) => push(m.index ?? 0, div(exact(jaValue(m[1] ?? "0")), exact(10n))));
  // Halves and words for numbers.
  each(/半分|半数/g, (m) => push(m.index ?? 0, exact(1n, 2n)));
  each(EN_NUMBER, (m) => push(m.index ?? 0, exact(BigInt(englishValue(m[0])))));
  each(EN_FRACTION, (m) => {
    const d = EN_DENOMINATOR[(m[2] ?? "").toLowerCase().replace(/s$/, "")] ?? EN_DENOMINATOR[(m[2] ?? "").toLowerCase()];
    if (d !== undefined) push(m.index ?? 0, exact(BigInt(englishValue(m[1] ?? "one") || 1), BigInt(d)));
  });
  each(/\btwice\b/gi, (m) => push(m.index ?? 0, exact(2n)));
  each(/\bthrice\b/gi, (m) => push(m.index ?? 0, exact(3n)));
  each(new RegExp(`\\b(?:(${EN_WORDS}|a)\\s+)?dozens?\\b`, "gi"), (m) =>
    push(m.index ?? 0, exact(BigInt(12 * (m[1] === undefined || m[1].toLowerCase() === "a" ? 1 : englishValue(m[1]))))),
  );

  return found.sort((a, b) => a.at - b.at).map((f) => toSchema(f.value));
}

// ---------------------------------------------------------------------------------------------
// Numbers read in kana (Q20): はち, やっつ, はっぴき, ろっぴゃく, さんぶんのに, れいてんご, さんわり
// ---------------------------------------------------------------------------------------------

type KanaToken = { digit?: number; unit?: number; sound?: true };
/** Readings of digits and units, longest first. A reading ending in っ goes on only into a unit (ろっぴゃく). */
const KANA_TOKENS: [string, KanaToken][] = [
  ["きゅう", { digit: 9 }], ["じゅう", { unit: 10 }], ["じゅっ", { unit: 10, sound: true }], ["じっ", { unit: 10, sound: true }],
  ["ひゃく", { unit: 100 }], ["びゃく", { unit: 100 }], ["ぴゃく", { unit: 100 }], ["せん", { unit: 1000 }],
  ["ぜん", { unit: 1000 }], ["まん", { unit: 10000 }], ["れい", { digit: 0 }], ["ぜろ", { digit: 0 }],
  ["いち", { digit: 1 }], ["いっ", { digit: 1, sound: true }], ["さん", { digit: 3 }], ["よん", { digit: 4 }],
  ["ろく", { digit: 6 }], ["ろっ", { digit: 6, sound: true }], ["なな", { digit: 7 }], ["しち", { digit: 7 }],
  ["はち", { digit: 8 }], ["はっ", { digit: 8, sound: true }], ["に", { digit: 2 }], ["し", { digit: 4 }],
  ["ご", { digit: 5 }], ["く", { digit: 9 }],
];
/** Single readings that are numbers on their own; the rest need a unit, a counter or a fraction next to them. */
const STANDALONE = new Set(["はち", "ろく", "きゅう", "よん", "ぜろ"]);
/** Readings too common inside other words to take a counter alone (おしまい, くまい). */
const NEVER_WITH_COUNTER = new Set(["し", "く"]);
/** Counters after a number. こ is not a counter when に follows (にこにこ). */
const COUNTER = /^(?:ひき|びき|ぴき|こ(?!に)|にん|ほん|ぼん|ぽん|まい|だい|かい|ばい|さい|ぷん|ふん|わり|[匹個人本枚台回倍歳割%])/;
const NATIVE: [string, number][] = [
  ["ここのつ", 9], ["ひとつ", 1], ["ふたつ", 2], ["みっつ", 3], ["よっつ", 4], ["いつつ", 5], ["むっつ", 6],
  ["ななつ", 7], ["やっつ", 8], ["ひとり", 1], ["ふたり", 2],
];

/** Katakana to hiragana, so ハチ reads like はち. */
const toHiragana = (s: string): string => s.replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const tokenAt = (t: string, j: number): [string, KanaToken] | undefined => KANA_TOKENS.find(([w]) => t.startsWith(w, j));

/**
 * The text with every kana number replaced by its digits. Words that only sound like numbers stay
 * (せんぱい, まんなか, わかりません, いちばん): a unit alone, or a short reading alone, is not a number.
 */
function kanaToDigits(text: string): string {
  const t = toHiragana(text).replace(/ぱーせんと/g, "%").replace(/ぶんの/g, "分の").replace(/はんぶん/g, "半分");
  let out = "";
  let i = 0;
  while (i < t.length) {
    const native = NATIVE.find(([w]) => t.startsWith(w, i));
    if (native !== undefined) {
      out += String(native[1]);
      i += native[0].length;
      continue;
    }
    if (t.startsWith("とお", i) && !/[\u3041-\u3096]/.test(t[i + 2] ?? "")) {
      out += "10";
      i += 2;
      continue;
    }
    // Read the longest run of digit and unit readings from here.
    let j = i;
    let total = 0;
    let section = 0;
    let digit: number | null = null;
    let tokens = 0;
    let digits = 0;
    let units = 0;
    let stoppedOnSound = false;
    let first = "";
    for (;;) {
      const tok = tokenAt(t, j);
      if (tok === undefined) break;
      const [w, v] = tok;
      if (v.digit !== undefined && digit !== null) break; // two digits in a row is not one number
      if (tokens === 0) first = w;
      if (v.digit !== undefined) {
        digit = v.digit;
        digits++;
      } else if (v.unit !== undefined) {
        if (v.unit === 10000) {
          total += (section + (digit ?? 0) || 1) * 10000;
          section = 0;
        } else section += (digit ?? 1) * v.unit;
        digit = null;
        units++;
      }
      tokens++;
      j += w.length;
      if (v.sound === true) {
        const next = tokenAt(t, j);
        if (next?.[1].unit === undefined) {
          stoppedOnSound = true;
          break;
        }
      }
    }
    let value = String(total + section + (digit ?? 0));
    // A decimal point read as てん: れいてんご.
    let decimal = false;
    if (tokens > 0 && t.startsWith("てん", j) && tokenAt(t, j + 2)?.[1].digit !== undefined) {
      let k = j + 2;
      let frac = "";
      for (let tok = tokenAt(t, k); tok?.[1].digit !== undefined && tok[1].sound !== true; tok = tokenAt(t, k)) {
        frac += String(tok[1].digit);
        k += tok[0].length;
      }
      if (frac !== "") {
        value += "." + frac;
        j = k;
        decimal = true;
      }
    }
    const rest = t.slice(j);
    const counter =
      COUNTER.test(rest) &&
      !(tokens === 1 && NEVER_WITH_COUNTER.has(first)) &&
      !(tokens === 1 && first === "に" && rest.startsWith("こ"));
    const fraction = rest.startsWith("分の") || out.endsWith("分の");
    const accepted =
      tokens > 0 &&
      (decimal ||
        fraction ||
        (stoppedOnSound ? counter : counter || (digits > 0 && units > 0) || units > 1 || (tokens === 1 && STANDALONE.has(first))));
    if (accepted) {
      out += value;
      i = j;
      if (t.startsWith("わり", i)) {
        out += "割";
        i += 2;
      }
    } else {
      out += t[i];
      i++;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Verified values
// ---------------------------------------------------------------------------------------------

declare const VERIFIED: unique symbol;
export type Verified<T> = T & { readonly [VERIFIED]: true };

// One set of marks per door: a correct world may never be shown as a child's world (which would skip
// the early-reveal check), and a drawing world may never be shown as the correct world.
const drawMarks = new WeakSet<object>();
const correctMarks = new WeakSet<object>();

/** Marked worlds are frozen copies, so nothing can be written into them after the check. */
function frozenCopy<T>(x: T): T {
  const copy = structuredClone(x);
  const freeze = (v: unknown): void => {
    if (v === null || typeof v !== "object" || Object.isFrozen(v)) return;
    Object.freeze(v);
    for (const child of Object.values(v)) freeze(child);
  };
  freeze(copy);
  return copy;
}

/** Only the drawing world may be shown; the judging and checking worlds hold values the child did not say. */
export function verifiedDrawWorld(child: ApplyResult): Verified<WorldScene> {
  const v = validateWorld(child.drawWorld);
  if (!v.ok) throw new Error(`the drawing world does not pass the meaning check: ${v.errors[0]?.message ?? ""}`);
  const copy = frozenCopy(child.drawWorld);
  drawMarks.add(copy);
  return copy as Verified<WorldScene>;
}

export function verifiedCorrectWorld(correct: WorldScene): Verified<WorldScene> {
  const v = validateWorld(correct);
  if (!v.ok) throw new Error(`the correct world does not pass the meaning check: ${v.errors[0]?.message ?? ""}`);
  const copy = frozenCopy(correct);
  correctMarks.add(copy);
  return copy as Verified<WorldScene>;
}

export function isVerified(x: object): boolean {
  return drawMarks.has(x) || correctMarks.has(x);
}

// ---------------------------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------------------------

export interface GateContext {
  correct: WorldScene;
  lang: "ja" | "en";
  childSaid: { numbers: Rational[]; words: string[] };
  grade: number;
  interpretationRecorded: boolean;
  prediction: "disabled" | "pending" | "answered";
}

export type Action =
  | { kind: "say"; text: string; echo?: boolean }
  | { kind: "show_world"; world: WorldScene; labels: { element_id: string; value: Rational | "?" }[] }
  | { kind: "show_statements" }
  | { kind: "show_correct_world"; world: WorldScene }
  | { kind: "switch_problem"; grade: number };

export type GateReason = "answer_leak" | "operation_name" | "question_not_hidden" | "too_early" | "unverified" | "grade_down";
export type GateResult = { ok: true } | { ok: false; reasons: GateReason[] };

/** Names and signs of operations, in every form (指示書 第5.5節 ②). */
const OPERATION_NAMES: RegExp[] = [
  /足し算|たし算|引き算|ひき算|掛け算|かけ算|割り算|わり算|加法|減法|乗法|除法/g,
  /足[しすせそさ]|引[いきくけこか]|掛け|割[っるりれろら]/g,
  /(?<![わ㐀-鿿])たし[てた]|(?<![わ㐀-鿿])たす(?!け)|たせば|ひい[てた]|ひく(?!い)|ひけば|(?<![しでみ㐀-鿿])かけ[てたるれ]|(?<![かさまおこあ㐀-鿿])わっ[てた]|(?<![かさまおこあ㐀-鿿])わる(?!い)|われば/g,
  /[×÷+*]|\d\s*[-−]\s*\d|\d\s*[xX]\s*\d/g,
  /\b(?:add(?:s|ed|ing|ition)?|plus|subtract(?:s|ed|ing|ion)?|minus|multipl(?:y|ies|ied|ying|ication)|times|divid(?:e|es|ed|ing)|division|sum|product|quotient|difference|take\s+away)\b/gi,
];

const same = (a: Rational, b: Rational): boolean => eq(fromSchema(a), fromSchema(b));
const containsAny = (values: readonly Rational[], v: Rational): boolean => values.some((x) => same(x, v));

/** The numbers the problem gives: values and amounts written into the correct world. */
function givenValues(w: WorldScene): Rational[] {
  return [
    ...w.quantities.flatMap((q) => (q.value === null ? [] : [q.value])),
    ...w.relations.flatMap((r) => (r.amount === null ? [] : [r.amount])),
    ...w.events.flatMap((e) => (e.amount === null ? [] : [e.amount])),
  ];
}

interface Facts {
  solvable: boolean;
  given: Rational[];
  hidden: Rational[];
  answer: Rational | null;
}

/** The answer and every value on the way that the problem does not give (指示書 第5.5節 ①). */
function facts(ctx: GateContext): Facts {
  const res = solve(ctx.correct);
  const given = givenValues(ctx.correct);
  if (res.kind !== "unique") return { solvable: false, given, hidden: [], answer: null };
  const answer = res.values.get(ctx.correct.question.target_id);
  const hidden = [...res.values.values()].map(toSchema).filter((v) => !containsAny(given, v));
  return { solvable: true, given, hidden, answer: answer === undefined ? null : toSchema(answer) };
}

/** Numbers the child said that may be said back: the answer only when it is handed back as the child's words. */
function excused(ctx: GateContext, f: Facts, echo: boolean): Rational[] {
  return ctx.childSaid.numbers.filter((n) => echo || f.answer === null || !same(n, f.answer));
}

function operationWord(text: string, ctx: GateContext): boolean {
  const t = text.normalize("NFKC");
  const allowed = [ctx.correct.problem_text, ...ctx.childSaid.words].map((s) => s.normalize("NFKC"));
  for (const re of OPERATION_NAMES) {
    for (const m of t.matchAll(re)) {
      const at = m.index ?? 0;
      // The same word with the same letter before it, so a longer word of the problem (でかける) does not excuse it.
      const withBefore = (at > 0 ? t[at - 1] : "") + m[0];
      const ok = allowed.some((a) => (at > 0 ? a.includes(withBefore) : a.startsWith(m[0])) || a === m[0]);
      if (!ok) return true;
    }
  }
  return false;
}

/** Every value written into a world. */
function valuesOf(w: WorldScene): Rational[] {
  return givenValues(w);
}

export function gate(action: Action, ctx: GateContext): GateResult {
  const reasons = new Set<GateReason>();
  const f = facts(ctx);
  // A correct world that does not solve to one answer cannot tell what to hide: refuse to show anything.
  if (!f.solvable && action.kind !== "switch_problem") reasons.add("unverified");

  switch (action.kind) {
    case "say": {
      const ok = excused(ctx, f, action.echo === true);
      const hidden = f.hidden.filter((v) => !containsAny(ok, v));
      // The "1" card is the name of a card, not a number (「1」, "1", “1”).
      const spoken = action.text.replace(/「1」|"1"|“1”|「１」/g, "");
      if (numbersIn(spoken).some((n) => containsAny(hidden, n))) reasons.add("answer_leak");
      if (operationWord(action.text, ctx)) reasons.add("operation_name");
      break;
    }
    case "show_world": {
      if (!drawMarks.has(action.world)) reasons.add("unverified");
      // A drawn number is either a number of the problem or one the child said (指示書 第5.5節 描画の答え漏れ).
      const drawable = [...f.given, ...ctx.childSaid.numbers];
      const asked = ctx.correct.question.target_id;
      for (const l of action.labels) {
        if (l.value === "?") continue;
        if (l.element_id === asked && !containsAny(ctx.childSaid.numbers, l.value)) reasons.add("question_not_hidden");
        if (!containsAny(drawable, l.value)) reasons.add("answer_leak");
      }
      if (valuesOf(action.world).some((v) => !containsAny(drawable, v))) reasons.add("answer_leak");
      break;
    }
    case "show_statements":
      if (!ctx.interpretationRecorded || ctx.prediction === "pending") reasons.add("too_early");
      break;
    case "show_correct_world":
      if (!ctx.interpretationRecorded || ctx.prediction === "pending") reasons.add("too_early");
      if (!correctMarks.has(action.world)) reasons.add("unverified");
      break;
    case "switch_problem":
      if (action.grade < ctx.grade) reasons.add("grade_down");
      break;
  }
  return reasons.size === 0 ? { ok: true } : { ok: false, reasons: [...reasons] };
}
