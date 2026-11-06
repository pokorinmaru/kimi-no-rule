// M1 step (6): gates before anything reaches the child (指示書 第5.5節, 第1節 原則1). Pure functions:
// an action is data, and a refused action is not shown.
import type { ApplyResult } from "../apply/index.ts";
import type { Rational } from "../schema/common.ts";
import { validateWorld } from "../schema/semantic.ts";
import type { WorldScene } from "../schema/world-scene.ts";
import { eq, fromSchema, toSchema, rat } from "../rational/index.ts";
import { solve } from "../solve/index.ts";

// ---------------------------------------------------------------------------------------------
// Numbers in any notation
// ---------------------------------------------------------------------------------------------

const KANJI_DIGIT: Record<string, number> = { 〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const KANJI_UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };

function kanjiValue(s: string): number {
  let total = 0;
  let section = 0;
  let digit = -1;
  for (const c of s) {
    if (c === "万") {
      total += (section + (digit < 0 ? 0 : digit) || 1) * 10000;
      section = 0;
      digit = -1;
    } else if (c in KANJI_UNIT) {
      section += (digit < 0 ? 1 : digit) * (KANJI_UNIT[c] as number);
      digit = -1;
    } else {
      // Positional digits (二〇二六) continue the number.
      digit = digit < 0 ? (KANJI_DIGIT[c] as number) : digit * 10 + (KANJI_DIGIT[c] as number);
    }
  }
  return total + section + (digit < 0 ? 0 : digit);
}

const EN_SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
};
const EN_SCALE: Record<string, number> = { hundred: 100, thousand: 1000 };
const EN_WORD = new RegExp(`\\b(?:${[...Object.keys(EN_SMALL), ...Object.keys(EN_SCALE)].join("|")})(?:[\\s-]+(?:and[\\s-]+)?(?:${[...Object.keys(EN_SMALL), ...Object.keys(EN_SCALE)].join("|")}))*\\b`, "gi");

function englishValue(words: string): number {
  let total = 0;
  let current = 0;
  for (const w of words.toLowerCase().split(/[\s-]+/)) {
    if (w === "and" || w === "") continue;
    if (w in EN_SMALL) current += EN_SMALL[w] as number;
    else if (w === "hundred") current = (current || 1) * 100;
    else if (w === "thousand") {
      total += (current || 1) * 1000;
      current = 0;
    }
  }
  return total + current;
}

const KANJI_NUM = "[〇零一二三四五六七八九十百千万]+";
const ARABIC = "\\d+(?:\\.\\d+)?";
const TOKEN = new RegExp(
  `(${ARABIC}|${KANJI_NUM})\\s*分の\\s*(${ARABIC}|${KANJI_NUM})|(\\d+)\\s*/\\s*(\\d+)|(${ARABIC})|(${KANJI_NUM})`,
  "g",
);

function single(s: string): Rational {
  if (/^\d/.test(s)) {
    const [whole, frac = ""] = s.split(".");
    return toSchema(rat(BigInt((whole ?? "0") + frac), 10n ** BigInt(frac.length)));
  }
  return toSchema(rat(kanjiValue(s)));
}

function divide(n: Rational, d: Rational): Rational | null {
  const dd = fromSchema(d);
  if (dd.num === 0n) return null;
  return toSchema(rat(fromSchema(n).num * dd.den, fromSchema(n).den * dd.num));
}

/** Every number in a text, whatever the notation (指示書 第5.5節). Readings in kana are not matched. */
export function numbersIn(text: string): Rational[] {
  const t = text.normalize("NFKC");
  const found: { at: number; value: Rational }[] = [];
  for (const m of t.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    let v: Rational | null;
    if (m[1] !== undefined && m[2] !== undefined) v = divide(single(m[2]), single(m[1]));
    else if (m[3] !== undefined && m[4] !== undefined) v = divide(single(m[3]), single(m[4]));
    else v = single((m[5] ?? m[6]) as string);
    if (v !== null) found.push({ at, value: v });
  }
  for (const m of t.matchAll(EN_WORD)) found.push({ at: m.index ?? 0, value: toSchema(rat(englishValue(m[0]))) });
  return found.sort((a, b) => a.at - b.at).map((f) => f.value);
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

/** Only the drawing world may be shown; the judging and checking worlds hold values the child did not say. */
export function verifiedDrawWorld(child: ApplyResult): Verified<WorldScene> {
  // A copy carries the mark, so a judging or checking world that is the same object never does.
  const copy = structuredClone(child.drawWorld);
  drawMarks.add(copy);
  return copy as Verified<WorldScene>;
}

export function verifiedCorrectWorld(correct: WorldScene): Verified<WorldScene> {
  const v = validateWorld(correct);
  if (!v.ok) throw new Error(`the correct world does not pass the meaning check: ${v.errors[0]?.message ?? ""}`);
  const copy = structuredClone(correct);
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

/** Names of operations, by language. Words of the problem text and of the child are allowed. */
const OPERATION_NAMES: Record<"ja" | "en", RegExp[]> = {
  ja: [/足し算|たし算|引き算|ひき算|掛け算|かけ算|割り算|わり算|加法|減法|乗法|除法/, /足す|たす|引く|ひく|掛ける|かける|割る|わる/, /[×÷]/],
  en: [/\b(?:add(?:ed|ing|ition)?|plus|subtract(?:ed|ing|ion)?|minus|multipl(?:y|ied|ying|ication)|times|divid(?:e|ed|ing)|division)\b/i],
};

function containsAny(values: readonly Rational[], v: Rational): boolean {
  return values.some((x) => eq(fromSchema(x), fromSchema(v)));
}

/** The answer and every value on the way that the problem text does not give (指示書 第5.5節 ①). */
function hiddenValues(ctx: GateContext): Rational[] {
  const res = solve(ctx.correct);
  if (res.kind !== "unique" && res.kind !== "underdetermined") return [];
  const given = numbersIn(ctx.correct.problem_text);
  return [...res.values.values()].map(toSchema).filter((v) => !containsAny(given, v));
}

function leaks(numbers: readonly Rational[], ctx: GateContext): boolean {
  const hidden = hiddenValues(ctx).filter((v) => !containsAny(ctx.childSaid.numbers, v));
  return numbers.some((n) => containsAny(hidden, n));
}

function operationWord(text: string, ctx: GateContext): boolean {
  const allowed = [ctx.correct.problem_text, ...ctx.childSaid.words].join("\n");
  for (const lang of ["ja", "en"] as const) {
    for (const re of OPERATION_NAMES[lang]) {
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      for (const m of text.matchAll(g)) if (!allowed.includes(m[0])) return true;
    }
  }
  return false;
}

export function gate(action: Action, ctx: GateContext): GateResult {
  const reasons = new Set<GateReason>();
  switch (action.kind) {
    case "say":
      // Handing the child's words back (echo) passes only because those numbers and words are the
      // child's own: every other number is checked the same way (指示書 第5.5節).
      if (leaks(numbersIn(action.text), ctx)) reasons.add("answer_leak");
      if (operationWord(action.text, ctx)) reasons.add("operation_name");
      break;
    case "show_world": {
      if (!drawMarks.has(action.world)) reasons.add("unverified");
      const asked = ctx.correct.question.target_id;
      for (const l of action.labels) {
        if (l.value === "?") continue;
        if (l.element_id === asked && !containsAny(ctx.childSaid.numbers, l.value)) reasons.add("question_not_hidden");
        if (leaks([l.value], ctx)) reasons.add("answer_leak");
      }
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
