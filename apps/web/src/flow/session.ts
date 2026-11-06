// The session controller: runs the machine, asks the worker for the junior's words (4 s, 第6.8節), the
// research pool and safety checks, and keeps the device records (第7.5節). The machine never waits on the
// server for the junior's words; a late or failed reply is dropped and the template stays.
import { createActor, type Actor } from "xstate";
import { flowMachine, type FlowEvent, type FlowInput, type Line, type ResearchRequest } from "./machine.ts";
import { createHttpApi, type FlowApi } from "./api.ts";
import type { FlowStore } from "../store/store.ts";

export type { FlowApi } from "./api.ts";

export const KOHAI_TIMEOUT_MS = 4000;
/** The research agent may take several turns; the child is past problem 1 long before this runs out. 【仮】 */
export const RESEARCH_TIMEOUT_MS = 20000;
export const SAFETY_TIMEOUT_MS = 3000;

export interface SessionOptions {
  store: FlowStore;
  /** The worker client; null runs with templates and the fallback pool only. */
  api?: FlowApi | null;
  input?: Omit<FlowInput, "introSeen" | "consented" | "research">;
  kohaiTimeoutMs?: number;
  researchTimeoutMs?: number;
  safetyTimeoutMs?: number;
}

export interface Session {
  actor: Actor<typeof flowMachine>;
  send(e: FlowEvent): void;
  /** Checks words the child typed or said (none in the finger-only flow); a failed check is "unchecked" (Q26). */
  checkWords(text: string): Promise<void>;
  /** Resolves when every record so far is on the device. */
  settle(): Promise<void>;
  stop(): void;
}

async function within<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T | "timeout"> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => {
      ctrl.abort();
      resolve("timeout");
    }, ms);
  });
  try {
    return await Promise.race([run(ctrl.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function startSession(opts: SessionOptions): Promise<Session> {
  const { store } = opts;
  const api = opts.api === undefined ? createHttpApi() : opts.api;
  const settings = await store.getSettings();
  const research = await store.loadResearch();
  const actor = createActor(flowMachine, { input: { ...(opts.input ?? {}), introSeen: settings.introSeen, consented: settings.consented, research } });

  let stopped = false;
  let lastLine: Line | null = null;
  let researchSent: ResearchRequest | null = null;
  let saved = { consented: settings.consented, introSeen: settings.introSeen, research, log: 0, safety: 0 };
  // Writes go one after another, so a later state never lands before an earlier one.
  let writes: Promise<void> = Promise.resolve();
  const write = (f: () => Promise<void>): void => {
    writes = writes.then(f).catch(() => undefined);
  };

  const askKohai = (line: Line): void => {
    if (api === null || line.request === null) return;
    const req = line.request;
    void within(opts.kohaiTimeoutMs ?? KOHAI_TIMEOUT_MS, (signal) => api.kohai(req, signal))
      .then((reply) => {
        if (stopped || reply === "timeout") return;
        if (reply.rejected.length > 0) write(() => store.logGate(reply.rejected));
        if (reply.source === "generated") actor.send({ type: "KOHAI_LINE", seq: line.seq, text: reply.text });
      })
      .catch(() => undefined);
  };

  const askResearch = (req: ResearchRequest): void => {
    if (api === null) {
      actor.send({ type: "RESEARCH_RESULT", pool: null });
      return;
    }
    void within(opts.researchTimeoutMs ?? RESEARCH_TIMEOUT_MS, (signal) => api.research(req, signal))
      .then((reply) => {
        if (stopped) return;
        actor.send({ type: "RESEARCH_RESULT", pool: reply !== "timeout" && reply.kind === "submitted" ? reply.pool : null });
      })
      .catch(() => {
        if (!stopped) actor.send({ type: "RESEARCH_RESULT", pool: null });
      });
  };

  actor.subscribe((snap) => {
    const c = snap.context;
    if (c.line !== null && c.line !== lastLine && c.line.seq !== lastLine?.seq && c.line.source === "template") askKohai(c.line);
    lastLine = c.line;
    if (c.researchRequest !== null && researchSent === null) {
      researchSent = c.researchRequest;
      askResearch(c.researchRequest);
    }
    if (c.consented !== saved.consented) {
      const v = c.consented;
      write(() => store.setConsent(v));
    }
    if (c.introSeen !== saved.introSeen) {
      const v = c.introSeen;
      write(() => store.setIntroSeen(v));
    }
    if (c.research !== saved.research) {
      const v = c.research;
      write(() => store.saveResearch(v));
    }
    for (const entry of c.log.slice(saved.log)) write(() => store.addAttempt(entry));
    for (const kind of c.safetyLog.slice(saved.safety)) write(() => store.logSafety(kind));
    saved = { consented: c.consented, introSeen: c.introSeen, research: c.research, log: c.log.length, safety: c.safetyLog.length };
  });
  actor.start();

  return {
    actor,
    send: (e) => actor.send(e),
    async checkWords(text) {
      let flag: "none" | "distress" | "inappropriate" | "unchecked" = "unchecked";
      if (api !== null) {
        try {
          const reply = await within(opts.safetyTimeoutMs ?? SAFETY_TIMEOUT_MS, (signal) => api.safety(text, signal));
          if (reply !== "timeout") flag = reply.flag;
        } catch {
          flag = "unchecked";
        }
      }
      if (!stopped) actor.send({ type: "SAFETY_RESULT", flag });
      await writes;
    },
    settle: () => writes,
    stop() {
      stopped = true;
      actor.stop();
    },
  };
}
