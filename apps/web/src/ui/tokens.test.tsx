// @vitest-environment jsdom
// The app's look in one place (whole-screen review, 2026-11-08: every screen scored 2/5 for looking like a plain
// web page beside the sticker-style pictures). The child's screens take their colours, sizes and shapes from
// ui/tokens.ts, the text stays readable (WCAG AA contrast), and the number pad's keys are big enough for a child's
// finger. Written before the tokens.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PALETTE } from "../draw/assets/spec.ts";
import { HOLDER_COLORS } from "../draw/holder-colors.ts";
import { NumberPad } from "./controls.tsx";
import { COLOR, RADIUS, SPACE, TYPE } from "./tokens.ts";

afterEach(cleanup);

function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const c = [0, 2, 4]
    .map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
}
const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [
    number,
    number,
  ];
  return (x + 0.05) / (y + 0.05);
};

describe("the colours", () => {
  it("keep the text readable on the page and on the cards", () => {
    for (const bg of [
      COLOR.page,
      COLOR.surface,
      COLOR.surfaceSoft,
      COLOR.bar,
    ]) {
      expect(contrast(COLOR.ink, bg), bg).toBeGreaterThanOrEqual(7);
      expect(contrast(COLOR.inkSoft, bg), bg).toBeGreaterThanOrEqual(4.5);
      for (const h of HOLDER_COLORS)
        expect(contrast(h.ink, bg), `${h.ink} on ${bg}`).toBeGreaterThanOrEqual(
          4.5,
        );
    }
    expect(contrast(COLOR.onPrimary, COLOR.primary)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrast(COLOR.ink, COLOR.highlight)).toBeGreaterThanOrEqual(7);
  });

  it("take the pictures' outline and the two holders' colours, so the screen and the pictures look like one app", () => {
    expect(COLOR.outline).toBe(PALETTE.outline);
    expect(COLOR.holders).toEqual(HOLDER_COLORS);
  });

  it("paint a warm light page, never a dark one", () => {
    expect(luminance(COLOR.page)).toBeGreaterThan(0.85);
    expect(COLOR.page).not.toBe("#ffffff");
  });
});

describe("the sizes", () => {
  it("give body text of about 20px, prose lines of at most about 32 characters, and steady scales", () => {
    expect(TYPE.body).toBeGreaterThanOrEqual(20);
    expect(TYPE.proseChars).toBeLessThanOrEqual(32);
    const ascending = (xs: readonly number[]) =>
      xs.every((x, i) => i === 0 || x > (xs[i - 1] ?? 0));
    expect(ascending([TYPE.small, TYPE.body, TYPE.large, TYPE.title])).toBe(
      true,
    );
    expect(ascending(Object.values(SPACE))).toBe(true);
    expect(ascending([RADIUS.sm, RADIUS.md, RADIUS.lg])).toBe(true);
  });

  it("make every key of the number pad at least 56px", () => {
    render(<NumberPad label="いくつ？" onAnswer={() => undefined} />);
    for (const d of ["0", "1", "5", "9", "ok"]) {
      const key = screen.getByTestId(`pad-${d}`);
      expect(parseFloat(key.style.minHeight), d).toBeGreaterThanOrEqual(56);
      expect(parseFloat(key.style.minWidth), d).toBeGreaterThanOrEqual(56);
    }
  });
});

describe("the child's screens", () => {
  // The files that draw the child's screens and controls (the pictures keep their own palette in draw/).
  const FILES = [
    "../App.tsx",
    "./controls.tsx",
    "./ReadAloud.tsx",
    "./Helplines.tsx",
    "../draw/Kohai.tsx",
    "../check/CheckMode.tsx",
    "../voice/VoicePanel.tsx",
    "../draw/SentenceList.tsx",
  ];
  it.each(FILES)(
    "%s takes its colours from the tokens (no colour written in place)",
    (f) => {
      const src = readFileSync(
        fileURLToPath(new URL(f, import.meta.url)),
        "utf8",
      );
      expect(src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
      expect(src.match(/rgba?\(/g) ?? []).toEqual([]);
    },
  );
});
