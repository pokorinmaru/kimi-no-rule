// Interpretation eval runner (指示書 第10.1節): world match, layer match, pass^k and latency per system,
// and the rows a system lost to the keyword baseline. Worlds and layers come from the real core
// (apply, sameWorld, diagnose); only the systems under test are stubs.
import { describe, expect, it } from "vitest";
import { apply, diagnose, sameWorld, type AnyOp, type ProblemRecord } from "@kimi/core";
import { PROVISIONAL } from "../../../packages/core/fixtures/problems/provisional.ts";
import { interpretRow } from "./dataset.ts";
import { lostToBaseline, runInterpretEval } from "./interpret-eval.ts";
import { wilson } from "./stats.ts";

const records = new Map<string, ProblemRecord>(PROVISIONAL.map((p) => [p.record.world.problem_id, p.record]));
const rec = (id: string): ProblemRecord => {
  const r = records.get(id);
  if (r === undefined) throw new Error(id);
  return r;
};

type Operand = { quantity_id: string } | { num: number; den: number };
const q = (quantity_id: string): Operand => ({ quantity_id });
const n = (num: number, den = 1) => ({ num, den });
const proc = (target_id: string, operands: [Operand, Operand], operation: "multiply" | "divide" | "add" | "subtract"): AnyOp =>
  ({ op: "state_procedure", target_id, operands, operation, evidence: "" }) as AnyOp;

// Expected readings, one row each (transcripts are unique so a stub can look its row up).
const EXPECTED: Record<string, { problem: string; transcript: string; ops: AnyOp[] }> = {
  a: { problem: "p_signboard", transcript: "6に3/4をかける", ops: [proc("q_otouto", [q("q_ani"), n(3, 4)], "multiply")] },
  b: {
    problem: "p_signboard",
    transcript: "弟の3/4が兄",
    ops: [{ op: "set_relation_reference", target_id: "r_ratio", reference: "q_otouto", evidence: "" } as AnyOp],
  },
  c: { problem: "p_fraction_c", transcript: "8に3/4をかける", ops: [proc("q_imo", [q("q_ane"), n(3, 4)], "multiply")] },
  d: { problem: "p_rate_c", transcript: "6に4をかける", ops: [proc("q_cookie", [n(6), q("q_box")], "multiply")] },
};

const rowsOf = (ids: string[]) =>
  ids.map((id) => {
    const e = EXPECTED[id];
    if (e === undefined) throw new Error(id);
    return interpretRow.parse({
      id,
      problem_id: e.problem,
      split: "test",
      kind: "plain",
      lang: "ja",
      transcript: e.transcript,
      expected_ops: e.ops,
      source: "author",
    });
  });

const ALL = ["a", "b", "c", "d"];
const byTranscript = (t: string): [string, { problem: string; transcript: string; ops: AnyOp[] }] => {
  const hit = Object.entries(EXPECTED).find(([, e]) => e.transcript === t);
  if (hit === undefined) throw new Error(`unknown transcript ${t}`);
  return hit;
};

type Run = { ops: AnyOp[] | null; latencyMs: number };
type System = { name: string; run: (record: ProblemRecord, transcript: string) => Promise<Run> };

const perfect = (latency: (id: string) => number = () => 5): System => ({
  name: "perfect",
  run: async (_r, t) => {
    const [id, e] = byTranscript(t);
    return { ops: structuredClone(e.ops), latencyMs: latency(id) };
  },
});
const silent: System = { name: "silent", run: async () => ({ ops: null, latencyMs: 1 }) };

/** Right on every call except the third call for row a. */
function flaky(): System {
  let callsOnA = 0;
  return {
    name: "flaky",
    run: async (_r, t) => {
      const [id, e] = byTranscript(t);
      if (id === "a") callsOnA += 1;
      if (id === "a" && callsOnA === 3) return { ops: [], latencyMs: 2 };
      return { ops: structuredClone(e.ops), latencyMs: 2 };
    },
  };
}

/** Other readings: the additive misread on a, the procedure on b, c computed from 8 as a bare number, nothing on d. */
const OTHER: Record<string, AnyOp[]> = {
  a: [
    { op: "set_relation_operator", target_id: "r_ratio", operator: "less_by", evidence: "" } as AnyOp,
    { op: "set_relation_amount", target_id: "r_ratio", number: n(3), evidence: "" } as AnyOp,
  ],
  b: [proc("q_otouto", [q("q_ani"), n(3, 4)], "multiply")],
  c: [proc("q_imo", [n(8), n(3, 4)], "multiply")],
  d: [],
};
const other: System = {
  name: "other",
  run: async (_r, t) => ({ ops: structuredClone(OTHER[byTranscript(t)[0]] ?? []), latencyMs: 3 }),
};

// Oracles built from core alone.
const worldOf = (r: ProblemRecord, ops: readonly AnyOp[]) => apply({ correct: r.world, ops }).judgeWorld;
const layersOf = (r: ProblemRecord, ops: readonly AnyOp[]) => {
  const d = diagnose({ record: r, ops, child: apply({ correct: r.world, ops }) });
  return { outcome: d.outcome, layers: d.layers };
};

type Results = Awaited<ReturnType<typeof runInterpretEval>>;
function resultOf(results: Results, name: string): Results[number] {
  const found = results.find((x) => x.name === name);
  if (found === undefined) throw new Error(`no result for ${name}`);
  return found;
}

describe("runInterpretEval", () => {
  it("a perfect system matches every row in world and layers, and passes all k runs", async () => {
    const res = await runInterpretEval({ rows: rowsOf(ALL), records, systems: [perfect()], k: 3 });
    const p = resultOf(res, "perfect");
    expect(p.worldMatch).toEqual({ k: 4, n: 4, ...wilson(4, 4) });
    expect(p.layerMatch).toEqual({ k: 4, n: 4, ...wilson(4, 4) });
    expect(p.passAllK).toEqual({ k: 4, n: 4, ...wilson(4, 4) });
    expect(p.failedRows).toEqual([]);
  });

  it("a null result is a miss everywhere", async () => {
    const res = await runInterpretEval({ rows: rowsOf(ALL), records, systems: [silent], k: 2 });
    const s = resultOf(res, "silent");
    expect(s.worldMatch).toEqual({ k: 0, n: 4, ...wilson(0, 4) });
    expect(s.layerMatch.k).toBe(0);
    expect(s.passAllK.k).toBe(0);
    expect(s.failedRows).toEqual(ALL);
  });

  it("runs each system k times per row", async () => {
    const seen: string[] = [];
    const inner = perfect();
    const counting: System = {
      name: "counting",
      run: async (r, t) => {
        seen.push(t);
        return inner.run(r, t);
      },
    };
    await runInterpretEval({ rows: rowsOf(ALL), records, systems: [counting], k: 5 });
    expect(seen).toHaveLength(4 * 5);
  });

  it("pass^k counts a row only when all k runs match; the world match counts the first run", async () => {
    const res = await runInterpretEval({ rows: rowsOf(ALL), records, systems: [flaky()], k: 3 });
    const f = resultOf(res, "flaky");
    expect(f.passAllK).toEqual({ k: 3, n: 4, ...wilson(3, 4) });
    expect(f.worldMatch.k).toBe(4);
    expect(f.failedRows).toEqual([]);
    const twice = await runInterpretEval({ rows: rowsOf(ALL), records, systems: [flaky()], k: 2 });
    expect(resultOf(twice, "flaky").passAllK.k).toBe(4);
  });

  it("world and layer matches agree with apply, sameWorld and diagnose on every row", async () => {
    const res = await runInterpretEval({ rows: rowsOf(ALL), records, systems: [other], k: 1 });
    const o = resultOf(res, "other");
    let worlds = 0;
    let layers = 0;
    const failed: string[] = [];
    for (const id of ALL) {
      const e = EXPECTED[id];
      const actual = OTHER[id];
      if (e === undefined || actual === undefined) throw new Error(id);
      const r = rec(e.problem);
      if (sameWorld(worldOf(r, e.ops), worldOf(r, actual))) worlds += 1;
      else failed.push(id);
      if (JSON.stringify(layersOf(r, e.ops)) === JSON.stringify(layersOf(r, actual))) layers += 1;
    }
    expect(o.worldMatch).toEqual({ k: worlds, n: 4, ...wilson(worlds, 4) });
    expect(o.layerMatch).toEqual({ k: layers, n: 4, ...wilson(layers, 4) });
    expect(o.failedRows).toEqual(failed);
    // The additive and procedure misreads build other worlds than the expected readings.
    expect(o.failedRows).toEqual(expect.arrayContaining(["a", "b"]));
  });

  it("reports the latency median and 95th percentile (nearest rank)", async () => {
    const latency: Record<string, number> = { a: 30, b: 10, c: 20 };
    const sys = perfect((id) => latency[id] ?? 0);
    const res = await runInterpretEval({ rows: rowsOf(["a", "b", "c"]), records, systems: [sys], k: 1 });
    expect(resultOf(res, "perfect").latency).toEqual({ median: 20, p95: 30 });
  });

  it("gives one result per system, in the order given", async () => {
    const res = await runInterpretEval({ rows: rowsOf(ALL), records, systems: [other, perfect(), silent], k: 1 });
    expect(res.map((x) => x.name)).toEqual(["other", "perfect", "silent"]);
  });

  it("fails when a row names a problem that is not in the records", async () => {
    const rows = rowsOf(["a"]).map((r) => ({ ...r, problem_id: "p_missing" }));
    await expect(runInterpretEval({ rows, records, systems: [perfect()], k: 1 })).rejects.toThrow(/p_missing/);
  });
});

describe("lostToBaseline", () => {
  /** The baseline gets rows a and c right only. */
  const baseline: System = {
    name: "keyword",
    run: async (_r, t) => {
      const [id, e] = byTranscript(t);
      return { ops: id === "a" || id === "c" ? structuredClone(e.ops) : null, latencyMs: 0 };
    },
  };

  it("lists, per system, the rows it missed that the baseline matched, in row order", async () => {
    const res = await runInterpretEval({ rows: rowsOf(ALL), records, systems: [baseline, perfect(), silent], k: 1 });
    expect(lostToBaseline(res, "keyword")).toEqual({ perfect: [], silent: ["a", "c"] });
  });

  it("fails for a baseline name that did not run", async () => {
    const res = await runInterpretEval({ rows: rowsOf(ALL), records, systems: [perfect()], k: 1 });
    expect(() => lostToBaseline(res, "keyword")).toThrow();
  });
});
