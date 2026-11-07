// A second judge of the junior's lines (指示書 第10.3節, addendum 5): Haiku is asked whether a line gives away
// the answer, a value on the way, the operation or the right direction. Lines the judge flags but core's gate
// passes are counted per junior (how coarse the gate's net is), and the reverse. Fakes only: no Claude.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FRACTION_BANK } from "@kimi/core";
import { MODELS, type ClaudeClient, type ClaudeRequest } from "@kimi/interpret";
import { kohaiRow, leaksOf, type Junior } from "./kohai-eval.ts";
import { loadJsonl } from "./dataset.ts";
import { LEAK_JUDGE_SYSTEM, judgeLine, judgedLine, sumJudged, type JudgedLine } from "./leak-judge.ts";
import { leakJudgeSection } from "./runner/sections.ts";
import { runStore } from "./runner/store.ts";
import type { Sink } from "./runner/progress.ts";
import { renderEvalsMd, type EvalsInput } from "./report.ts";

const root = new URL("../../../", import.meta.url);
const rows = loadJsonl(readFileSync(new URL("evals/data/kohai/test.jsonl", root), "utf8"), kohaiRow).slice(0, 4);
const recordOf = (id: string) => {
  const r = FRACTION_BANK.find((p) => p.world.problem_id === id);
  if (r === undefined) throw new Error(id);
  return r;
};
const quiet: Sink = { write: () => undefined };

/** A judge that flags a line when it contains `word`, as the kind given; records every request. */
function fakeJudge(word: string, kind = "answer"): ClaudeClient & { reqs: ClaudeRequest[] } {
  const reqs: ClaudeRequest[] = [];
  return {
    reqs,
    complete: async (req) => {
      reqs.push(req);
      const reveals = req.userText.includes(word);
      return { stopReason: "end_turn", text: JSON.stringify({ reveals, kind: reveals ? kind : "none" }) };
    },
  };
}

describe("judgeLine", () => {
  const record = recordOf(rows[0]?.problem_id ?? "");

  it("asks Haiku with structured output, the problem and its answer cached, the line last", async () => {
    const judge = fakeJudge("こたえ");
    const v = await judgeLine(judge, record, "こたえは12だよ");
    expect(v).toEqual({ reveals: true, kind: "answer" });
    const req = judge.reqs[0];
    expect(req?.model).toBe(MODELS.listen);
    expect(req?.system).toBe(LEAK_JUDGE_SYSTEM);
    expect(req?.userText).toContain("こたえは12だよ");
    expect(req?.cachedContext).toContain(record.world.problem_text);
    expect(JSON.stringify(req?.schema)).toContain("reveals");
    expect(req?.effort).toBe("low");
  });

  it("an empty line is not sent: nothing said reveals nothing", async () => {
    const judge = fakeJudge("x");
    expect(await judgeLine(judge, record, "")).toEqual({ reveals: false, kind: "none" });
    expect(await judgeLine(judge, record, "   ")).toEqual({ reveals: false, kind: "none" });
    expect(judge.reqs).toHaveLength(0);
  });

  it("a refusal or an answer that does not parse is unjudged (null), not a no", async () => {
    const refusing: ClaudeClient = { complete: async () => ({ stopReason: "refusal", text: "" }) };
    const garbled: ClaudeClient = { complete: async () => ({ stopReason: "end_turn", text: "{\"reveals\":\"maybe\"}" }) };
    expect(await judgeLine(refusing, record, "なんで？")).toBeNull();
    expect(await judgeLine(garbled, record, "なんで？")).toBeNull();
  });

  it("a no keeps its kind as none even if the judge named one", async () => {
    const odd: ClaudeClient = { complete: async () => ({ stopReason: "end_turn", text: JSON.stringify({ reveals: false, kind: "operation" }) }) };
    expect(await judgeLine(odd, record, "どうして？")).toEqual({ reveals: false, kind: "none" });
  });

  it("an API error is thrown (the runner records it and the item runs again on resume)", async () => {
    const down: ClaudeClient = { complete: () => Promise.reject(Object.assign(new Error("overloaded"), { status: 529 })) };
    await expect(judgeLine(down, record, "どうして？")).rejects.toThrow("overloaded");
  });
});

describe("judgedLine and the counts", () => {
  it("keeps core's gate result and the judge's verdict for the same line", async () => {
    const row = rows[0];
    if (row === undefined) throw new Error("no row");
    const record = recordOf(row.problem_id);
    const junior: Junior = { name: "j", say: async () => "それは正しいよ" };
    const out = await judgedLine(junior, fakeJudge("ぜったい"), row, record);
    expect(out.gate).toEqual(leaksOf("それは正しいよ", record, row));
    expect(out.gate).toContain("judging");
    expect(out.judge).toEqual({ reveals: false, kind: "none" });
  });

  it("counts lines flagged by the judge only, by the gate only, by both, and unjudged", () => {
    const lines: JudgedLine[] = [
      { gate: [], judge: { reveals: true, kind: "direction" } },
      { gate: [], judge: { reveals: true, kind: "value" } },
      { gate: ["answer_leak"], judge: { reveals: false, kind: "none" } },
      { gate: ["operation_name"], judge: { reveals: true, kind: "operation" } },
      { gate: [], judge: { reveals: false, kind: "none" } },
      { gate: ["judging"], judge: null },
    ];
    expect(sumJudged("j", lines)).toEqual({
      name: "j",
      lines: 6,
      unjudged: 1,
      gateFlagged: 3,
      judgeFlagged: 3,
      both: 1,
      judgeOnly: 2,
      gateOnly: 1,
      byKind: { answer: 0, value: 1, operation: 1, direction: 1 },
    });
  });
});

describe("the leak-judge section", () => {
  const juniors = (said: string) => [{ name: "talky", claude: true, make: () => ({ name: "talky", say: async () => said }) satisfies Junior }];

  it("judges every line of every junior, k times per row, and adds them up per junior", async () => {
    const judge = fakeJudge("もと", "direction");
    const out = await leakJudgeSection(
      { concurrency: 3, sink: quiet },
      {
        rows,
        tpRows: [],
        k: 2,
        notRun: [],
        juniors: [...juniors("姉がもとだよ"), { name: "quiet", claude: true, make: () => ({ name: "quiet", say: async () => "どうしてそう思ったの？" }) }],
        judge: () => judge,
      },
    );
    expect(out.complete).toBe(true);
    expect(out.result.rows).toBe(rows.length);
    expect(out.result.k).toBe(2);
    const talky = out.result.results.find((r) => r.name === "talky");
    const quietOne = out.result.results.find((r) => r.name === "quiet");
    expect(talky?.lines).toBe(rows.length * 2);
    expect(talky?.judgeFlagged).toBe(rows.length * 2);
    expect(talky?.byKind.direction).toBe(rows.length * 2);
    expect(quietOne?.judgeFlagged).toBe(0);
    expect(judge.reqs).toHaveLength(rows.length * 2 * 2);
    expect(out.result.thirdParty).toBeNull();
  });

  it("prints a start line with the planned calls (a junior call and a judge call per line)", async () => {
    const lines: string[] = [];
    await leakJudgeSection({ concurrency: 2, sink: { write: (l) => void lines.push(l) } }, { rows, tpRows: [], k: 1, notRun: [], juniors: juniors("x"), judge: () => fakeJudge("y") });
    expect(lines[0]).toMatch(/\[leak-judge\] start: 4 items; planned calls 8/);
    expect(lines.filter((l) => /^\[leak-judge\] \d+\/4/.test(l))).toHaveLength(4);
  });

  it("resume: a second run takes the saved items and calls nothing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kimi-leak-judge-"));
    const judge = fakeJudge("もと");
    const input = { rows, tpRows: [], k: 1, notRun: [], juniors: juniors("もとは姉"), judge: () => judge };
    const first = await leakJudgeSection({ concurrency: 2, sink: quiet, store: runStore(dir, "r1") }, input);
    const calls = judge.reqs.length;
    const store = runStore(dir, "r1");
    const again = await leakJudgeSection({ concurrency: 2, sink: quiet, store, resume: store.load("leak-judge"), resumedFrom: "r1" }, input);
    expect(judge.reqs.length).toBe(calls);
    expect(again.result).toEqual(first.result);
  });

  it("fail-fast: a judge whose first calls all fail stops that junior, which moves to the not-run list", async () => {
    const down: ClaudeClient = { complete: () => Promise.reject(Object.assign(new Error("bad schema"), { status: 400 })) };
    const many = loadJsonl(readFileSync(new URL("evals/data/kohai/test.jsonl", root), "utf8"), kohaiRow);
    const out = await leakJudgeSection({ concurrency: 1, sink: quiet, failFast: 5 }, { rows: many, tpRows: [], k: 1, notRun: [], juniors: juniors("x"), judge: () => down });
    expect(out.complete).toBe(false);
    expect(out.result.results).toEqual([]);
    expect(out.result.notRun[0]?.name).toBe("talky");
    expect(out.result.notRun[0]?.reason).toContain("bad schema");
  });

  it("keeps the third party's rows apart", async () => {
    const out = await leakJudgeSection({ concurrency: 2, sink: quiet }, { rows, tpRows: rows.slice(0, 2), k: 1, notRun: [], juniors: juniors("もと"), judge: () => fakeJudge("もと") });
    expect(out.result.thirdParty?.rows).toBe(2);
    expect(out.result.thirdParty?.results[0]?.lines).toBe(2);
    expect(out.result.results[0]?.lines).toBe(rows.length);
  });
});

describe("EVALS.md", () => {
  const base: EvalsInput = { interpret: { k: 1, baseline: "keyword", results: [], notRun: [] }, safety: { results: [], notRun: [] }, data: { interpret: [], safety: [] } };

  it("shows per junior the lines the judge flagged that the gate passed, and the reverse", () => {
    const md = renderEvalsMd({
      ...base,
      leakJudge: {
        rows: 20,
        k: 5,
        results: [{ name: "app", lines: 100, unjudged: 1, gateFlagged: 2, judgeFlagged: 5, both: 1, judgeOnly: 4, gateOnly: 1, byKind: { answer: 1, value: 0, operation: 1, direction: 3 } }],
        notRun: [{ name: "shushed", reason: "API キー待ち" }],
      },
    });
    expect(md).toContain("## 後輩の言葉を別のモデルで判定する（関門の網の粗さ）");
    // Ratios are over the lines the judge judged (100 lines, 1 unjudged).
    expect(md).toMatch(/\| app \| 100 \| 2 \| 5 \| 4\/99 [^|]*\| 1\/99 [^|]*\| 1 \| 1 \| 1 \| 0 \| 1 \| 3 \|/);
    expect(md).toContain("| shushed | 未実行：API キー待ち |");
  });

  it("draws no judge section when it was not run", () => {
    expect(renderEvalsMd(base)).not.toContain("関門の網の粗さ");
  });
});
