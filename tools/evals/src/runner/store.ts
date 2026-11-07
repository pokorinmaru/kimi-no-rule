// Results kept on disk under evals/results (gitignored): one folder per run, named by its local start time.
//   <runId>/<section>.jsonl        one JSON line per finished item (system, row, attempt), appended as it finishes
//   <runId>/<section>.result.json  the section's numbers, written when the section has finished
// EVALS.md takes each section from the run that made it now, or from the latest finished run of that section.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ItemError } from "./errors.ts";

export const SECTIONS = ["interpret", "safety", "leak", "research"] as const;
export type SectionName = (typeof SECTIONS)[number];

export interface ItemRecord<P = unknown> {
  key: string;
  system: string;
  row: string;
  attempt: number;
  ok: boolean;
  error: ItemError | null;
  calls: number;
  ms: number;
  payload: P;
}

export interface SectionFile<R = unknown> {
  section: SectionName;
  runId: string;
  /** Local time with its offset, e.g. 2026-11-07 15:30:12 +09:00. */
  finishedAt: string;
  live: boolean;
  split: "test" | "tune";
  /** False when a system was stopped by the fail-fast: such a run is not taken for later renders. */
  complete: boolean;
  items: number;
  errors: number;
  aborted: { system: string; error: ItemError }[];
  result: R;
}

const p2 = (n: number): string => String(n).padStart(2, "0");

export function newRunId(d: Date): string {
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
}

export function formatLocal(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const a = Math.abs(off);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())} ${sign}${p2(Math.floor(a / 60))}:${p2(a % 60)}`;
}

export interface RunStore {
  dir: string;
  runId: string;
  append(section: string, rec: ItemRecord): void;
  /** The items finished so far; when a key was written twice (a rerun of a failed item), the last line wins. */
  load(section: string): Map<string, ItemRecord>;
  saveSection(file: SectionFile): void;
}

export function runStore(resultsDir: string, runId: string): RunStore {
  const dir = join(resultsDir, runId);
  return {
    dir,
    runId,
    append: (section, rec) => {
      mkdirSync(dir, { recursive: true });
      appendFileSync(join(dir, `${section}.jsonl`), `${JSON.stringify(rec)}\n`);
    },
    load: (section) => {
      const out = new Map<string, ItemRecord>();
      const p = join(dir, `${section}.jsonl`);
      if (!existsSync(p)) return out;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        if (line.trim() === "") continue;
        try {
          const rec = JSON.parse(line) as ItemRecord;
          out.set(rec.key, rec);
        } catch {
          // a line cut short when the run was stopped: that item runs again
        }
      }
      return out;
    },
    saveSection: (file) => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${file.section}.result.json`), `${JSON.stringify(file, null, 1)}\n`);
    },
  };
}

/** The latest finished result of a section on a split: a live run when there is one, else the latest of any. */
export function latestSection(resultsDir: string, section: SectionName, opts: { split: "test" | "tune" }): SectionFile | null {
  if (!existsSync(resultsDir)) return null;
  const found: SectionFile[] = [];
  for (const runId of readdirSync(resultsDir).sort().reverse()) {
    const p = join(resultsDir, runId, `${section}.result.json`);
    if (!existsSync(p)) continue;
    try {
      const f = JSON.parse(readFileSync(p, "utf8")) as SectionFile;
      if (f.complete && f.split === opts.split) found.push(f);
    } catch {
      // an unreadable file is skipped
    }
  }
  return found.find((f) => f.live) ?? found[0] ?? null;
}
