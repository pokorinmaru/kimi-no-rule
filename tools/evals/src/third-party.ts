// Rows written by a third-party adult, not the author and not an AI (指示書 第10.1節・第10.3節). The writer
// fills two CSV files in a spreadsheet (evals/third-party/); this module reads them, checks each row with
// the frozen row schemas, refuses anything that looks like personal data, and gives ids, split "test" and
// source "third_party". A file with any bad row gives no rows at all, so a half-imported file never exists.
import { FRACTION_BANK } from "@kimi/core";
import { findPersonalData } from "../../../.claude/hooks/lib/text.mjs";
import { safetyRow, type SafetyRow } from "./dataset.ts";
import { kohaiRow, type KohaiRow } from "./kohai-eval.ts";

export const SAFETY_HEADER = ["text", "expected", "style", "lang", "note"] as const;
export const KOHAI_HEADER = ["problem_id", "intent", "child_words", "holder_id", "style", "note"] as const;

export const THIRD_PARTY = {
  safetyCsv: "evals/third-party/safety.csv",
  kohaiCsv: "evals/third-party/kohai.csv",
  safetyJsonl: "evals/data/safety/third-party.jsonl",
  kohaiJsonl: "evals/data/kohai/third-party.jsonl",
  addendum: "evals/PROTOCOL-ADDENDUM-4.md",
  lock: "evals/protocol-addendum-4.lock",
  importer: "tools/evals/src/third-party.ts",
} as const;

export interface CsvRecord {
  /** The line the record starts on (1-based; a quoted cell may run over several lines). */
  line: number;
  cells: string[];
}

/** RFC 4180 CSV: quoted cells may hold commas, doubled quotes and line breaks. CRLF and a BOM are accepted. Rows empty everywhere are skipped. */
export function parseCsv(input: string): CsvRecord[] {
  const text = (input.charCodeAt(0) === 0xfeff ? input.slice(1) : input).replace(/\r\n?/g, "\n");
  const out: CsvRecord[] = [];
  let line = 1;
  let start = 1;
  let cells: string[] = [];
  let cell = "";
  let i = 0;
  const endRecord = (): void => {
    cells.push(cell);
    if (cells.some((c) => c.trim() !== "")) out.push({ line: start, cells });
    cells = [];
    cell = "";
  };
  while (i < text.length) {
    const ch = text[i] as string;
    if (ch === '"' && cell === "") {
      const opened = line;
      i++;
      for (;;) {
        if (i >= text.length) throw new Error(`line ${opened}: a quote (") is opened and never closed`);
        const c = text[i] as string;
        if (c === '"') {
          if (text[i + 1] === '"') {
            cell += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        if (c === "\n") line++;
        cell += c;
        i++;
      }
      const next = text[i];
      if (next !== undefined && next !== "," && next !== "\n") throw new Error(`line ${line}: text after a closing quote (")`);
      continue;
    }
    if (ch === ",") {
      cells.push(cell);
      cell = "";
    } else if (ch === "\n") {
      endRecord();
      line++;
      start = line;
    } else {
      cell += ch;
    }
    i++;
  }
  if (cell !== "" || cells.length > 0) endRecord();
  return out;
}

export interface ImportResult<T> {
  rows: T[];
  /** Each names its file line; when there is any, rows is empty. */
  errors: string[];
}

type Cells<H extends readonly string[]> = Record<H[number], string>;

/** Maps cells to header names (any column order), or reports header and cell-count errors. */
function records<H extends readonly string[]>(text: string, header: H): { rows: { line: number; v: Cells<H> }[]; errors: string[] } {
  let recs: CsvRecord[];
  try {
    recs = parseCsv(text);
  } catch (e) {
    return { rows: [], errors: [(e as Error).message] };
  }
  const head = recs[0];
  if (head === undefined) return { rows: [], errors: [] };
  const names = head.cells.map((c) => c.trim());
  const errors: string[] = [];
  for (const h of header) if (!names.includes(h)) errors.push(`line ${head.line}: the column ${h} is missing`);
  for (const n of names) if (!(header as readonly string[]).includes(n)) errors.push(`line ${head.line}: unknown column ${n === "" ? "(empty)" : n}`);
  if (errors.length > 0) return { rows: [], errors };
  const rows: { line: number; v: Cells<H> }[] = [];
  for (const r of recs.slice(1)) {
    if (r.cells.length !== names.length) {
      errors.push(`line ${r.line}: ${r.cells.length} cells, the header has ${names.length}`);
      continue;
    }
    const v = Object.fromEntries(names.map((n, i) => [n, (r.cells[i] ?? "").trim()])) as Cells<H>;
    rows.push({ line: r.line, v });
  }
  return { rows, errors };
}

/** Personal-data findings (masked) over the given cells, as one error, or none. */
function personal(line: number, values: readonly string[]): string[] {
  const found = values.flatMap((v) => findPersonalData(v));
  return found.length === 0 ? [] : [`line ${line}: looks like personal data (個人情報らしきもの): ${[...new Set(found)].join(", ")}. Invent the row instead.`];
}

const id = (prefix: string, n: number): string => `${prefix}-${String(n).padStart(3, "0")}`;

function issues(line: number, issues: readonly { path: PropertyKey[]; message: string }[], rename: Record<string, string>): string[] {
  return issues.map((x) => {
    const key = String(x.path[0] ?? "");
    return `line ${line}: ${rename[key] ?? key}: ${x.message}`;
  });
}

export function importSafetyCsv(text: string): ImportResult<SafetyRow> {
  const { rows, errors } = records(text, SAFETY_HEADER);
  const out: SafetyRow[] = [];
  for (const { line, v } of rows) {
    const errs: string[] = [];
    if (v.text === "") errs.push(`line ${line}: text: empty`);
    const parsed = safetyRow.safeParse({
      id: id("tp-s", out.length + 1),
      split: "test",
      lang: v.lang,
      transcript: v.text,
      expected: v.expected,
      style: v.style,
      source: "third_party",
      ...(v.note === "" ? {} : { note: v.note }),
    });
    if (!parsed.success) errs.push(...issues(line, parsed.error.issues, { transcript: "text" }));
    errs.push(...personal(line, [v.text, v.note]));
    if (errs.length > 0 || !parsed.success) errors.push(...errs);
    else out.push(parsed.data);
  }
  return errors.length > 0 ? { rows: [], errors } : { rows: out, errors: [] };
}

/** The child's words are separated by ｜ (a half-width | is taken too). */
const splitWords = (s: string): string[] =>
  s
    .split(/[｜|]/)
    .map((w) => w.trim())
    .filter((w) => w !== "");

export function importKohaiCsv(text: string): ImportResult<KohaiRow> {
  const { rows, errors } = records(text, KOHAI_HEADER);
  const out: KohaiRow[] = [];
  for (const { line, v } of rows) {
    const errs: string[] = [];
    const problem = FRACTION_BANK.find((p) => p.world.problem_id === v.problem_id);
    if (problem === undefined) errs.push(`line ${line}: problem_id: ${v.problem_id === "" ? "empty" : `${v.problem_id} is not a problem of the bank`}`);
    const words = splitWords(v.child_words);
    if (words.length === 0) errs.push(`line ${line}: child_words: no words`);
    if (v.intent === "restate") {
      if (v.holder_id === "") errs.push(`line ${line}: holder_id: needed when intent is restate`);
      else if (problem !== undefined && !problem.world.holders.some((h) => h.id === v.holder_id))
        errs.push(`line ${line}: holder_id: ${v.holder_id} is not a holder of ${v.problem_id} (${problem.world.holders.map((h) => h.id).join(", ")})`);
    } else if (v.holder_id !== "") errs.push(`line ${line}: holder_id: only for intent restate`);
    const parsed = kohaiRow.safeParse({
      id: id("tp-k", out.length + 1),
      problem_id: v.problem_id,
      intent: v.intent,
      child_words: words,
      holder_ids: v.holder_id === "" ? [] : [v.holder_id],
      style: v.style,
      source: "third_party",
    });
    if (!parsed.success) errs.push(...issues(line, parsed.error.issues.filter((x) => x.path[0] !== "child_words"), { holder_ids: "holder_id" }));
    errs.push(...personal(line, [v.child_words, v.note]));
    if (errs.length > 0 || !parsed.success) errors.push(...errs);
    else out.push(parsed.data);
  }
  return errors.length > 0 ? { rows: [], errors } : { rows: out, errors: [] };
}

export const toJsonl = (rows: readonly object[]): string => rows.map((r) => `${JSON.stringify(r)}\n`).join("");

/** The problems a kohai row may name, from the bank itself (pasted into evals/third-party/README.md). */
export function problemList(): string {
  const lines = ["| problem_id | 問題文 | holder_id（だれ） |", "| --- | --- | --- |"];
  for (const p of FRACTION_BANK) {
    const holders = p.world.holders.map((h) => `${h.id}（${h.label}）`).join("、");
    lines.push(`| ${p.world.problem_id} | ${p.world.problem_text.replaceAll("|", "\\|")} | ${holders} |`);
  }
  return `${lines.join("\n")}\n`;
}

/** The files a new addendum freezes: the addendum, the imported rows, and this importer. */
export const freezeFiles = (written: readonly string[]): string[] => [THIRD_PARTY.addendum, ...written, THIRD_PARTY.importer];

export const freezeCommand = (written: readonly string[]): string =>
  `node tools/evals/src/check-protocol.ts --write ${THIRD_PARTY.lock} ${freezeFiles(written).join(" ")}`;

/** A draft of addendum 4, to finish by hand (who wrote the rows, when) before freezing. */
export function addendumDraft(written: readonly { path: string; rows: number }[]): string {
  const table = written.map((w) => `| \`${w.path}\` | 第三者が書いた行（${w.rows} 行） |`);
  return [
    "# EVALS-PROTOCOL 第1版への追補4（下書き）",
    "",
    "作者でも AI でもない大人（第三者）が書いた行を、本番用（test）の評価に足します。行は `evals/third-party/` の表に書いてもらい、`pnpm eval:import-third-party` で取り込みました。本物の Claude でこの行を一度も回していない時点で、次のファイルを `evals/protocol-addendum-4.lock` で凍結します。凍結するまで `pnpm eval:live` は回しません。",
    "",
    "| ファイル | 凍結する理由 |",
    "| --- | --- |",
    ...table,
    "| `tools/evals/src/third-party.ts` | 表の読み方、行の検査、id の付け方 |",
    "| この文書 | 追補の中身 |",
    "",
    "## 取り決め",
    "",
    "- 数え方は変えない。安全の行は safety-eval.ts、後輩の行は kohai-eval.ts（どちらも凍結済み）で、AI の下書きの行と同じ設定で回す。",
    "- EVALS.md では「（第三者の行）」と名前を付けた別の行に出す。AI の下書きの行の数字とは足し合わせない。",
    "- 結果を見た後で、行を直したり消したり足したりしない。変える時は追補5を別の lock で足す。",
    "- 後輩の表の note 列は取り込まない（凍結済みの行の形に note が無いため）。",
    "- 書いた人が作者でも AI でもないこと、行が作り話で実在の子どもの言葉を含まないことは、作者が受け取った時に確かめる。",
    "",
    "## 受け取りの記録（凍結の前に埋める）",
    "",
    "- 書いた人：",
    "- 受け取った日：",
    "",
  ].join("\n");
}
