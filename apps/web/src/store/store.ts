// The records on the device (指示書 第7.5節, reduced to the submission; 第9節: nothing goes to a server).
// The child's words never reach a table: every op is passed through core's redact before it is stored,
// and the junior's rejected lines and the safety events keep only their kinds and dates.
import { Dexie, type Table } from "dexie";
import { hasChildText, initialState, readingLine, redactInterpretation, type Interpretation, type Lang, type ResearchState } from "@kimi/core";
import type { CardLog, ProblemLog } from "../flow/machine.ts";

export interface Settings {
  consented: boolean;
  introSeen: boolean;
  /** The screen's language (HANDOFF §7 の4); Japanese until it is switched. */
  lang: Lang;
}

export interface AttemptRow {
  id?: number;
  at: string;
  problemId: string;
  consistency: ProblemLog["consistency"];
  /** Where the junior's reading came from (shown only on the grown-up's screen, 原則10). */
  source: ProblemLog["source"];
  readingId: string;
  /** The child's own first prediction before the junior's world: holder ids only (absent on rows kept before it was asked). */
  guess?: ProblemLog["guess"];
  /** The child's prediction about the junior's world (absent on rows kept before it was asked). */
  prediction?: ProblemLog["prediction"];
  firstPlacement: string | null;
  /** The child's ops on this problem, redacted by core. */
  interpretation: Interpretation;
  fixes: number;
  unitTries: number;
  totalTries: number;
  outcome: ProblemLog["outcome"];
  /** The child's answers to "which is longer?" in the help (holder ids; observations, never judged). */
  orderGuesses?: string[];
  /** How many times the word book opened on this problem. */
  bookOpens?: number;
  /** On a transfer problem only (Q48): ids, the wording and core's yes/no. */
  transfer?: ProblemLog["transfer"];
  /** The problem one sentence at a time (Q62): each step's kind, tries and outcome, and the holder ids chosen. */
  steps?: ProblemLog["steps"];
}

export interface GateRow {
  id?: number;
  at: string;
  kinds: string[];
}

export type SafetyKind = "distress" | "hard_button" | "rest";

export interface SafetyRow {
  id?: number;
  at: string;
  kind: SafetyKind;
}

/** One problem of an AI-free check (指示書 第7.3節): which problem, its kind, and how core judged it. */
export interface CheckItem {
  problemId: string;
  consistency: AttemptRow["consistency"];
  outcome: "right" | "not_right" | "skipped";
}

export interface CheckRow {
  id?: number;
  at: string;
  items: CheckItem[];
}

/** The junior's rule card the child left (指示書 第7.1節 後輩のルールカード): rule ids and counts only, no child's words. */
export interface CardRow extends CardLog {
  id?: number;
  at: string;
}

/**
 * One change of the research pool, for the grown-up's trend (指示書 第7.4節): each hypothesis's id, status and
 * core's adult line in both languages, and whether no hypothesis fits most placements. No child's words.
 */
export interface ResearchLogRow {
  id?: number;
  at: string;
  pool: { id: string; status: "hypothesis" | "confirmed"; line: { ja: string; en: string } }[];
  unsettled: boolean;
}

interface KeyValue {
  key: string;
  value: unknown;
}

class KimiDB extends Dexie {
  settings!: Table<KeyValue, string>;
  attempts!: Table<AttemptRow, number>;
  research!: Table<KeyValue, string>;
  gateLog!: Table<GateRow, number>;
  safetyEvents!: Table<SafetyRow, number>;
  checks!: Table<CheckRow, number>;
  cards!: Table<CardRow, number>;
  researchLog!: Table<ResearchLogRow, number>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      settings: "key",
      attempts: "++id, at, problemId",
      research: "key",
      gateLog: "++id, at",
      safetyEvents: "++id, at",
    });
    this.version(2).stores({ checks: "++id, at" });
    this.version(3).stores({ cards: "++id, at" });
    this.version(4).stores({ researchLog: "++id, at" });
  }
}

export interface FlowStore {
  getSettings(): Promise<Settings>;
  setConsent(v: boolean): Promise<void>;
  setIntroSeen(v: boolean): Promise<void>;
  setLang(lang: Lang): Promise<void>;
  /** Ruby readings over the kanji (指示書 第8.4b節); on until switched off. A display setting like the language. */
  getFurigana(): Promise<boolean>;
  setFurigana(on: boolean): Promise<void>;
  /** The name the child typed (Q60), shown on the screen only; null when none. Removed by deleteAll. */
  getName(): Promise<string | null>;
  setName(name: string | null): Promise<void>;
  addAttempt(log: ProblemLog): Promise<void>;
  listAttempts(): Promise<AttemptRow[]>;
  saveResearch(state: ResearchState): Promise<void>;
  loadResearch(): Promise<ResearchState>;
  /** The research pool's changes (a row only when a status, the pool or unexpressible changed), oldest first. */
  listResearchLog(): Promise<ResearchLogRow[]>;
  logGate(kinds: readonly string[]): Promise<void>;
  listGateLog(): Promise<GateRow[]>;
  logSafety(kind: SafetyKind): Promise<void>;
  listSafety(): Promise<SafetyRow[]>;
  /** One AI-free check: the outcome of each problem given (no number the child typed). */
  addCheck(items: readonly CheckItem[]): Promise<void>;
  listChecks(): Promise<CheckRow[]>;
  /** The junior's rule card the child left: which rule, how many picks, whether every gallery world fit. */
  addCard(card: CardLog): Promise<void>;
  listCards(): Promise<CardRow[]>;
  /** Removes every record and setting on this device (the grown-up's screen), except the screen's language and
   * the furigana switch: they are how the screen reads, not a record of the child. */
  deleteAll(): Promise<void>;
  close(): Promise<void>;
}

export const DEFAULT_DB_NAME = "kimi-no-rule";

const now = (): string => new Date().toISOString();

function interpretationOf(log: ProblemLog): Interpretation {
  const raw = {
    schema_version: "6" as const,
    utterance_lang: "ja" as const,
    representable: "full" as const,
    ops: log.ops as Interpretation["ops"],
    unclear: [],
    phrases: [],
  };
  const redacted = redactInterpretation(raw);
  if (hasChildText(redacted)) throw new Error("the record still holds the child's words");
  return redacted;
}

export function openStore(name: string = DEFAULT_DB_NAME): FlowStore {
  const db = new KimiDB(name);
  const getBool = async (key: string): Promise<boolean> => (await db.settings.get(key))?.value === true;
  // The language is a display setting, also kept synchronously in localStorage: a reload right after the
  // switch could come before the IndexedDB write lands (seen in CI). Storage may be unavailable: ignore it.
  const langKey = `${name}:lang`;
  const localLang = (): Lang | null => {
    try {
      const v = globalThis.localStorage?.getItem(langKey);
      return v === "en" || v === "ja" ? v : null;
    } catch {
      return null;
    }
  };
  const furiganaKey = `${name}:furigana`;
  const localFurigana = (): boolean | null => {
    try {
      const v = globalThis.localStorage?.getItem(furiganaKey);
      return v === "on" ? true : v === "off" ? false : null;
    } catch {
      return null;
    }
  };
  return {
    async getSettings() {
      const lang = localLang() ?? ((await db.settings.get("lang"))?.value === "en" ? "en" : "ja");
      return { consented: await getBool("consented"), introSeen: await getBool("introSeen"), lang };
    },
    async setConsent(v) {
      await db.settings.put({ key: "consented", value: v });
    },
    async getName() {
      const v = (await db.settings.get("name"))?.value;
      return typeof v === "string" && v !== "" ? v : null;
    },
    async setName(name) {
      if (name === null) await db.settings.delete("name");
      else await db.settings.put({ key: "name", value: name });
    },
    async setIntroSeen(v) {
      await db.settings.put({ key: "introSeen", value: v });
    },
    async setLang(lang) {
      try {
        globalThis.localStorage?.setItem(langKey, lang);
      } catch {
        // the IndexedDB copy below still keeps it
      }
      await db.settings.put({ key: "lang", value: lang });
    },
    async getFurigana() {
      const local = localFurigana();
      if (local !== null) return local;
      return (await db.settings.get("furigana"))?.value !== false;
    },
    async setFurigana(on) {
      try {
        globalThis.localStorage?.setItem(furiganaKey, on ? "on" : "off");
      } catch {
        // the IndexedDB copy below still keeps it
      }
      await db.settings.put({ key: "furigana", value: on });
    },
    async addAttempt(log) {
      await db.attempts.add({
        at: now(),
        problemId: log.problemId,
        consistency: log.consistency,
        source: log.source,
        readingId: log.readingId,
        guess: log.guess === undefined || log.guess === null ? null : { larger: log.guess.larger, oneOn: log.guess.oneOn },
        prediction: log.prediction,
        firstPlacement: log.firstPlacement,
        interpretation: interpretationOf(log),
        fixes: log.fixes,
        unitTries: log.unitTries,
        totalTries: log.totalTries,
        outcome: log.outcome,
        orderGuesses: [...(log.orderGuesses ?? [])],
        bookOpens: log.bookOpens ?? 0,
        ...(log.transfer === undefined
          ? {}
          : { transfer: { fixedProblemId: log.transfer.fixedProblemId, oldReadingId: log.transfer.oldReadingId, wording: log.transfer.wording, beyondWording: log.transfer.beyondWording } }),
        ...(log.steps === undefined
          ? {}
          : {
              steps: log.steps.map((e) => ({
                kind: e.kind,
                tries: e.tries,
                outcome: e.outcome,
                ...(e.choices === undefined ? {} : { choices: [...e.choices] }),
                ...(e.firstRight === undefined ? {} : { firstRight: e.firstRight }),
              })),
            }),
      });
    },
    async listAttempts() {
      return db.attempts.orderBy("id").toArray();
    },
    async saveResearch(state) {
      const pool = state.pool.map((e) => ({
        id: e.hypothesis.id,
        status: e.status,
        line: { ja: readingLine(e.hypothesis, "ja"), en: readingLine(e.hypothesis, "en") },
      }));
      // A modified hypothesis keeps its id, so its words are part of the key (review, 2026-11-07).
      const key = (p: readonly { id: string; status: string; line: { ja: string } }[], unsettled: boolean): string =>
        JSON.stringify([p.map((e) => [e.id, e.status, e.line.ja]), unsettled]);
      await db.transaction("rw", [db.research, db.researchLog], async () => {
        await db.research.put({ key: "current", value: structuredClone(state) });
        const last = await db.researchLog.orderBy("id").last();
        const before = last === undefined ? key([], false) : key(last.pool, last.unsettled);
        if (key(pool, state.unexpressible) !== before) await db.researchLog.add({ at: now(), pool, unsettled: state.unexpressible });
      });
    },
    async listResearchLog() {
      return db.researchLog.orderBy("id").toArray();
    },
    async loadResearch() {
      const row = await db.research.get("current");
      return row === undefined ? initialState() : (row.value as ResearchState);
    },
    async logGate(kinds) {
      await db.gateLog.add({ at: now(), kinds: kinds.map(String) });
    },
    async listGateLog() {
      return db.gateLog.orderBy("id").toArray();
    },
    async logSafety(kind) {
      await db.safetyEvents.add({ at: now(), kind });
    },
    async listSafety() {
      return db.safetyEvents.orderBy("id").toArray();
    },
    async addCheck(items) {
      await db.checks.add({
        at: now(),
        items: items.map((i) => ({ problemId: i.problemId, consistency: i.consistency, outcome: i.outcome })),
      });
    },
    async listChecks() {
      return db.checks.orderBy("id").toArray();
    },
    async addCard(card) {
      await db.cards.add({
        at: now(),
        afterProblemId: card.afterProblemId,
        startRuleId: card.startRuleId,
        leftRuleId: card.leftRuleId,
        picks: card.picks,
        fitsAll: card.fitsAll,
        galleryIds: [...card.galleryIds],
      });
    },
    async listCards() {
      return db.cards.orderBy("id").toArray();
    },
    async deleteAll() {
      const tables = [db.settings, db.attempts, db.research, db.gateLog, db.safetyEvents, db.checks, db.cards, db.researchLog];
      await db.transaction("rw", tables, async () => {
        const lang = await db.settings.get("lang");
        const furigana = await db.settings.get("furigana");
        await Promise.all(tables.map((t) => t.clear()));
        if (lang !== undefined) await db.settings.put(lang);
        if (furigana !== undefined) await db.settings.put(furigana);
      });
    },
    async close() {
      db.close();
    },
  };
}
