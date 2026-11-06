// The calls to the local worker (apps/worker). Nothing here keeps a body; a non-2xx reply throws, so the
// session falls back to templates, the fallback pool, or "unchecked".
import type { Hypothesis } from "@kimi/core";
import type { KohaiRequest, ResearchRequest, SafetyFlagEvent } from "./machine.ts";

export interface KohaiReply {
  text: string;
  source: "generated" | "template";
  rejected: string[];
}

export type ResearchReply = { kind: "submitted"; pool: Hypothesis[] } | { kind: "failed" };

export interface SafetyReply {
  flag: SafetyFlagEvent;
}

export interface FlowApi {
  kohai(req: KohaiRequest, signal: AbortSignal): Promise<KohaiReply>;
  research(req: ResearchRequest, signal: AbortSignal): Promise<ResearchReply>;
  safety(text: string, signal: AbortSignal): Promise<SafetyReply>;
}

export const DEFAULT_API_BASE = "http://localhost:8787";

export function createHttpApi(base: string = DEFAULT_API_BASE, fetchImpl: typeof fetch = (...a) => fetch(...a)): FlowApi {
  const post = async <T>(path: string, body: unknown, signal: AbortSignal): Promise<T> => {
    const res = await fetchImpl(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new Error(`worker ${path}: ${res.status}`);
    return (await res.json()) as T;
  };
  return {
    kohai: (req, signal) => post<KohaiReply>("/kohai", req, signal),
    research: (req, signal) => post<ResearchReply>("/research", req, signal),
    safety: (text, signal) => post<SafetyReply>("/safety", { text }, signal),
  };
}
