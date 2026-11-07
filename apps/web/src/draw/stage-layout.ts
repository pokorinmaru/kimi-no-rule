// The layout of the stage picture (指示書 第8節: the stage picture above the tape). Pure: no React, no DOM.
// Every count, share and dish comes from core's objectScene (which also hides the correct world's values the
// child has not said); this file only places the things and turns a piece into a width.
import type { ObjectScene, StageAmount } from "@kimi/core";
import { CONTAINER_INNER, VIEWBOX, containerPartFor, itemPartFor, type ContainerPart, type ItemPart } from "./assets/spec.ts";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * What draws a holder's things: an item part, or (a liquid: ジュース, 水) a measuring cup, filled to the amount.
 * Liquids and yarn have no container: they are laid out under the holder's name (assets/spec.ts).
 */
export type StageItem = ItemPart | "cup" | "token";
export const LIQUID_NOUNS: Readonly<Record<string, "juice" | "water">> = { ジュース: "juice", 水: "water" };
export const liquidOf = (noun: string): "juice" | "water" | null => LIQUID_NOUNS[noun] ?? null;
const OPEN: readonly string[] = ["cup", "yarn"];
/** Things laid out without a container: liquids in cups, and yarn. */
export const isOpen = (item: string): boolean => OPEN.includes(item);

export interface ThingLayout {
  x: number;
  y: number;
  size: number;
  /** The share of a thing kept, from the left (a cut piece), or null for a whole thing. */
  piece: number | null;
  /** The piece as core gave it, "num/den", for tests and the description; "" for a whole thing. */
  pieceText: string;
  /** container: kept in its container; row: kept without one (cups, yarn); dish: dealt onto a plate; group: poured into a group of cups. */
  place: "container" | "dish" | "row" | "group";
  /** The dish it sits on (0-based), or -1 in the container. */
  dish: number;
  /** Where it starts when dealt: the middle of its container (top-left of the thing). */
  fromX: number;
  fromY: number;
}

export interface StageHolderLayout {
  holderId: string;
  label: string;
  item: StageItem;
  /** The container part; null for things laid out without one (cups, yarn). */
  container: ContainerPart | null;
  /** The holder's own panel is `width` (StageLayout) by `height`, in its own units; everything below is inside it. */
  height: number;
  /** The container; null once its things are dealt (an empty container has no purpose: only the name and dishes). */
  box: Box | null;
  tag: { x: number; y: number };
  hidden: boolean;
  /** The 「？」 in the container when hidden. */
  unknown: { x: number; y: number } | null;
  /** Each dish: the whole cell, things above and the plate at its foot. */
  dishes: Box[];
  /** The plate of each dish (inside its cell); empty for poured cups. */
  plates: Box[];
  /** A soft band behind each group a liquid is poured into, or yarn is measured out into (one per "dish"); empty otherwise. */
  groups: Box[];
  /** Soil bands behind each row of flowers in a flower bed, so every row stands on soil; empty for other things. */
  soil: Box[];
  things: ThingLayout[];
}

export interface StageLayout {
  /** The width of every holder's panel, in its units. */
  width: number;
  /** The tallest panel. */
  height: number;
  /** The holders one above the other at full width (side by side could not keep every thing large enough). */
  stacked: boolean;
  /** A small picture beside another (the word book's contrasting cases): things on dishes at PANEL.compactPx. */
  compact: boolean;
  /** The width the picture is drawn at on a 1024 screen (px): the page's, or less beside another picture. */
  pagePx: number;
  holders: StageHolderLayout[];
  /**
   * An additive reading drawn as a one-to-one pairing: both holders in ONE panel, one above the other (holder i at
   * offsets[i]), with the same thing size and columns, so thing i of one sits above thing i of the other. A light
   * line joins each pair; the larger holder's things without a partner sit in dashed boxes. Coordinates are the
   * combined panel's. Null otherwise.
   */
  pairing: StagePairing | null;
}

export interface StagePairing {
  offsets: number[];
  lines: { x1: number; y1: number; x2: number; y2: number }[];
  /** One box per row of the larger holder's unpaired things. */
  unpaired: Box[];
  larger: string;
}

/** A thing is drawn this share of its cell, so neighbours never touch. */
export const THING_FILL = 0.94;

/**
 * One panel per holder. Side by side, two panels of `side` units share the page; stacked, each panel is `stacked`
 * units wide at full width. On a 1024 screen the page's content is pagePx wide (760 less a 16 px gutter each side).
 */
export const PANEL = {
  side: 360,
  stacked: 720,
  pagePx: 728,
  /** Between the two panels, in px (the flex gap). */
  gap: 24,
  /** Each panel's frame: padding plus border, in px on each side (ObjectScene.tsx). */
  frame: 9,
  /** The flex basis side by side: two panels fit from about 2 x 340 + 24 = 704 px. */
  minPx: 340,
  maxPx: 480,
  /** Stacked panels grow to this. */
  stackedMaxPx: 960,
  /** Side by side only while every thing's drawing keeps this shorter side (px), else stacked. */
  sideMinPx: 30,
  /** No thing's drawing is ever narrower or shorter than this (px). */
  leastPx: 27,
  /** The largest thing, in panel units. */
  maxThing: 72,
  /** The emptied container once its things are dealt, in panel units wide. */
  dealtContainer: 152,
  /** Stacked containers grow up to this many times their viewBox, until things reach `roomyThing` units. */
  stackedContainerMax: 1.6,
  roomyThing: 44,
  tagGap: 22,
  dishGap: 12,
  /** On a dish, each thing's drawing keeps at least this shorter side (px): 3 things or fewer, and more. */
  dishFewPx: 56,
  dishManyPx: 40,
  /** On a dish of a compact picture (the word book's contrasting cases). */
  compactPx: 30,
  /** A plate is this much wider than the things standing across it. */
  plateMargin: 1.08,
  /** Around a group of cups (panel units). */
  groupPad: 8,
  /** The widest plate, in panel units. */
  maxPlate: 720,
  /** A plate may stretch up to this many times its own height, to hold rows of things. */
  plateStretch: 2,
  /** A plate's height to its width (its viewBox). */
  plateRatio: VIEWBOX.group.h / VIEWBOX.group.w,
  bottom: 8,
} as const;

/**
 * How much of its box a thing's drawing fills on its shorter side (measured on the parts of 2026-11-08 with
 * getBBox; a tulip is narrow). A part not listed counts as half, so it is never drawn too small. e2e/parts.spec.ts
 * measures the real parts in a browser and fails when a redrawn part no longer matches this table.
 */
export const PART_NARROW: Readonly<Record<string, number>> = {
  goldfish: 0.71,
  fish: 0.63,
  ribbon: 0.92,
  sticker: 0.86,
  tulip: 0.52,
  flower_white: 0.71,
  flower_red: 0.66,
  mikan: 0.95,
  apple: 0.77,
  card: 0.68,
  yarn: 0.31,
  // The word book's things (measured on the real parts, 2026-11-08).
  candy: 0.44,
  marble: 0.8,
  bead: 0.84,
  acorn: 0.84,
  senbei: 0.84,
};
export const narrowOf = (item: string): number => (item === "cup" ? CUP_NARROW : item === "token" ? TOKEN_NARROW : (PART_NARROW[item] ?? 0.5));

/** The round counter (a placeholder drawn by parts.ts: a circle of radius 38 + outline in its 100 box). */
export const TOKEN_NARROW = 0.8;

/**
 * The clear inside of the cup part where the liquid goes, in its viewBox (PART_VIEWBOX cup: 100 by 130): between its
 * walls, from just under the rim to the bottom (measured: e2e/parts.spec.ts).
 */
export const CUP_INNER: Box = { x: 21, y: 27, w: 48, h: 78 };
/** The liquid fills down to the cup's rounded bottom (inside its outline), clipped with rounded corners. */
export const CUP_BOTTOM = 117;

/** A measuring cup (PART_VIEWBOX: 100 wide, 130 tall) drawn in a square cell: its width is its shorter side. */
export const CUP_NARROW = 0.7;

/**
 * Where each item part's drawing lies across its 100-unit box (measured with getBBox: e2e/parts.spec.ts). A piece is
 * cut to its share of this width, so half a fish is half of the fish you see. A part not listed spans the whole box.
 */
export const PART_BOX: Readonly<Record<string, { x: number; w: number }>> = {
  goldfish: { x: 6.8, w: 87.2 },
  fish: { x: 8, w: 90 },
  ribbon: { x: 2.3, w: 97.7 },
  sticker: { x: 7, w: 86 },
  tulip: { x: 24, w: 52 },
  flower_white: { x: 14, w: 71.3 },
  flower_red: { x: 17, w: 66 },
  mikan: { x: 0, w: 100 },
  apple: { x: 11.7, w: 76.5 },
  card: { x: 17.3, w: 68.2 },
  yarn: { x: 5.5, w: 89 },
  candy: { x: 5, w: 90 },
  marble: { x: 10, w: 80 },
  bead: { x: 8, w: 84 },
  acorn: { x: 8, w: 84 },
  senbei: { x: 8, w: 84 },
};
export const partBoxOf = (item: string): { x: number; w: number } => PART_BOX[item] ?? { x: 0, w: 100 };

/** The plain inside of each container part, in its viewBox (measured: e2e/parts.spec.ts); others use CONTAINER_INNER. */
// The measured rectangle, 2 units in on each side.
export const CONTAINER_INNER_OF: Readonly<Partial<Record<ContainerPart, Box>>> = {
  tank: { x: 46, y: 54, w: 288, h: 136 },
  cooler: { x: 34, y: 54, w: 292, h: 160 },
  flowerbed: { x: 26, y: 46, w: 308, h: 160 },
  basket: { x: 26, y: 50, w: 308, h: 164 },
  sheet: { x: 26, y: 26, w: 308, h: 192 },
  tray: { x: 50, y: 42, w: 260, h: 156 },
};
/** A container's plain inside in its viewBox. */
export const containerInnerOf = (part: string): Box => CONTAINER_INNER_OF[part as ContainerPart] ?? CONTAINER_INNER;

/**
 * Which side of a thing a piece keeps. A fish's head is on its right, and a piece of the tail alone does not read
 * as part of a fish (scene check, 2026-11-08), so a fish keeps its head; every other thing keeps its left part.
 */
export const PIECE_KEEP: Readonly<Record<string, "left" | "right">> = { goldfish: "right", fish: "right" };
export const pieceKeepOf = (item: string): "left" | "right" => PIECE_KEEP[item] ?? "left";

/** The shorter side of a thing's drawing, in px on a 1024 screen, for a cell of `size` units. */
export const drawnSide = (l: { stacked: boolean; width: number; pagePx?: number }, item: string, size: number): number => size * THING_FILL * sizingNarrowOf(item) * pxPerUnit(l);

/**
 * The share a thing's size is judged on. A length of yarn or a wrapped candy is long and flat by nature: it reads by
 * its length, so it is judged on its box (its drawing's own shorter side stays in PART_NARROW).
 */
/** Things that are long and flat by nature (a length of yarn, a wrapped candy): judged on their box, not their thin side. */
const BY_LENGTH: readonly string[] = ["yarn", "candy"];
export const sizingNarrowOf = (item: string): number => (BY_LENGTH.includes(item) ? 1 : narrowOf(item));

/** px per panel unit on a 1024 screen, for the layout's arrangement. */
export function pxPerUnit(l: { stacked: boolean; width: number; pagePx?: number }): number {
  const page = l.pagePx ?? PANEL.pagePx;
  const panelPx = l.stacked ? page - 2 * PANEL.frame : (page - PANEL.gap) / 2 - 2 * PANEL.frame;
  return panelPx / l.width;
}

/** Pixel share of a piece: the only place a rational becomes a float here. */
const share = (p: { num: number; den: number }): number => p.num / p.den;

const thingsOf = (a: StageAmount): { piece: number | null; pieceText: string }[] => [
  ...Array.from({ length: a.wholes }, () => ({ piece: null, pieceText: "" })),
  ...(a.piece === null ? [] : [{ piece: share(a.piece), pieceText: `${String(a.piece.num)}/${String(a.piece.den)}` }]),
];

/** The largest cell for n things in a w by h box (at most `max`). */
export function bestSize(n: number, w: number, h: number, max: number): number {
  let best = 0;
  for (let c = 1; c <= Math.max(1, n); c++) best = Math.max(best, Math.min(w / c, h / Math.ceil(n / c), max));
  return best;
}

/** A piece keeps this much of a cell clear between it and the whole thing before it (so "1 and a half" reads). */
export const PIECE_GAP = 0.3;

/**
 * The things of a container: one cell size, as many columns as `cols`, the block centred in the box and its rows
 * left-aligned inside it (so two holders' rows line up). A piece after a whole thing in its row keeps PIECE_GAP
 * clear, or starts the next row.
 */
export function containerGrid(n: number, piece: boolean, box: Box, size: number, cols: number): { x: number; y: number; size: number }[] {
  if (n <= 0) return [];
  const slots: { col: number; row: number; shift: number }[] = [];
  for (let i = 0; i < n; i++) slots.push({ col: i % cols, row: Math.floor(i / cols), shift: 0 });
  const last = slots[n - 1];
  if (piece && last !== undefined && last.col > 0) {
    if ((last.col + 1 + PIECE_GAP) * size <= cols * size + 1e-9) last.shift = PIECE_GAP * size;
    else slots[n - 1] = { col: 0, row: last.row + 1, shift: 0 };
  }
  const rows = Math.max(...slots.map((q) => q.row)) + 1;
  const x0 = box.x + (box.w - cols * size) / 2;
  const y0 = box.y + (box.h - rows * size) / 2;
  return slots.map((q) => ({ x: x0 + q.col * size + q.shift, y: y0 + q.row * size, size }));
}

/** The light inside of the plate part, in its viewBox (VIEWBOX.group): things stand with their feet in it. */
export const PLATE_INNER = { cx: 80, cy: 26, rx: 44, ry: 14 } as const;

/**
 * Where rows of things stand in the inner ellipse, as a share of its half-height below (+) or above (-) its middle:
 * one row stands in front of the middle; a pile's rows spread from the back to the front.
 */
export const FEET = { single: 0.3, back: -0.4, front: 0.6 } as const;
/** Each thing stands with the middle of its foot inside the ellipse (food on a plate may reach over the rim). */
export const FOOT_SPAN = 0;
const chordAt = (t: number): number => Math.sqrt(1 - t * t);

/** A pile of things on a dish: rows, columns, the thing size, the plate's width and height (stretched for rows). */
export interface Pile {
  rows: number;
  cols: number;
  size: number;
  plateW: number;
  plateH: number;
}

/**
 * How a dish at most `maxW` wide holds n things of at most `want` units: the fewest rows that reach `want` (else the
 * largest things), and the plate only as wide as its things need (their feet in the inner ellipse, a small margin).
 */
export function dishPile(n: number, piece: boolean, maxW: number, want: number): Pile {
  const all: Pile[] = [];
  for (let R = 1; R <= Math.max(1, n); R++) {
    const C = Math.ceil(n / R);
    const brick = R > 1 ? 0.5 : 0;
    const gap = piece && C > 1 ? PIECE_GAP : 0;
    const chord = R > 1 ? Math.min(chordAt(FEET.back), chordAt(FEET.front)) : chordAt(FEET.single);
    // Size per unit of plate width: the row's foot middles within the ellipse's chord, and the things across the plate.
    const across = C - 1 + brick + gap;
    const byEllipse = across === 0 ? Infinity : (2 * (PLATE_INNER.rx / VIEWBOX.group.w) * chord) / across;
    const byThings = 1 / ((C + brick + gap) * PANEL.plateMargin);
    const k = Math.min(byEllipse, byThings);
    // Rows stand 0.55 of a thing apart, between FEET.back and FEET.front of the ellipse's height; the plate stretches
    // up to PANEL.plateStretch times its own height for that.
    const span = FEET.front - FEET.back;
    const maxB = (maxW * PANEL.plateRatio * PANEL.plateStretch * PLATE_INNER.ry) / VIEWBOX.group.h;
    const byHeight = R > 1 ? (maxB * span) / ((R - 1) * 0.55) : Infinity;
    const size = Math.min(want, k * maxW, byHeight);
    const plateW = Math.min(maxW, size / k);
    const b = R > 1 ? ((R - 1) * 0.55 * size) / span : 0;
    all.push({ rows: R, cols: C, size, plateW, plateH: Math.max(plateW * PANEL.plateRatio, (b * VIEWBOX.group.h) / PLATE_INNER.ry) });
  }
  const reach = all.find((x) => x.size >= want - 1e-9);
  if (reach !== undefined) return reach;
  const top = Math.max(...all.map((x) => x.size));
  return all.find((x) => x.size >= top * 0.75) ?? all[0] ?? { rows: 1, cols: 1, size: 0, plateW: maxW, plateH: maxW * PANEL.plateRatio };
}

/** The things on one dish whose plate is `plate`: rows from back to front, feet in the inner ellipse. */
export function dishThings(n: number, piece: boolean, plate: Box, pile: Pile): { x: number; y: number; size: number; row: number }[] {
  const { rows: R, cols: C, size: s } = pile;
  const cx = plate.x + (plate.w * PLATE_INNER.cx) / VIEWBOX.group.w;
  const cy = plate.y + (plate.h * PLATE_INNER.cy) / VIEWBOX.group.h;
  const b = (plate.h * PLATE_INNER.ry) / VIEWBOX.group.h;
  // The back row takes what is left over; the front rows are full and the piece is last in the front row.
  const counts = Array.from({ length: R }, (_, r) => (r === 0 ? n - (R - 1) * C : C));
  const out: { x: number; y: number; size: number; row: number }[] = [];
  let i = 0;
  for (let r = 0; r < R; r++) {
    const cnt = counts[r] ?? 0;
    const foot = R === 1 ? cy + FEET.single * b : cy + FEET.back * b + (r * (FEET.front - FEET.back) * b) / (R - 1);
    const hasPiece = piece && r === R - 1;
    const width = (cnt + (hasPiece && cnt > 1 ? PIECE_GAP : 0)) * s;
    const shift = R > 1 ? (r % 2 === 0 ? -0.25 : 0.25) * s : 0;
    const x0 = cx - width / 2 + shift;
    for (let j = 0; j < cnt; j++, i++) {
      const gap = hasPiece && j === cnt - 1 && cnt > 1 ? PIECE_GAP * s : 0;
      out.push({ x: x0 + j * s + gap, y: foot - s, size: s, row: r });
    }
  }
  return out;
}

const FLOWERS: readonly string[] = ["tulip", "flower_white", "flower_red"];

/** How many dishes side by side, at most. */
const dishCols = (d: number, stacked: boolean): number => (stacked ? (d <= 5 ? d : Math.ceil(d / 2)) : d <= 2 ? d : d <= 4 ? 2 : 3);

/** Options: `counters` draws things without a part of their own (the word book's everyday things) as plain round counters. */
export interface StageOptions {
  counters?: boolean;
  /** A small picture shown beside another: things on dishes kept at PANEL.compactPx, not the problem screen's sizes. */
  compact?: boolean;
  /** The width the picture is drawn at on a 1024 screen (px); default the page's (PANEL.pagePx). */
  pagePx?: number;
}

/**
 * Null when a holder's things have no part (the screen then shows the tape only). Without `mode`, the holders
 * stand side by side when every thing keeps PANEL.sideMinPx there, else one above the other at full width.
 */
export function layoutStage(scene: ObjectScene, mode?: "side" | "stacked", opts: StageOptions = {}): StageLayout | null {
  const found: (StageItem | null)[] = scene.holders.map((h) =>
    liquidOf(scene.item.noun) !== null ? "cup" : (itemPartFor(scene.item.noun, h.label) ?? (opts.counters === true ? "token" : null)),
  );
  if (found.some((p) => p === null)) return null;
  const parts = found as StageItem[];
  const compact = opts.compact === true;
  const pagePx = opts.pagePx ?? PANEL.pagePx;
  if (scene.pairing !== null) return paired(arrange(scene, parts, true, compact, pagePx), scene.pairing);
  if (mode !== undefined) return arrange(scene, parts, mode === "stacked", compact, pagePx);
  const side = arrange(scene, parts, false, compact, pagePx);
  const stacked = arrange(scene, parts, true, compact, pagePx);
  if (!meetsSizes(side)) return stacked;
  if (meetsSizes(stacked) && heightPx(stacked) < heightPx(side)) return stacked;
  return side;
}

/** The gap between the two holders of a pairing, in panel units. */
const PAIR_GAP = 16;

/** Both holders in one panel, one above the other, their things paired one to one by index. */
function paired(l: StageLayout, p: NonNullable<ObjectScene["pairing"]>): StageLayout {
  const [top, bottom] = l.holders;
  if (top === undefined || bottom === undefined) return l;
  const offsets = [0, top.height + PAIR_GAP];
  const off1 = offsets[1] ?? 0;
  const lines: StagePairing["lines"] = [];
  for (let i = 0; i < p.paired; i++) {
    const a = top.things[i];
    const b = bottom.things[i];
    if (a === undefined || b === undefined) continue;
    lines.push({ x1: a.x + a.size / 2, y1: a.y + a.size * 0.95, x2: b.x + b.size / 2, y2: off1 + b.y + b.size * 0.1 });
  }
  const largeIndex = l.holders.findIndex((h) => h.holderId === p.larger);
  const large = l.holders[largeIndex];
  const dy = offsets[largeIndex] ?? 0;
  const rows = new Map<number, ThingLayout[]>();
  for (const t of (large?.things ?? []).slice(p.paired)) rows.set(Math.round(t.y * 1000), [...(rows.get(Math.round(t.y * 1000)) ?? []), t]);
  const pad = 4;
  const unpaired = [...rows.values()].map((ts) => {
    const x0 = Math.min(...ts.map((t) => t.x));
    const x1 = Math.max(...ts.map((t) => t.x + t.size));
    const y0 = Math.min(...ts.map((t) => t.y));
    const y1 = Math.max(...ts.map((t) => t.y + t.size));
    return { x: x0 - pad, y: dy + y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
  });
  return { ...l, height: off1 + bottom.height, pairing: { offsets, lines, unpaired, larger: p.larger } };
}

/** The least shorter side (px) a thing's drawing must keep where it is: on a dish by how many share it, else the side-by-side floor. */
export function leastPxFor(l: StageLayout, t: ThingLayout): number {
  if (t.place === "container") return l.stacked ? PANEL.leastPx : PANEL.sideMinPx;
  const onDish = l.holders.flatMap((h) => h.things).filter((x) => x.place === "dish" && x.dish === 0);
  // Every dish holds the same share; count one dish of any dealt holder.
  const first = l.holders.find((h) => h.things.some((x) => x.place === "dish"));
  const n = first === undefined ? onDish.length : first.things.filter((x) => x.place === "dish" && x.dish === 0).length;
  if (l.compact) return PANEL.compactPx;
  return n <= 3 ? PANEL.dishFewPx : PANEL.dishManyPx;
}

/** Every thing keeps its least size. */
export function meetsSizes(l: StageLayout): boolean {
  return l.holders.every((h) => h.things.every((t) => drawnSide(l, h.item, t.size) >= leastPxFor(l, t) - 1e-9));
}

/** How tall the picture is on a 1024 screen (px): side by side the taller panel, stacked both panels. */
export function heightPx(l: StageLayout): number {
  const px = pxPerUnit(l);
  return l.stacked ? l.holders.reduce((a, h) => a + h.height * px, 0) + PANEL.gap : Math.max(0, ...l.holders.map((h) => h.height * px));
}

type Holder = ObjectScene["holders"][number];

function arrange(scene: ObjectScene, parts: StageItem[], stacked: boolean, compact = false, pagePx: number = PANEL.pagePx): StageLayout {
  const W = stacked ? PANEL.stacked : PANEL.side;
  const unitPx = pxPerUnit({ stacked, width: W, pagePx });
  // The smallest cell that still draws the scene's narrowest thing at PANEL.leastPx or more.
  const narrow = Math.min(...parts.map(sizingNarrowOf));
  const minThing = PANEL.leastPx / (THING_FILL * narrow * unitPx) + 0.5;
  const isDealt = (h: Holder): boolean => h.count !== null && h.dishes > 0 && scene.share !== null;

  // One grid for every holder whose things stay in its container: one container scale, one thing size and one
  // column count, fitting the largest count in the smallest plain inside (so the two holders' rows compare).
  const keptHolders = scene.holders
    .map((h, i) => ({ h, item: parts[i] as StageItem }))
    .filter((x) => !isDealt(x.h) && x.h.count !== null && !isOpen(x.item))
    .map((x) => ({ h: x.h, part: x.item === "token" ? ("tray" as const) : containerPartFor(x.item as ItemPart) }));
  const need = Math.max(0, ...keptHolders.map((x) => thingsOf(x.h.count as StageAmount).length + (x.h.count?.piece != null ? 1 : 0)));
  const most = Math.max(0, ...keptHolders.map((x) => thingsOf(x.h.count as StageAmount).length));
  const innerW = Math.min(VIEWBOX.container.w, ...keptHolders.map((x) => containerInnerOf(x.part).w));
  const innerH = Math.min(VIEWBOX.container.h, ...keptHolders.map((x) => containerInnerOf(x.part).h));
  const fullK = W / VIEWBOX.container.w;
  const fit = (k: number): number => bestSize(need, innerW * k, innerH * k, PANEL.maxThing);
  let k = Math.min(1, fullK);
  if (stacked) {
    // Grow the container until its things are roomy (and never below the least size), up to the full width.
    const want = Math.max(PANEL.roomyThing, minThing);
    while (k < fullK && fit(k) < want && (k < PANEL.stackedContainerMax || fit(k) < minThing)) k += 0.05;
    k = Math.min(k, fullK);
  }
  let keptSize = fit(k);
  let keptCols = Math.max(1, Math.min(Math.max(most, 1), Math.floor((innerW * k) / keptSize + 1e-9)));
  if (scene.pairing !== null && stacked) {
    // A pairing reads best in one row per holder: the smallest container that holds the larger count in one row
    // at a roomy size; else the rows wrap, the same for both holders.
    const roomy = Math.max(minThing, PANEL.roomyThing);
    for (let kk = 1; kk <= fullK + 1e-9; kk += 0.05) {
      const row = Math.min((innerW * kk) / Math.max(1, most), innerH * kk, PANEL.maxThing);
      if (row >= roomy) {
        k = kk;
        keptSize = row;
        keptCols = Math.max(1, most);
        break;
      }
    }
  }

  // Things laid out without a container (cups, yarn): one row per holder when it fits at a roomy size, else rows of
  // the least size; the same size and columns for both holders.
  const openW = W - 32;
  const openMost = Math.max(1, ...scene.holders.map((h, i) => (isOpen(parts[i] as StageItem) && !isDealt(h) && h.count !== null ? thingsOf(h.count).length + (h.count.piece !== null ? 1 : 0) : 0)));
  const openRow = Math.min(PANEL.maxThing, openW / openMost);
  const openSize = openRow >= Math.max(minThing, PANEL.roomyThing) ? openRow : Math.max(minThing, Math.min(PANEL.maxThing, openRow));
  const openCols = Math.max(1, Math.min(openMost, Math.floor(openW / openSize + 1e-9)));

  // One pile for every dish (every dish gets the same share): things at least PANEL.dishFewPx (3 or fewer) or
  // PANEL.dishManyPx, as many dishes side by side as keep that, each plate only as wide as its things.
  const each = scene.share === null ? [] : thingsOf(scene.share);
  const sharePiece = scene.share?.piece != null;
  const maxDishes = Math.max(1, ...scene.holders.filter(isDealt).map((h) => h.dishes));
  const dishNarrow = Math.min(...scene.holders.filter(isDealt).map((h) => sizingNarrowOf(parts[scene.holders.indexOf(h)] as StageItem)), 1);
  const wantPx = compact ? PANEL.compactPx : each.length <= 3 ? PANEL.dishFewPx : PANEL.dishManyPx;
  const want = (wantPx / (THING_FILL * dishNarrow * unitPx)) * 1.02;
  let cols = dishCols(maxDishes, stacked);
  const plateW = (c: number): number => Math.min((W - (c - 1) * PANEL.dishGap) / c, PANEL.maxPlate);
  let pile = dishPile(each.length, sharePiece, plateW(cols), want);
  while (pile.size < want - 1e-9 && cols > 1) {
    cols--;
    pile = dishPile(each.length, sharePiece, plateW(cols), want);
  }
  const P = pile.plateW;
  // A liquid is poured: each "dish" is a group of cups in a row, the share's whole cups and its part-filled cup.
  // A group holds the share in one row: as large as the dish target asks, never wider than the panel.
  const cupSize = Math.min(PANEL.maxThing * 1.2, Math.max(want, minThing), (W - 2 * PANEL.groupPad) / Math.max(1, each.length));
  const groupW = Math.max(1, each.length) * cupSize + 2 * PANEL.groupPad;
  const groupCols = Math.max(1, Math.min(maxDishes, Math.floor((W + PANEL.dishGap) / (groupW + PANEL.dishGap))));

  const holders = scene.holders.map((h, i): StageHolderLayout => {
    const item = parts[i] as StageItem;
    const open = isOpen(item);
    const container = open ? null : item === "token" ? "tray" : containerPartFor(item as ItemPart);
    const dealt = isDealt(h);
    // Things without a container: the name tag at the top, the things in rows under it.
    const openRows = h.count === null ? 1 : Math.ceil((thingsOf(h.count).length + (h.count.piece !== null ? 1 : 0)) / openCols);
    const kk = dealt ? PANEL.dealtContainer / VIEWBOX.container.w : k;
    const box: Box = open
      ? { x: 16, y: PANEL.tagGap * 2 + 6, w: openW, h: Math.max(1, openRows) * openSize }
      : { x: (W - VIEWBOX.container.w * kk) / 2, y: 0, w: VIEWBOX.container.w * kk, h: VIEWBOX.container.h * kk };
    const own = container === null ? { x: 0, y: 0, w: box.w / kk, h: box.h / kk } : containerInnerOf(container);
    const inner: Box = open ? box : { x: box.x + own.x * kk, y: box.y + own.y * kk, w: own.w * kk, h: own.h * kk };
    const mid = { x: inner.x + inner.w / 2, y: inner.y + inner.h / 2 };
    // Once dealt there is no container: the name tag stands at the top and the dishes get the room.
    const tag = { x: W / 2, y: dealt || open ? PANEL.tagGap : box.y + box.h + PANEL.tagGap };
    let height = (open && !dealt ? box.y + box.h : tag.y + PANEL.tagGap) + PANEL.bottom;
    const dishes: Box[] = [];
    const plates: Box[] = [];
    const groups: Box[] = [];
    const soil: Box[] = [];
    const flower = FLOWERS.includes(item);
    let things: ThingLayout[] = [];
    if (dealt && open && h.count !== null && scene.share !== null) {
      // Poured (cups) or measured out (yarn): each group holds the share in a row, the groups in rows under the name.
      const top = tag.y + PANEL.tagGap + 6;
      const gh = cupSize + 2 * PANEL.groupPad;
      for (let d = 0; d < h.dishes; d++) {
        const row = Math.floor(d / groupCols);
        const inRow = Math.min(groupCols, h.dishes - row * groupCols);
        const x0 = (W - (inRow * groupW + (inRow - 1) * PANEL.dishGap)) / 2;
        const g: Box = { x: x0 + (d % groupCols) * (groupW + PANEL.dishGap), y: top + row * (gh + PANEL.dishGap), w: groupW, h: gh };
        groups.push(g);
        dishes.push(g);
      }
      things = groups.flatMap((g, k2) =>
        each.map((e, j) => ({
          x: g.x + PANEL.groupPad + j * cupSize,
          y: g.y + PANEL.groupPad,
          size: cupSize,
          ...e,
          place: "group" as const,
          dish: k2,
          fromX: W / 2 - cupSize / 2,
          fromY: -cupSize,
        })),
      );
      const last = groups[groups.length - 1];
      height = (last === undefined ? height : last.y + last.h) + PANEL.bottom;
    } else if (open && !dealt && h.count !== null) {
      const all = thingsOf(h.count);
      const cells = containerGrid(all.length, h.count.piece !== null, inner, openSize, openCols);
      things = cells.map((g, j) => ({
        ...g,
        ...(all[j] ?? { piece: null, pieceText: "" }),
        place: "row" as const,
        dish: -1,
        fromX: g.x,
        fromY: -g.size,
      }));
    } else if (dealt && h.count !== null && scene.share !== null) {
      // Each dish: the plate, and above it the back row's things standing in it.
      const backFoot = PLATE_INNER.cy + (pile.rows > 1 ? FEET.back : FEET.single) * PLATE_INNER.ry;
      const lift = pile.size - (pile.plateH * backFoot) / VIEWBOX.group.h;
      const above = Math.max(0, lift);
      const dishH = above + pile.plateH;
      const top = tag.y + PANEL.tagGap + 6;
      for (let d = 0; d < h.dishes; d++) {
        const row = Math.floor(d / cols);
        const inRow = Math.min(cols, h.dishes - row * cols);
        const x0 = (W - (inRow * P + (inRow - 1) * PANEL.dishGap)) / 2;
        const cell: Box = { x: x0 + (d % cols) * (P + PANEL.dishGap), y: top + row * (dishH + PANEL.dishGap), w: P, h: dishH };
        dishes.push(cell);
        plates.push({ x: cell.x, y: cell.y + above, w: P, h: pile.plateH });
      }
      things = plates.flatMap((pl, k2) =>
        dishThings(each.length, sharePiece, pl, pile).map((g, j) => ({
          x: g.x,
          y: g.y,
          size: g.size,
          ...(each[j] ?? { piece: null, pieceText: "" }),
          place: "dish" as const,
          dish: k2,
          fromX: W / 2 - g.size / 2,
          fromY: -g.size,
        })),
      );
      const last = dishes[dishes.length - 1];
      height = (last === undefined ? height : last.y + last.h) + PANEL.bottom;
    } else if (h.count !== null) {
      const all = thingsOf(h.count);
      const cells = containerGrid(all.length, h.count.piece !== null, inner, keptSize, keptCols);
      things = cells.map((g, j) => ({
        ...g,
        ...(all[j] ?? { piece: null, pieceText: "" }),
        place: "container" as const,
        dish: -1,
        fromX: g.x,
        fromY: Math.max(0, inner.y - g.size),
      }));
      if (flower) {
        // A soil band behind every row, the row's feet on it (a flower's stem ends near the foot of the part).
        const feet = [...new Set(cells.map((g) => g.y + g.size))];
        for (const foot of feet) soil.push({ x: inner.x, y: foot - keptSize * 0.1, w: inner.w, h: keptSize * 0.16 });
      }
    }
    return {
      holderId: h.holderId,
      label: h.label,
      item,
      container,
      height,
      box: dealt || open ? null : box,
      tag,
      hidden: h.hidden,
      unknown: h.hidden ? mid : null,
      dishes,
      plates,
      groups,
      soil,
      things,
    };
  });
  return { width: W, height: Math.max(0, ...holders.map((h) => h.height)), stacked, compact, pagePx, holders, pairing: null };
}
