// The code half of the scene check: things never overlap, are never too small to count, and stay in the picture.
import { describe, expect, it } from "vitest";
import { MIN_THING_PX, judgeLayout } from "./scene-layout.ts";

const box = (x: number, y: number, w = 40, h = 32, ghost = false) => ({ x, y, w, h, ghost });
const pic = { x: 0, y: 0, w: 600, h: 400 };

describe("judgeLayout", () => {
  it("passes things side by side inside the picture", () => {
    expect(judgeLayout([box(10, 10), box(60, 10), box(110, 10)], pic).problems).toEqual([]);
  });
  it("finds overlapping things", () => {
    expect(judgeLayout([box(10, 10), box(30, 12)], pic).problems).toContain("overlap");
  });
  it("lets a ghost piece sit right after its thing (a dish's 1 and a half)", () => {
    expect(judgeLayout([box(10, 10), box(46, 10, 40, 32, true)], pic).problems).toEqual([]);
  });
  it("finds things too small to count", () => {
    expect(judgeLayout([box(10, 10, MIN_THING_PX - 4, MIN_THING_PX - 4)], pic).problems).toContain("too_small");
  });
  it("finds things outside the picture, and a missing picture", () => {
    expect(judgeLayout([box(590, 10)], pic).problems).toContain("outside");
    expect(judgeLayout([box(10, 10)], null).problems).toContain("no_picture");
  });
});
