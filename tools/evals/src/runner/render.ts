// EVALS.md input from section results that may come from different runs: the sections run now, and for the
// others the latest finished run of each (store.latestSection). The heading says which run each section's
// numbers come from (run id, time, with or without Claude, errors).
import type { InterpretRow, SafetyRow } from "../dataset.ts";
import type { EvalsInput } from "../report.ts";
import type {
  InterpretSectionResult,
  LeakJudgeSectionResult,
  LeakSectionResult,
  ResearchJudgeSectionResult,
  ResearchSectionResult,
  SafetySectionResult,
} from "./sections.ts";
import type { SectionFile, SectionName } from "./store.ts";

export const SECTION_LABEL: Record<SectionName, string> = {
  interpret: "解釈",
  safety: "安全",
  leak: "後輩の言葉の漏れ",
  research: "読み方の研究",
  "leak-judge": "後輩の言葉を別のモデルで判定（追補5）",
  "research-judge": "読み方の研究・判定用の問題（追補5）",
};

const ORDER: readonly SectionName[] = ["interpret", "safety", "leak", "research", "leak-judge", "research-judge"];
const NONE_YET = "保存された結果がまだ無い（pnpm eval で作る）";
/** The addendum-5 sections run only when named. */
const NONE_YET_NAMED = (name: SectionName): string => `保存された結果がまだ無い（pnpm eval:live -- --only ${name} で作る）`;

export interface Picked {
  /** Run now, or taken from an earlier run. */
  current: boolean;
  file: SectionFile;
}

function fromText(p: Picked): string {
  const f = p.file;
  const parts = [f.finishedAt, f.live ? "Claude あり" : "Claude なし", `項目 ${f.items}`, `エラー ${f.errors}`];
  if (f.aborted.length > 0) parts.push(`止めた system ${f.aborted.map((a) => a.system).join("、")}`);
  return `${f.runId}（${parts.join("、")}、${p.current ? "今回の実行" : "以前の実行"}）`;
}

export function buildEvalsInput(o: {
  sections: Partial<Record<SectionName, Picked>>;
  data: { interpret: readonly InterpretRow[]; safety: readonly SafetyRow[] };
  note: string;
}): EvalsInput {
  const s = o.sections;
  const interpret = s.interpret?.file.result as InterpretSectionResult | undefined;
  const safety = s.safety?.file.result as SafetySectionResult | undefined;
  const leak = s.leak?.file.result as LeakSectionResult | undefined;
  const research = s.research?.file.result as ResearchSectionResult | undefined;
  const leakJudge = s["leak-judge"]?.file.result as LeakJudgeSectionResult | undefined;
  const researchJudge = s["research-judge"]?.file.result as ResearchJudgeSectionResult | undefined;
  const input: EvalsInput = {
    interpret: interpret ?? { k: 1, baseline: "keyword-rules", results: [], notRun: [{ name: "解釈の評価", reason: NONE_YET }] },
    safety: safety === undefined ? { results: [], notRun: [{ name: "安全の評価", reason: NONE_YET }] } : { results: safety.results, notRun: safety.notRun },
    data: o.data,
    note: o.note,
    thirdParty: { safety: safety?.thirdParty ?? null, leak: leak?.thirdParty ?? null },
    sources: ORDER.map((name) => {
      const p = s[name];
      const none = name === "leak-judge" || name === "research-judge" ? NONE_YET_NAMED(name) : NONE_YET;
      return { section: SECTION_LABEL[name], from: p === undefined ? none : fromText(p) };
    }),
  };
  if (leak !== undefined) input.leak = { results: leak.results, notRun: leak.notRun, rows: leak.rows, k: leak.k };
  if (research !== undefined) input.research = research;
  if (leakJudge !== undefined) input.leakJudge = { results: leakJudge.results, notRun: leakJudge.notRun, rows: leakJudge.rows, k: leakJudge.k, thirdParty: leakJudge.thirdParty?.results ?? [] };
  if (researchJudge !== undefined) input.researchJudge = researchJudge;
  return input;
}
