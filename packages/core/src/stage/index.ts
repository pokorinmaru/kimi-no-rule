// The stage picture's numbers (指示書 第8節 舞台の絵, above the tape). Pure functions only.
//
// A world of things (countable, or a continuous unit such as dL, L or m) is drawn as each holder's things in a container, dealt onto dishes by the
// multiple: the holder the relation takes as 1 is dealt onto q dishes and the other holder has p dishes
// (the multiple p/q in lowest terms, both at most 10). A misread world is drawn with its own values, cut
// pieces included (a goldfish cut in half): that is how the misreading shows (user decision, 2026-11-08).
//
// The gate lives here: a value of the correct world's solution that is not a number of the problem and that
// the child has not said (the answer, the size of one segment) is never drawn as things. A holder or a
// share of a misread world that coincides with such a value is drawn hidden (「？」), not as things.
import { div, eq, fromSchema, isInteger, mul, rat, sub, toSchema, type Rational as Exact } from "../rational/index.ts";
import type { Rational } from "../schema/common.ts";
import type { WorldScene } from "../schema/world-scene.ts";
import { solve } from "../solve/index.ts";

/** A number of things: whole things and the last piece (between 0 and 1, exclusive), or no piece. */
export interface StageAmount {
  wholes: number;
  piece: Rational | null;
}

export interface StageHolder {
  holderId: string;
  label: string;
  quantityId: string;
  /** The holder's things as drawn; null when hidden or when no things can be drawn (a negative count). */
  count: StageAmount | null;
  /** Drawn as 「？」: its value is a hidden value of the correct world. */
  hidden: boolean;
  /** The count is a number the problem gives (the correct world's own value): always drawn. */
  given: boolean;
  /** The holder the multiple takes as 1 (the relation's reference). */
  isOne: boolean;
  /** How many dishes the holder's things are dealt onto; 0 when nothing is dealt for it. */
  dishes: number;
  /** The count cannot happen with countable things: not whole, or below zero. */
  impossible: boolean;
}

export interface ObjectScene {
  /** `continuous`: a unit like dL, L or m (poured into cups or cut in lengths; a piece is possible). */
  item: { id: string; noun: string; counter: string; continuous: boolean };
  /** In the world's order of holders. */
  holders: StageHolder[];
  /** What one dish gets; null when nothing is dealt (no multiple, or the share is hidden). */
  share: StageAmount | null;
  /**
   * An additive reading (more_by / less_by) drawn as a one-to-one pairing: the smaller holder's things pair with as
   * many of the larger holder's, and `extra` of the larger holder's have no partner. Null when the relation is not
   * additive, a count is not whole or is hidden, or the paired or extra count is a hidden value (then the picture is
   * the two containers only).
   */
  pairing: { paired: number; extra: number; larger: string } | null;
  /** The dealing does not come out in whole things. */
  breaks: boolean;
  /** The values that are never drawn here (the correct world's solution the child has not said). */
  hidden: Rational[];
}

/** Larger than this, a multiple is not cut into dishes (the same limit as the tape's segments, 第8.5節). */
const MAX_PARTS = 10n;
/** More things than this are not drawn one by one (not reached by the bank; the screen then draws the tape only). */
export const MAX_THINGS = 60;

const MULTIPLE = new Set(["times", "fraction_of"]);

function amountOf(v: Exact): StageAmount {
  const wholes = v.num / v.den; // v >= 0 here
  const piece = sub(v, rat(wholes));
  return { wholes: Number(wholes), piece: piece.num === 0n ? null : toSchema(piece) };
}

/** The numbers a child can read off an amount as drawn: its value, and its whole things when a piece is beside them. */
function countsOf(a: StageAmount): Exact[] {
  const v = fromSchema(amountValue(a));
  return a.piece === null ? [v] : [v, rat(a.wholes)];
}

/** The value of an amount, as one rational. */
export function amountValue(a: StageAmount): Rational {
  const whole = rat(a.wholes);
  return toSchema(a.piece === null ? whole : fromSchema({ num: a.wholes * a.piece.den + a.piece.num, den: a.piece.den }));
}

type Quantity = WorldScene["quantities"][number];
const quantityOfHolder = (w: WorldScene, holderId: string): Quantity | undefined => {
  const own = w.quantities.filter((q) => q.holder === holderId);
  return own.find((q) => q.at_event === null) ?? own[0];
};
const multipleOf = (w: WorldScene) => w.relations.find((r) => MULTIPLE.has(r.operator) && r.reference !== null && r.amount !== null);

/** The correct world's values the child has not said: its solution beyond the given numbers, and one segment. */
function hiddenValues(correct: WorldScene, said: readonly Rational[]): Exact[] {
  const res = solve(correct);
  if (res.kind !== "unique" && res.kind !== "underdetermined") return [];
  const out: Exact[] = [];
  for (const q of correct.quantities) {
    if (q.value !== null) continue;
    const v = res.values.get(q.id);
    if (v !== undefined) out.push(v);
  }
  const m = multipleOf(correct);
  const ref = m?.reference == null ? undefined : res.values.get(m.reference);
  if (m?.amount != null && ref !== undefined) out.push(div(ref, rat(fromSchema(m.amount).den)));
  const saidExact = said.map(fromSchema);
  const unique: Exact[] = [];
  for (const v of out) if (!saidExact.some((s) => eq(s, v)) && !unique.some((u) => eq(u, v))) unique.push(v);
  return unique;
}

/**
 * The things of `shown` (the world on the screen, verified by core), drawn against the `correct` world, with
 * the numbers the child has said. Null when the world is not of two holders and one kind of thing (countable or a
 * continuous unit), or does not solve to one value per holder (the screen then shows the tape only).
 */
export function objectScene(shown: WorldScene, correct: WorldScene, said: { values: readonly Rational[] }): ObjectScene | null {
  const kind = shown.item_kinds[0];
  if (shown.item_kinds.length !== 1 || kind === undefined) return null;
  // A continuous unit (dL, L, m) may come in pieces: a piece is then no impossible world.
  const countable = kind.countable;
  if (shown.holders.length !== 2 || shown.events.length > 0) return null;
  const res = solve(shown);
  if (res.kind !== "unique") return null;

  const hidden = hiddenValues(correct, said.values);
  const isHiddenValue = (v: Exact): boolean => hidden.some((h) => eq(h, v));
  // A number the problem gives keeps its holder drawn: it is in the text (the given quantity, unchanged).
  const given = (q: Quantity, v: Exact): boolean => {
    const c = correct.quantities.find((x) => x.id === q.id);
    return c?.value != null && eq(fromSchema(c.value), v);
  };

  const m = multipleOf(shown);
  const amount = m?.amount == null ? null : fromSchema(m.amount);
  const cuts = amount !== null && amount.num > 0n && amount.num <= MAX_PARTS && amount.den <= MAX_PARTS;

  const holders: StageHolder[] = [];
  for (const h of shown.holders) {
    const q = quantityOfHolder(shown, h.id);
    const v = q === undefined ? undefined : res.values.get(q.id);
    if (q === undefined || v === undefined) return null;
    const negative = v.num < 0n;
    const isGiven = given(q, v);
    // Hidden when its value, or the number of its whole things beside a cut piece, is a hidden value.
    const hide = !isGiven && !negative && countsOf(amountOf(v)).some(isHiddenValue);
    const count = hide || negative ? null : amountOf(v);
    if (count !== null && count.wholes > MAX_THINGS) return null;
    const isOne = m?.reference === q.id;
    let dishes = 0;
    if (cuts && amount !== null && m !== undefined && !hide && !negative) {
      if (isOne) dishes = Number(amount.den);
      else if (m.subject === q.id) dishes = Number(amount.num);
    }
    holders.push({ holderId: h.id, label: h.label, quantityId: q.id, count, hidden: hide, given: isGiven, isOne, dishes, impossible: negative || (countable && !isInteger(v)) });
  }

  // One dish's share: the "1" holder's value cut in q. When the share, or a count of whole things the dealing
  // shows, is a hidden value, nothing is dealt.
  let share: StageAmount | null = null;
  let breaks = false;
  const one = holders.find((x) => x.isOne);
  const oneValue = one === undefined ? undefined : res.values.get(one.quantityId);
  if (cuts && amount !== null && oneValue !== undefined && oneValue.num >= 0n) {
    const s = div(oneValue, rat(amount.den));
    // The other holder's dishes hold p shares: when that is not its count, it is not dealt.
    for (const x of holders) {
      const v = res.values.get(x.quantityId);
      if (x.dishes > 0 && (v === undefined || !eq(mul(s, rat(x.dishes)), v))) x.dishes = 0;
    }
    const a = amountOf(s);
    const shows = [...countsOf(a), ...(a.piece === null ? [] : holders.filter((x) => x.dishes > 0).map((x) => rat(x.dishes * a.wholes)))];
    if (shows.some(isHiddenValue)) {
      for (const x of holders) x.dishes = 0;
    } else {
      share = a;
      breaks = countable && !isInteger(s);
    }
  } else {
    for (const x of holders) x.dishes = 0;
  }

  // An additive reading: pair the two holders' things one to one; the larger holder's extra things have no partner.
  let pairing: ObjectScene["pairing"] = null;
  const additive = shown.relations.some((r) => (r.operator === "more_by" || r.operator === "less_by") && r.reference !== null);
  const [ha, hb] = holders;
  if (additive && share === null && ha !== undefined && hb !== undefined && ha.count !== null && hb.count !== null && ha.count.piece === null && hb.count.piece === null && !ha.impossible && !hb.impossible) {
    const ca = ha.count.wholes;
    const cb = hb.count.wholes;
    if (ca !== cb) {
      const [small, large] = ca < cb ? [ha, hb] : [hb, ha];
      const paired = Math.min(ca, cb);
      const extra = Math.abs(ca - cb);
      // The extra count is a new number on the picture; the paired count is new unless it is the problem's own number.
      const shows = [rat(extra), ...(small.given ? [] : [rat(paired)])];
      if (!shows.some(isHiddenValue)) pairing = { paired, extra, larger: large.holderId };
    }
  }

  return {
    item: { id: kind.id, noun: kind.noun, counter: kind.counter, continuous: !countable },
    holders,
    share,
    pairing,
    breaks,
    hidden: hidden.map(toSchema),
  };
}

/**
 * Every number the scene lets a child count beyond the problem's own numbers: each drawn holder's count (and its
 * whole things beside a piece), the share of a dish (and its whole things), and the whole things on a holder's
 * dishes when the dealing cuts.
 */
export function drawnValues(s: ObjectScene): Rational[] {
  const counts = (a: StageAmount): Rational[] => (a.piece === null ? [amountValue(a)] : [amountValue(a), { num: a.wholes, den: 1 }]);
  const share = s.share;
  const p = s.pairing;
  const smallGiven = p === null ? true : s.holders.find((h) => h.holderId !== p.larger)?.given === true;
  return [
    ...(p === null ? [] : [{ num: p.extra, den: 1 }, ...(smallGiven ? [] : [{ num: p.paired, den: 1 }])]),
    ...s.holders.flatMap((h) => (h.count === null || h.given ? [] : counts(h.count))),
    ...(share === null ? [] : counts(share)),
    ...(share === null || share.piece === null ? [] : s.holders.filter((h) => h.dishes > 0).map((h) => ({ num: h.dishes * share.wholes, den: 1 }))),
  ];
}
