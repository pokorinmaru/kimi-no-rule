// The loop that makes one candidate of a part: draw, code check, render, critique, revise, up to a number of rounds;
// the best passing drawing wins, otherwise the best one is kept and marked as not passing. Written before the
// implementation, with fakes for Claude and the browser.
import { describe, expect, it } from "vitest";
import { PALETTE } from "../../../apps/web/src/draw/assets/spec.ts";
import { buildCandidate, type BuildDeps, type Scores } from "./build.ts";
import { STYLES } from "./prompts.ts";

const STYLE = STYLES[0] as (typeof STYLES)[number];

const good = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="${PALETTE.orange}"/></svg>`;
const offPalette = good.replace(PALETTE.orange, "#123456");
const all = (n: number): Scores => ({ recognizable: n, style_match: n, clean: n, cut_readable: n, child_appropriate: n, quality: n });

function deps(o: { draws: string[]; scores: Scores[] }): BuildDeps & { calls: string[] } {
  const calls: string[] = [];
  let d = 0;
  let c = 0;
  return {
    calls,
    draw: async (req) => {
      calls.push(`draw problems=${(req.problems ?? []).join(",")} fixes=${String((req.fixes ?? []).length)}`);
      return { svg: o.draws[Math.min(d++, o.draws.length - 1)] ?? good, notes: "" };
    },
    render: async () => {
      calls.push("render");
      return new Uint8Array([1, 2, 3]);
    },
    critique: async () => {
      calls.push("critique");
      return { scores: o.scores[Math.min(c++, o.scores.length - 1)] ?? all(5), fixes: ["make the tail larger"] };
    },
  };
}

describe("buildCandidate", () => {
  it("stops as soon as a drawing passes every score", async () => {
    const dp = deps({ draws: [good], scores: [all(4)] });
    const r = await buildCandidate({ part: "goldfish", style: STYLE, references: [], maxRounds: 3 }, dp);
    expect(r.passed).toBe(true);
    expect(r.rounds).toHaveLength(1);
    expect(dp.calls).toEqual(["draw problems= fixes=0", "render", "critique"]);
  });

  it("revises with the reviewer's fixes until it passes", async () => {
    const dp = deps({ draws: [good, good, good], scores: [all(3), { ...all(5), quality: 3 }, all(5)] });
    const r = await buildCandidate({ part: "goldfish", style: STYLE, references: [], maxRounds: 4 }, dp);
    expect(r.passed).toBe(true);
    expect(r.rounds).toHaveLength(3);
    expect(dp.calls.filter((c) => c.startsWith("draw"))[1]).toBe("draw problems= fixes=1");
  });

  it("sends the code check's problems back before rendering, and never renders a refused drawing", async () => {
    const dp = deps({ draws: [offPalette, good], scores: [all(5)] });
    const r = await buildCandidate({ part: "goldfish", style: STYLE, references: [], maxRounds: 3 }, dp);
    expect(r.passed).toBe(true);
    expect(dp.calls).toEqual(["draw problems= fixes=0", "draw problems=off_palette fixes=0", "render", "critique"]);
  });

  it("keeps the best drawing, marked as not passing, when no round passes", async () => {
    const dp = deps({ draws: [good, good], scores: [all(2), all(3)] });
    const r = await buildCandidate({ part: "goldfish", style: STYLE, references: [], maxRounds: 2 }, dp);
    expect(r.passed).toBe(false);
    expect(r.best?.scores).toEqual(all(3));
  });

  it("never passes a drawing that the code check refused, however often it is asked", async () => {
    const dp = deps({ draws: [offPalette], scores: [all(5)] });
    const r = await buildCandidate({ part: "goldfish", style: STYLE, references: [], maxRounds: 3 }, dp);
    expect(r.passed).toBe(false);
    expect(r.best).toBeNull();
    expect(dp.calls.includes("render")).toBe(false);
  });
});
