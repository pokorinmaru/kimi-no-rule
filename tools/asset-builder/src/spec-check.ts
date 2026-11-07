// The code checks of a picture part against apps/web/src/draw/assets/spec.ts, before Claude looks at the picture:
// the part's viewBox, no fixed size, no text, images, scripts, styles or filters, no outside reference, only the
// palette's colours, a container's back and front layers, and a size that loads fast.
import { CONTAINER_PARTS, GROUP_PARTS, ITEM_PARTS, PALETTE, VIEWBOX, type PartId } from "../../../apps/web/src/draw/assets/spec.ts";

export type PartKind = keyof typeof VIEWBOX;
export type PartProblem = "not_svg" | "viewbox" | "fixed_size" | "forbidden_element" | "outside_reference" | "off_palette" | "layers" | "too_large";

export const MAX_PART_BYTES = 20_000;

export function kindOf(id: PartId): PartKind {
  if ((ITEM_PARTS as readonly string[]).includes(id)) return "item";
  if ((CONTAINER_PARTS as readonly string[]).includes(id)) return "container";
  if ((GROUP_PARTS as readonly string[]).includes(id)) return "group";
  throw new Error(`unknown part ${id}`);
}

const ALLOWED = new Set(Object.values(PALETTE).map((c) => c.toLowerCase()));
const COLOUR_WORDS = new Set(["none", "transparent", "currentcolor", "inherit"]);

export function checkPart(id: PartId, svg: string): PartProblem[] {
  const out = new Set<PartProblem>();
  const text = svg.trim();
  const root = /^<svg\b[^>]*>/i.exec(text);
  if (root === null || !/<\/svg>\s*$/i.test(text)) return ["not_svg"];
  const head = root[0];
  const { w, h } = VIEWBOX[kindOf(id)];
  const vb = /\bviewBox="([^"]+)"/.exec(head)?.[1]?.trim().split(/[\s,]+/).map(Number);
  if (vb === undefined || vb.length !== 4 || vb[0] !== 0 || vb[1] !== 0 || vb[2] !== w || vb[3] !== h) out.add("viewbox");
  if (/\s(width|height)="/.test(head)) out.add("fixed_size");
  if (/<(text|tspan|image|script|foreignObject|style|filter|iframe|a)\b/i.test(text)) out.add("forbidden_element");
  // An inline style would beat the CSS the scene uses to draw a living thing's missing part as a dashed outline.
  if (/\sstyle\s*=/i.test(text)) out.add("forbidden_element");
  if (/(url\(\s*['"]?(https?:|data:|\/\/))|(href="(https?:|data:|\/\/))/i.test(text)) out.add("outside_reference");
  for (const m of text.matchAll(/\b(fill|stroke|stop-color|color)\s*[=:]\s*"?([^";>]+)"?/gi)) {
    const v = (m[2] ?? "").trim().toLowerCase();
    if (v.startsWith("url(#")) continue;
    if (COLOUR_WORDS.has(v)) continue;
    if (!ALLOWED.has(v)) out.add("off_palette");
  }
  if (kindOf(id) === "container" && !(/<g\b[^>]*\bid="back"/.test(text) && /<g\b[^>]*\bid="front"/.test(text))) out.add("layers");
  if (new TextEncoder().encode(text).length > MAX_PART_BYTES) out.add("too_large");
  return [...out];
}
