// The contract between the picture parts (drawn by Claude Opus with tools/asset-builder, picked by a person) and the
// code that places them (the objects of a world, 指示書 第8節: the stage picture above the tape). Both tracks build
// against this file: the parts must meet it, and the scene code only relies on what it promises.
//
// A part is one SVG file in apps/web/src/draw/assets/parts/<id>.svg. Nothing in a part is a number or a word:
// counts, groups, cuts and names come from core's world and are drawn by the scene code.

/** The things a problem counts. Each is drawn one by one; a piece of one is the part clipped from the left. */
export const ITEM_PARTS = [
  "goldfish",
  "fish",
  "ribbon",
  "sticker",
  "tulip",
  "flower_white",
  "flower_red",
  "mikan",
  "apple",
  "card",
  // Continuous: a length of yarn (cut lengths are its pieces). Liquids have no item part: they are poured into cups.
  "yarn",
] as const;
export type ItemPart = (typeof ITEM_PARTS)[number];

/**
 * How a thing that is not whole is drawn when a share does not come out whole (pending the user's decision):
 * "cut" draws the part clipped from the left with a cut edge; "ghost" draws the kept part the same way and the
 * missing part as a faint dashed outline of the whole thing (no cut edge). A thing not listed is drawn "cut".
 */
export type ShareStyle = "cut" | "ghost";
// Every thing, living things included, is drawn cut: the dashed outline was hard to read (the user's decision,
// 2026-11-08, replacing the earlier "ghost" for living things). "ghost" stays available as a setting.
export const ITEM_SHARE: Partial<Record<ItemPart, ShareStyle>> = {};
export const shareStyleOf = (item: ItemPart): ShareStyle => ITEM_SHARE[item] ?? "cut";

/** Where a holder keeps its things. Drawn in two layers so the things sit inside: back, then things, then front. */
// Each shows every thing inside, side by side and countable, up to MAX_THINGS (the bank's largest count across the
// worlds the app can show is 54 cards): a clear wide tank, a flower bed, baskets and trays seen from above, a sheet.
export const CONTAINER_PARTS = ["tank", "cooler", "flowerbed", "basket", "sheet", "tray", "bottle", "pail", "yarn_ball"] as const;
export type ContainerPart = (typeof CONTAINER_PARTS)[number];

/** The dish the things are dealt onto, one per segment of the relation (the "1" is so many dishes). */
// plate: countable things are dealt onto it. cup: a liquid is poured into same-size cups (a cup part-filled is its piece).
export const GROUP_PARTS = ["plate", "cup"] as const;
export type GroupPart = (typeof GROUP_PARTS)[number];

export type PartId = ItemPart | ContainerPart | GroupPart;

export const VIEWBOX = {
  item: { w: 100, h: 100 },
  container: { w: 360, h: 240 },
  group: { w: 160, h: 60 },
} as const;

/**
 * The area of a container where the things go, in its viewBox. The back layer is drawn behind it and the front
 * layer (a rim or a lip) in front of its lower part, so things look inside.
 */
export const CONTAINER_INNER = { x: 20, y: 40, w: 320, h: 180 } as const;

/** The most things one holder may need to show (the bank's largest count over every world the app can show). */
export const MAX_THINGS = 60;

/** The palette every part uses (flat colours; a part may use a few of them). Kept small so the parts match. */
export const PALETTE = {
  outline: "#3b3552",
  orange: "#f28c38",
  orangeLight: "#ffc48a",
  red: "#e5484d",
  redLight: "#ff9fa1",
  yellow: "#ffd84d",
  green: "#4caf6e",
  greenLight: "#a8e6b8",
  blue: "#4c8ee8",
  blueLight: "#a9cdfa",
  water: "#cfe9ff",
  brown: "#a8714a",
  brownLight: "#e2b58a",
  grey: "#9aa3b2",
  greyLight: "#e7eaf0",
  white: "#ffffff",
} as const;

/** The outline width a part uses, in its own viewBox units (items 100 wide). */
export const OUTLINE_WIDTH = { item: 3.5, container: 5, group: 4 } as const;

/** Which part draws the things of a problem: by the item's noun, and for a few nouns by the holder's label. */
export function itemPartFor(noun: string, holderLabel: string): ItemPart | null {
  if (noun === "金魚") return "goldfish";
  if (noun === "魚") return "fish";
  if (noun === "リボン") return "ribbon";
  if (noun === "シール") return "sticker";
  if (noun === "チューリップ") return "tulip";
  if (noun === "花") return holderLabel.includes("赤") ? "flower_red" : "flower_white";
  if (noun === "くだもの") return holderLabel.includes("みかん") ? "mikan" : "apple";
  if (noun === "カード") return "card";
  if (noun === "毛糸") return "yarn";
  return null;
}

/** Which container a holder's things sit in: one that shows every thing inside and fits the thing. */
export function containerPartFor(item: ItemPart): ContainerPart {
  // Goldfish are kept in a tank; fish that were caught go in an open cooler box (scene check, 2026-11-08).
  if (item === "goldfish") return "tank";
  if (item === "fish") return "cooler";
  if (item === "tulip" || item === "flower_white" || item === "flower_red") return "flowerbed";
  if (item === "mikan" || item === "apple") return "basket";
  if (item === "sticker") return "sheet";
  if (item === "yarn") return "yarn_ball";
  return "tray";
}
