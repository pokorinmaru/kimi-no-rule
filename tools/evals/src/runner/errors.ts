// Errors kept per item: the class, the HTTP status when there is one, and the message with any key removed.
// Clients that record every call's error, so errors the evaluated code swallows (it falls back) still show.
import type { AgentClient, ClaudeClient } from "@kimi/interpret";

export interface ItemError {
  class: string;
  status: number | null;
  message: string;
}

const KEY_LIKE = /sk-ant-[A-Za-z0-9_-]+/g;
const MAX_MESSAGE = 400;

export function redact(text: string, secrets: readonly (string | undefined)[] = [process.env.ANTHROPIC_API_KEY]): string {
  let out = text;
  for (const s of secrets) if (s !== undefined && s.length >= 8) out = out.split(s).join("[redacted]");
  return out.replace(KEY_LIKE, "[redacted]");
}

export function describeError(e: unknown, secrets?: readonly (string | undefined)[]): ItemError {
  const cls = e instanceof Error ? e.constructor.name || e.name : typeof e;
  const raw = e instanceof Error ? e.message : String(e);
  const status = typeof e === "object" && e !== null && typeof (e as { status?: unknown }).status === "number" ? (e as { status: number }).status : null;
  const message = redact(raw.replace(/\s+/g, " ").trim(), secrets);
  return { class: cls, status, message: message.length > MAX_MESSAGE ? `${message.slice(0, MAX_MESSAGE)}…` : message };
}

export interface CallLog {
  calls: number;
  errors: ItemError[];
  /** Calls aborted because the caller's deadline passed: the code under test handles these, they are not errors. */
  timeouts: number;
}

export const newCallLog = (): CallLog => ({ calls: 0, errors: [], timeouts: 0 });

function note(log: CallLog, e: unknown, signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) log.timeouts++;
  else log.errors.push(describeError(e));
}

export function recordingClient(inner: ClaudeClient, log: CallLog): ClaudeClient {
  return {
    complete: async (req) => {
      log.calls++;
      try {
        return await inner.complete(req);
      } catch (e) {
        note(log, e, req.signal);
        throw e;
      }
    },
  };
}

export function recordingAgent(inner: AgentClient, log: CallLog): AgentClient {
  return {
    step: async (req) => {
      log.calls++;
      try {
        return await inner.step(req);
      } catch (e) {
        note(log, e, req.signal);
        throw e;
      }
    },
  };
}
