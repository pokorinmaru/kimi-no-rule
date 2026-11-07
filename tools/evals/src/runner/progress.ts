// Progress lines for long runs: a start line, one line per finished item (done/total, pct, elapsed, eta,
// failures), error lines the first time an error is seen. Every line goes to stdout and to a log file.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ItemError } from "./errors.ts";

export interface Sink {
  write(line: string): void;
}

/** Prints the line and appends it, with the local time in front, to the log. */
export function fileSink(logPath: string, print: (line: string) => void = (l) => console.log(l)): Sink {
  mkdirSync(dirname(logPath), { recursive: true });
  return {
    write: (line) => {
      print(line);
      const d = new Date();
      const p = (n: number): string => String(n).padStart(2, "0");
      appendFileSync(logPath, `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${line}\n`);
    },
  };
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export const errorText = (e: ItemError): string => `${e.class}${e.status === null ? "" : ` ${e.status}`} ${e.message}`;

export interface Progress {
  start(detail: string): void;
  /** Items taken from an earlier run: counted done, one line for all of them. */
  resumed(n: number, runId: string): void;
  done(ok: boolean): void;
  /** Items that will not run (a stopped system): taken off the total. */
  skip(n: number): void;
  error(label: string, e: ItemError): void;
  note(text: string): void;
  readonly failures: number;
}

export function createProgress(o: { section: string; total: number; sink: Sink; now?: () => number; etaAfter?: number }): Progress {
  const now = o.now ?? (() => performance.now());
  const etaAfter = o.etaAfter ?? 3;
  const started = now();
  const tag = `[${o.section}]`;
  let total = o.total;
  let done = 0;
  let fresh = 0;
  let failures = 0;
  const seen = new Set<string>();
  const line = (): string => {
    const elapsed = now() - started;
    const left = total - done;
    const eta = fresh >= etaAfter ? formatDuration((elapsed / fresh) * left) : "--:--";
    const pct = total === 0 ? 100 : (done / total) * 100;
    return `${tag} ${done}/${total} (${pct.toFixed(1)}%) elapsed ${formatDuration(elapsed)} eta ${eta} failures ${failures}`;
  };
  return {
    start: (detail) => o.sink.write(`${tag} start: ${total} items; ${detail}`),
    resumed: (n, runId) => {
      if (n === 0) return;
      done += n;
      o.sink.write(`${tag} resumed ${done}/${total} from run ${runId}`);
    },
    done: (ok) => {
      done++;
      fresh++;
      if (!ok) failures++;
      o.sink.write(line());
    },
    skip: (n) => {
      total -= n;
    },
    error: (label, e) => {
      const k = `${e.class}|${e.status ?? ""}|${e.message}`;
      if (seen.has(k)) return;
      seen.add(k);
      o.sink.write(`${tag} error ${label}: ${errorText(e)}`);
    },
    note: (text) => o.sink.write(`${tag} ${text}`),
    get failures() {
      return failures;
    },
  };
}
