// The records on the device (指示書 第7.5節, reduced to the submission; 第9節: nothing goes to a server).
// The child's words never reach a table: every op is passed through core's redact before it is stored,
// and the junior's rejected lines and the safety events keep only their kinds and dates.
import { Dexie, type Table } from "dexie";
import { hasChildText, initialState, redactInterpretation, type Interpretation, type ResearchState } from "@kimi/core";
import type { ProblemLog } from "../flow/machine.ts";

export interface Settings {
  consented: boolean;
  introSeen: boolean;
}

export interface AttemptRow {
  id?: number;
  at: string;
  problemId: string;
  consistency: ProblemLog["consistency"];
  /** Where the junior's reading came from (shown only on the grown-up's screen, 原則10). */
  source: ProblemLog["source"];
  readingId: string;
  firstPlacement: string | null;
  /** The child's ops on this problem, redacted by core. */
  interpretation: Interpretation;
  fixes: number;
  unitTries: number;
  totalTries: number;
  outcome: ProblemLog["outcome"];
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
  }
}

export interface FlowStore {
  getSettings(): Promise<Settings>;
  setConsent(v: boolean): Promise<void>;
  setIntroSeen(v: boolean): Promise<void>;
  addAttempt(log: ProblemLog): Promise<void>;
  listAttempts(): Promise<AttemptRow[]>;
  saveResearch(state: ResearchState): Promise<void>;
  loadResearch(): Promise<ResearchState>;
  logGate(kinds: readonly string[]): Promise<void>;
  listGateLog(): Promise<GateRow[]>;
  logSafety(kind: SafetyKind): Promise<void>;
  listSafety(): Promise<SafetyRow[]>;
  /** One AI-free check: the outcome of each problem given (no number the child typed). */
  addCheck(items: readonly CheckItem[]): Promise<void>;
  listChecks(): Promise<CheckRow[]>;
  /** Removes every record and setting on this device (the grown-up's screen). */
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
  return {
    async getSettings() {
      return { consented: await getBool("consented"), introSeen: await getBool("introSeen") };
    },
    async setConsent(v) {
      await db.settings.put({ key: "consented", value: v });
    },
    async setIntroSeen(v) {
      await db.settings.put({ key: "introSeen", value: v });
    },
    async addAttempt(log) {
      await db.attempts.add({
        at: now(),
        problemId: log.problemId,
        consistency: log.consistency,
        source: log.source,
        readingId: log.readingId,
        firstPlacement: log.firstPlacement,
        interpretation: interpretationOf(log),
        fixes: log.fixes,
        unitTries: log.unitTries,
        totalTries: log.totalTries,
        outcome: log.outcome,
      });
    },
    async listAttempts() {
      return db.attempts.orderBy("id").toArray();
    },
    async saveResearch(state) {
      await db.research.put({ key: "current", value: structuredClone(state) });
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
    async deleteAll() {
      const tables = [db.settings, db.attempts, db.research, db.gateLog, db.safetyEvents, db.checks];
      await db.transaction("rw", tables, async () => {
        await Promise.all(tables.map((t) => t.clear()));
      });
    },
    async close() {
      db.close();
    },
  };
}
