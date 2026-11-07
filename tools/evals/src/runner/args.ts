// The eval CLI's options.
//   --live                  also the Claude systems (needs ANTHROPIC_API_KEY)
//   --only a,b              sections to run now (interpret, safety, leak, research); default all
//   --concurrency N         Claude calls in flight at once (default 8)
//   --resume <runId>        continue that run: finished items are skipped, failed ones run again
//   --fail-fast N           stop a system when its first N calls all fail (default 10)
//   --split tune            the tuning rows (printed, never written to EVALS.md)
//   --out <path>            where EVALS.md goes (default the repository's EVALS.md)
//   --results <dir>         where results and progress.log go (default evals/results)
import { SECTIONS, type SectionName } from "./store.ts";
import { DEFAULT_FAIL_FAST } from "./tasks.ts";

export interface EvalArgs {
  live: boolean;
  only: SectionName[];
  concurrency: number;
  resume: string | null;
  failFast: number;
  split: "test" | "tune";
  out: string | null;
  results: string | null;
}

const positiveInt = (name: string, v: string | undefined): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} needs a positive whole number, got ${String(v)}`);
  return n;
};

export function parseArgs(argv: readonly string[]): EvalArgs {
  const a: EvalArgs = { live: false, only: [...SECTIONS], concurrency: 8, resume: null, failFast: DEFAULT_FAIL_FAST, split: "test", out: null, results: null };
  const args = argv.filter((x) => x !== "--");
  for (let i = 0; i < args.length; i++) {
    const x = args[i];
    const value = (): string => {
      const v = args[++i];
      if (v === undefined) throw new Error(`${String(x)} needs a value`);
      return v;
    };
    switch (x) {
      case "--live":
        a.live = true;
        break;
      case "--only": {
        const names = value().split(",").map((s) => s.trim()).filter((s) => s !== "");
        for (const n of names) if (!(SECTIONS as readonly string[]).includes(n)) throw new Error(`unknown section ${n} (sections: ${SECTIONS.join(", ")})`);
        a.only = SECTIONS.filter((s) => names.includes(s));
        break;
      }
      case "--concurrency":
        a.concurrency = positiveInt("--concurrency", value());
        break;
      case "--resume":
        a.resume = value();
        break;
      case "--fail-fast":
        a.failFast = positiveInt("--fail-fast", value());
        break;
      case "--split": {
        const v = value();
        if (v !== "test" && v !== "tune") throw new Error(`--split is test or tune, got ${v}`);
        a.split = v;
        break;
      }
      case "--out":
        a.out = value();
        break;
      case "--results":
        a.results = value();
        break;
      default:
        throw new Error(`unknown option ${String(x)}`);
    }
  }
  return a;
}
