// The offline bank of discriminating problems (指示書 第6.7節 手順3; Q33). It finds the reading pairs the bank
// does not tell apart (core predict), has Opus write problems for them through packages/interpret
// writeDiscriminating (which runs the one build of 第6.6節 and core's checks), and writes the kept records to
// content/problems/discriminating, unchecked by a person. checkStored runs core again on every stored record.
// The build log holds the answers, so it is marked for adults.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  COMMON_FRACTION_READINGS,
  eq,
  fromSchema,
  problemConditions,
  schemas,
  solve,
  validateStatements,
  validateWorld,
  type Hypothesis,
  type ProblemRecord,
} from "@kimi/core";
import { formatBuildLog, splitsPair, writeDiscriminating, type BuildDeps, type DiscriminateOptions } from "@kimi/interpret";
// The research eval's simulated children (their readings only; their words are not used here).
import { SIM_CHILDREN } from "../../evals/src/research-children.ts";

/** At most this many pairs per run, and this many problems asked for each (the cap of Q33). */
export const MAX_PAIRS = 4;
export const PER_PAIR = 2;
/** A pair the bank splits on at most this many problems still needs problems. */
export const WEAK_SPLITS = 1;

export const PAIRS_FILE = "pairs.json";
export const LOG_FILE = "build-log.adult-only.md";
const LOG_HEAD = "# 見分け問題の組み立ての記録（大人向け：答えが書いてあります。子どもに見せないこと）";

const sameRule = (a: Hypothesis, b: Hypothesis): boolean => JSON.stringify(a.clauses) === JSON.stringify(b.clauses);

/** The common readings, then the eval's simulated children's readings that are not among them. */
export const PAIR_READINGS: readonly Hypothesis[] = (() => {
  const out: Hypothesis[] = [...COMMON_FRACTION_READINGS];
  for (const c of SIM_CHILDREN) {
    if (c.rule === null) continue;
    const rule = c.rule;
    if (out.some((h) => h.id === rule.id || sameRule(h, rule))) continue;
    out.push(rule);
  }
  return out;
})();

export interface WeakPair {
  a: Hypothesis;
  b: Hypothesis;
  /** How many problems of the bank the two readings build different worlds on. */
  splits: number;
}

const splitsSafe = (r: ProblemRecord, a: Hypothesis, b: Hypothesis): boolean => {
  try {
    return splitsPair(r, a, b);
  } catch {
    return false;
  }
};

/** The pairs (each with a common reading) that the bank splits at most WEAK_SPLITS times, fewest first. */
export function weakPairs(bank: readonly ProblemRecord[], opts: { maxSplits?: number; cap?: number } = {}): WeakPair[] {
  const maxSplits = opts.maxSplits ?? WEAK_SPLITS;
  const common = new Set(COMMON_FRACTION_READINGS.map((h) => h.id));
  const out: WeakPair[] = [];
  PAIR_READINGS.forEach((a, i) => {
    for (const b of PAIR_READINGS.slice(i + 1)) {
      if (!common.has(a.id) && !common.has(b.id)) continue;
      if (sameRule(a, b)) continue;
      const splits = bank.filter((r) => splitsSafe(r, a, b)).length;
      if (splits <= maxSplits) out.push({ a, b, splits });
    }
  });
  // A stable sort keeps the reading order among equal counts.
  return out.sort((x, y) => x.splits - y.splits).slice(0, opts.cap ?? MAX_PAIRS);
}

export interface CallCount {
  problems: number;
  opusTypical: number;
  opusMax: number;
  haikuMax: number;
}

/**
 * The Claude calls a run may make: per pair one writer call (two with the retry); per problem two builds of up
 * to maxTurns agent turns each and three judge calls (restate, sentences, misreads; each with one retry), and up
 * to misreadCount Haiku calls for the misread check. "Typical" takes five turns a build and no retry.
 */
export function expectedCalls(pairs: number, opts: { perPair?: number; maxTurns?: number; misreadCount?: number } = {}): CallCount {
  const perPair = opts.perPair ?? PER_PAIR;
  const maxTurns = opts.maxTurns ?? 12;
  const problems = pairs * perPair;
  return {
    problems,
    opusTypical: pairs + problems * (2 * 5 + 3),
    opusMax: pairs * 2 + problems * (2 * maxTurns + 3 * 2),
    haikuMax: problems * (opts.misreadCount ?? 20),
  };
}

export interface StoredPair {
  readingA: Hypothesis;
  readingB: Hypothesis;
}

export interface Stored {
  records: ProblemRecord[];
  pairs: Record<string, StoredPair>;
}

const recordFiles = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json") && f !== PAIRS_FILE).sort() : []);

function readPairs(dir: string): Record<string, StoredPair> {
  const p = join(dir, PAIRS_FILE);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as Record<string, StoredPair>) : {};
}

/** The records already in the folder (those that read as records) and the pairs they were written for. */
export function readStored(dir: string): Stored {
  const records: ProblemRecord[] = [];
  for (const f of recordFiles(dir)) {
    const parsed = schemas.problemRecord.safeParse(JSON.parse(readFileSync(join(dir, f), "utf8")));
    if (parsed.success) records.push(parsed.data);
  }
  return { records, pairs: readPairs(dir) };
}

export interface Made {
  accepted: ProblemRecord[];
  pairs: Record<string, StoredPair>;
  log: string;
}

const answerText = (r: ProblemRecord): string => (r.expected_answer === null ? "なし" : `${r.expected_answer.num}/${r.expected_answer.den}`);

/** What the caller hears after each pair (the CLI prints a progress line). */
export interface PairDone {
  pair: WeakPair;
  /** 1-based. */
  index: number;
  total: number;
  kept: number;
  refused: number;
  /** True when the writer gave no problem text for the pair. */
  noReply: boolean;
}

/** One writeDiscriminating per pair; the new records are numbered past those already stored. */
export async function makeDiscriminating(
  deps: BuildDeps,
  input: { pairs: readonly WeakPair[]; bank: readonly ProblemRecord[]; stored: Stored },
  opts: DiscriminateOptions = {},
  hooks: { onPair?(done: PairDone): void } = {},
): Promise<Made> {
  const made: Made = { accepted: [], pairs: {}, log: "" };
  const lines: string[] = [];
  const known = [...input.bank, ...input.stored.records];
  for (const [n, pair] of input.pairs.entries()) {
    let kept = 0;
    const idPrefix = `p_disc_${pair.a.id}_${pair.b.id}`;
    const taken = [...known, ...made.accepted].map((r) => r.world.problem_id).filter((id) => id.startsWith(`${idPrefix}_`));
    const startIndex = 1 + Math.max(0, ...taken.map((id) => Number(id.slice(idPrefix.length + 1))).filter((n) => Number.isInteger(n)));
    const res = await writeDiscriminating(
      deps,
      { readingA: pair.a, readingB: pair.b, bank: known, avoidTexts: [...known, ...made.accepted].map((r) => r.world.problem_text) },
      { count: PER_PAIR as 1 | 2, ...opts, idPrefix, startIndex },
    );
    lines.push(`## ${pair.a.id} と ${pair.b.id}（銀行で分かれる問題 ${String(pair.splits)}）`, "");
    if (res.writer === "no_reply") lines.push("問題の文が返りませんでした（拒否・時間切れ・形の誤り）。", "");
    for (const item of res.results) {
      lines.push(formatBuildLog(item.problemId, item.log), `問題の文：${item.text}`);
      const rec = res.accepted.find((r) => r.world.problem_id === item.problemId);
      if (item.status === "accepted" && rec !== undefined) {
        lines.push(`採用（人の確認待ち）。答え：${answerText(rec)}`, "");
        made.accepted.push(rec);
        made.pairs[item.problemId] = { readingA: pair.a, readingB: pair.b };
        kept++;
      } else {
        lines.push(`不採用：${item.reason ?? "unknown"}${item.buildReason === undefined ? "" : `（${item.buildReason}）`}`, "");
      }
    }
    hooks.onPair?.({ pair, index: n + 1, total: input.pairs.length, kept, refused: res.results.length - kept, noReply: res.writer === "no_reply" });
  }
  made.log = `${lines.join("\n").trimEnd()}\n`;
  return made;
}

/** Writes the records (never checked by a person here), merges the pairs, and appends the log. */
export function writeMade(dir: string, made: Made): void {
  mkdirSync(dir, { recursive: true });
  for (const r of made.accepted) {
    const record = schemas.problemRecord.parse({ ...r, checks: { ...r.checks, human_checked: false } });
    writeFileSync(join(dir, `${record.world.problem_id}.json`), `${JSON.stringify(record, null, 2)}\n`);
  }
  writeFileSync(join(dir, PAIRS_FILE), `${JSON.stringify({ ...readPairs(dir), ...made.pairs }, null, 2)}\n`);
  const logPath = join(dir, LOG_FILE);
  const head = existsSync(logPath) ? "\n" : `${LOG_HEAD}\n\n`;
  appendFileSync(logPath, `${head}${made.log}`);
}

/** core's checks again on every stored record: what CI runs (pnpm check:discriminating). */
export function checkStored(dir: string): { records: number; errors: string[] } {
  const errors: string[] = [];
  const files = recordFiles(dir);
  let pairs: Record<string, StoredPair> = {};
  try {
    pairs = readPairs(dir);
  } catch (e) {
    errors.push(`${PAIRS_FILE}: ${e instanceof Error ? e.message : String(e)}`);
  }
  for (const f of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(join(dir, f), "utf8"));
    } catch (e) {
      errors.push(`${f}: not JSON (${e instanceof Error ? e.message : String(e)})`);
      continue;
    }
    const parsed = schemas.problemRecord.safeParse(raw);
    if (!parsed.success) {
      errors.push(`${f}: not a problem record (${parsed.error.issues.map((i) => i.path.join(".")).join(", ")})`);
      continue;
    }
    const r = parsed.data;
    const id = r.world.problem_id;
    const err = (m: string): void => {
      errors.push(`${id}: ${m}`);
    };
    if (f !== `${id}.json`) errors.push(`${f}: the file name does not match problem_id ${id}`);
    if (r.source !== "discriminating_bank") err(`source is ${r.source}, not discriminating_bank`);
    try {
      const w = validateWorld(r.world);
      if (!w.ok) {
        err(`invalid world (${w.errors.map((e) => e.message).join("; ")})`);
        continue;
      }
      const s = validateStatements(r.world, r.statements, r.syntax_marks);
      if (!s.ok) err(`invalid statements (${s.errors.map((e) => e.message).join("; ")})`);
      const solved = solve(r.world);
      const value = solved.kind === "unique" ? solved.values.get(r.world.question.target_id) : undefined;
      if (value === undefined) err(`no unique solution (${solved.kind})`);
      else if (r.expected_answer === null || !eq(value, fromSchema(r.expected_answer))) err(`expected answer does not match core solve`);
      const c = problemConditions(r);
      if (!c.ok) err(`problem conditions fail (${c.failures.map((x) => x.code).join("; ")})`);
      const pair = pairs[id];
      if (pair === undefined) err(`no reading pair in ${PAIRS_FILE}`);
      else if (!splitsPair(r, pair.readingA, pair.readingB)) err(`the readings ${pair.readingA.id} and ${pair.readingB.id} no longer split here`);
    } catch (e) {
      err(`core check threw (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  return { records: files.length, errors };
}
