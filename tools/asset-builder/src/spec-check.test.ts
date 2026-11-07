// The code checks of a picture part (apps/web/src/draw/assets/spec.ts): what a part may and may not hold, decided
// by code before Claude looks at the picture. Written before the implementation.
import { describe, expect, it } from "vitest";
import { PALETTE } from "../../../apps/web/src/draw/assets/spec.ts";
import { checkPart, kindOf } from "./spec-check.ts";

const item = (body: string, extra = ""): string => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${extra}>${body}</svg>`;
const fish = `<path d="M10 50 Q50 10 90 50 Q50 90 10 50Z" fill="${PALETTE.orange}" stroke="${PALETTE.outline}" stroke-width="3.5"/>`;

describe("kindOf", () => {
  it("knows each part's kind", () => {
    expect(kindOf("goldfish")).toBe("item");
    expect(kindOf("tank")).toBe("container");
    expect(kindOf("plate")).toBe("group");
  });
});

describe("checkPart", () => {
  it("passes a clean item that uses only the palette", () => {
    expect(checkPart("goldfish", item(fish))).toEqual([]);
  });

  it("needs the part's own viewBox and no fixed size", () => {
    expect(checkPart("goldfish", item(fish).replace('viewBox="0 0 100 100"', 'viewBox="0 0 64 64"'))).toContain("viewbox");
    expect(checkPart("goldfish", item(fish, ' width="100" height="100"'))).toContain("fixed_size");
  });

  it.each(["<text>a</text>", '<image href="x.png"/>', "<script>1</script>", "<foreignObject/>", "<style>.a{}</style>", '<filter id="f"/>'])(
    "refuses %s",
    (bad) => {
      expect(checkPart("goldfish", item(fish + bad))).toContain("forbidden_element");
    },
  );

  // The scene draws a living thing's missing part as a dashed outline by overriding fill and stroke with CSS, which
  // an inline style attribute would beat (object-world report, 2026-11-08).
  it("refuses an inline style attribute", () => {
    expect(checkPart("goldfish", item(fish.replace("<path ", '<path style="fill:#f28c38" ')))).toContain("forbidden_element");
  });

  it("refuses an outside reference", () => {
    expect(checkPart("goldfish", item(fish.replace(`fill="${PALETTE.orange}"`, 'fill="url(http://x/y)"')))).toContain("outside_reference");
  });

  it("refuses a colour outside the palette, in any notation", () => {
    expect(checkPart("goldfish", item(fish.replace(PALETTE.orange, "#123456")))).toContain("off_palette");
    expect(checkPart("goldfish", item(fish.replace(PALETTE.orange, "rgb(1,2,3)")))).toContain("off_palette");
    expect(checkPart("goldfish", item(fish.replace(PALETTE.orange, "pink")))).toContain("off_palette");
    expect(checkPart("goldfish", item(fish.replace(PALETTE.orange, PALETTE.orange.toUpperCase())))).toEqual([]);
    expect(checkPart("goldfish", item(fish.replace(`fill="${PALETTE.orange}"`, 'fill="none"')))).toEqual([]);
  });

  it("needs a container's back and front layers", () => {
    const box = (b: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 240">${b}</svg>`;
    const back = `<g id="back"><rect x="20" y="30" width="200" height="140" fill="${PALETTE.blueLight}"/></g>`;
    const front = `<g id="front"><rect x="20" y="140" width="200" height="30" fill="${PALETTE.blue}"/></g>`;
    expect(checkPart("tank", box(back + front))).toEqual([]);
    expect(checkPart("tank", box(back))).toContain("layers");
  });

  it("refuses a part that is too large to load fast", () => {
    expect(checkPart("goldfish", item(fish.repeat(400)))).toContain("too_large");
  });

  it("refuses something that is not an SVG", () => {
    expect(checkPart("goldfish", "<html></html>")).toContain("not_svg");
  });
});
