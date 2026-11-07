// The four eval sections, run item by item through runTasks (bounded pool, per-item results, resume,
// fail-fast) and then counted by the frozen eval functions themselves: each finished item's outcome is
// replayed, in the order those functions ask, into runInterpretEval and runSafetyEval. runLeakEval and
// runResearchEval add up per line and per episode; their sums are repeated here as they are written there
// (sections.test.ts checks both give the same numbers). Nothing a child says and no reply text is saved:
// an item keeps the ops, the safety flag, the leak kinds, or the episode outcome.
import { FRACTION_BANK, type AnyOp, type ProblemRecord } from "@kimi/core";
import type { InterpretRow, SafetyRow } from "../dataset.ts";
import { runInterpretEval, type EvalSystem, type SystemResult } from "../interpret-eval.ts";
import { leaksOf, type Junior, type KohaiRow, type Leak, type LeakResult } from "../kohai-eval.ts";
import type { NotRun } from "../report.ts";
import type { ChildKind, SimChild } from "../research-children.ts";
import { runEpisode, type Episode, type Researcher, type ResearchResult } from "../research-eval.ts";
import { runSafetyEval, type Flag, type SafetyResult } from "../safety-eval.ts";
import { describeError, type CallLog, type ItemError } from "./errors.ts";
import { errorText } from "./progress.ts";
import type { ItemRecord } from "./store.ts";
import { runTasks, type Task, type TaskContext, type TaskRun } from "./tasks.ts";

export type SectionContext = TaskContext;

export interface SectionOutcome<R> {
  result: R;
  /** False when a system was stopped by the fail-fast. */
  complete: boolean;
  items: number;
  errors: number;
  aborted: { system: string; error: ItemError }[];
}

/** A system of a section: `make` gets the item's call log, to hand to a recording client. */
export interface Named<T> {
  name: string;
  claude: boolean;
  make(log: CallLog): T;
}

const stoppedReason = (n: number, e: ItemError): string => `止めた：最初の ${n} 回の呼び出しがすべてエラー（${errorText(e)}）`;

function outcome<R>(result: R, run: TaskRun<unknown>): SectionOutcome<R> {
  const done = run.records.filter((r): r is ItemRecord => r !== null);
  return {
    result,
    complete: run.aborted.size === 0,
    items: done.length,
    errors: done.filter((r) => !r.ok).length,
    aborted: [...run.aborted].map(([system, error]) => ({ system, error })),
  };
}

/** The payloads of one system's items, in task order (a stopped system has none). */
function payloadsOf<P>(tasks: readonly Task<P>[], run: TaskRun<P>, system: string, row?: (r: string) => boolean): P[] {
  const out: P[] = [];
  tasks.forEach((t, i) => {
    const rec = run.records[i];
    if (t.system === system && (row === undefined || row(t.row)) && rec !== null && rec !== undefined) out.push(rec.payload);
  });
  return out;
}

const cursor = <P>(items: readonly P[]): (() => P) => {
  let i = 0;
  return () => {
    if (i >= items.length) throw new Error("replay ran past the saved items");
    return items[i++] as P;
  };
};

// ---- interpretation -------------------------------------------------------------------------------------------

export interface InterpretPayload {
  ops: AnyOp[] | null;
  latencyMs: number;
}

export interface InterpretSectionResult {
  k: number;
  baseline: string;
  results: SystemResult[];
  notRun: NotRun[];
}

export async function interpretSection(
  ctx: SectionContext,
  input: { rows: readonly InterpretRow[]; records: ReadonlyMap<string, ProblemRecord>; systems: readonly Named<EvalSystem>[]; k: number; baseline: string; notRun: readonly NotRun[] },
): Promise<SectionOutcome<InterpretSectionResult>> {
  const tasks: Task<InterpretPayload>[] = [];
  for (const s of input.systems) {
    for (const row of input.rows) {
      const record = input.records.get(row.problem_id);
      if (record === undefined) throw new Error(`row ${row.id}: no problem ${row.problem_id}`);
      for (let attempt = 0; attempt < input.k; attempt++) {
        tasks.push({
          system: s.name,
          row: row.id,
          attempt,
          claude: s.claude,
          run: async (log) => {
            const started = performance.now();
            try {
              return await s.make(log).run(record, row.transcript);
            } catch (e) {
              // As runInterpretEval counts it: a miss that still took its time.
              log.errors.push(describeError(e));
              return { ops: null, latencyMs: Math.round(performance.now() - started) };
            }
          },
          fallback: () => ({ ops: null, latencyMs: 0 }),
        });
      }
    }
  }
  const run = await runTasks("interpret", tasks, ctx);
  const kept = input.systems.filter((s) => !run.aborted.has(s.name));
  const replay: EvalSystem[] = kept.map((s) => {
    const next = cursor(payloadsOf(tasks, run, s.name));
    return { name: s.name, run: async () => next() };
  });
  const results = await runInterpretEval({ rows: input.rows, records: input.records, systems: replay, k: input.k });
  const notRun = [...[...run.aborted].map(([name, e]) => ({ name, reason: stoppedReason(ctx.failFast ?? 10, e) })), ...input.notRun];
  return outcome({ k: input.k, baseline: input.baseline, results, notRun }, run);
}

// ---- safety ---------------------------------------------------------------------------------------------------

export interface SafetySectionResult {
  results: { name: string; result: SafetyResult }[];
  notRun: NotRun[];
  /** The same checks on the rows a third party wrote, apart (null when there are none). */
  thirdParty: { rows: number; results: { name: string; result: SafetyResult }[] } | null;
}

type Check = (transcript: string) => Promise<Flag>;

export async function safetySection(
  ctx: SectionContext,
  input: { rows: readonly SafetyRow[]; tpRows: readonly SafetyRow[]; checks: readonly Named<Check>[]; notRun: readonly NotRun[] },
): Promise<SectionOutcome<SafetySectionResult>> {
  const sets = [
    { set: "ai", rows: input.rows },
    { set: "tp", rows: input.tpRows },
  ];
  const tasks: Task<Flag>[] = [];
  for (const c of input.checks) {
    for (const { set, rows } of sets) {
      for (const row of rows) {
        tasks.push({ system: c.name, row: `${set}/${row.id}`, attempt: 0, claude: c.claude, run: async (log) => c.make(log)(row.transcript), fallback: () => "none" });
      }
    }
  }
  const run = await runTasks("safety", tasks, ctx);
  const kept = input.checks.filter((c) => !run.aborted.has(c.name));
  const on = async (set: string, rows: readonly SafetyRow[]) =>
    Promise.all(
      kept.map(async (c) => {
        const next = cursor(payloadsOf(tasks, run, c.name, (r) => r.startsWith(`${set}/`)));
        return { name: c.name, result: await runSafetyEval(rows, async () => next()) };
      }),
    );
  const results = await on("ai", input.rows);
  const thirdParty = input.tpRows.length === 0 ? null : { rows: input.tpRows.length, results: await on("tp", input.tpRows) };
  const notRun = [...[...run.aborted].map(([name, e]) => ({ name, reason: stoppedReason(ctx.failFast ?? 10, e) })), ...input.notRun];
  return outcome({ results, notRun, thirdParty }, run);
}

// ---- the junior's-words leak ----------------------------------------------------------------------------------

export interface LeakSectionResult {
  results: LeakResult[];
  notRun: NotRun[];
  rows: number;
  k: number;
  thirdParty: { rows: number; results: LeakResult[] } | null;
}

/** As runLeakEval adds up: one line per say, leaked when it has any leak, each kind counted. */
function sumLeaks(name: string, lines: readonly Leak[][]): LeakResult {
  const r: LeakResult = { name, lines: 0, leaked: 0, byKind: { answer_leak: 0, operation_name: 0, judging: 0 } };
  for (const leaks of lines) {
    r.lines++;
    if (leaks.length > 0) r.leaked++;
    for (const l of leaks) r.byKind[l]++;
  }
  return r;
}

export async function leakSection(
  ctx: SectionContext,
  input: { rows: readonly KohaiRow[]; tpRows: readonly KohaiRow[]; juniors: readonly Named<Junior>[]; k: number; notRun: readonly NotRun[] },
): Promise<SectionOutcome<LeakSectionResult>> {
  const recordOf = (row: KohaiRow): ProblemRecord => {
    const record = FRACTION_BANK.find((p) => p.world.problem_id === row.problem_id);
    if (record === undefined) throw new Error(`row ${row.id}: no problem ${row.problem_id}`);
    return record;
  };
  const sets = [
    { set: "ai", rows: input.rows },
    { set: "tp", rows: input.tpRows },
  ];
  const tasks: Task<Leak[]>[] = [];
  for (const j of input.juniors) {
    for (const { set, rows } of sets) {
      for (const row of rows) {
        const record = recordOf(row);
        for (let attempt = 0; attempt < input.k; attempt++) {
          tasks.push({
            system: j.name,
            row: `${set}/${row.id}`,
            attempt,
            claude: j.claude,
            run: async (log) => leaksOf(await j.make(log).say(row, record), record, row),
            // A say that threw counts as an empty line (what a junior says when Claude gives nothing back).
            fallback: () => leaksOf("", record, row),
          });
        }
      }
    }
  }
  const run = await runTasks("leak", tasks, ctx);
  const kept = input.juniors.filter((j) => !run.aborted.has(j.name));
  const on = (set: string) => kept.map((j) => sumLeaks(j.name, payloadsOf(tasks, run, j.name, (r) => r.startsWith(`${set}/`))));
  const notRun = [...[...run.aborted].map(([name, e]) => ({ name, reason: stoppedReason(ctx.failFast ?? 10, e) })), ...input.notRun];
  return outcome(
    { results: on("ai"), notRun, rows: input.rows.length, k: input.k, thirdParty: input.tpRows.length === 0 ? null : { rows: input.tpRows.length, results: on("tp") } },
    run,
  );
}

// ---- research -------------------------------------------------------------------------------------------------

export interface ResearchSectionResult {
  results: ResearchResult[];
  notRun: NotRun[];
  seeds: number;
  maxProblems: number;
}

const KINDS: readonly ChildKind[] = ["listed", "inside", "outside", "inexpressible"];

/** As runResearchEval adds up the episodes of one researcher. */
function sumEpisodes(name: string, episodes: readonly Episode[]): ResearchResult {
  const byKind = Object.fromEntries(KINDS.map((k) => [k, { episodes: 0, recovered: 0, falseConfirmations: 0, confirmedAfter: [] as number[] }])) as ResearchResult["byKind"];
  for (const e of episodes) {
    const row = byKind[e.kind];
    row.episodes++;
    if (e.recovered) row.recovered++;
    if (e.falseConfirmation) row.falseConfirmations++;
    if (e.confirmedAfter !== null && e.recovered) row.confirmedAfter.push(e.confirmedAfter);
  }
  return { name, byKind };
}

export async function researchSection(
  ctx: SectionContext,
  input: {
    researchers: readonly (Named<Researcher> & { seeds: readonly number[] })[];
    children: readonly SimChild[];
    bank: readonly ProblemRecord[];
    notRun: readonly NotRun[];
    /** The seeds count the report names (the baselines'). */
    seedsShown: number;
    maxProblems?: number;
  },
): Promise<SectionOutcome<ResearchSectionResult>> {
  const tasks: Task<Episode>[] = [];
  for (const r of input.researchers) {
    for (const child of input.children) {
      for (const seed of r.seeds) {
        // One episode is sequential inside (problem after problem); episodes run side by side in the pool.
        tasks.push({
          system: r.name,
          row: child.id,
          attempt: seed,
          claude: r.claude,
          run: async (log) => runEpisode(r.make(log), child, input.bank, seed),
          fallback: () => ({ child: child.id, kind: child.kind, seed, confirmedAfter: null, recovered: false, falseConfirmation: false }),
        });
      }
    }
  }
  const run = await runTasks("research", tasks, ctx);
  const results = input.researchers.filter((r) => !run.aborted.has(r.name)).map((r) => sumEpisodes(r.name, payloadsOf(tasks, run, r.name)));
  const notRun = [...[...run.aborted].map(([name, e]) => ({ name, reason: stoppedReason(ctx.failFast ?? 10, e) })), ...input.notRun];
  return outcome({ results, notRun, seeds: input.seedsShown, maxProblems: input.maxProblems ?? 9 }, run);
}
