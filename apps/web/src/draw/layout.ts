// The layout of a world as tapes (指示書 第8.5節). Pure: no React, no DOM.
//
// The screen does not decide numbers: every value comes from @kimi/core (solve, the rational functions,
// numbersIn). This file only turns core's rationals into pixel lengths and decides what may be shown.
// What may be shown (第1節 原則1): a number of the problem text, a number the child said, or the value
// the child gave for a quantity. Everything else, the asked quantity first, is drawn as 「？」.
// A segment carries a value only when the child has said the size of one segment (Q29), and then only on
// the segments of the 「1」 tape; a tape with segments carries no number card.
import type { Lang } from "@kimi/core";
import { ui } from "../flow/text.ts";
import {
  cmp,
  div,
  eq,
  fromSchema,
  inv,
  mul,
  numbersIn,
  rat,
  sameWorld,
  solve,
  toString,
  type ExactRational,
  type Rational,
  type WorldScene,
} from "@kimi/core";

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export type ValueLabel =
  | { kind: "number"; value: Rational; text: string; counter: string }
  /** Drawn as 「？」. */
  | { kind: "unknown" }
  /** Nothing drawn: a known number on a tape with segments stays in the problem text. */
  | { kind: "none" };

export interface SegmentLayout {
  x: number;
  width: number;
  /** The size of one segment the child said, on the 「1」 tape only; absent before the child said it. */
  value?: ValueLabel;
}

export interface TapeLayout {
  holderId: string;
  label: string;
  quantityId: string;
  /** The row's top; the tape itself is drawn at tapeY. */
  rowY: number;
  x: number;
  tapeY: number;
  width: number;
  height: number;
  /** The tape the world takes as 1 (the reference of its multiple). */
  isUnit: boolean;
  asked: boolean;
  value: ValueLabel;
  /** Same-size units of the multiple (第8.5節); empty when none are drawn. Only the child's own unit value is drawn on one. */
  segments: SegmentLayout[];
  impossible: boolean;
}

export interface DifferenceLayout {
  /** The longer tape the bracket sits under. */
  holderId: string;
  relationId: string;
  x: number;
  width: number;
  y: number;
  label: ValueLabel;
}

export interface CardLayout {
  /** The holder whose whole tape the card covers, or null while it waits in the tray. */
  placedOn: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DropTarget {
  holderId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WorldLayout {
  width: number;
  height: number;
  /** proportional: lengths by core's values; order: only which tape is longer (第7.1節 手順3). */
  mode: "proportional" | "order";
  tapes: TapeLayout[];
  differences: DifferenceLayout[];
  card: CardLayout;
  /** Only whole tapes: the card is never placed on one segment. */
  dropTargets: DropTarget[];
  /** The world cannot happen (a fraction of a fish, a negative count, a contradiction). */
  impossible: boolean;
}

export interface LayoutOptions {
  /**
   * The holder the 「1」 card is on. Default: the reference holder of the world's multiple. null: the
   * card is not placed yet, so only the length order is drawn and no segments (第8.5節).
   */
  cardHolder?: string | null;
  /** The correct world. When the drawn world is the same world (core's sameWorld), only the order is drawn. */
  correct?: WorldScene;
  /** Values the child said for quantities, by quantity id. Only these may show for the asked quantity. */
  answered?: Readonly<Record<string, Rational>>;
  /** Other numbers the child said (a multiple, a difference); they may be shown. */
  childNumbers?: readonly Rational[];
  /** The size of one segment the child said: drawn on each segment of the 「1」 tape (Q29). */
  unitValue?: Rational | null;
  /** Width of the drawing in SVG units. */
  width?: number;
}

// ---------------------------------------------------------------------------------------------
// Sizes (SVG units). Touch targets are at least 44 high.
// ---------------------------------------------------------------------------------------------

export const SIZES = {
  width: 640,
  labelWidth: 96,
  valueWidth: 88,
  pad: 16,
  trayHeight: 64,
  cardHeight: 36,
  tapeHeight: 44,
  rowGap: 20,
  bracketHeight: 32,
  /** The shorter tape when only the order is drawn: not the ratio of any problem in the bank. */
  orderShort: 0.62,
  /** The shorter tape of a difference (第8.5節: fixed, not proportional to the values) 【仮】. */
  differenceShort: 0.75,
  /** No tape is drawn shorter than this share of the longest, so a tiny or negative value stays visible. */
  minShare: 0.08,
} as const;

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const MULTIPLE = new Set(["times", "fraction_of"]);
const DIFFERENCE = new Set(["more_by", "less_by"]);

/** Pixel share of a core rational: the only place a rational becomes a float. */
const toNumber = (r: ExactRational): number => Number(r.num) / Number(r.den);

type Quantity = WorldScene["quantities"][number];
type Relation = WorldScene["relations"][number];

/** One quantity per holder: the one not tied to an event, else the first. */
function quantityOfHolder(w: WorldScene, holderId: string): Quantity | undefined {
  const own = w.quantities.filter((q) => q.holder === holderId);
  return own.find((q) => q.at_event === null) ?? own[0];
}

function firstMultiple(w: WorldScene): Relation | undefined {
  return w.relations.find((r) => MULTIPLE.has(r.operator) && r.reference !== null && r.amount !== null);
}

/**
 * Length of each quantity relative to `unitId`, walking the relations with core's arithmetic.
 * A difference takes a fixed share (第8.5節), never its values.
 */
function relativeByRelations(w: WorldScene, unitId: string): Map<string, ExactRational> {
  const out = new Map<string, ExactRational>([[unitId, rat(1)]]);
  const fixedShort = rat(3, 4); // SIZES.differenceShort as an exact share
  for (let changed = true; changed; ) {
    changed = false;
    for (const r of w.relations) {
      if (r.reference === null) continue;
      const s = out.get(r.subject);
      const ref = out.get(r.reference);
      let factor: ExactRational | null = null;
      if (MULTIPLE.has(r.operator) && r.amount !== null) factor = fromSchema(r.amount);
      else if (r.operator === "less_by") factor = fixedShort;
      else if (r.operator === "more_by") factor = inv(fixedShort);
      if (factor === null || factor.num <= 0n) continue;
      if (ref !== undefined && s === undefined) {
        out.set(r.subject, mul(factor, ref));
        changed = true;
      } else if (s !== undefined && ref === undefined) {
        out.set(r.reference, div(s, factor));
        changed = true;
      }
    }
  }
  return out;
}

/** Numbers that may be drawn: the problem text's (read by core) and the child's own. */
function drawable(w: WorldScene, opts: LayoutOptions): ExactRational[] {
  return [...numbersIn(w.problem_text), ...(opts.childNumbers ?? []), ...Object.values(opts.answered ?? {})].map(fromSchema);
}

function numberLabel(value: Rational, counter: string): ValueLabel {
  return { kind: "number", value, text: toString(fromSchema(value)), counter };
}

// ---------------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------------

export function layoutWorld(world: WorldScene, opts: LayoutOptions = {}): WorldLayout {
  const width = opts.width ?? SIZES.width;
  const asked = world.question.target_id;
  const counterOf = (q: Quantity): string => world.item_kinds.find((k) => k.id === q.item_kind)?.counter ?? "";
  const shown = drawable(world, opts);
  const mayShow = (v: Rational): boolean => shown.some((x) => eq(x, fromSchema(v)));

  const rows = world.holders.flatMap((h) => {
    const q = quantityOfHolder(world, h.id);
    return q === undefined ? [] : [{ holder: h, q }];
  });

  // Who is 1: the reference of the world's multiple, else of its first relation, else the first holder.
  const multipleRel = firstMultiple(world);
  const anyRel = multipleRel ?? world.relations.find((r) => DIFFERENCE.has(r.operator) && r.reference !== null);
  const unitQ = anyRel?.reference ?? rows[0]?.q.id ?? "";
  const unitHolder = world.quantities.find((q) => q.id === unitQ)?.holder ?? null;

  const cardHolder = opts.cardHolder === undefined ? unitHolder : opts.cardHolder;
  const sameAsCorrect = opts.correct !== undefined && sameWorld(world, opts.correct);
  const mode: WorldLayout["mode"] = cardHolder === null || sameAsCorrect ? "order" : "proportional";

  // Values from core: solve first; the relations fill in when the world does not solve to one answer.
  const res = solve(world);
  const hasDifference = world.relations.some((r) => DIFFERENCE.has(r.operator));
  const byRelations = relativeByRelations(world, unitQ);
  const unitValue = res.kind === "unique" || res.kind === "underdetermined" ? res.values.get(unitQ) : undefined;
  const relative = (qid: string): ExactRational | undefined => {
    if (!hasDifference && unitValue !== undefined && unitValue.num > 0n && res.kind !== "contradiction" && res.kind !== "nonlinear") {
      const v = res.values.get(qid);
      if (v !== undefined) return div(v, unitValue);
    }
    return byRelations.get(qid);
  };
  const impossibleIds = new Set(res.kind === "unique" ? res.impossible.map((m) => m.id) : []);
  const impossible = res.kind === "contradiction" || impossibleIds.size > 0;

  // Shares of the longest tape.
  const rel = rows.map((r) => relative(r.q.id) ?? rat(1));
  const longest = rel.reduce((a, b) => (cmp(a, b) >= 0 ? a : b), rat(1));
  let shares: number[];
  if (mode === "proportional") {
    shares = rel.map((r) => Math.max(SIZES.minShare, toNumber(div(r, longest))));
  } else {
    shares = rel.map((r) => (cmp(r, longest) === 0 ? 1 : SIZES.orderShort));
  }

  // Segments: the multiple in lowest terms (core keeps rationals reduced), both parts at most 10.
  const amount = multipleRel?.amount != null ? fromSchema(multipleRel.amount) : null;
  const segmentCount = (qid: string): number => {
    if (mode !== "proportional" || multipleRel === undefined || amount === null) return 0;
    if (amount.num > 10n || amount.den > 10n || amount.num <= 0n) return 0;
    if (qid === multipleRel.reference) return Number(amount.den);
    if (qid === multipleRel.subject) return Number(amount.num);
    return 0;
  };

  const trackX = SIZES.pad + SIZES.labelWidth;
  const trackWidth = Math.max(80, width - trackX - SIZES.valueWidth - SIZES.pad);
  const rowHeight = SIZES.cardHeight + SIZES.tapeHeight + SIZES.rowGap + (hasDifference ? SIZES.bracketHeight : 0);

  const tapes: TapeLayout[] = rows.map(({ holder, q }, i) => {
    const rowY = SIZES.trayHeight + i * rowHeight;
    const tapeWidth = trackWidth * (shares[i] ?? 1);
    const n = segmentCount(q.id);
    const said = q.id === unitQ && opts.unitValue != null ? numberLabel(opts.unitValue, counterOf(q)) : null;
    const segments: SegmentLayout[] = Array.from({ length: n }, (_, k) => ({
      x: trackX + (tapeWidth * k) / n,
      width: tapeWidth / n,
      ...(said === null ? {} : { value: said }),
    }));
    const answered = opts.answered?.[q.id];
    let value: ValueLabel;
    if (answered !== undefined) value = numberLabel(answered, counterOf(q));
    else if (q.id === asked || q.value === null || !mayShow(q.value)) value = { kind: "unknown" };
    else if (segments.length > 0) value = { kind: "none" };
    else value = numberLabel(q.value, counterOf(q));
    return {
      holderId: holder.id,
      label: holder.label,
      quantityId: q.id,
      rowY,
      x: trackX,
      tapeY: rowY + SIZES.cardHeight,
      width: tapeWidth,
      height: SIZES.tapeHeight,
      isUnit: q.id === unitQ,
      asked: q.id === asked,
      value,
      segments,
      impossible: impossibleIds.has(q.id),
    };
  });

  // A difference: a bracket under the longer tape over the part the shorter one does not reach.
  const differences: DifferenceLayout[] = world.relations.flatMap((r) => {
    if (!DIFFERENCE.has(r.operator) || r.reference === null) return [];
    const a = tapes.find((t) => t.quantityId === r.subject);
    const b = tapes.find((t) => t.quantityId === r.reference);
    if (a === undefined || b === undefined) return [];
    const [long, short] = a.width >= b.width ? [a, b] : [b, a];
    const q = world.quantities.find((x) => x.id === long.quantityId);
    const label: ValueLabel =
      r.amount !== null && mayShow(r.amount) && q !== undefined ? numberLabel(r.amount, counterOf(q)) : { kind: "unknown" };
    return [
      {
        holderId: long.holderId,
        relationId: r.id,
        x: long.x + short.width,
        width: long.width - short.width,
        y: long.tapeY + long.height + 4,
        label,
      },
    ];
  });

  const placed = cardHolder === null ? undefined : tapes.find((t) => t.holderId === cardHolder);
  const card: CardLayout =
    placed === undefined
      ? { placedOn: null, x: trackX, y: (SIZES.trayHeight - SIZES.cardHeight) / 2, width: 72, height: SIZES.cardHeight }
      : { placedOn: placed.holderId, x: placed.x, y: placed.rowY, width: placed.width, height: SIZES.cardHeight };

  const dropTargets: DropTarget[] = tapes.map((t) => ({
    holderId: t.holderId,
    x: SIZES.pad,
    y: t.rowY,
    width: width - 2 * SIZES.pad,
    height: SIZES.cardHeight + SIZES.tapeHeight,
  }));

  return {
    width,
    height: SIZES.trayHeight + rows.length * rowHeight,
    mode,
    tapes,
    differences,
    card,
    dropTargets,
    impossible,
  };
}

/**
 * A spoken description of the tapes (指示書 第8.4b節): names, the number of segments, 「？」 for what is
 * unknown, and the sentence verdicts when given. Never a value that is not drawn.
 */
export function describeLayout(l: WorldLayout, failingSentences: readonly string[] = [], lang: Lang = "ja"): string {
  const w = ui(lang).draw;
  const sep = lang === "en" ? ", " : "、";
  const parts = l.tapes.map((t) => {
    const cut = t.segments.length > 0 ? w.cut(t.segments.length) : "";
    const one = t.segments[0]?.value;
    const each = one?.kind === "number" ? w.each(`${one.text}${one.counter}`) : "";
    const v = t.value.kind === "number" ? `${t.value.text}${t.value.counter}` : t.value.kind === "unknown" ? w.unknown : "";
    const unit = l.card.placedOn === t.holderId ? w.cardHere : "";
    return `${w.tape(t.label)}${[v, cut, each, unit].filter((s) => s !== "").map((s) => `${sep}${s}`).join("")}`;
  });
  const fails = failingSentences.map(w.fails);
  const odd = l.impossible ? [w.odd] : [];
  return w.join([...parts, ...odd, ...fails]);
}
