// What Claude Opus is asked when it draws a picture part and when it looks at the drawing: the part, the style, the
// contract (apps/web/src/draw/assets/spec.ts) and the rubric. The parts are for a math app for Japanese children of
// about nine; they are drawn once, before the app runs, and a person picks among them.
import { CONTAINER_INNER, OUTLINE_WIDTH, PALETTE, VIEWBOX, type PartId } from "../../../apps/web/src/draw/assets/spec.ts";
import { kindOf } from "./spec-check.ts";

/** What each part is, in plain words (what a child must recognise at a glance). */
export const PART_BRIEFS: Record<PartId, string> = {
  goldfish: "one goldfish seen from the side, facing right, round body, flowing tail fin; orange and white",
  fish: "one ordinary sea fish that was caught fishing (like a horse mackerel) seen from the side, facing right; blue-grey back, light belly",
  ribbon: "one length of ribbon (counted with 本 in Japanese): a straight ribbon strip shown diagonally with a soft wave and cut ends, not a bow",
  sticker: "one round sticker with a simple star on it and a slightly lifted corner",
  tulip: "one tulip with a straight stem and two leaves",
  flower_white: "one simple white flower with five petals, a yellow centre and a short stem",
  flower_red: "one simple red flower with five petals, a yellow centre and a short stem",
  mikan: "one mandarin orange (mikan) with a small green leaf",
  apple: "one red apple with a short stem and a leaf",
  card: "one playing-style card with a rounded rectangle shape and a simple star in the middle",
  tank: "a large clear glass fish tank seen from the front, wide and low, light blue water, a little sand along the bottom edge only; no plants, no fish, no pebbles or bubbles that could be counted",
  cooler: "an open fishing cooler box seen from above at a slight angle: thick white plastic walls with rounded corners, a blue lid leaning open behind it, a carrying handle on each short side, so it clearly reads as a fishing cooler; the inside bottom (the things area) is plain light ice-blue and empty",
  flowerbed: "a wide flower bed seen from slightly above, a raised wooden or brick edge around a large area of dark soil, so several rows of flowers can be planted one behind another in the soil; no sprouts, leaves or flowers drawn",
  basket: "a wide, shallow woven fruit basket seen from above at an angle: the rim and outer sides show a clear basket weave and two small handles, so it clearly reads as a basket; the inside bottom (the things area) is plain light and empty",
  sheet: "a sticker book opened flat and seen from the front: a large plain light page with a coloured spine edge on the left, clearly a book page for stickers (no rings, no calendar look), nothing on the page",
  tray: "a wide, flat rounded tray seen from above at an angle, plain light surface with a raised edge, so many things can lie on it side by side; nothing on it",
  yarn: "one length of knitting yarn laid out straight with a soft wave, thick and fuzzy-looking, both ends cut cleanly; one colour (red)",
  bottle: "a clear glass juice bottle seen from the front, wide body and short neck, empty and transparent so a liquid level drawn inside is fully visible; the things area is the bottle's body",
  pail: "a clear plastic water pail (bucket) seen from the front with a handle, transparent body so a water level drawn inside is fully visible; the things area is the pail's body",
  yarn_ball: "a round ball of knitting yarn (red) with a loose end, sitting in a small shallow basket seen from the front; the things area above it is open and plain for cut lengths of yarn laid side by side",
  cup: "a clear measuring cup seen from the front, straight sides and a small spout and handle, empty and transparent so a liquid level drawn inside is visible; no marks, numbers or scale lines",
  plate: "a shallow round dish seen from slightly above, wide and flat",
};

export interface StyleBrief {
  id: string;
  name: string;
  text: string;
}

/** The three style directions shown at the first checkpoint; the person picks one, and its drawings anchor the rest. */
export const STYLES: StyleBrief[] = [
  {
    id: "soft_flat",
    name: "やさしいフラット",
    text: "Flat fills, one uniform dark outline on every shape, rounded friendly shapes, one small white highlight per shape. Like the stickers in a Japanese picture book. No gradients.",
  },
  {
    id: "bold_sticker",
    name: "太い線のステッカー",
    text: "Bold, thick outline, slightly chunky cartoon proportions, very simple shapes with few details, strong solid colours. Like a cheerful app icon set for children. No gradients.",
  },
  {
    id: "no_line",
    name: "線のない やわらかい塗り",
    text: "No outlines at all. Each shape is filled with a base colour and one lighter or darker shape for soft shading. Gentle, calm, picture-book feel. No gradients.",
  },
];

const palette = Object.entries(PALETTE)
  .map(([k, v]) => `${k} ${v}`)
  .join(", ");

export function drawSystem(): string {
  return [
    "You draw one picture part as an SVG for a math app for Japanese children of about nine. The app draws many copies of an item part side by side, cuts some of them in pieces, and puts them inside container parts, so each part must read at a glance even when small.",
    "Rules for the SVG: a root <svg xmlns=\"http://www.w3.org/2000/svg\"> with the given viewBox and no width or height; only path, circle, ellipse, rect, polygon, polyline, line, g and clipPath elements; no text, no image, no style element and no style attribute (colours only as fill and stroke attributes), no filter, no gradient, no outside reference; every fill and stroke colour from this palette only: " +
      palette +
      " (or none). Keep it under 12 KB. No words, letters or numbers anywhere in the picture. No human faces.",
    "An item fills the middle of its 100×100 viewBox (margin about 6 on every side), centred, so that it looks right cut in half from the left. A container uses the 360×240 viewBox and has exactly two groups: <g id=\"back\"> (everything behind the things inside) and <g id=\"front\"> (only what sits in front of the lower part of the things: a rim or a front lip). The things go in the area x " +
      String(CONTAINER_INNER.x) +
      " y " +
      String(CONTAINER_INNER.y) +
      " w " +
      String(CONTAINER_INNER.w) +
      " h " +
      String(CONTAINER_INNER.h) +
      ", so keep that area open and plain in the back layer (never draw anything there that a child could count as one of the things: no plants, sprouts, pebbles, bubbles or small shapes): up to 60 things are drawn there side by side, and every one of them must stay fully visible (the front layer is only a thin rim or edge along the very bottom, or a faint glass tint). A dish (group part) uses the 160×60 viewBox.",
    `When the style has outlines, use stroke ${PALETTE.outline} with stroke-width ${String(OUTLINE_WIDTH.item)} for items, ${String(OUTLINE_WIDTH.container)} for containers and ${String(OUTLINE_WIDTH.group)} for dishes, with round line joins and caps.`,
    "Answer with the JSON object only: svg (the whole SVG text) and notes (one short sentence on what you changed or chose).",
  ].join("\n");
}

export function drawUser(part: PartId, style: StyleBrief, opts: { references: number; problems?: string[]; fixes?: string[]; previous?: string }): string {
  const kind = kindOf(part);
  const vb = VIEWBOX[kind];
  return [
    `Part: ${part} (${kind}, viewBox 0 0 ${String(vb.w)} ${String(vb.h)}). Draw: ${PART_BRIEFS[part]}.`,
    `Style: ${style.text}`,
    opts.references > 0 ? `The ${String(opts.references)} image(s) above are parts already chosen in this style: match their outline weight, colours, roundness and level of detail exactly, so the new part belongs to the same set.` : "",
    opts.previous === undefined ? "" : `Your previous SVG:\n${opts.previous}`,
    opts.problems === undefined || opts.problems.length === 0 ? "" : `The code check refused it for: ${opts.problems.join(", ")}. Fix exactly these.`,
    opts.fixes === undefined || opts.fixes.length === 0 ? "" : `A reviewer looked at the rendered picture and asks for these changes:\n- ${opts.fixes.join("\n- ")}`,
  ]
    .filter((s) => s !== "")
    .join("\n\n");
}

export const RUBRIC = [
  ["recognizable", "At the small size, a nine-year-old would name it as the intended thing at once."],
  ["style_match", "It follows the style text (and the reference parts, when given): outline weight, colours, roundness, detail."],
  ["clean", "Clean construction: no stray or broken shapes, nothing cut off by the viewBox, good balance, centred, pleasant proportions."],
  ["cut_readable", "For an item: the left-half crop still reads as half of that thing. For a container: the things area is open and the front layer only covers the lower rim. For a dish: flat and wide enough to hold things."],
  ["child_appropriate", "Friendly and calm for a child; no scary or sad look, no words or numbers, no human face."],
  ["quality", "Overall it looks like a professional illustration from a well-made children's app, not like a quick programmer drawing."],
] as const;

export type RubricKey = (typeof RUBRIC)[number][0];

export function critiqueSystem(): string {
  return [
    "You are a strict art director for a children's math app. You look at a rendered picture part and score it against a rubric from 1 (poor) to 5 (excellent). Be honest and demanding: 4 means it could ship in a polished app; 5 means a professional illustrator would be happy with it. Do not give 4 or 5 to something that looks like a quick programmer drawing.",
    "Rubric:\n" + RUBRIC.map(([k, v]) => `- ${k}: ${v}`).join("\n"),
    "Then list the concrete changes that would raise every score below 5 (at most six, each one specific: which shape, how to change it). Answer with the JSON object only.",
  ].join("\n");
}

export function critiqueUser(part: PartId, style: StyleBrief, references: number): string {
  return [
    `The image above shows the part "${part}" (${PART_BRIEFS[part]}) rendered large, small (as it appears in the app)${kindOf(part) === "item" ? ", and cut to its left half" : ""}.`,
    `Intended style: ${style.text}`,
    references > 0 ? `The image(s) before it are parts already chosen for this set; judge style_match against them.` : "",
  ]
    .filter((s) => s !== "")
    .join("\n");
}

export const CRITIQUE_SCHEMA = {
  type: "object",
  properties: {
    scores: {
      type: "object",
      properties: Object.fromEntries(RUBRIC.map(([k]) => [k, { type: "integer" }])),
      required: RUBRIC.map(([k]) => k),
      additionalProperties: false,
    },
    fixes: { type: "array", items: { type: "string" } },
  },
  required: ["scores", "fixes"],
  additionalProperties: false,
} as const;

export const DRAW_SCHEMA = {
  type: "object",
  properties: { svg: { type: "string" }, notes: { type: "string" } },
  required: ["svg", "notes"],
  additionalProperties: false,
} as const;

/** A drawing passes when every score is at least this. */
export const PASS_SCORE = 4;
