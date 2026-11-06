// M2: the keyword-rule baseline for the interpretation eval (指示書 第10.1節). It picks the operation from
// cue words alone, the strategy word-problem research describes, and takes the first two numbers as the
// operands. No Claude, no answer: it is the rule the listening layer has to beat.
import type { AnyOp, Interpretation, ProblemRecord } from "@kimi/core";

type Operation = "multiply" | "divide" | "add" | "subtract";
type Rat = { num: number; den: number };

const CUES: { operation: Operation; words: string[] }[] = [
  { operation: "multiply", words: ["かけ", "掛け", "倍", "ばい", "times", "multiply", " of "] },
  { operation: "divide", words: ["わる", "わっ", "わり", "割", "divide"] },
  { operation: "add", words: ["たす", "たし", "足し", "足す", "あわせ", "合わせ", "多い", "おおい", "ふえ", "増え", "more", "plus", "add"] },
  { operation: "subtract", words: ["ひく", "ひい", "引く", "引い", "少ない", "すくない", "へっ", "減っ", "ちがい", "違い", "less", "minus"] },
];

const KANJI: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

/** The first cue word in the text decides the operation. */
function firstCue(text: string): Operation | null {
  const t = ` ${text.toLowerCase()} `;
  let best: { at: number; operation: Operation } | null = null;
  for (const c of CUES) {
    for (const w of c.words) {
      const at = t.indexOf(w);
      if (at >= 0 && (best === null || at < best.at)) best = { at, operation: c.operation };
    }
  }
  return best?.operation ?? null;
}

/** Numbers in text order: b分のa, a/b, whole numbers, and the kanji numerals one to ten. */
export function numbersOf(text: string): Rat[] {
  const t = text.normalize("NFKC");
  const found: { at: number; value: Rat }[] = [];
  const taken: [number, number][] = [];
  const free = (s: number, e: number): boolean => taken.every(([a, b]) => e <= a || s >= b);
  const add = (s: number, e: number, value: Rat): void => {
    if (!free(s, e) || value.den === 0) return;
    taken.push([s, e]);
    found.push({ at: s, value });
  };
  const k = (s: string): number => (/^\d+$/.test(s) ? Number(s) : (KANJI[s] ?? NaN));
  for (const m of t.matchAll(/(\d+|[一二三四五六七八九十])分の(\d+|[一二三四五六七八九十])/g)) add(m.index, m.index + m[0].length, { num: k(m[2] as string), den: k(m[1] as string) });
  for (const m of t.matchAll(/(\d+)\/(\d+)/g)) add(m.index, m.index + m[0].length, { num: Number(m[1]), den: Number(m[2]) });
  for (const m of t.matchAll(/\d+(?:\.\d+)?/g)) {
    const [whole, frac = ""] = m[0].split(".");
    add(m.index, m.index + m[0].length, { num: Number(`${whole}${frac}`), den: 10 ** frac.length });
  }
  for (const m of t.matchAll(/[一二三四五六七八九十]/g)) add(m.index, m.index + 1, { num: KANJI[m[0]] as number, den: 1 });
  return found.sort((a, b) => a.at - b.at).map((f) => f.value);
}

const sameRat = (a: Rat, b: Rat): boolean => a.num * b.den === b.num * a.den;

export function parseKeywords(record: ProblemRecord, transcript: string): Interpretation {
  const world = record.world;
  const lang = /^[\x20-\x7e]*$/.test(transcript) && /[a-z]/i.test(transcript) ? "en" : "ja";
  const given = world.quantities.filter((q) => q.value !== null);
  const operand = (r: Rat): { quantity_id: string } | Rat => {
    const q = given.find((g) => g.value !== null && sameRat(g.value, r));
    return q === undefined ? r : { quantity_id: q.id };
  };
  const nums = numbersOf(transcript);
  const operation = firstCue(transcript);
  const target = world.question.target_id;
  const ops: AnyOp[] = [];
  if (operation !== null && world.question.target_type === "quantity") {
    const first = given[0];
    const pair: ({ quantity_id: string } | Rat)[] = nums.slice(0, 2).map(operand);
    if (pair.length === 1 && first !== undefined) pair.unshift({ quantity_id: first.id });
    if (pair.length === 2) ops.push({ op: "state_procedure", target_id: target, operands: pair as [never, never], operation, evidence: transcript } as AnyOp);
  } else if (operation === null && nums.length > 0 && /(答え|こたえ|answer|です|匹|ひき|びき|個|こ|人|円|本|枚|is)/i.test(transcript)) {
    const n = nums[nums.length - 1] as Rat;
    ops.push({ op: "state_answer", target_id: target, number: n, evidence: transcript });
  }
  return {
    schema_version: "6",
    utterance_lang: lang,
    representable: ops.length > 0 ? "full" : "none",
    ops: ops as Interpretation["ops"],
    unclear: [],
    phrases: [],
  };
}
