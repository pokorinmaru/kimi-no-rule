// M2: the problem-preparation entry (指示書 第6.6節). It runs the one build agent of packages/interpret
// over a list of problems. Adopted records are written unchecked by a person (human_checked false): a
// person looks at each before it goes into the app. The build record is written next to them.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { schemas, type ProblemRecord } from "@kimi/core";
import { buildProblem, formatBuildLog, type BuildDeps, type BuildInput, type BuildOptions, type RejectReason } from "@kimi/interpret";

export const PACKAGE = "@kimi/world-builder";

const buildInput = z.strictObject({
  problemId: z.string().min(1),
  problemText: z.string().min(1),
  lang: z.enum(["ja", "en"]),
  grade: z.int(),
  consistency: z.enum(["consistent", "inconsistent"]),
  source: schemas.problemRecord.shape.source,
  pairId: z.string().nullable().optional(),
});

/** The input file: a JSON list of problems to prepare. */
export function parseInputs(text: string): BuildInput[] {
  return z.array(buildInput).parse(JSON.parse(text)) as BuildInput[];
}

export interface Prepared {
  adopted: ProblemRecord[];
  rejected: { problemId: string; reason: RejectReason }[];
  log: string;
}

export async function prepareProblems(deps: BuildDeps, inputs: readonly BuildInput[], opts?: BuildOptions): Promise<Prepared> {
  const out: Prepared = { adopted: [], rejected: [], log: "" };
  const logs: string[] = ["# 組み立ての記録", ""];
  for (const input of inputs) {
    const res = await buildProblem(deps, input, opts);
    if (res.status === "adopted") out.adopted.push(res.record);
    else out.rejected.push({ problemId: input.problemId, reason: res.reason });
    logs.push(formatBuildLog(input.problemId, res.log), res.status === "adopted" ? "採用（人の確認待ち）" : `不採用：${res.reason}`, "");
  }
  out.log = `${logs.join("\n").trimEnd()}\n`;
  return out;
}

export function writePrepared(dir: string, prepared: Prepared): void {
  mkdirSync(dir, { recursive: true });
  for (const r of prepared.adopted) {
    const record = schemas.problemRecord.parse({ ...r, checks: { ...r.checks, human_checked: false } });
    writeFileSync(join(dir, `${record.world.problem_id}.json`), `${JSON.stringify(record, null, 2)}\n`);
  }
  const rejected = prepared.rejected.map((x) => `- ${x.problemId}: ${x.reason}`);
  writeFileSync(join(dir, "build-log.md"), `${prepared.log}${rejected.length === 0 ? "" : `\n## 不採用\n\n${rejected.join("\n")}\n`}`);
}
