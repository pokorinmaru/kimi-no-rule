/// <reference types="vite/client" />
// The one loader of the picture parts (the contract: ./assets/spec.ts). A part is a trusted repository file,
// apps/web/src/draw/assets/parts/<id>.svg, read as a raw string. Until a part's file exists, a plain
// placeholder made from the palette stands in for it, through the same parsing, so a real part replaces it
// with no other change. Nothing in a part is a number or a word.
import {
  CONTAINER_INNER,
  CONTAINER_PARTS,
  GROUP_PARTS,
  ITEM_PARTS,
  OUTLINE_WIDTH,
  PALETTE,
  PART_VIEWBOX,
  VIEWBOX,
  type ContainerPart,
  type GroupPart,
  type ItemPart,
  type PartId,
} from "./assets/spec.ts";

/** A part as drawn: its viewBox and its inner markup. */
export interface PartSvg {
  viewBox: string;
  body: string;
}
/** A container is drawn in two layers: back (behind the things) and front (a rim in front of them). */
export interface ContainerSvg {
  viewBox: string;
  back: string;
  front: string;
}

const FILES: Record<string, string> = import.meta.glob<string>("./assets/parts/*.svg", { query: "?raw", import: "default", eager: true });

const svg = (w: number, h: number, body: string): string => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(w)} ${String(h)}">${body}</svg>`;
const O = PALETTE.outline;

// Partial, so the placeholders keep working when a part id is renamed or added.
const ITEM_FILL: Record<string, [string, string] | undefined> = {
  goldfish: [PALETTE.orange, PALETTE.orangeLight],
  fish: [PALETTE.blue, PALETTE.blueLight],
  ribbon: [PALETTE.red, PALETTE.redLight],
  sticker: [PALETTE.yellow, PALETTE.white],
  tulip: [PALETTE.red, PALETTE.green],
  flower_white: [PALETTE.white, PALETTE.yellow],
  flower_red: [PALETTE.redLight, PALETTE.yellow],
  mikan: [PALETTE.orange, PALETTE.green],
  apple: [PALETTE.red, PALETTE.green],
  card: [PALETTE.greyLight, PALETTE.blue],
};

/** A plain stand-in for a part not drawn yet: a shape and the palette only. */
export function placeholder(part: PartId | "token"): string {
  // A plain string, so the shapes below keep compiling when a part id is renamed (the ids are the contract's).
  const id: string = part;
  const sw = (k: keyof typeof OUTLINE_WIDTH) => `stroke="${O}" stroke-width="${String(OUTLINE_WIDTH[k])}"`;
  // A plain round counter: a thing that has no part of its own (the word book's everyday examples).
  if (id === "token") return svg(VIEWBOX.item.w, VIEWBOX.item.h, `<circle cx="50" cy="50" r="38" fill="${PALETTE.yellow}" ${sw("item")}/><circle cx="50" cy="50" r="18" fill="none" stroke="${PALETTE.orange}" stroke-width="5"/>`);
  if ((ITEM_PARTS as readonly string[]).includes(id)) {
    const [main, accent] = ITEM_FILL[id] ?? [PALETTE.grey, PALETTE.greyLight];
    const { w, h } = VIEWBOX.item;
    if (id === "goldfish" || id === "fish")
      return svg(w, h, `<path d="M74 50 L96 30 L96 70 Z" fill="${accent}" ${sw("item")}/><ellipse cx="44" cy="50" rx="36" ry="24" fill="${main}" ${sw("item")}/><circle cx="26" cy="45" r="4" fill="${O}"/>`);
    if (id === "card" || id === "sticker") return svg(w, h, `<rect x="16" y="10" width="68" height="80" rx="10" fill="${main}" ${sw("item")}/><circle cx="50" cy="50" r="14" fill="${accent}"/>`);
    if (id === "ribbon") return svg(w, h, `<path d="M50 50 L12 26 L12 74 Z M50 50 L88 26 L88 74 Z" fill="${main}" ${sw("item")}/><circle cx="50" cy="50" r="10" fill="${accent}" ${sw("item")}/>`);
    if (id === "yarn")
      // A length of yarn: a thick wavy strand from end to end (a shorter length is its piece).
      return svg(w, h, `<path d="M8 50 C24 30 38 70 54 50 S80 30 92 50" fill="none" stroke="${O}" stroke-width="22" stroke-linecap="round"/><path d="M8 50 C24 30 38 70 54 50 S80 30 92 50" fill="none" stroke="${PALETTE.red}" stroke-width="15" stroke-linecap="round"/>`);
    if (id === "mikan" || id === "apple") return svg(w, h, `<circle cx="50" cy="56" r="36" fill="${main}" ${sw("item")}/><ellipse cx="58" cy="16" rx="12" ry="6" fill="${accent}" ${sw("item")}/>`);
    // Flowers: a stem and a head.
    return svg(w, h, `<rect x="46" y="48" width="8" height="48" fill="${PALETTE.green}"/><circle cx="50" cy="36" r="28" fill="${main}" ${sw("item")}/><circle cx="50" cy="36" r="9" fill="${accent}"/>`);
  }
  if ((CONTAINER_PARTS as readonly string[]).includes(id)) {
    const { w, h } = VIEWBOX.container;
    const fill: Record<string, [string, string] | undefined> = {
      tank: [PALETTE.water, PALETTE.grey],
      cooler: [PALETTE.white, PALETTE.blue],
      flowerbed: [PALETTE.brownLight, PALETTE.green],
      basket: [PALETTE.brownLight, PALETTE.brown],
      sheet: [PALETTE.white, PALETTE.greyLight],
      tray: [PALETTE.greyLight, PALETTE.grey],
    };
    const [back, front] = fill[id] ?? [PALETTE.greyLight, PALETTE.grey];
    const n = (x: number): string => String(x);
    return svg(
      w,
      h,
      `<g id="back"><rect x="6" y="${n(CONTAINER_INNER.y - 14)}" width="${n(w - 12)}" height="${n(h - CONTAINER_INNER.y + 8)}" rx="18" fill="${back}" ${sw("container")}/></g>` +
        `<g id="front"><rect x="2" y="${n(h - 20)}" width="${n(w - 4)}" height="18" rx="8" fill="${front}" ${sw("container")}/></g>`,
    );
  }
  if (id === "cup") {
    // A measuring cup with a handle (PART_VIEWBOX: 100 by 130); the liquid is drawn by the scene code inside CUP_INNER.
    return svg(100, 130, `<path d="M84 44 Q98 44 98 60 V78 Q98 92 84 92" fill="none" ${sw("group")}/><path d="M12 14 H88 L82 122 Q81 126 77 126 H23 Q19 126 18 122 Z" fill="${PALETTE.white}" fill-opacity="0.6" ${sw("group")}/>`);
  }
  const { w, h } = VIEWBOX.group;
  return svg(w, h, `<ellipse cx="80" cy="34" rx="74" ry="22" fill="${PALETTE.white}" ${sw("group")}/><ellipse cx="80" cy="30" rx="50" ry="12" fill="${PALETTE.greyLight}"/>`);
}

// ---------------------------------------------------------------------------------------------
// Parsing (a small scanner, so it needs no DOM)
// ---------------------------------------------------------------------------------------------

function viewBoxOf(src: string, fallback: { w: number; h: number }): string {
  return /<svg\b[^>]*\bviewBox="([^"]+)"/.exec(src)?.[1] ?? `0 0 ${String(fallback.w)} ${String(fallback.h)}`;
}

/** The markup inside the outer <svg>. */
export function innerOf(src: string): string {
  const open = /<svg\b[^>]*>/.exec(src);
  const end = src.lastIndexOf("</svg>");
  if (open === null || end < 0) return "";
  return src.slice(open.index + open[0].length, end).trim();
}

/** The markup inside <g id="…"> (nested groups kept), or "" when there is none. */
export function groupInner(src: string, id: string): string {
  const open = new RegExp(`<g\\b[^>]*\\bid="${id}"[^>]*?(/?)>`).exec(src);
  if (open === null || open[1] === "/") return "";
  const start = open.index + open[0].length;
  const tag = /<(\/?)g\b[^>]*?(\/?)>/g;
  tag.lastIndex = start;
  let depth = 1;
  for (let m = tag.exec(src); m !== null; m = tag.exec(src)) {
    if (m[1] === "/") depth--;
    else if (m[2] !== "/") depth++;
    if (depth === 0) return src.slice(start, m.index).trim();
  }
  return "";
}

/** The source of a part: its file when it exists, else the placeholder. */
export function sourceOf(id: PartId | "token", files: Record<string, string> = FILES): string {
  const hit = Object.entries(files).find(([path]) => path.endsWith(`/${id}.svg`));
  return hit?.[1] ?? placeholder(id);
}

const cache = new Map<string, PartSvg | ContainerSvg>();

export function itemSvg(id: ItemPart | "token"): PartSvg {
  const got = cache.get(id);
  if (got !== undefined) return got as PartSvg;
  const src = sourceOf(id);
  const p = { viewBox: viewBoxOf(src, VIEWBOX.item), body: innerOf(src) };
  cache.set(id, p);
  return p;
}

export function groupSvg(id: GroupPart = GROUP_PARTS[0]): PartSvg {
  const got = cache.get(id);
  if (got !== undefined) return got as PartSvg;
  const src = sourceOf(id);
  const p = { viewBox: viewBoxOf(src, PART_VIEWBOX[id] ?? VIEWBOX.group), body: innerOf(src) };
  cache.set(id, p);
  return p;
}

export function containerSvg(id: ContainerPart): ContainerSvg {
  const got = cache.get(id);
  if (got !== undefined) return got as ContainerSvg;
  const src = sourceOf(id);
  const p = { viewBox: viewBoxOf(src, VIEWBOX.container), back: groupInner(src, "back"), front: groupInner(src, "front") };
  cache.set(id, p);
  return p;
}
