// The child's own number for one part, dealt as it is (user request, 2026-11-08): the known count is dealt onto the
// parts' plates at the child's number per plate, so the plates run out early or things are left over. Before any answer
// the plates start empty with every thing in the pool (dealStart), and a wrong answer at the answer step is dealt one
// part per plate (dealTotal). The child can then move the things between plates; core says what each plate holds (its
// share of the whole, as count / total) and whether all are equal. A plate's number that is one part or the answer and
// that the child has not said is not given while the plates are not all the same (the screen shows 「？」; safety
// review, 2026-11-08). AI-kun's lines are fixed words with core's numbers, through the gate; when every wording with
// numbers is refused, a wording without numbers, and when that is refused too, no line (null).
import { gate, type GateContext } from "../gates/index.ts";
import { div, fromSchema, isInteger, rat, toSchema } from "../rational/index.ts";
import type { Rational } from "../schema/common.ts";
import type { ProblemRecord } from "../schema/problem-record.ts";
import { MAX_THINGS, objectScene } from "../stage/index.ts";
import { stepsOf, type Step } from "./index.ts";

export interface DealAttempt {
  /** Things per plate as the child said (in things: coins when money is drawn as coins); 0 before any answer. */
  per: number;
  /** What each plate got, in order; later plates may be short or empty. */
  plates: number[];
  /** Things left over when every plate got `per` (all of them before any answer). */
  left: number;
  /** All the things, and how many plates. */
  total: number;
  parts: number;
  /**
   * over: the things ran out before every plate got `per`; under: some were left over; start: nothing dealt yet (all
   * the things wait in the pool for the child to deal, user request 2026-11-08 夜).
   */
  kind: "over" | "under" | "start";
  /** The thing's words as drawn (100円玉 and 枚 for money) and the problem's own counter, and what one thing is worth. */
  noun: string;
  counter: string;
  unitCounter: string;
  worth: number;
  /** The values (in the problem's unit) never given as a plate's number before the plates are the same: one part and the answer, unless the child said them. */
  hidden: number[];
}

export interface DealPlate {
  count: number;
  /** In the problem's unit; null when it is a hidden value (one part or the answer the child has not said). */
  value: number | null;
  /** count / all the things, not reduced (2/8 stays 2/8); null when the value is hidden. */
  fraction: { num: number; den: number } | null;
  /** Its share of the whole, reduced (kept for older callers). */
  share: Rational;
}

export interface DealStatus {
  plates: DealPlate[];
  /** Every thing is on a plate and every plate holds the same. */
  equal: boolean;
  /** All the things, in the problem's unit (the plates' 「◯のうち」). */
  totalValue: number;
  /** The things left in the pool, in the problem's unit; null when hidden. */
  poolValue: number | null;
}

const integer = (r: Rational): number | null => {
  const x = fromSchema(r);
  return isInteger(x) ? Number(x.num) : null;
};

/** One part and the answer of the problem, in its unit, less the numbers the child said. */
function hiddenOf(record: ProblemRecord, said: readonly Rational[]): number[] {
  const steps = stepsOf(record) ?? [];
  const out: number[] = [];
  for (const s of steps) {
    if (s.kind !== "unit" && s.kind !== "total") continue;
    const v = integer(s.value);
    if (v === null) continue;
    if (said.some((x) => integer(x) === v)) continue;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

function drawn(record: ProblemRecord): { worth: number; noun: string; counter: string; unitCounter: string } | null {
  const scene = objectScene(record.world, record.world, { values: [] });
  if (scene === null) return null;
  return { worth: scene.item.coin ?? 1, noun: scene.item.noun, counter: scene.item.counter, unitCounter: record.world.item_kinds[0]?.counter ?? "" };
}

/** Deals `total` things `per` a plate onto `parts` plates: what each got and what is left. */
function dealOut(total: number, per: number, parts: number): { plates: number[]; left: number } {
  const plates: number[] = [];
  let rest = total;
  for (let i = 0; i < parts; i++) {
    const got = Math.min(per, rest);
    plates.push(got);
    rest -= got;
  }
  return { plates, left: rest };
}

/**
 * The dealing at the child's number for one part, or null when it cannot be drawn as things (not whole, not
 * positive, too many, or the child's number is one part itself).
 */
export function dealAttempt(record: ProblemRecord, step: Extract<Step, { kind: "unit" }>, fact: Extract<Step, { kind: "fact" }>, said: Rational): DealAttempt | null {
  const d = drawn(record);
  if (d === null) return null;
  const totalValue = integer(fact.value);
  const perValue = integer(said);
  if (totalValue === null || perValue === null || perValue <= 0) return null;
  if (totalValue % d.worth !== 0 || perValue % d.worth !== 0) return null;
  const total = totalValue / d.worth;
  const per = perValue / d.worth;
  if (total > MAX_THINGS || total <= 0) return null;
  const parts = step.parts;
  if (per * parts === total) return null;
  const { plates, left } = dealOut(total, per, parts);
  return { per, plates, left, total, parts, kind: per * parts > total ? "over" : "under", ...d, hidden: hiddenOf(record, [said]) };
}

/**
 * One part before any answer (user request, 2026-11-08 夜): the parts' plates empty and all the known things in the pool,
 * so the child can deal them and think with the things. Null when the things cannot be drawn.
 */
export function dealStart(record: ProblemRecord, step: Extract<Step, { kind: "unit" }>, fact: Extract<Step, { kind: "fact" }>): DealAttempt | null {
  const d = drawn(record);
  if (d === null) return null;
  const totalValue = integer(fact.value);
  if (totalValue === null || totalValue <= 0 || totalValue % d.worth !== 0) return null;
  const total = totalValue / d.worth;
  if (total > MAX_THINGS) return null;
  return { per: 0, plates: Array.from({ length: step.parts }, () => 0), left: total, total, parts: step.parts, kind: "start", ...d, hidden: hiddenOf(record, []) };
}

/**
 * The answer step, wrong (user request, 2026-11-08 夜): the child's number for the parts asked, dealt one part (the
 * number the child already said) per plate, so the plates run out or things are left over. Null when it cannot be drawn
 * or the number is the answer.
 */
export function dealTotal(record: ProblemRecord, step: Extract<Step, { kind: "total" }>, unit: Rational, said: Rational): DealAttempt | null {
  const d = drawn(record);
  if (d === null) return null;
  const unitValue = integer(unit);
  const saidValue = integer(said);
  if (unitValue === null || saidValue === null || unitValue <= 0 || saidValue <= 0) return null;
  if (unitValue % d.worth !== 0 || saidValue % d.worth !== 0) return null;
  const per = unitValue / d.worth;
  const total = saidValue / d.worth;
  if (total > MAX_THINGS || per * step.parts === total) return null;
  const { plates, left } = dealOut(total, per, step.parts);
  return { per, plates, left, total, parts: step.parts, kind: per * step.parts > total ? "over" : "under", ...d, hidden: hiddenOf(record, [unit, said]) };
}

/**
 * What the plates hold now (the child may have moved things): each plate's count, its value and its share of all the
 * things (count / total, not reduced), whether all are equal, the whole and the pool in the problem's unit. Before the
 * plates are all the same, a value in `hidden` (one part or the answer the child has not said) is not given.
 */
export function dealStatus(plates: readonly number[], total: number, worth = 1, pool = 0, hidden: readonly number[] = []): DealStatus {
  const placed = plates.reduce((a, b) => a + b, 0);
  const first = plates[0];
  const equal = placed === total && first !== undefined && first > 0 && plates.every((c) => c === first);
  const shown = (v: number): number | null => (!equal && hidden.includes(v) ? null : v);
  return {
    plates: plates.map((count) => {
      const value = shown(count * worth);
      return { count, value, fraction: value === null ? null : { num: count, den: total }, share: toSchema(div(rat(count), rat(total))) };
    }),
    equal,
    totalValue: total * worth,
    poolValue: shown(pool * worth),
  };
}

function gateOk(record: ProblemRecord, said: readonly Rational[], lang: "ja" | "en"): (text: string) => boolean {
  const ctx: GateContext = {
    correct: record.world,
    lang,
    childSaid: { numbers: [...said], words: [] },
    grade: record.world.grade,
    interpretationRecorded: true,
    prediction: "disabled",
  };
  return (text) => gate({ kind: "say", text }, ctx).ok;
}

/** The first wording the gate lets through, or null (the last wording carries no number; when even it is refused, nothing is said). */
const pick = (ok: (text: string) => boolean, candidates: readonly string[]): string | null => candidates.find(ok) ?? null;

/**
 * AI-kun's line for the child's dealing: fixed words, the problem's numbers and the child's own number. A wording the
 * gate refuses (one part, or the answer) is passed over for one with fewer numbers; null when none passes.
 */
export function dealLine(record: ProblemRecord, a: DealAttempt, said: Rational, lang: "ja" | "en"): string | null {
  const ok = gateOk(record, [said], lang);
  const totalValue = a.total * a.worth;
  const perValue = a.per * a.worth;
  const u = a.unitCounter;
  if (lang === "en") {
    const tail = ` It was ${String(totalValue)} ${u} split into ${String(a.parts)} parts. Is this right?`;
    if (a.kind === "over")
      return pick(ok, [`Huh? With ${String(perValue)} ${u} on each plate, they ran out before the ${String(a.parts)} plates were full.${tail}`, `Huh? They ran out before every plate got the same.${tail}`, "Huh? They ran out before every plate got the same. Is this right?"]);
    return pick(ok, [`Huh? With ${String(perValue)} ${u} on each plate, ${String(a.left * a.worth)} ${u} are left over.${tail}`, `Huh? With ${String(perValue)} ${u} on each plate, some are left over.${tail}`, "Huh? Some are left over. Is this right?"]);
  }
  const tail = `${String(totalValue)}${u}を ${String(a.parts)}つに わける、だったよね。これで いいのかな？`;
  if (a.kind === "over") {
    return pick(ok, [
      `あれれ？ 1つの おさらに ${String(perValue)}${u}ずつ くばったら、とちゅうで ${a.noun}が なくなっちゃった。${tail}`,
      `あれれ？ とちゅうで ${a.noun}が なくなっちゃった。${tail}`,
      `あれれ？ とちゅうで ${a.noun}が なくなっちゃった。これで いいのかな？`,
    ]);
  }
  return pick(ok, [
    `あれれ？ 1つの おさらに ${String(perValue)}${u}ずつ くばったら、${String(a.left * a.worth)}${u} のこっちゃった。${tail}`,
    `あれれ？ 1つの おさらに ${String(perValue)}${u}ずつ くばったら、${a.noun}が のこっちゃった。${tail}`,
    `あれれ？ ${a.noun}が のこっちゃった。これで いいのかな？`,
  ]);
}

/** AI-kun's line before any answer: deal the things onto the plates the same on each (fixed words, the problem's numbers); null when the gate refuses every wording. */
export function dealStartLine(record: ProblemRecord, a: DealAttempt, lang: "ja" | "en"): string | null {
  const ok = gateOk(record, [], lang);
  const u = a.unitCounter;
  const total = `${String(a.total * a.worth)}${u}`;
  return lang === "en"
    ? pick(ok, [`Let's put the ${total} on the ${String(a.parts)} plates, the same on each. Drag them with your finger!`, `Let's put them on the ${String(a.parts)} plates, the same on each!`, "Let's put them on the plates, the same on each!"])
    : pick(ok, [`${total}を ${String(a.parts)}つの おさらに、同じ 数ずつ くばってみよう。ゆびで うごかせるよ！`, `${String(a.parts)}つの おさらに、同じ 数ずつ くばってみよう！`, "おさらに、同じ 数ずつ くばってみよう！"]);
}

/** AI-kun's line for the child's wrong answer at the answer step: one part per plate, and the plates run out or things are left (never the answer); null when the gate refuses every wording. */
export function dealTotalLine(record: ProblemRecord, a: DealAttempt, unit: Rational, said: Rational, lang: "ja" | "en"): string | null {
  const ok = gateOk(record, [unit, said], lang);
  const u = a.unitCounter;
  const per = `${String(a.per * a.worth)}${u}`;
  const total = `${String(a.total * a.worth)}${u}`;
  if (lang === "en") {
    return a.kind === "over"
      ? pick(ok, [`Huh? With ${total}, putting ${per} on each of the ${String(a.parts)} plates, they ran out. Is this right?`, "Huh? They ran out before every plate got one part. Is this right?"])
      : pick(ok, [`Huh? With ${total}, putting ${per} on each of the ${String(a.parts)} plates, some are left over. Is this right?`, "Huh? Some are left over. Is this right?"]);
  }
  return a.kind === "over"
    ? pick(ok, [`あれれ？ ${total}で、${String(a.parts)}つの おさらに ${per}ずつ くばったら、たりなくなっちゃった。これで いいのかな？`, `あれれ？ とちゅうで ${a.noun}が たりなくなっちゃった。これで いいのかな？`])
    : pick(ok, [`あれれ？ ${total}で、${String(a.parts)}つの おさらに ${per}ずつ くばったら、のこっちゃった。これで いいのかな？`, `あれれ？ ${a.noun}が のこっちゃった。これで いいのかな？`]);
}
