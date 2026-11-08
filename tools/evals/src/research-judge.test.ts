// The research eval with "recovered" judged again on problems apart from the bank (指示書 第10.2節, addendum 5).
// The frozen episode runs as it is; a wrapper keeps the reading the researcher confirmed and checks it on the
// judging problems too. Both numbers come from the same episodes. No Claude.
import { describe, expect, it } from "vitest";
import { COMMON_FRACTION_READINGS, FRACTION_BANK, type Hypothesis } from "@kimi/core";
import { SIM_CHILDREN } from "./research-children.ts";
import { recovers, runEpisode, runResearchEval, weighedResearcher, type Researcher } from "./research-eval.ts";
import { JUDGE_PROBLEMS } from "./judge-problems.ts";
import { runJudgedEpisode, sumJudgedEpisodes } from "./research-judge.ts";
import { researchJudgeSection, researchSection } from "./runner/sections.ts";
import type { Sink } from "./runner/progress.ts";
import { renderEvalsMd, type EvalsInput } from "./report.ts";

const quiet: Sink = { write: () => undefined };

// Slow under the full run's load (7-15 s with every package in parallel): a minute, not the default 5 s.
const SLOW_MS = 60_000;

/** A researcher that confirms the given rule after the first problem. */
const confirming = (h: Hypothesis): Researcher => ({
  name: `confirms ${h.id}`,
  start: async () => ({ see: async () => undefined, confirmed: () => h, next: () => null }),
});

describe("runJudgedEpisode", () => {
  it("gives the frozen episode unchanged, for every child and seed", async () => {
    const r = weighedResearcher("common", COMMON_FRACTION_READINGS, FRACTION_BANK);
    for (const child of SIM_CHILDREN) {
      for (const seed of [1, 2]) {
        const judged = await runJudgedEpisode(r, child, FRACTION_BANK, JUDGE_PROBLEMS, seed);
        expect({ ...judged, judge: undefined }).toEqual({ ...(await runEpisode(r, child, FRACTION_BANK, seed)), judge: undefined });
      }
    }
  }, SLOW_MS);

  it("recovered on the judging problems is whether the confirmed reading builds the child's worlds there", async () => {
    for (const h of COMMON_FRACTION_READINGS) {
      for (const child of SIM_CHILDREN) {
        const e = await runJudgedEpisode(confirming(h), child, FRACTION_BANK, JUDGE_PROBLEMS, 1);
        const expected = child.rule !== null && recovers(h, child, JUDGE_PROBLEMS);
        expect(e.judge.recovered, `${h.id} on ${child.id}`).toBe(expected);
        expect(e.judge.falseConfirmation, `${h.id} on ${child.id}`).toBe(!expected);
        expect(e.recovered).toBe(child.rule !== null && recovers(h, child, FRACTION_BANK));
      }
    }
  });

  it("nothing confirmed is neither recovered nor a false confirmation on either set", async () => {
    const never: Researcher = { name: "never", start: async () => ({ see: async () => undefined, confirmed: () => null, next: () => null }) };
    const e = await runJudgedEpisode(never, SIM_CHILDREN[0] as never, FRACTION_BANK, JUDGE_PROBLEMS, 1);
    expect(e.confirmedAfter).toBeNull();
    expect(e.judge).toEqual({ recovered: false, falseConfirmation: false });
  });
});

describe("the research-judge section", () => {
  it("the bank column gives the frozen eval's numbers, the judge column comes from the same episodes", async () => {
    const children = SIM_CHILDREN.slice(0, 4);
    const r = weighedResearcher("common", COMMON_FRACTION_READINGS, FRACTION_BANK);
    const direct = await runResearchEval([r], children, FRACTION_BANK, [1, 2]);
    const out = await researchJudgeSection(
      { concurrency: 3, sink: quiet },
      { children, bank: FRACTION_BANK, judgeSet: JUDGE_PROBLEMS, notRun: [], researchers: [{ name: "common", claude: false, seeds: [1, 2], make: () => r }] },
    );
    expect(out.complete).toBe(true);
    const res = out.result.results[0];
    expect(res?.name).toBe("common");
    expect(res?.seeds).toBe(2);
    expect(res?.bank).toEqual(direct[0]?.byKind);
    const episodes = await Promise.all(children.flatMap((c) => [1, 2].map((s) => runJudgedEpisode(r, c, FRACTION_BANK, JUDGE_PROBLEMS, s))));
    expect(res).toEqual(sumJudgedEpisodes("common", 2, episodes));
    expect(out.result.judgeProblems).toBe(JUDGE_PROBLEMS.length);
    expect(out.result.bankProblems).toBe(FRACTION_BANK.length);
  });

  it("each researcher keeps its own seed count (Claude can run 3 seeds while the baselines run 5)", async () => {
    const children = SIM_CHILDREN.slice(0, 2);
    const a = weighedResearcher("a", COMMON_FRACTION_READINGS, FRACTION_BANK);
    const out = await researchJudgeSection(
      { concurrency: 2, sink: quiet },
      {
        children,
        bank: FRACTION_BANK,
        judgeSet: JUDGE_PROBLEMS,
        notRun: [],
        researchers: [
          { name: "a", claude: false, seeds: [1, 2, 3, 4, 5], make: () => a },
          { name: "b", claude: true, seeds: [1, 2, 3], make: () => a },
        ],
      },
    );
    expect(out.result.results.map((r) => [r.name, r.seeds, r.bank.listed.episodes])).toEqual([
      ["a", 5, 10],
      ["b", 3, 6],
    ]);
  });
});

describe("the research section names each system's seeds", () => {
  it("seedsBySystem has every researcher that ran", async () => {
    const children = SIM_CHILDREN.slice(0, 2);
    const a = weighedResearcher("a", COMMON_FRACTION_READINGS, FRACTION_BANK);
    const out = await researchSection(
      { concurrency: 2, sink: quiet },
      {
        children,
        bank: FRACTION_BANK,
        notRun: [],
        seedsShown: 5,
        researchers: [
          { name: "a", claude: false, seeds: [1, 2, 3, 4, 5], make: () => a },
          { name: "b", claude: true, seeds: [1, 2, 3], make: () => a },
        ],
      },
    );
    expect(out.result.seedsBySystem).toEqual({ a: 5, b: 3 });
  });
});

describe("EVALS.md", () => {
  const base: EvalsInput = { interpret: { k: 1, baseline: "keyword", results: [], notRun: [] }, safety: { results: [], notRun: [] }, data: { interpret: [], safety: [] } };
  const kinds = (recovered: number, falseConfirmations: number) => ({
    listed: { episodes: 7, recovered, falseConfirmations, confirmedAfter: [2, 3] },
    inside: { episodes: 3, recovered: 0, falseConfirmations: 0, confirmedAfter: [] },
    outside: { episodes: 2, recovered: 0, falseConfirmations: 0, confirmedAfter: [] },
    inexpressible: { episodes: 2, recovered: 0, falseConfirmations: 1, confirmedAfter: [] },
  });

  it("the research table shows each system's seed count", () => {
    const md = renderEvalsMd({
      ...base,
      research: { results: [{ name: "opus", byKind: kinds(5, 1) }], notRun: [], seeds: 5, maxProblems: 9, seedsBySystem: { opus: 3 } },
    });
    expect(md).toMatch(/\| opus \| 3 \| よくある読み違いの一覧にある読み方 \|/);
  });

  it("an older saved research result without seedsBySystem shows the shared seed count", () => {
    const md = renderEvalsMd({ ...base, research: { results: [{ name: "opus", byKind: kinds(5, 1) }], notRun: [], seeds: 5, maxProblems: 9 } });
    expect(md).toMatch(/\| opus \| 5 \| よくある読み違いの一覧にある読み方 \|/);
  });

  it("the judge table shows recovered on the bank and on the judging problems side by side", () => {
    const md = renderEvalsMd({
      ...base,
      researchJudge: {
        results: [{ name: "opus", seeds: 3, bank: kinds(5, 1), judge: kinds(4, 2) }],
        notRun: [{ name: "sonnet", reason: "回さない" }],
        maxProblems: 9,
        bankProblems: 9,
        judgeProblems: 8,
      },
    });
    expect(md).toContain("## 読み方の研究の評価（判定用の問題で回復を測り直す）");
    expect(md).toMatch(/\| opus \| 3 \| よくある読み違いの一覧にある読み方 \| 5\/7 [^|]*\| 4\/7 [^|]*\| 1\/7 [^|]*\| 2\/7 [^|]*\|/);
    expect(md).toContain("| sonnet | 未実行：回さない |");
  });
});
