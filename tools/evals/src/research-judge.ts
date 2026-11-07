// The research eval with "recovered" judged a second time on problems apart from the bank (指示書 第10.2節,
// addendum 5). research-eval.ts is frozen and judges on the same bank the researcher picks from, so two
// readings the bank cannot tell apart count as the same. Here the frozen episode runs unchanged; a wrapper
// keeps the reading the researcher confirmed, and that reading is checked again on the judging problems
// (judge-problems.ts). Both numbers come from the same episodes.
import type { Hypothesis, ProblemRecord } from "@kimi/core";
import type { ChildKind, SimChild } from "./research-children.ts";
import { recovers, runEpisode, type Episode, type Researcher, type ResearchResult } from "./research-eval.ts";

export interface JudgedEpisode extends Episode {
  /** Recovered and false confirmation, judged on the judging problems. */
  judge: { recovered: boolean; falseConfirmation: boolean };
}

/** A researcher that remembers the last reading it reported as confirmed (runEpisode stops at the first). */
function remembering(r: Researcher): { researcher: Researcher; confirmed: () => Hypothesis | null } {
  let last: Hypothesis | null = null;
  return {
    confirmed: () => last,
    researcher: {
      name: r.name,
      start: async () => {
        const run = await r.start();
        return {
          see: (s) => run.see(s),
          confirmed: () => {
            const h = run.confirmed();
            if (h !== null) last = h;
            return h;
          },
          next: (done) => run.next(done),
        };
      },
    },
  };
}

export async function runJudgedEpisode(
  researcher: Researcher,
  child: SimChild,
  bank: readonly ProblemRecord[],
  judgeSet: readonly ProblemRecord[],
  seed: number,
): Promise<JudgedEpisode> {
  const w = remembering(researcher);
  const episode = await runEpisode(w.researcher, child, bank, seed);
  const h = episode.confirmedAfter === null ? null : w.confirmed();
  // As the frozen eval counts it, with the judging problems in place of the bank.
  const recovered = h !== null && child.rule !== null && recovers(h, child, judgeSet);
  return { ...episode, judge: { recovered, falseConfirmation: h !== null && !recovered } };
}

export interface ResearchJudgeResult {
  name: string;
  /** Episodes per child (seeds) this researcher ran. */
  seeds: number;
  /** Judged on the bank, as the frozen research eval does. */
  bank: ResearchResult["byKind"];
  /** Judged on the judging problems. */
  judge: ResearchResult["byKind"];
}

const KINDS: readonly ChildKind[] = ["listed", "inside", "outside", "inexpressible"];
const empty = (): ResearchResult["byKind"] =>
  Object.fromEntries(KINDS.map((k) => [k, { episodes: 0, recovered: 0, falseConfirmations: 0, confirmedAfter: [] as number[] }])) as ResearchResult["byKind"];

export function sumJudgedEpisodes(name: string, seeds: number, episodes: readonly JudgedEpisode[]): ResearchJudgeResult {
  const bank = empty();
  const judge = empty();
  const add = (into: ResearchResult["byKind"], kind: ChildKind, recovered: boolean, falseConfirmation: boolean, after: number | null): void => {
    const row = into[kind];
    row.episodes++;
    if (recovered) row.recovered++;
    if (falseConfirmation) row.falseConfirmations++;
    if (after !== null && recovered) row.confirmedAfter.push(after);
  };
  for (const e of episodes) {
    add(bank, e.kind, e.recovered, e.falseConfirmation, e.confirmedAfter);
    add(judge, e.kind, e.judge.recovered, e.judge.falseConfirmation, e.confirmedAfter);
  }
  return { name, seeds, bank, judge };
}
