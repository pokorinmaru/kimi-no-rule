// The grown-up's trend across days (指示書 第7.4節): read from the records the device already keeps (the
// problems' outcomes and the research pool's changes). Nothing here is sent anywhere. The lines are core's
// (readingLine, kept with each change); this only groups them by day.
import { COMMON_FRACTION_READINGS, readingLine, type Lang } from "@kimi/core";
import type { AttemptRow, ResearchLogRow } from "../store/store.ts";

export interface TrendDay {
  date: string;
  solved: number;
  held: number;
  /** How many times the child fixed the junior's world on that day's counted problems. */
  fixes: number;
  /** Readings that became the way of reading for now. */
  settled: string[];
  /** Readings that went from the way of reading for now back to a guess. */
  backToGuess: string[];
  /** Readings that left the pool. */
  dropped: string[];
}

/** The day of a stored date, on this device's clock. */
export function localDay(at: string): string {
  const d = new Date(at);
  return `${String(d.getFullYear())}/${String(d.getMonth() + 1)}/${String(d.getDate())}`;
}

/**
 * Per day, oldest first. Problems ended by "stop", "it's hard" or a rest are left out: the child chooses what
 * the grown-up sees of those (指示書 第7.4節), and they say nothing about reading.
 */
export function trendOf(attempts: readonly AttemptRow[], log: readonly ResearchLogRow[], lang: Lang, dayOf: (at: string) => string = localDay): TrendDay[] {
  const days = new Map<string, TrendDay>();
  const day = (at: string): TrendDay => {
    const date = dayOf(at);
    let d = days.get(date);
    if (d === undefined) {
      d = { date, solved: 0, held: 0, fixes: 0, settled: [], backToGuess: [], dropped: [] };
      days.set(date, d);
    }
    return d;
  };
  const push = (list: string[], line: string): void => {
    if (!list.includes(line)) list.push(line);
  };
  for (const a of attempts) {
    if (a.outcome !== "solved" && a.outcome !== "held") continue;
    const d = day(a.at);
    if (a.outcome === "solved") d.solved++;
    else d.held++;
    d.fixes += a.fixes;
  }
  let before = new Map<string, ResearchLogRow["pool"][number]>();
  for (const row of log) {
    const now = new Map(row.pool.map((e) => [e.id, e]));
    const settled: string[] = [];
    const back: string[] = [];
    const dropped: string[] = [];
    for (const e of row.pool) {
      const prev = before.get(e.id)?.status;
      if (e.status === "confirmed" && prev !== "confirmed") settled.push(e.line[lang]);
      if (e.status === "hypothesis" && prev === "confirmed") back.push(e.line[lang]);
    }
    for (const [id, e] of before) if (!now.has(id)) dropped.push(e.line[lang]);
    if (settled.length + back.length + dropped.length > 0) {
      const d = day(row.at);
      for (const l of settled) push(d.settled, l);
      for (const l of back) push(d.backToGuess, l);
      for (const l of dropped) push(d.dropped, l);
    }
    before = now;
  }
  // The problems and the pool's changes are two lists: their days are put back in order here.
  return [...days.values()].sort((a, b) => (dayKey(a.date) < dayKey(b.date) ? -1 : 1));
}

/** A day written as y/m/d or y-m-d, padded so that its text order is the order of the days. */
function dayKey(date: string): string {
  return date
    .split(/[/-]/)
    .map((p) => p.padStart(4, "0"))
    .join("-");
}

/** One reading that did not lean on the wording, as the grown-up's screen lists it. */
export interface WordingFree {
  key: string;
  date: string;
  /** The junior's reading the child had fixed, in core's words (readingLine), or `unknownLine` when core has none. */
  line: string;
}

/**
 * The transfer problems core kept as "does not lean on the wording" (指示書 第6.7節 手順6, Q48), oldest first. The
 * device keeps only the old reading's id; its words come from core's common readings.
 */
export function wordingFreeOf(attempts: readonly AttemptRow[], lang: Lang, unknownLine: string, dayOf: (at: string) => string = localDay): WordingFree[] {
  const out: WordingFree[] = [];
  attempts.forEach((a, i) => {
    if (a.outcome !== "solved" || a.transfer?.wording !== "different" || !a.transfer.beyondWording) return;
    const h = COMMON_FRACTION_READINGS.find((x) => x.id === a.transfer?.oldReadingId);
    out.push({ key: `${String(a.id ?? i)}-${a.problemId}`, date: dayOf(a.at), line: h === undefined ? unknownLine : readingLine(h, lang) });
  });
  return out;
}
