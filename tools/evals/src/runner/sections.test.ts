// The sections run item by item through the pool, then give the same numbers as the frozen eval functions run
// in one go (runInterpretEval, runSafetyEval, runLeakEval, runResearchEval). EVALS.md is rendered from mixed
// runs and says where each section's numbers come from. Fakes only.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMMON_FRACTION_READINGS, FRACTION_BANK, type ProblemRecord } from "@kimi/core";
import { PROVISIONAL } from "../../../../packages/core/fixtures/problems/provisional.ts";
import { interpretRow, loadJsonl, safetyRow } from "../dataset.ts";
import { runInterpretEval, type EvalSystem } from "../interpret-eval.ts";
import { runSafetyEval } from "../safety-eval.ts";
import { appJunior, kohaiRow, runLeakEval, silentClient, type Junior } from "../kohai-eval.ts";
import { SIM_CHILDREN } from "../research-children.ts";
import { runResearchEval, weighedResearcher } from "../research-eval.ts";
import { readFileSync } from "node:fs";
import type { Sink } from "./progress.ts";
import { runStore, type SectionFile } from "./store.ts";
import { interpretSection, leakSection, researchSection, safetySection, type SectionContext } from "./sections.ts";
import { buildEvalsInput } from "./render.ts";
import { renderEvalsMd } from "../report.ts";

const root = new URL("../../../../", import.meta.url);
const read = (p: string): string => readFileSync(new URL(p, root), "utf8");
const records = new Map<string, ProblemRecord>(PROVISIONAL.map((p) => [p.record.world.problem_id, p.record]));
const interpretRows = loadJsonl(read("evals/data/interpret/test.jsonl"), interpretRow).slice(0, 8);
const safetyRows = loadJsonl(read("evals/data/safety/test.jsonl"), safetyRow).slice(0, 12);
const leakRows = loadJsonl(read("evals/data/kohai/test.jsonl"), kohaiRow).slice(0, 4);

const quiet: Sink = { write: () => undefined };
const ctx = (over: Partial<SectionContext> = {}): SectionContext => ({ concurrency: 4, sink: quiet, ...over });

/** A fake system: right on even rows (by the transcript's length), wrong (null) on odd ones, with a fixed latency. */
const fakeSystem = (name: string): EvalSystem => ({
  name,
  run: async (_r, t) => {
    await new Promise((r) => setTimeout(r, t.length % 3));
    const row = interpretRows.find((x) => x.transcript === t);
    return { ops: row !== undefined && t.length % 2 === 0 ? row.expected_ops : null, latencyMs: t.length };
  },
});

describe("sections give the frozen functions' numbers", () => {
  it("interpret", async () => {
    const direct = await runInterpretEval({ rows: interpretRows, records, systems: [fakeSystem("a"), fakeSystem("b")], k: 2 });
    const out = await interpretSection(ctx(), {
      rows: interpretRows,
      records,
      k: 2,
      baseline: "a",
      notRun: [],
      systems: [
        { name: "a", claude: false, make: () => fakeSystem("a") },
        { name: "b", claude: true, make: () => fakeSystem("b") },
      ],
    });
    expect(out.result.results).toEqual(direct);
    expect(out.complete).toBe(true);
  });

  it("interpret: a stopped system moves to the not-run list with its error", async () => {
    const broken: EvalSystem = { name: "b", run: () => Promise.reject(Object.assign(new Error("grammar too large"), { status: 400 })) };
    const rows = loadJsonl(read("evals/data/interpret/test.jsonl"), interpretRow).slice(0, 12);
    const out = await interpretSection(ctx({ failFast: 10, concurrency: 1 }), {
      rows,
      records,
      k: 1,
      baseline: "a",
      notRun: [],
      systems: [
        { name: "a", claude: false, make: () => fakeSystem("a") },
        { name: "b", claude: true, make: () => broken },
      ],
    });
    expect(out.result.results.map((r) => r.name)).toEqual(["a"]);
    expect(out.result.notRun[0]?.name).toBe("b");
    expect(out.result.notRun[0]?.reason).toContain("grammar too large");
    expect(out.complete).toBe(false);
  });

  it("safety, with the third-party rows apart", async () => {
    const check = async (t: string) => (t.length % 3 === 0 ? "distress" : t.length % 3 === 1 ? "none" : "unchecked") as "distress" | "none" | "unchecked";
    const direct = await runSafetyEval(safetyRows, check);
    const tp = safetyRows.slice(0, 5);
    const out = await safetySection(ctx(), { rows: safetyRows, tpRows: tp, notRun: [], checks: [{ name: "dict", claude: false, make: () => check }] });
    expect(out.result.results).toEqual([{ name: "dict", result: direct }]);
    expect(out.result.thirdParty).toEqual({ rows: 5, results: [{ name: "dict", result: await runSafetyEval(tp, check) }] });
  });

  it("leak", async () => {
    let n = 0;
    const chatty: Junior = { name: "x", say: async () => (n++ % 2 === 0 ? "こたえは正しいよ" : "どうしてそう思ったの？") };
    const juniors = [appJunior("app", silentClient), chatty];
    const direct = await runLeakEval(juniors, leakRows, 2);
    n = 0;
    const out = await leakSection(ctx({ concurrency: 1 }), {
      rows: leakRows,
      tpRows: [],
      k: 2,
      notRun: [],
      juniors: [
        { name: "app", claude: false, make: () => appJunior("app", silentClient) },
        { name: "x", claude: true, make: () => chatty },
      ],
    });
    expect(out.result.results).toEqual(direct);
    expect(out.result.thirdParty).toBeNull();
  });

  it("research (episodes run in parallel across children)", async () => {
    const children = SIM_CHILDREN.slice(0, 3);
    const r = weighedResearcher("common", COMMON_FRACTION_READINGS, FRACTION_BANK);
    const direct = await runResearchEval([r], children, FRACTION_BANK, [1, 2]);
    const out = await researchSection(ctx(), { children, bank: FRACTION_BANK, notRun: [], seedsShown: 2, researchers: [{ name: "common", claude: false, seeds: [1, 2], make: () => r }] });
    expect(out.result.results).toEqual(direct);
  });

  it("resume: a second run of the same section takes the saved items and calls nothing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kimi-sections-"));
    let calls = 0;
    const counting = async (t: string) => {
      calls++;
      return (t.length % 2 === 0 ? "distress" : "none") as "distress" | "none";
    };
    const input = { rows: safetyRows, tpRows: [], notRun: [], checks: [{ name: "c", claude: true, make: () => counting }] };
    const first = await safetySection(ctx({ store: runStore(dir, "r1") }), input);
    expect(calls).toBe(safetyRows.length);
    calls = 0;
    const store = runStore(dir, "r1");
    const again = await safetySection(ctx({ store, resume: store.load("safety"), resumedFrom: "r1" }), input);
    expect(calls).toBe(0);
    expect(again.result).toEqual(first.result);
  });
});

describe("rendering from mixed runs", () => {
  const file = (section: SectionFile["section"], runId: string, result: unknown, current = false) => ({
    current,
    file: { section, runId, finishedAt: `${runId.slice(0, 4)}-${runId.slice(4, 6)}-${runId.slice(6, 8)} 10:00:00 +09:00`, live: true, split: "test" as const, complete: true, items: 3, errors: 1, aborted: [], result },
  });

  it("takes each section from its run and says which run (runId, date) each section's numbers come from", async () => {
    const interp = await interpretSection(ctx(), { rows: interpretRows, records, k: 1, baseline: "a", notRun: [], systems: [{ name: "a", claude: false, make: () => fakeSystem("a") }] });
    const safety = await safetySection(ctx(), { rows: safetyRows, tpRows: [], notRun: [], checks: [{ name: "dict", claude: false, make: () => async () => "none" as const }] });
    const input = buildEvalsInput({
      sections: { interpret: file("interpret", "20261107-120000", interp.result, true), safety: file("safety", "20261101-090000", safety.result) },
      data: { interpret: interpretRows, safety: safetyRows },
      note: "n",
    });
    const md = renderEvalsMd(input);
    expect(md).toContain("20261107-120000");
    expect(md).toContain("2026-11-07");
    expect(md).toContain("20261101-090000");
    expect(md).toMatch(/解釈.*今回/);
    expect(md).toMatch(/安全.*20261101-090000.*以前/);
    // Sections with no saved result say so and are not drawn.
    expect(md).toMatch(/後輩の言葉の漏れ.*まだ無い/);
    expect(md).not.toContain("## 後輩の言葉の漏れの比較");
    expect(md).not.toContain("## 読み方の研究の評価");
    expect(md).toContain("| dict |");
  });

  it("a missing interpret or safety section is drawn as not run, not as numbers", () => {
    const md = renderEvalsMd(buildEvalsInput({ sections: {}, data: { interpret: interpretRows, safety: safetyRows }, note: "n" }));
    expect(md).toContain("未実行");
    expect(md).toMatch(/解釈.*まだ無い/);
  });
});
