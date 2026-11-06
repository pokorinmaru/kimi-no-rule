// M2: runs the evals on the frozen test split and writes EVALS.md (指示書 第10節).
//   pnpm eval       the keyword baseline and the device dictionary only (no Claude, no key needed)
//   pnpm eval:live  also Haiku, Sonnet and Opus (needs ANTHROPIC_API_KEY in the environment)
// Neither the transcripts nor the replies are logged; only the numbers go into EVALS.md.
import { readFileSync, writeFileSync } from "node:fs";
import { FRACTION_BANK, type AnyOp, type ProblemRecord } from "@kimi/core";
import { parseKeywords } from "@kimi/baseline-parser";
import { MODELS, anthropicAgentClient, anthropicClient, checkSafety, interpret, writeHypotheses, type ClaudeClient } from "@kimi/interpret";
import { PROVISIONAL } from "../../../packages/core/fixtures/problems/provisional.ts";
import { interpretRow, loadJsonl, safetyRow } from "./dataset.ts";
import { runInterpretEval, type EvalSystem } from "./interpret-eval.ts";
import { renderEvalsMd, type NotRun } from "./report.ts";
import { runSafetyEval } from "./safety-eval.ts";
import { SIM_CHILDREN } from "./research-children.ts";
import { appJunior, kohaiRow, runLeakEval, shushedJunior, silentClient, type Junior } from "./kohai-eval.ts";
import { MAX_PROBLEMS, RESEARCH_SEEDS, RESEARCH_SEEDS_CLAUDE, baselineResearchers, poolResearcher, runResearchEval, type Researcher } from "./research-eval.ts";

const root = new URL("../../../", import.meta.url);
const read = (p: string): string => readFileSync(new URL(p, root), "utf8");

/** A client that never answers: checkSafety then falls back to the device dictionary. */
const noClaude: ClaudeClient = {
  complete: () => Promise.reject(new Error("no Claude in this run")),
};

export const KEYWORD = "keyword-rules";

export function keywordSystem(): EvalSystem {
  return {
    name: KEYWORD,
    run: async (record, transcript) => {
      const started = performance.now();
      const res = parseKeywords(record, transcript);
      return { ops: res.ops as AnyOp[], latencyMs: Math.round(performance.now() - started) };
    },
  };
}

export function claudeSystem(name: string, model: string, client: ClaudeClient): EvalSystem {
  return {
    name,
    run: async (record, transcript) => {
      const started = performance.now();
      const res = await interpret({ record, transcript, fingerOps: [], wordCues: [], lang: record.world.problem_lang }, client, { model });
      return { ops: res.status === "ok" ? (res.interpretation.ops as AnyOp[]) : null, latencyMs: Math.round(performance.now() - started) };
    },
  };
}

async function main(): Promise<void> {
  const live = process.argv.includes("--live");
  const key = process.env.ANTHROPIC_API_KEY;
  if (live && (key === undefined || key === "")) {
    console.error("eval:live needs ANTHROPIC_API_KEY in the environment (BLOCKED B3).");
    process.exit(2);
  }
  const records = new Map<string, ProblemRecord>(PROVISIONAL.map((p) => [p.record.world.problem_id, p.record]));
  const tune = process.argv.includes("--split") && process.argv[process.argv.indexOf("--split") + 1] === "tune";
  const split = tune ? "tune" : "test";
  const interpretRows = loadJsonl(read(`evals/data/interpret/${split}.jsonl`), interpretRow);
  const safetyRows = loadJsonl(read(`evals/data/safety/${split}.jsonl`), safetyRow);
  const k = live ? 5 : 1;

  const systems: EvalSystem[] = [keywordSystem()];
  const notRun: NotRun[] = [];
  const safetyNotRun: NotRun[] = [];
  const claudeModels: [string, string][] = [
    ["haiku-5.5", MODELS.listen],
    ["sonnet-5.5", MODELS.kohai],
    ["opus-5.5", MODELS.build],
  ];
  const client = live ? anthropicClient() : null;
  for (const [name, model] of claudeModels) {
    if (client === null) notRun.push({ name, reason: "API キー待ち（BLOCKED B3）" });
    else systems.push(claudeSystem(name, model, client));
  }
  notRun.push({ name: "Anthropic 以外の LLM", reason: "使える環境が無い（任意の比較）" });

  const results = await runInterpretEval({ rows: interpretRows, records, systems, k });
  const safety: { name: string; result: Awaited<ReturnType<typeof runSafetyEval>> }[] = [
    { name: "端末の辞書だけ（Claude が答えない時）", result: await runSafetyEval(safetyRows, async (t) => (await checkSafety(t, noClaude)).flag) },
  ];
  if (client === null) safetyNotRun.push({ name: "haiku-5.5（辞書への切り替えを含む）", reason: "API キー待ち（BLOCKED B3）" });
  else safety.push({ name: "haiku-5.5（辞書への切り替えを含む）", result: await runSafetyEval(safetyRows, async (t) => (await checkSafety(t, client)).flag) });

  const researchNotRun: NotRun[] = [];
  const research = await runResearchEval(baselineResearchers(FRACTION_BANK), SIM_CHILDREN, FRACTION_BANK, RESEARCH_SEEDS);
  if (!live) researchNotRun.push({ name: "opus-5.5 が仮説を書く（研究層）", reason: "API キー待ち（BLOCKED B3）" });
  else {
    const agent = anthropicAgentClient();
    const opus: Researcher = poolResearcher("opus-5.5 が仮説を書く（研究層、1人1回）", FRACTION_BANK, async (state, seen) => {
      const out = await writeHypotheses(agent, {
        state,
        readings: seen.map((x) => ({ record: x.record, childWorld: x.world, referencePlaced: true, afterFix: false, wordbookOpenedBefore: false, words: x.words })),
        bank: FRACTION_BANK,
      });
      return out.kind === "submitted" ? out.revision.state : state;
    });
    research.push(...(await runResearchEval([opus], SIM_CHILDREN, FRACTION_BANK, RESEARCH_SEEDS_CLAUDE)));
  }
  researchNotRun.push({ name: "sonnet-5.5・haiku-5.5 が仮説を書く", reason: "費用を抑えるため提出版では回さない" });

  const leakRows = loadJsonl(read("evals/data/kohai/test.jsonl"), kohaiRow);
  const juniors: Junior[] = [appJunior("この作品の後輩（Claude なし、定型文だけ）", silentClient)];
  const leakNotRun: NotRun[] = [];
  if (client === null) {
    leakNotRun.push({ name: "口止めした Claude（sonnet-5.5、答えを渡す）", reason: "API キー待ち（BLOCKED B3）" });
    leakNotRun.push({ name: "この作品の後輩（sonnet-5.5＋関門）", reason: "API キー待ち（BLOCKED B3）" });
  } else {
    juniors.push(shushedJunior("口止めした Claude（sonnet-5.5、答えを渡す）", client), appJunior("この作品の後輩（sonnet-5.5＋関門）", client));
  }
  const leakK = live ? 5 : 1;
  const leak = await runLeakEval(juniors, leakRows, leakK);

  const md = renderEvalsMd({
    interpret: { k, baseline: KEYWORD, results, notRun },
    safety: { results: safety, notRun: safetyNotRun },
    data: { interpret: interpretRows, safety: safetyRows },
    leak: { results: leak, notRun: leakNotRun, rows: leakRows.length, k: leakK },
    research: { results: research, notRun: researchNotRun, seeds: RESEARCH_SEEDS.length, maxProblems: MAX_PROBLEMS },
    note: tune
      ? "対象：調整用（tune）の行と【仮】の問題10題。調整の判断にだけ使い、公開しない。"
      : "対象：本番用（test）の行と、誤読への耐性の検査で選ぶ前の【仮】の問題10題（指示書 第10.1節の「選別前」）。選別後の問題の一致率は、問題の組み立てを本物の Claude で回した後に足す。",
  });
  // The tune split is for tuning: shown on screen, never written into the published table.
  if (tune) {
    console.log(md);
    return;
  }
  writeFileSync(new URL("EVALS.md", root), md);
  console.log(`EVALS.md written (${results.length} interpretation systems, ${safety.length} safety checks).`);
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href || process.argv[1]?.endsWith("run.ts")) {
  await main();
}
