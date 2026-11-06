// The research eval (指示書 第10.2節, the submission's one type): simulated children, the researchers that
// need no Claude, and what counts as recovered and as a wrong confirmation.
import { describe, expect, it } from "vitest";
import { COMMON_FRACTION_READINGS, FRACTION_BANK, runRule, sameReading, schemas } from "@kimi/core";
import { SIM_CHILDREN } from "./research-children.ts";
import { FIRST_PROBLEM, enumerateRules, firstWorld, poolResearcher, recovers, rng, runEpisode, weighedResearcher } from "./research-eval.ts";
import { renderEvalsMd } from "./report.ts";

const child = (id: string) => {
  const c = SIM_CHILDREN.find((x) => x.id === id);
  if (c === undefined) throw new Error(id);
  return c;
};

describe("the simulated children", () => {
  it("have distinct ids, every kind, valid rules and at least five ways of saying their reading", () => {
    expect(new Set(SIM_CHILDREN.map((c) => c.id)).size).toBe(SIM_CHILDREN.length);
    expect(new Set(SIM_CHILDREN.map((c) => c.kind))).toEqual(new Set(["listed", "inside", "outside", "inexpressible"]));
    for (const c of SIM_CHILDREN) {
      expect(c.words.length, c.id).toBeGreaterThanOrEqual(5);
      expect(c.rule === null, c.id).toBe(c.kind === "inexpressible");
      if (c.rule !== null) expect(() => schemas.readingRule.shape.hypotheses.element.parse(c.rule)).not.toThrow();
    }
  });

  it("the readings outside the common list are not in it: no common reading builds their worlds on every bank problem", () => {
    for (const c of SIM_CHILDREN.filter((x) => x.kind !== "listed")) {
      for (const h of COMMON_FRACTION_READINGS) expect(recovers(h, c, FRACTION_BANK), `${c.id} ~ ${h.id}`).toBe(false);
    }
  });

  it("the readings outside the enumeration are out of its reach, and the inside ones within it", () => {
    const rules = enumerateRules();
    for (const c of SIM_CHILDREN.filter((x) => x.kind === "inside" || x.kind === "outside")) {
      expect(rules.some((h) => recovers(h, c, FRACTION_BANK)), c.id).toBe(c.kind === "inside");
    }
  });
});

describe("the eval's pieces", () => {
  it("the random numbers are the same for the same seed", () => {
    const a = rng(7);
    const b = rng(7);
    const xs = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
  });

  it("a child's first world is its own reading's unless it slips, and a slip is another world a child could build", () => {
    const c = child("s_swap");
    const record = FRACTION_BANK.find((r) => r.world.problem_id === FIRST_PROBLEM);
    if (record === undefined) throw new Error("no signboard");
    expect(sameReading(firstWorld(c, record, 0, () => 0.99), runRule(c.rule as never, record), true)).toBe(true);
    expect(sameReading(firstWorld(c, record, 0, () => 0), runRule(c.rule as never, record), true)).toBe(false);
  });

  it("a researcher weighing the common list recovers a child who reads with one of them", async () => {
    const r = weighedResearcher("list", COMMON_FRACTION_READINGS, FRACTION_BANK);
    // Seed 3 gives no slip in the first problems of this child.
    const e = await runEpisode(r, child("s_known"), FRACTION_BANK, 3);
    expect(e.recovered).toBe(true);
    expect(e.falseConfirmation).toBe(false);
    expect(e.confirmedAfter).not.toBeNull();
  });

  it("an inexpressible child is never counted as recovered", async () => {
    const r = weighedResearcher("list", COMMON_FRACTION_READINGS, FRACTION_BANK);
    for (const seed of [1, 2]) {
      const e = await runEpisode(r, child("s_alternate"), FRACTION_BANK, seed);
      expect(e.recovered).toBe(false);
      expect(e.falseConfirmation).toBe(e.confirmedAfter !== null);
    }
  });

  it("a pool researcher whose pool never changes confirms nothing and still walks the bank", async () => {
    const r = poolResearcher("empty", FRACTION_BANK, async (s) => s);
    const e = await runEpisode(r, child("s_swap"), FRACTION_BANK, 1);
    expect(e.confirmedAfter).toBeNull();
    expect(e.recovered).toBe(false);
  });
});

describe("EVALS.md: the research section", () => {
  const base = {
    interpret: { k: 1, baseline: "keyword-rules", results: [], notRun: [] },
    safety: { results: [], notRun: [] },
    data: { interpret: [], safety: [] },
  };
  it("is left out when the research eval did not run, and lists every kind and what did not run when it did", () => {
    expect(renderEvalsMd(base)).not.toContain("研究する層");
    const row = { episodes: 2, recovered: 1, falseConfirmations: 1, confirmedAfter: [3] };
    const md = renderEvalsMd({
      ...base,
      research: {
        results: [{ name: "list", byKind: { listed: row, inside: row, outside: row, inexpressible: { ...row, recovered: 0 } } }],
        notRun: [{ name: "opus", reason: "キー待ち" }],
        seeds: 2,
        maxProblems: 9,
      },
    });
    expect(md).toContain("研究する層");
    expect(md).toContain("記述言語で書けない読み方");
    expect(md).toContain("| opus | 未実行：キー待ち |");
    expect(md).toContain("1/2 (50.0%");
  });
});
