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

export interface ThingLayout {
  x: number;
  y: number;
  size: number;
  /** The share of a thing kept, from the left (a cut piece), or null for a whole thing. */
  piece: number | null;
  /** The piece as core gave it, "num/den", for tests and the description; "" for a whole thing. */
  pieceText: string;
  place: "container" | "dish";
  /** The dish it sits on (0-based), or -1 in the container. */
  dish: number;
  /** Where it starts when dealt: the middle of its container (top-left of the thing). */
  fromX: number;
  fromY: number;
}

export interface StageHolderLayout {
  holderId: string;
  label: string;
  item: ItemPart;
  container: ContainerPart;
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
  /** The plate of each dish (inside its cell). */
  plates: Box[];
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
  holders: StageHolderLayout[];
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
  /** A plate is this much wider than the things standing across it. */
  plateMargin: 1.08,
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
  fish: 0.6,
  ribbon: 0.92,
  sticker: 0.86,
  tulip: 0.52,
  flower_white: 0.71,
  flower_red: 0.66,
  mikan: 0.95,
  apple: 0.77,
  card: 0.68,
};
export const narrowOf = (item: string): number => PART_NARROW[item] ?? 0.5;

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
export const drawnSide = (l: { stacked: boolean; width: number }, item: string, size: number): number => size * THING_FILL * narrowOf(item) * pxPerUnit(l);

/** px per panel unit on a 1024 screen, for the layout's arrangement. */
export function pxPerUnit(l: { stacked: boolean; width: number }): number {
  const panelPx = l.stacked ? PANEL.pagePx - 2 * PANEL.frame : (PANEL.pagePx - PANEL.gap) / 2 - 2 * PANEL.frame;
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

/**
 * Null when a holder's things have no part (the screen then shows the tape only). Without `mode`, the holders
 * stand side by side when every thing keeps PANEL.sideMinPx there, else one above the other at full width.
 */
export function layoutStage(scene: ObjectScene, mode?: "side" | "stacked"): StageLayout | null {
  const found = scene.holders.map((h) => itemPartFor(scene.item.noun, h.label));
  if (found.some((p) => p === null)) return null;
  const parts = found as ItemPart[];
  if (mode !== undefined) return arrange(scene, parts, mode === "stacked");
  const side = arrange(scene, parts, false);
  const stacked = arrange(scene, parts, true);
  if (!meetsSizes(side)) return stacked;
  if (meetsSizes(stacked) && heightPx(stacked) < heightPx(side)) return stacked;
  return side;
}

/** The least shorter side (px) a thing's drawing must keep where it is: on a dish by how many share it, else the side-by-side floor. */
export function leastPxFor(l: StageLayout, t: ThingLayout): number {
  if (t.place === "container") return l.stacked ? PANEL.leastPx : PANEL.sideMinPx;
  const onDish = l.holders.flatMap((h) => h.things).filter((x) => x.place === "dish" && x.dish === 0);
  // Every dish holds the same share; count one dish of any dealt holder.
  const first = l.holders.find((h) => h.things.some((x) => x.place === "dish"));
  const n = first === undefined ? onDish.length : first.things.filter((x) => x.place === "dish" && x.dish === 0).length;
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

function arrange(scene: ObjectScene, parts: ItemPart[], stacked: boolean): StageLayout {
  const W = stacked ? PANEL.stacked : PANEL.side;
  const unitPx = pxPerUnit({ stacked, width: W });
  // The smallest cell that still draws the scene's narrowest thing at PANEL.leastPx or more.
  const narrow = Math.min(...parts.map(narrowOf));
  const minThing = PANEL.leastPx / (THING_FILL * narrow * unitPx) + 0.5;
  const isDealt = (h: Holder): boolean => h.count !== null && h.dishes > 0 && scene.share !== null;

  // One grid for every holder whose things stay in its container: one container scale, one thing size and one
  // column count, fitting the largest count in the smallest plain inside (so the two holders' rows compare).
  const keptHolders = scene.holders.map((h, i) => ({ h, part: containerPartFor(parts[i] as ItemPart) })).filter((x) => !isDealt(x.h) && x.h.count !== null);
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
  const keptSize = fit(k);
  const keptCols = Math.max(1, Math.min(Math.max(most, 1), Math.floor((innerW * k) / keptSize + 1e-9)));

  // One pile for every dish (every dish gets the same share): things at least PANEL.dishFewPx (3 or fewer) or
  // PANEL.dishManyPx, as many dishes side by side as keep that, each plate only as wide as its things.
  const each = scene.share === null ? [] : thingsOf(scene.share);
  const sharePiece = scene.share?.piece != null;
  const maxDishes = Math.max(1, ...scene.holders.filter(isDealt).map((h) => h.dishes));
  const dishNarrow = Math.min(...scene.holders.filter(isDealt).map((h) => narrowOf(parts[scene.holders.indexOf(h)] as ItemPart)), 1);
  const wantPx = each.length <= 3 ? PANEL.dishFewPx : PANEL.dishManyPx;
  const want = (wantPx / (THING_FILL * dishNarrow * unitPx)) * 1.02;
  let cols = dishCols(maxDishes, stacked);
  const plateW = (c: number): number => Math.min((W - (c - 1) * PANEL.dishGap) / c, PANEL.maxPlate);
  let pile = dishPile(each.length, sharePiece, plateW(cols), want);
  while (pile.size < want - 1e-9 && cols > 1) {
    cols--;
    pile = dishPile(each.length, sharePiece, plateW(cols), want);
  }
  const P = pile.plateW;

  const holders = scene.holders.map((h, i): StageHolderLayout => {
    const item = parts[i] as ItemPart;
    const container = containerPartFor(item);
    const dealt = isDealt(h);
    const kk = dealt ? PANEL.dealtContainer / VIEWBOX.container.w : k;
    const box: Box = { x: (W - VIEWBOX.container.w * kk) / 2, y: 0, w: VIEWBOX.container.w * kk, h: VIEWBOX.container.h * kk };
    const own = containerInnerOf(container);
    const inner: Box = { x: box.x + own.x * kk, y: box.y + own.y * kk, w: own.w * kk, h: own.h * kk };
    const mid = { x: inner.x + inner.w / 2, y: inner.y + inner.h / 2 };
    // Once dealt there is no container: the name tag stands at the top and the dishes get the room.
    const tag = { x: W / 2, y: dealt ? PANEL.tagGap : box.y + box.h + PANEL.tagGap };
    let height = tag.y + PANEL.tagGap + PANEL.bottom;
    const dishes: Box[] = [];
    const plates: Box[] = [];
    const soil: Box[] = [];
    const flower = FLOWERS.includes(item);
    let things: ThingLayout[] = [];
    if (dealt && h.count !== null && scene.share !== null) {
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
      box: dealt ? null : box,
      tag,
      hidden: h.hidden,
      unknown: h.hidden ? mid : null,
      dishes,
      plates,
      soil,
      things,
    };
  });
  return { width: W, height: Math.max(0, ...holders.map((h) => h.height)), stacked, holders };
}
