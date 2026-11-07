// The code half of the scene check (scenes-cli.ts): from the boxes of the drawn things in the browser, whether two
// things overlap (a ghost piece may touch the thing it belongs to, never cover it), whether any is too small to
// count on a tablet, and whether any leaves the picture.
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  ghost?: boolean;
}
export type LayoutProblem = "overlap" | "too_small" | "outside" | "no_picture";

/** The smallest a thing may be drawn, in CSS px at 1024×768 (the shorter side of its box). */
export const MIN_THING_PX = 26;

const overlapArea = (a: Box, b: Box): number => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

export function judgeLayout(things: readonly Box[], picture: Box | null): { problems: LayoutProblem[] } {
  const out = new Set<LayoutProblem>();
  if (picture === null) return { problems: ["no_picture"] };
  for (let i = 0; i < things.length; i++) {
    const a = things[i] as Box;
    if (Math.min(a.w, a.h) < MIN_THING_PX) out.add("too_small");
    if (a.x < picture.x - 1 || a.y < picture.y - 1 || a.x + a.w > picture.x + picture.w + 1 || a.y + a.h > picture.y + picture.h + 1) out.add("outside");
    for (let j = i + 1; j < things.length; j++) {
      const b = things[j] as Box;
      // More than a tenth of the smaller box covered counts as overlap; a ghost may touch its thing (15%).
      const limit = (a.ghost === true || b.ghost === true ? 0.15 : 0.1) * Math.min(a.w * a.h, b.w * b.h);
      if (overlapArea(a, b) > limit) out.add("overlap");
    }
  }
  return { problems: [...out] };
}
