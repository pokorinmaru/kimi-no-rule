// The child's own number for one part, dealt as it is (user request, 2026-11-08): the known count is dealt onto the
// parts' plates at the child's number per plate, so the plates run out early or things are left over. The child can then
// move the things between plates; core says what each plate holds (its share of the whole) and whether all are equal.
// AI-kun's line is fixed words with core's numbers, and never says one part (the gate checks it).
import { gate, type GateContext } from "../gates/index.ts";
import { div, fromSchema, isInteger, rat, toSchema } from "../rational/index.ts";
import type { Rational } from "../schema/common.ts";
import type { ProblemRecord } from "../schema/problem-record.ts";
import { MAX_THINGS, objectScene } from "../stage/index.ts";
import type { Step } from "./index.ts";

export interface DealAttempt {
  /** Things per plate as the child said (in things: coins when money is drawn as coins). */
  per: number;
  /** What each plate got, in order; later plates may be short or empty. */
  plates: number[];
  /** Things left over when every plate got `per`. */
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
}

export interface DealStatus {
  /** Each plate: its count in things, its value in the problem's unit, and its share of the whole (count / total). */
  plates: { count: number; value: number; share: Rational }[];
  /** Every thing is on a plate and every plate holds the same. */
  equal: boolean;
}

const integer = (r: Rational): number | null => {
  const x = fromSchema(r);
  return isInteger(x) ? Number(x.num) : null;
};

/**
 * The dealing at the child's number for one part, or null when it cannot be drawn as things (not whole, not
 * positive, too many, or the child's number is one part itself).
 */
export function dealAttempt(record: ProblemRecord, step: Extract<Step, { kind: "unit" }>, fact: Extract<Step, { kind: "fact" }>, said: Rational): DealAttempt | null {
  const scene = objectScene(record.world, record.world, { values: [] });
  if (scene === null) return null;
  const worth = scene.item.coin ?? 1;
  const totalValue = integer(fact.value);
  const perValue = integer(said);
  if (totalValue === null || perValue === null || perValue <= 0) return null;
  if (totalValue % worth !== 0 || perValue % worth !== 0) return null;
  const total = totalValue / worth;
  const per = perValue / worth;
  if (total > MAX_THINGS || total <= 0) return null;
  const parts = step.parts;
  if (per * parts === total) return null;
  const plates: number[] = [];
  let rest = total;
  for (let i = 0; i < parts; i++) {
    const got = Math.min(per, rest);
    plates.push(got);
    rest -= got;
  }
  const unitCounter = record.world.item_kinds[0]?.counter ?? "";
  return { per, plates, left: rest, total, parts, kind: per * parts > total ? "over" : "under", noun: scene.item.noun, counter: scene.item.counter, unitCounter, worth };
}

/**
 * One part before any answer (user request, 2026-11-08 夜): the parts' plates empty and all the known things in the pool,
 * so the child can deal them and think with the things. Null when the things cannot be drawn.
 */
export function dealStart(record: ProblemRecord, step: Extract<Step, { kind: "unit" }>, fact: Extract<Step, { kind: "fact" }>): DealAttempt | null {
  const scene = objectScene(record.world, record.world, { values: [] });
  if (scene === null) return null;
  const worth = scene.item.coin ?? 1;
  const totalValue = integer(fact.value);
  if (totalValue === null || totalValue <= 0 || totalValue % worth !== 0) return null;
  const total = totalValue / worth;
  if (total > MAX_THINGS) return null;
  const unitCounter = record.world.item_kinds[0]?.counter ?? "";
  return { per: 0, plates: Array.from({ length: step.parts }, () => 0), left: total, total, parts: step.parts, kind: "start", noun: scene.item.noun, counter: scene.item.counter, unitCounter, worth };
}

/**
 * The answer step, wrong (user request, 2026-11-08 夜): the child's number for the parts asked, dealt one part (the
 * number the child already said) per plate, so the plates run out or things are left over. Null when it cannot be drawn
 * or the number is the answer.
 */
export function dealTotal(record: ProblemRecord, step: Extract<Step, { kind: "total" }>, unit: Rational, said: Rational): DealAttempt | null {
  const scene = objectScene(record.world, record.world, { values: [] });
  if (scene === null) return null;
  const worth = scene.item.coin ?? 1;
  const unitValue = integer(unit);
  const saidValue = integer(said);
  if (unitValue === null || saidValue === null || unitValue <= 0 || saidValue <= 0) return null;
  if (unitValue % worth !== 0 || saidValue % worth !== 0) return null;
  const per = unitValue / worth;
  const total = saidValue / worth;
  if (total > MAX_THINGS || per * step.parts === total) return null;
  const plates: number[] = [];
  let rest = total;
  for (let i = 0; i < step.parts; i++) {
    const got = Math.min(per, rest);
    plates.push(got);
    rest -= got;
  }
  const unitCounter = record.world.item_kinds[0]?.counter ?? "";
  return { per, plates, left: rest, total, parts: step.parts, kind: per * step.parts > total ? "over" : "under", noun: scene.item.noun, counter: scene.item.counter, unitCounter, worth };
}

/** What the plates hold now (the child may have moved things): each plate's share of the whole, and whether all are equal. */
export function dealStatus(plates: readonly number[], total: number, worth = 1): DealStatus {
  const placed = plates.reduce((a, b) => a + b, 0);
  const first = plates[0];
  return {
    plates: plates.map((count) => ({ count, value: count * worth, share: toSchema(div(rat(count), rat(total))) })),
    equal: placed === total && first !== undefined && first > 0 && plates.every((c) => c === first),
  };
}

/**
 * AI-kun's line for the child's dealing: fixed words, the problem's numbers and the child's own number. A number the
 * gate refuses (one part, or the answer) is left out of the line.
 */
export function dealLine(record: ProblemRecord, a: DealAttempt, said: Rational, lang: "ja" | "en"): string {
  const ctx: GateContext = {
    correct: record.world,
    lang,
    childSaid: { numbers: [said], words: [] },
    grade: record.world.grade,
    interpretationRecorded: true,
    prediction: "disabled",
  };
  const ok = (text: string): boolean => gate({ kind: "say", text }, ctx).ok;
  const totalValue = a.total * a.worth;
  const perValue = a.per * a.worth;
  const u = a.unitCounter;
  const pick = (...candidates: string[]): string => candidates.find(ok) ?? candidates.at(-1) ?? "";
  if (lang === "en") {
    const head = a.kind === "over" ? `Huh? With ${String(perValue)} ${u} on each plate, they ran out before the ${String(a.parts)} plates were full.` : `Huh? With ${String(perValue)} ${u} on each plate, `;
    const tail = ` It was ${String(totalValue)} ${u} split into ${String(a.parts)} parts. Is this right?`;
    if (a.kind === "over") return pick(head + tail, `Huh? They ran out before every plate got the same.${tail}`);
    return pick(`${head}${String(a.left * a.worth)} ${u} are left over.${tail}`, `${head}some are left over.${tail}`);
  }
  const tail = `${String(totalValue)}${u}を ${String(a.parts)}つに わける、だったよね。これで いいのかな？`;
  if (a.kind === "over") {
    return pick(
      `あれれ？ 1つの おさらに ${String(perValue)}${u}ずつ くばったら、とちゅうで ${a.noun}が なくなっちゃった。${tail}`,
      `あれれ？ とちゅうで ${a.noun}が なくなっちゃった。${tail}`,
    );
  }
  return pick(
    `あれれ？ 1つの おさらに ${String(perValue)}${u}ずつ くばったら、${String(a.left * a.worth)}${u} のこっちゃった。${tail}`,
    `あれれ？ 1つの おさらに ${String(perValue)}${u}ずつ くばったら、${a.noun}が のこっちゃった。${tail}`,
  );
}

const gateOk = (record: ProblemRecord, said: Rational[], lang: "ja" | "en") => (text: string): boolean =>
  gate(
    { kind: "say", text },
    { correct: record.world, lang, childSaid: { numbers: said, words: [] }, grade: record.world.grade, interpretationRecorded: true, prediction: "disabled" },
  ).ok;

/** AI-kun's line before any answer: deal the things onto the plates the same on each (fixed words, the problem's numbers). */
export function dealStartLine(record: ProblemRecord, a: DealAttempt, lang: "ja" | "en"): string {
  const ok = gateOk(record, [], lang);
  const u = a.unitCounter;
  const total = `${String(a.total * a.worth)}${u}`;
  const lines =
    lang === "en"
      ? [`Let's put the ${total} on the ${String(a.parts)} plates, the same on each. Drag them with your finger!`, `Let's put them on the ${String(a.parts)} plates, the same on each!`]
      : [`${total}を ${String(a.parts)}つの おさらに、同じ 数ずつ くばってみよう。ゆびで うごかせるよ！`, `${String(a.parts)}つの おさらに、同じ 数ずつ くばってみよう！`];
  return lines.find(ok) ?? lines.at(-1) ?? "";
}

/** AI-kun's line for the child's wrong answer at the answer step: one part per plate, and the plates run out or things are left (never the answer). */
export function dealTotalLine(record: ProblemRecord, a: DealAttempt, unit: Rational, said: Rational, lang: "ja" | "en"): string {
  const ok = gateOk(record, [unit, said], lang);
  const u = a.unitCounter;
  const per = `${String(a.per * a.worth)}${u}`;
  const total = `${String(a.total * a.worth)}${u}`;
  const lines =
    lang === "en"
      ? a.kind === "over"
        ? [`Huh? With ${total}, putting ${per} on each of the ${String(a.parts)} plates, they ran out. Is this right?`, `Huh? They ran out before every plate got one part. Is this right?`]
        : [`Huh? With ${total}, putting ${per} on each of the ${String(a.parts)} plates, some are left over. Is this right?`, `Huh? Some are left over. Is this right?`]
      : a.kind === "over"
        ? [`あれれ？ ${total}で、${String(a.parts)}つの おさらに ${per}ずつ くばったら、たりなくなっちゃった。これで いいのかな？`, `あれれ？ とちゅうで ${a.noun}が たりなくなっちゃった。これで いいのかな？`]
        : [`あれれ？ ${total}で、${String(a.parts)}つの おさらに ${per}ずつ くばったら、のこっちゃった。これで いいのかな？`, `あれれ？ ${a.noun}が のこっちゃった。これで いいのかな？`];
  return lines.find(ok) ?? lines.at(-1) ?? "";
}
