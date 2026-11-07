// M2: runs the evals on the frozen test split and writes EVALS.md (指示書 第10節).
//   pnpm eval       the keyword baseline and the device dictionary only (no Claude, no key needed)
//   pnpm eval:live  also Haiku, Sonnet and Opus (needs ANTHROPIC_API_KEY in the environment)
// Options (runner/args.ts): --only interpret,safety,leak,research  --concurrency 8  --resume <runId>  --fail-fast 10
// Items run through a bounded pool; each finished item prints a progress line, appended also to
// evals/results/progress.log, and is saved to evals/results/<runId>/<section>.jsonl (gitignored). EVALS.md takes
// the sections run now and, for the others, the latest finished run of each, and says which run each came from.
// Neither the transcripts nor the replies are logged or saved; items keep ops, flags, leak kinds and outcomes.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FRACTION_BANK, type AnyOp, type ProblemRecord } from "@kimi/core";
import { parseKeywords } from "@kimi/baseline-parser";
import { MODELS, anthropicAgentClient, anthropicClient, checkSafety, interpret, writeHypotheses, type ClaudeClient } from "@kimi/interpret";
import { PROVISIONAL } from "../../../packages/core/fixtures/problems/provisional.ts";
import { interpretRow, loadJsonl, safetyRow } from "./dataset.ts";
import type { EvalSystem } from "./interpret-eval.ts";
import { renderEvalsMd, type NotRun } from "./report.ts";
import { SIM_CHILDREN } from "./research-children.ts";
import { appJunior, kohaiRow, shushedJunior, silentClient, type Junior } from "./kohai-eval.ts";
import { THIRD_PARTY } from "./third-party.ts";
import { MAX_PROBLEMS, RESEARCH_SEEDS, RESEARCH_SEEDS_CLAUDE, baselineResearchers, poolResearcher, type Researcher } from "./research-eval.ts";
import type { Flag } from "./safety-eval.ts";
import { parseArgs, type EvalArgs } from "./runner/args.ts";
import { recordingAgent, recordingClient } from "./runner/errors.ts";
import { fileSink } from "./runner/progress.ts";
import { buildEvalsInput, SECTION_LABEL, type Picked } from "./runner/render.ts";
import { interpretSection, leakSection, researchSection, safetySection, type Named, type SectionContext, type SectionOutcome } from "./runner/sections.ts";
import { formatLocal, latestSection, newRunId, runStore, SECTIONS, type SectionFile, type SectionName } from "./runner/store.ts";

const root = new URL("../../../", import.meta.url);
const read = (p: string): string => readFileSync(new URL(p, root), "utf8");
/** A file that may not exist yet (the third-party rows), read when it does. */
const readIfAny = (p: string): string | null => (existsSync(new URL(p, root)) ? read(p) : null);

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

const NO_KEY = "API キー待ち（BLOCKED B3）";

async function main(args: EvalArgs): Promise<number> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (args.live && (key === undefined || key === "")) {
    console.error("eval:live needs ANTHROPIC_API_KEY in the environment (BLOCKED B3).");
    return 2;
  }
  const tune = args.split === "tune";
  const records = new Map<string, ProblemRecord>(PROVISIONAL.map((p) => [p.record.world.problem_id, p.record]));
  const interpretRows = loadJsonl(read(`evals/data/interpret/${args.split}.jsonl`), interpretRow);
  const safetyRows = loadJsonl(read(`evals/data/safety/${args.split}.jsonl`), safetyRow);

  const resultsDir = args.results ?? fileURLToPath(new URL("evals/results/", root));
  if (args.resume !== null && !existsSync(join(resultsDir, args.resume))) {
    console.error(`--resume: no run ${args.resume} in ${resultsDir}`);
    return 2;
  }
  const runId = args.resume ?? newRunId(new Date());
  const store = runStore(resultsDir, runId);
  const logPath = join(resultsDir, "progress.log");
  const sink = fileSink(logPath);
  sink.write(
    `[run] ${runId}${args.resume === null ? "" : " (resumed)"}: ${args.live ? "live" : "no Claude"}, split ${args.split}, sections ${args.only.join(",")}, concurrency ${args.concurrency}, fail-fast ${args.failFast}; log ${logPath}`,
  );
  const ctxFor = (section: SectionName): SectionContext => ({
    concurrency: args.concurrency,
    sink,
    store,
    failFast: args.failFast,
    ...(args.resume === null ? {} : { resume: store.load(section), resumedFrom: args.resume }),
  });

  const client = args.live ? anthropicClient() : null;
  const agent = args.live ? anthropicAgentClient() : null;
  const ran: Partial<Record<SectionName, Picked>> = {};
  let stopped = 0;
  const keep = (section: SectionName, out: SectionOutcome<unknown>): void => {
    const file: SectionFile = {
      section,
      runId,
      finishedAt: formatLocal(new Date()),
      live: args.live,
      split: args.split,
      complete: out.complete,
      items: out.items,
      errors: out.errors,
      aborted: out.aborted,
      result: out.result,
    };
    store.saveSection(file);
    ran[section] = { current: true, file };
    stopped += out.aborted.length;
    sink.write(`[${section}] finished: ${out.items} items, ${out.errors} with errors${out.aborted.length === 0 ? "" : `, stopped ${out.aborted.map((a) => a.system).join(", ")}`}`);
  };

  for (const section of args.only) {
    if (section === "interpret") {
      const notRun: NotRun[] = [];
      const systems: Named<EvalSystem>[] = [{ name: KEYWORD, claude: false, make: () => keywordSystem() }];
      const claudeModels: [string, string][] = [
        ["haiku-5.5", MODELS.listen],
        ["sonnet-5.5", MODELS.kohai],
        ["opus-5.5", MODELS.build],
      ];
      for (const [name, model] of claudeModels) {
        if (client === null) notRun.push({ name, reason: NO_KEY });
        else systems.push({ name, claude: true, make: (log) => claudeSystem(name, model, recordingClient(client, log)) });
      }
      notRun.push({ name: "Anthropic 以外の LLM", reason: "使える環境が無い（任意の比較）" });
      keep(section, await interpretSection(ctxFor(section), { rows: interpretRows, records, systems, k: args.live ? 5 : 1, baseline: KEYWORD, notRun }));
    } else if (section === "safety") {
      const tpText = tune ? null : readIfAny(THIRD_PARTY.safetyJsonl);
      const checks: Named<(t: string) => Promise<Flag>>[] = [
        { name: "端末の辞書だけ（Claude が答えない時）", claude: false, make: () => async (t) => (await checkSafety(t, noClaude)).flag },
      ];
      const notRun: NotRun[] = [];
      const haiku = "haiku-5.5（辞書への切り替えを含む）";
      if (client === null) notRun.push({ name: haiku, reason: NO_KEY });
      else checks.push({ name: haiku, claude: true, make: (log) => async (t) => (await checkSafety(t, recordingClient(client, log))).flag });
      keep(section, await safetySection(ctxFor(section), { rows: safetyRows, tpRows: tpText === null ? [] : loadJsonl(tpText, safetyRow), checks, notRun }));
    } else if (section === "leak") {
      const rows = loadJsonl(read("evals/data/kohai/test.jsonl"), kohaiRow);
      const tpText = tune ? null : readIfAny(THIRD_PARTY.kohaiJsonl);
      const silent = "この作品の後輩（Claude なし、定型文だけ）";
      const juniors: Named<Junior>[] = [{ name: silent, claude: false, make: () => appJunior(silent, silentClient) }];
      const notRun: NotRun[] = [];
      const shushed = "口止めした Claude（sonnet-5.5、答えを渡す）";
      const app = "この作品の後輩（sonnet-5.5＋関門）";
      if (client === null) notRun.push({ name: shushed, reason: NO_KEY }, { name: app, reason: NO_KEY });
      else {
        juniors.push(
          { name: shushed, claude: true, make: (log) => shushedJunior(shushed, recordingClient(client, log)) },
          { name: app, claude: true, make: (log) => appJunior(app, recordingClient(client, log)) },
        );
      }
      keep(section, await leakSection(ctxFor(section), { rows, tpRows: tpText === null ? [] : loadJsonl(tpText, kohaiRow), juniors, k: args.live ? 5 : 1, notRun }));
    } else {
      const researchers: (Named<Researcher> & { seeds: readonly number[] })[] = baselineResearchers(FRACTION_BANK).map((r) => ({
        name: r.name,
        claude: false,
        seeds: RESEARCH_SEEDS,
        make: () => r,
      }));
      const notRun: NotRun[] = [];
      const opusName = "opus-5.5 が仮説を書く（研究層、1人1回）";
      if (agent === null) notRun.push({ name: "opus-5.5 が仮説を書く（研究層）", reason: NO_KEY });
      else {
        researchers.push({
          name: opusName,
          claude: true,
          seeds: RESEARCH_SEEDS_CLAUDE,
          make: (log) => {
            const recording = recordingAgent(agent, log);
            return poolResearcher(opusName, FRACTION_BANK, async (state, seen) => {
              const out = await writeHypotheses(recording, {
                state,
                readings: seen.map((x) => ({ record: x.record, childWorld: x.world, referencePlaced: true, afterFix: false, wordbookOpenedBefore: false, words: x.words })),
                bank: FRACTION_BANK,
              });
              return out.kind === "submitted" ? out.revision.state : state;
            });
          },
        });
      }
      notRun.push({ name: "sonnet-5.5・haiku-5.5 が仮説を書く", reason: "費用を抑えるため提出版では回さない" });
      keep(
        section,
        await researchSection(ctxFor(section), { researchers, children: SIM_CHILDREN, bank: FRACTION_BANK, notRun, seedsShown: RESEARCH_SEEDS.length, maxProblems: MAX_PROBLEMS }),
      );
    }
  }

  const sections: Partial<Record<SectionName, Picked>> = {};
  for (const name of SECTIONS) {
    const now = ran[name];
    if (now !== undefined) sections[name] = now;
    else {
      const file = latestSection(resultsDir, name, { split: args.split });
      if (file !== null) sections[name] = { current: false, file };
    }
    const p = sections[name];
    sink.write(`[render] ${SECTION_LABEL[name]}: ${p === undefined ? "no saved result" : `${p.file.runId}${p.current ? " (this run)" : " (earlier run)"}`}`);
  }
  const md = renderEvalsMd(
    buildEvalsInput({
      sections,
      data: { interpret: interpretRows, safety: safetyRows },
      note: tune
        ? "対象：調整用（tune）の行と【仮】の問題10題。調整の判断にだけ使い、公開しない。"
        : "対象：本番用（test）の行と、誤読への耐性の検査で選ぶ前の【仮】の問題10題（指示書 第10.1節の「選別前」）。選別後の問題の一致率は、問題の組み立てを本物の Claude で回した後に足す。",
    }),
  );
  // The tune split is for tuning: shown on screen, never written into the published table.
  if (tune) console.log(md);
  else {
    const out = args.out ?? fileURLToPath(new URL("EVALS.md", root));
    writeFileSync(out, md);
    sink.write(`[run] ${runId}: EVALS.md written to ${out}`);
  }
  if (stopped > 0) {
    sink.write(`[run] ${runId}: ${stopped} system(s) stopped by the fail-fast; fix the cause, then rerun with --resume ${runId}`);
    return 1;
  }
  return 0;
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href || process.argv[1]?.endsWith("run.ts")) {
  let args: EvalArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(2);
  }
  process.exit(await main(args));
}
