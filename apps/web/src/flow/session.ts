// The session controller: runs the machine, asks the worker for the junior's words (4 s, 第6.8節), the
// research pool and safety checks, and keeps the device records (第7.5節). The machine never waits on the
// server for the junior's words; a late or failed reply is dropped and the template stays.
import { createActor, type Actor } from "xstate";
import { flowMachine, type FlowEvent, type FlowInput, type Line, type ResearchRequest, type ScenesRequest } from "./machine.ts";
import { createHttpApi, type FlowApi } from "./api.ts";
import type { Hypothesis } from "@kimi/core";
import type { FlowStore } from "../store/store.ts";

export type { FlowApi } from "./api.ts";

export const KOHAI_TIMEOUT_MS = 4000;
/** The research wait: past this the fallback pool is used, so the child never waits long between problems. 【仮】 */
export const RESEARCH_TIMEOUT_MS = 8000;
/** The everyday scenes' proposal (Opus): the program's pair shows at once, so a long wait costs nothing; later replies are dropped. */
export const SCENES_TIMEOUT_MS = 25000;
/** Two tries on the server (1.5 s, then 4 s while a new schema is prepared) and some room. */
/** How long the research request may run on behind the flow (the agent's turns are about a minute). 【仮】 */
export const RESEARCH_HARD_TIMEOUT_MS = 180_000;
export const SAFETY_TIMEOUT_MS = 6000;

export interface SessionOptions {
  store: FlowStore;
  /** The worker client; null runs with templates and the fallback pool only. */
  api?: FlowApi | null;
  input?: Omit<FlowInput, "introSeen" | "consented" | "research">;
  kohaiTimeoutMs?: number;
  researchTimeoutMs?: number;
  researchHardTimeoutMs?: number;
  safetyTimeoutMs?: number;
  scenesTimeoutMs?: number;
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
  // The screen's language is the device's choice (HANDOFF §7 の4) unless the caller names one.
  const actor = createActor(flowMachine, {
    input: { lang: settings.lang, ...(opts.input ?? {}), introSeen: settings.introSeen, consented: settings.consented, research },
  });

  let stopped = false;
  let lastLine: Line | null = null;
  let researchSent: ResearchRequest | null = null;
  let scenesSent: ScenesRequest | null = null;
  let saved = { consented: settings.consented, introSeen: settings.introSeen, research, log: 0, safety: 0, cards: 0 };
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
    // The child waits at most the short wait; the request itself runs on (up to RESEARCH_HARD_TIMEOUT_MS), and a
    // pool that comes after the wait is handed over as RESEARCH_LATE (the Opus agent takes about a minute).
    const ctrl = new AbortController();
    const hard = setTimeout(() => ctrl.abort(), opts.researchHardTimeoutMs ?? RESEARCH_HARD_TIMEOUT_MS);
    let settled = false;
    const settle = (pool: Hypothesis[] | null): void => {
      if (settled || stopped) return;
      settled = true;
      actor.send({ type: "RESEARCH_RESULT", pool });
    };
    const soft = setTimeout(() => settle(null), opts.researchTimeoutMs ?? RESEARCH_TIMEOUT_MS);
    api
      .research(req, ctrl.signal)
      .then((reply) => {
        const pool = reply.kind === "submitted" ? reply.pool : null;
        if (!settled) {
          clearTimeout(soft);
          settle(pool);
        } else if (pool !== null && !stopped) actor.send({ type: "RESEARCH_LATE", pool });
      })
      .catch(() => {
        clearTimeout(soft);
        settle(null);
      })
      .finally(() => clearTimeout(hard));
  };

  // One call per reading the scenes are made for (指示書 第6.7節 手順5). The machine takes the reply only for that
  // reading and only when core passes it; nothing of the reply is kept but the checked scenes.
  const askScenes = (req: ScenesRequest): void => {
    const call = api?.scenes;
    if (api === null || call === undefined) return;
    void within(opts.scenesTimeoutMs ?? SCENES_TIMEOUT_MS, (signal) => call.call(api, req, signal))
      .then((reply) => {
        if (stopped || reply === "timeout" || reply.source !== "claude" || reply.proposal === null) return;
        actor.send({ type: "SCENES_RESULT", focusId: req.rule.id, proposal: reply.proposal, reason: typeof reply.reason === "string" ? reply.reason : null });
      })
      .catch(() => undefined);
  };

  actor.subscribe((snap) => {
    const c = snap.context;
    if (c.line !== null && c.line !== lastLine && c.line.seq !== lastLine?.seq && c.line.source === "template") askKohai(c.line);
    lastLine = c.line;
    const scenes = c.ruleCard?.scenes ?? null;
    if (scenes !== null && scenes.source === "program" && scenes.request !== scenesSent) {
      scenesSent = scenes.request;
      askScenes(scenes.request);
    }
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
    for (const card of c.cardLog.slice(saved.cards)) write(() => store.addCard(card));
    saved = { consented: c.consented, introSeen: c.introSeen, research: c.research, log: c.log.length, safety: c.safetyLog.length, cards: c.cardLog.length };
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
