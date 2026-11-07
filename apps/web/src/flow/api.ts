// The calls to the local worker (apps/worker). Nothing here keeps a body; a non-2xx reply throws, so the
// session falls back to templates, the fallback pool, or "unchecked".
import type { Hypothesis, SceneChoice } from "@kimi/core";
import type { KohaiRequest, ResearchRequest, SafetyFlagEvent, ScenesRequest } from "./machine.ts";

export interface KohaiReply {
  text: string;
  source: "generated" | "template";
  rejected: string[];
}

export type ResearchReply = { kind: "submitted"; pool: Hypothesis[] } | { kind: "failed" };

export interface SafetyReply {
  flag: SafetyFlagEvent;
}

/** POST /scenes: the choices for the two everyday scenes (the device builds and checks them again with core). */
export interface ScenesReply {
  source: "claude" | "program" | "none";
  proposal: { breaks: SceneChoice; keeps: SceneChoice } | null;
  reason: string | null;
}

export interface FlowApi {
  kohai(req: KohaiRequest, signal: AbortSignal): Promise<KohaiReply>;
  research(req: ResearchRequest, signal: AbortSignal): Promise<ResearchReply>;
  safety(text: string, signal: AbortSignal): Promise<SafetyReply>;
  /** Optional: without it the program's scenes stay. */
  scenes?(req: ScenesRequest, signal: AbortSignal): Promise<ScenesReply>;
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
    scenes: (req, signal) => post<ScenesReply>("/scenes", req, signal),
  };
}
