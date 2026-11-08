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
  /** over: the things ran out before every plate got `per`; under: some were left over. */
  kind: "over" | "under";
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
