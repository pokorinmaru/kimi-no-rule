// M2: the interpretation eval (指示書 第10.1節). Each system hears every row k times. A row matches when
// the child world its ops build is the same world (core sameWorld) as the one the expected ops build;
// the layers match when diagnose gives the same outcome and layers. The first run counts for the world
// and layer match; pass^k counts rows where all k runs match. A run that throws or returns null misses.
import { apply, diagnose, sameWorld, type AnyOp, type ProblemRecord, type WorldScene } from "@kimi/core";
import type { InterpretRow } from "./dataset.ts";
import { median, percentile, wilson } from "./stats.ts";

export interface EvalSystem {
  name: string;
  run(record: ProblemRecord, transcript: string): Promise<{ ops: AnyOp[] | null; latencyMs: number }>;
}

export interface Rate {
  k: number;
  n: number;
  low: number;
  high: number;
}

export interface SystemResult {
  name: string;
  worldMatch: Rate;
  layerMatch: Rate;
  /** The layer match on the rows whose expected reading has a layer: saying nothing cannot match these (Q27). */
  layeredMatch: Rate;
  passAllK: Rate;
  latency: { median: number; p95: number } | null;
  failedRows: string[];
}

export const rate = (k: number, n: number): Rate => ({ k, n, ...wilson(k, n) });

function childOf(record: ProblemRecord, ops: readonly AnyOp[]): { world: WorldScene; layers: string; layered: boolean } | null {
  try {
    const child = apply({ correct: record.world, ops });
    const d = diagnose({ record, ops, child });
    return { world: child.judgeWorld, layers: JSON.stringify({ outcome: d.outcome, layers: d.layers }), layered: d.layers.length > 0 };
  } catch {
    return null;
  }
}

export async function runInterpretEval(input: {
  rows: readonly InterpretRow[];
  records: ReadonlyMap<string, ProblemRecord>;
  systems: readonly EvalSystem[];
  k: number;
}): Promise<SystemResult[]> {
  const { rows, records, systems, k } = input;
  if (!Number.isInteger(k) || k < 1) throw new Error(`bad k ${k}`);
  const expected = rows.map((row) => {
    const record = records.get(row.problem_id);
    if (record === undefined) throw new Error(`row ${row.id}: no problem ${row.problem_id}`);
    const child = childOf(record, row.expected_ops);
    if (child === null) throw new Error(`row ${row.id}: the expected ops do not apply`);
    return { row, record, child };
  });

  const out: SystemResult[] = [];
  for (const system of systems) {
    let worlds = 0;
    let layers = 0;
    let layered = 0;
    let all = 0;
    const failed: string[] = [];
    const latencies: number[] = [];
    for (const e of expected) {
      let every = true;
      for (let i = 0; i < k; i++) {
        let ops: AnyOp[] | null;
        const started = performance.now();
        try {
          const res = await system.run(e.record, e.row.transcript);
          ops = res.ops;
          latencies.push(res.latencyMs);
        } catch {
          // A failed run still took its time (Q27).
          ops = null;
          latencies.push(Math.round(performance.now() - started));
        }
        const got = ops === null ? null : childOf(e.record, ops);
        const worldOk = got !== null && sameWorld(e.child.world, got.world);
        if (i === 0) {
          if (worldOk) worlds++;
          else failed.push(e.row.id);
          if (got !== null && got.layers === e.child.layers) {
            layers++;
            if (e.child.layered) layered++;
          }
        }
        if (!worldOk) every = false;
      }
      if (every) all++;
    }
    out.push({
      name: system.name,
      worldMatch: rate(worlds, expected.length),
      layerMatch: rate(layers, expected.length),
      layeredMatch: rate(layered, expected.filter((x) => x.child.layered).length),
      passAllK: rate(all, expected.length),
      latency: latencies.length === 0 ? null : { median: median(latencies), p95: percentile(latencies, 95) },
      failedRows: failed,
    });
  }
  return out;
}

/** Per system other than the baseline: the rows it missed that the baseline matched, in row order. */
export function lostToBaseline(results: readonly SystemResult[], baselineName: string): Record<string, string[]> {
  const base = results.find((r) => r.name === baselineName);
  if (base === undefined) throw new Error(`no result for the baseline ${baselineName}`);
  const baseFailed = new Set(base.failedRows);
  const out: Record<string, string[]> = {};
  for (const r of results) if (r.name !== baselineName) out[r.name] = r.failedRows.filter((id) => !baseFailed.has(id));
  return out;
}
