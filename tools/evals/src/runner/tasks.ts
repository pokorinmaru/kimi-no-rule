// Runs a section's items through the bounded pool: each finished item is saved as one JSON line and printed as
// one progress line; items finished in an earlier run (--resume) are taken as they are; an item whose calls
// failed is recorded with the error, and its fallback (what the evaluated code would have counted) stands in.
// Fail-fast: when the first `failFast` finished items of a Claude system all failed, the rest of it is skipped.
import { describeError, newCallLog, type CallLog, type ItemError } from "./errors.ts";
import { mapPool } from "./pool.ts";
import { createProgress, errorText, type Sink } from "./progress.ts";
import type { ItemRecord, RunStore } from "./store.ts";

export interface Task<P> {
  system: string;
  /** The row id (with its set when a section has more than one, e.g. tp/s-01). */
  row: string;
  attempt: number;
  /** Whether the item calls Claude (counted in the planned calls; the fail-fast looks only at these). */
  claude: boolean;
  run(log: CallLog): Promise<P>;
  /** What stands in when run throws. */
  fallback(): P;
}

export const taskKey = (t: { system: string; row: string; attempt: number }): string => `${t.system}|${t.row}|${t.attempt}`;

export interface TaskContext {
  concurrency: number;
  sink: Sink;
  store?: RunStore;
  resume?: ReadonlyMap<string, ItemRecord>;
  resumedFrom?: string;
  failFast?: number;
  now?: () => number;
}

export interface TaskRun<P> {
  /** In task order; null for items skipped because their system was stopped. */
  records: (ItemRecord<P> | null)[];
  aborted: Map<string, ItemError>;
}

export const DEFAULT_FAIL_FAST = 10;

export async function runTasks<P>(section: string, tasks: readonly Task<P>[], ctx: TaskContext): Promise<TaskRun<P>> {
  const now = ctx.now ?? (() => performance.now());
  const failFast = ctx.failFast ?? DEFAULT_FAIL_FAST;
  const progress = createProgress({ section, total: tasks.length, sink: ctx.sink, now });
  const planned = new Map<string, number>();
  for (const t of tasks) if (t.claude) planned.set(t.system, (planned.get(t.system) ?? 0) + 1);
  const plannedTotal = [...planned.values()].reduce((a, b) => a + b, 0);
  progress.start(
    `planned calls ${plannedTotal}${planned.size === 0 ? "" : ` (${[...planned].map(([s, n]) => `${s} ${n}`).join(", ")})`}; concurrency ${ctx.concurrency}`,
  );

  const records: (ItemRecord<P> | null)[] = new Array<ItemRecord<P> | null>(tasks.length).fill(null);
  const todo: number[] = [];
  tasks.forEach((t, i) => {
    const prev = ctx.resume?.get(taskKey(t));
    if (prev !== undefined && prev.ok) records[i] = prev as ItemRecord<P>;
    else todo.push(i);
  });
  progress.resumed(tasks.length - todo.length, ctx.resumedFrom ?? "?");

  const first = new Map<string, boolean[]>();
  const aborted = new Map<string, ItemError>();
  const started = new Set<number>();

  await mapPool(todo, ctx.concurrency, async (i) => {
    const t = tasks[i] as Task<P>;
    if (aborted.has(t.system)) return;
    started.add(i);
    const log = newCallLog();
    const t0 = now();
    let payload: P;
    let error: ItemError | null = null;
    try {
      payload = await t.run(log);
    } catch (e) {
      error = describeError(e);
      payload = t.fallback();
    }
    error ??= log.errors[0] ?? null;
    const rec: ItemRecord<P> = { key: taskKey(t), system: t.system, row: t.row, attempt: t.attempt, ok: error === null, error, calls: log.calls, ms: Math.round(now() - t0), payload };
    records[i] = rec;
    ctx.store?.append(section, rec);
    if (error !== null) progress.error(`${t.system} ${t.row}#${t.attempt}`, error);
    progress.done(error === null);

    if (!t.claude || aborted.has(t.system)) return;
    const seen = first.get(t.system) ?? [];
    if (seen.length >= failFast) return;
    seen.push(error !== null);
    first.set(t.system, seen);
    if (seen.length === failFast && seen.every((x) => x) && error !== null) {
      aborted.set(t.system, error);
      const rest = todo.filter((j) => tasks[j]?.system === t.system && !started.has(j)).length;
      progress.skip(rest);
      progress.note(`stopped ${t.system}: the first ${failFast} calls all failed (${errorText(error)}); ${rest} items skipped`);
    }
  });
  return { records, aborted };
}
