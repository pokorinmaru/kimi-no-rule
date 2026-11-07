// The offline transfer problems (指示書 第6.7節 手順6; Q33). For each common misreading and each wording (the
// same as the fixed problem, or another known phrasing) it picks a bank problem the misreading fails on as the
// fixed problem, has Opus write one transfer problem through packages/interpret writeTransfer (the one build of
// 第6.6節 and core's checks), and writes the kept records to content/problems/transfer, unchecked by a person.
// checkStoredTransfer runs core again on every stored record. The build log holds answers, so it is for adults.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMMON_MISREADINGS,
  eq,
  fromSchema,
  problemConditions,
  schemas,
  solve,
  validateStatements,
  validateWorld,
  wordingTag,
  type Hypothesis,
  type ProblemRecord,
} from "@kimi/core";
import { TRANSFER_SOURCE, formatBuildLog, oldReadingFails, writeTransfer, type BuildDeps, type TransferOptions, type TransferWording } from "@kimi/interpret";

export const TRANSFER_DIR = fileURLToPath(new URL("../../../content/problems/transfer/", import.meta.url));

/** At most this many problems per run (each common misreading × two wordings would be more). */
export const MAX_TRANSFER = 8;
export const WORDINGS: readonly TransferWording[] = ["same", "different"];

export const TRANSFERS_FILE = "transfers.json";
export const TRANSFER_LOG_FILE = "build-log.adult-only.md";
const LOG_HEAD = "# 転移の問題の組み立ての記録（大人向け：答えが書いてあります。子どもに見せないこと）";

/** What each stored record was written for: the old reading, the wording and the fixed problem. */
export interface TransferMeta {
  oldReading: Hypothesis;
  wording: TransferWording;
  fixedProblemId: string;
  fixedText: string;
}

export interface StoredTransfer {
  records: ProblemRecord[];
  meta: Record<string, TransferMeta>;
}

export interface TransferSlot {
  reading: Hypothesis;
  wording: TransferWording;
  fixed: ProblemRecord;
}

const failsSafe = (r: ProblemRecord, h: Hypothesis): boolean => {
  try {
    return oldReadingFails(r, h);
  } catch {
    return false;
  }
};

/**
 * Each common misreading × {same, different}, in that order, with the first bank problem the misreading fails
 * on as the fixed problem; slots already stored are skipped; at most `cap`. noFixed lists the misreadings no
 * bank problem catches.
 */
export function planTransfer(bank: readonly ProblemRecord[], stored: StoredTransfer, opts: { cap?: number } = {}): { slots: TransferSlot[]; noFixed: string[] } {
  const done = new Set(Object.values(stored.meta).map((m) => `${m.oldReading.id}|${m.wording}`));
  const slots: TransferSlot[] = [];
  const noFixed: string[] = [];
  for (const reading of COMMON_MISREADINGS) {
    const fixed = bank.find((r) => failsSafe(r, reading));
    if (fixed === undefined) {
      noFixed.push(reading.id);
      continue;
    }
    for (const wording of WORDINGS) if (!done.has(`${reading.id}|${wording}`)) slots.push({ reading, wording, fixed });
  }
  return { slots: slots.slice(0, opts.cap ?? MAX_TRANSFER), noFixed };
}

export interface TransferCallCount {
  problems: number;
  opusTypical: number;
  opusMax: number;
  haikuMax: number;
}

/**
 * Per problem: one writer call (two with the retry), two builds of up to maxTurns agent turns each, three judge
 * calls (restate, sentences, misreads; each with one retry), and up to misreadCount Haiku calls for the misread
 * rate. "Typical" takes five turns a build and no retry.
 */
export function expectedTransferCalls(problems: number, opts: { maxTurns?: number; misreadCount?: number } = {}): TransferCallCount {
  const maxTurns = opts.maxTurns ?? 12;
  return {
    problems,
    opusTypical: problems * (1 + 2 * 5 + 3),
    opusMax: problems * (2 + 2 * maxTurns + 3 * 2),
    haikuMax: problems * (opts.misreadCount ?? 20),
  };
}

const recordFiles = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json") && f !== TRANSFERS_FILE).sort() : []);

function readMeta(dir: string): Record<string, TransferMeta> {
  const p = join(dir, TRANSFERS_FILE);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as Record<string, TransferMeta>) : {};
}

/** The records already in the folder (those that read as records) and what they were written for. */
export function readStoredTransfer(dir: string): StoredTransfer {
  const records: ProblemRecord[] = [];
  for (const f of recordFiles(dir)) {
    const parsed = schemas.problemRecord.safeParse(JSON.parse(readFileSync(join(dir, f), "utf8")));
    if (parsed.success) records.push(parsed.data);
  }
  return { records, meta: readMeta(dir) };
}

export interface MadeTransfer {
  accepted: ProblemRecord[];
  meta: Record<string, TransferMeta>;
  log: string;
}

export interface SlotDone {
  slot: TransferSlot;
  /** 1-based. */
  index: number;
  total: number;
  kept: number;
  refused: number;
  noReply: boolean;
}

const answerText = (r: ProblemRecord): string => (r.expected_answer === null ? "なし" : `${r.expected_answer.num}/${r.expected_answer.den}`);

/** One writeTransfer per slot; new records are numbered past those already stored. */
export async function makeTransfer(
  deps: BuildDeps,
  input: { slots: readonly TransferSlot[]; bank: readonly ProblemRecord[]; stored: StoredTransfer },
  opts: TransferOptions = {},
  hooks: { onSlot?(done: SlotDone): void } = {},
): Promise<MadeTransfer> {
  const made: MadeTransfer = { accepted: [], meta: {}, log: "" };
  const lines: string[] = [];
  for (const [n, slot] of input.slots.entries()) {
    const known = [...input.bank, ...input.stored.records, ...made.accepted];
    const prefix = `p_transfer_${slot.reading.id}_${slot.wording}`;
    const taken = known.map((r) => r.world.problem_id).filter((id) => id.startsWith(`${prefix}_`));
    const index = 1 + Math.max(0, ...taken.map((id) => Number(id.slice(prefix.length + 1))).filter((x) => Number.isInteger(x)));
    const problemId = `${prefix}_${String(index)}`;
    const res = await writeTransfer(
      deps,
      { oldReading: slot.reading, fixed: slot.fixed, wording: slot.wording, avoidTexts: known.map((r) => r.world.problem_text) },
      { ...opts, problemId },
    );
    lines.push(`## ${slot.reading.id}・${slot.wording === "same" ? "同じ言い回し" : "別の言い回し"}（直した問題：${slot.fixed.world.problem_id}）`, "");
    let kept = 0;
    if (res.item === null) lines.push("問題の文が返りませんでした（拒否・時間切れ・形の誤り）。", "");
    else {
      lines.push(formatBuildLog(res.item.problemId, res.item.log), `問題の文：${res.item.text}`);
      if (res.item.status === "accepted" && res.record !== null) {
        lines.push(`採用（人の確認待ち）。答え：${answerText(res.record)}。誤読への耐性（記録）：${String(res.record.checks.misread_pass_rate ?? "なし")}`, "");
        made.accepted.push(res.record);
        made.meta[problemId] = { oldReading: slot.reading, wording: slot.wording, fixedProblemId: slot.fixed.world.problem_id, fixedText: slot.fixed.world.problem_text };
        kept = 1;
      } else {
        lines.push(`不採用：${res.item.reason ?? "unknown"}${res.item.buildReason === undefined ? "" : `（${res.item.buildReason}）`}`, "");
      }
    }
    hooks.onSlot?.({ slot, index: n + 1, total: input.slots.length, kept, refused: res.item !== null && kept === 0 ? 1 : 0, noReply: res.item === null });
  }
  made.log = `${lines.join("\n").trimEnd()}\n`;
  return made;
}

/** Writes the records (never checked by a person here), merges the transfer list, and appends the log. */
export function writeMadeTransfer(dir: string, made: MadeTransfer): void {
  mkdirSync(dir, { recursive: true });
  for (const r of made.accepted) {
    const record = schemas.problemRecord.parse({ ...r, checks: { ...r.checks, human_checked: false } });
    writeFileSync(join(dir, `${record.world.problem_id}.json`), `${JSON.stringify(record, null, 2)}\n`);
  }
  writeFileSync(join(dir, TRANSFERS_FILE), `${JSON.stringify({ ...readMeta(dir), ...made.meta }, null, 2)}\n`);
  const logPath = join(dir, TRANSFER_LOG_FILE);
  const head = existsSync(logPath) ? "\n" : `${LOG_HEAD}\n\n`;
  appendFileSync(logPath, `${head}${made.log}`);
}

/** core's checks on one stored record against what it was written for; the messages, none when it holds. */
export function transferErrors(r: ProblemRecord, meta: TransferMeta | undefined): string[] {
  const errors: string[] = [];
  if (r.source !== TRANSFER_SOURCE) errors.push(`source is ${r.source}, not ${TRANSFER_SOURCE}`);
  try {
    const w = validateWorld(r.world);
    if (!w.ok) return [...errors, `invalid world (${w.errors.map((e) => e.message).join("; ")})`];
    const s = validateStatements(r.world, r.statements, r.syntax_marks);
    if (!s.ok) errors.push(`invalid statements (${s.errors.map((e) => e.message).join("; ")})`);
    const solved = solve(r.world);
    const value = solved.kind === "unique" ? solved.values.get(r.world.question.target_id) : undefined;
    if (value === undefined) errors.push(`no unique solution (${solved.kind})`);
    else if (r.expected_answer === null || !eq(value, fromSchema(r.expected_answer))) errors.push("expected answer does not match core solve");
    const c = problemConditions(r);
    if (!c.ok) errors.push(`problem conditions fail (${c.failures.map((x) => x.code).join("; ")})`);
    if (meta === undefined) errors.push(`no entry in ${TRANSFERS_FILE}`);
    else {
      if (!oldReadingFails(r, meta.oldReading)) errors.push(`the old reading ${meta.oldReading.id} builds the correct world here`);
      const tag = wordingTag(meta.fixedText, r.world.problem_text);
      if (tag !== meta.wording) errors.push(`the wording is ${tag}, not ${meta.wording}`);
    }
  } catch (e) {
    errors.push(`core check threw (${e instanceof Error ? e.message : String(e)})`);
  }
  return errors;
}

/** core's checks again on every stored record: what CI runs (pnpm check:transfer). */
export function checkStoredTransfer(dir: string): { records: number; errors: string[] } {
  const errors: string[] = [];
  const files = recordFiles(dir);
  let meta: Record<string, TransferMeta> = {};
  try {
    meta = readMeta(dir);
  } catch (e) {
    errors.push(`${TRANSFERS_FILE}: ${e instanceof Error ? e.message : String(e)}`);
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
    const id = parsed.data.world.problem_id;
    if (f !== `${id}.json`) errors.push(`${f}: the file name does not match problem_id ${id}`);
    for (const m of transferErrors(parsed.data, meta[id])) errors.push(`${id}: ${m}`);
  }
  return { records: files.length, errors };
}
