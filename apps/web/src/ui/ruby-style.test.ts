// The furigana must stand out when the switch is on (2026-11-08, a parent's check: the small grey readings were hard
// to see): bold, in the text colour, and not smaller than 0.6 of the line.
import { describe, expect, it } from "vitest";
import { COLOR, GLOBAL_CSS } from "./tokens.ts";

function rtRule(): string {
  const m = /(^|\n)rt \{([^}]*)\}/.exec(GLOBAL_CSS);
  if (m === null) throw new Error("no rt rule in GLOBAL_CSS");
  return m[2] ?? "";
}

describe("furigana style", () => {
  it("is bold", () => {
    expect(rtRule()).toMatch(/font-weight:\s*(700|800|900|bold)/);
  });
  it("is in the text's own colour (dark on the page, white on a filled button), not the quiet one", () => {
    expect(rtRule()).toContain("color: inherit");
    expect(rtRule()).not.toContain(COLOR.inkSoft);
  });
  it("is at least 0.6 of the line", () => {
    const size = /font-size:\s*([\d.]+)em/.exec(rtRule());
    expect(Number(size?.[1])).toBeGreaterThanOrEqual(0.6);
  });
});
