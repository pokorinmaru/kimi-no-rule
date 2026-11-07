// One candidate of a part: draw (Claude Opus), code check, render (a browser), critique (Claude Opus looking at the
// rendered picture), revise with the reviewer's fixes, up to maxRounds drawings. A refused drawing is sent back with
// the check's problems and never rendered. The best scored drawing is kept; it passes only when every score is at
// least PASS_SCORE.
import type { PartId } from "../../../apps/web/src/draw/assets/spec.ts";
import { PASS_SCORE, RUBRIC, type RubricKey, type StyleBrief } from "./prompts.ts";
import { checkPart, type PartProblem } from "./spec-check.ts";

export type Scores = Record<RubricKey, number>;

export interface DrawRequest {
  part: PartId;
  style: StyleBrief;
  references: readonly Uint8Array[];
  previous?: string;
  problems?: PartProblem[];
  fixes?: string[];
}

export interface BuildDeps {
  draw(req: DrawRequest): Promise<{ svg: string; notes: string }>;
  /** The review sheet: the part large, small as in the app, and (items) cut to its left half. PNG bytes. */
  render(part: PartId, svg: string): Promise<Uint8Array>;
  critique(req: { part: PartId; style: StyleBrief; sheet: Uint8Array; references: readonly Uint8Array[] }): Promise<{ scores: Scores; fixes: string[] }>;
}

export interface Round {
  svg: string;
  problems: PartProblem[];
  scores: Scores | null;
  fixes: string[];
  sheet: Uint8Array | null;
}

export interface CandidateResult {
  rounds: Round[];
  best: { svg: string; scores: Scores; sheet: Uint8Array; round: number } | null;
  passed: boolean;
}

export const minScore = (s: Scores): number => Math.min(...RUBRIC.map(([k]) => s[k]));
const total = (s: Scores): number => RUBRIC.reduce((a, [k]) => a + s[k], 0);
const better = (a: Scores, b: Scores): boolean => minScore(a) > minScore(b) || (minScore(a) === minScore(b) && total(a) > total(b));

export async function buildCandidate(
  o: { part: PartId; style: StyleBrief; references: readonly Uint8Array[]; maxRounds: number; onRound?: (r: Round, index: number) => void },
  deps: BuildDeps,
): Promise<CandidateResult> {
  const rounds: Round[] = [];
  let best: CandidateResult["best"] = null;
  let previous: string | undefined;
  let problems: PartProblem[] | undefined;
  let fixes: string[] | undefined;
  for (let i = 0; i < o.maxRounds; i++) {
    const req: DrawRequest = { part: o.part, style: o.style, references: o.references };
    if (previous !== undefined) req.previous = previous;
    if (problems !== undefined) req.problems = problems;
    if (fixes !== undefined) req.fixes = fixes;
    const { svg } = await deps.draw(req);
    const found = checkPart(o.part, svg);
    if (found.length > 0) {
      const r: Round = { svg, problems: found, scores: null, fixes: [], sheet: null };
      rounds.push(r);
      o.onRound?.(r, i);
      previous = svg;
      problems = found;
      fixes = undefined;
      continue;
    }
    const sheet = await deps.render(o.part, svg);
    const review = await deps.critique({ part: o.part, style: o.style, sheet, references: o.references });
    const r: Round = { svg, problems: [], scores: review.scores, fixes: review.fixes, sheet };
    rounds.push(r);
    o.onRound?.(r, i);
    if (best === null || better(review.scores, best.scores)) best = { svg, scores: review.scores, sheet, round: i };
    if (minScore(review.scores) >= PASS_SCORE) return { rounds, best, passed: true };
    previous = svg;
    problems = undefined;
    fixes = review.fixes;
  }
  return { rounds, best, passed: best !== null && minScore(best.scores) >= PASS_SCORE };
}
