// The reviewer sees a container filled with things drawn between its back and front layers.
import { describe, expect, it } from "vitest";
import { withThings } from "./render.ts";

describe("withThings", () => {
  it("puts 40 things after the back layer and before the front layer", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 240"><g id="back"></g><g id="front"></g></svg>';
    const out = withThings(svg);
    expect(out.indexOf('<g id="things">')).toBeGreaterThan(out.indexOf('<g id="back">'));
    expect(out.indexOf('<g id="things">')).toBeLessThan(out.indexOf('<g id="front">'));
    expect(out.match(/<circle /g)).toHaveLength(40);
  });
});
