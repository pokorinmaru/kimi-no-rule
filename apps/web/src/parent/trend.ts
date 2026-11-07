// The grown-up's trend across days (指示書 第7.4節): read from the records the device already keeps (the
// problems' outcomes and the research pool's changes). Nothing here is sent anywhere. The lines are core's
// (readingLine, kept with each change); this only groups them by day.
import type { Lang } from "@kimi/core";
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
