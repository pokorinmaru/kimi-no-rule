/// <reference types="vite/client" />
// The calls to the local worker (apps/worker). Nothing here keeps a body; a non-2xx reply throws, so the
// session falls back to templates, the fallback pool, or "unchecked".
import type { AnyOp, Hypothesis, Lang, SceneChoice } from "@kimi/core";
import type { KohaiRequest, ResearchRequest, SafetyFlagEvent, ScenesRequest } from "./machine.ts";
import { PASS_HEADER, getPasscode } from "./passcode.ts";

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

/** POST /interpret: what the browser heard, with the problem by id (the worker takes the record from its bank). */
export interface InterpretRequest {
  problem_id: string;
  transcript: string;
  lang: Lang;
}

/** The ops core validated on the worker, the child's words taken out of them; none unless the status is "ok". */
export interface InterpretReply {
  status: "ok" | "ask_back" | "error";
  ops: AnyOp[];
}

/** POST /wish (Q61): the kind, and for a wish the rephrased request core let through (never the child's words). */
export type WishReply = { kind: "wish"; request: string } | { kind: "distress" } | { kind: "unchecked" } | { kind: "no_request" };

/** A reply that was not 2xx; the status tells "no key" (503) from other failures. */
export class WorkerError extends Error {
  constructor(readonly status: number) {
    super(`worker: ${String(status)}`);
    this.name = "WorkerError";
  }
}

export interface FlowApi {
  kohai(req: KohaiRequest, signal: AbortSignal): Promise<KohaiReply>;
  research(req: ResearchRequest, signal: AbortSignal): Promise<ResearchReply>;
  safety(text: string, signal: AbortSignal): Promise<SafetyReply>;
  /** Optional: without it the program's scenes stay. */
  scenes?(req: ScenesRequest, signal: AbortSignal): Promise<ScenesReply>;
  /** Optional: without it the child's voice is not offered. */
  interpret?(req: InterpretRequest, signal: AbortSignal): Promise<InterpretReply>;
  /** Optional: without it a wish stays on the device with no request. */
  wish?(text: string, signal: AbortSignal): Promise<WishReply>;
}

/**
 * The local server. A build may point elsewhere with VITE_API_BASE: the e2e build points at a port nobody
 * listens on, so the tests never reach a local server that happens to run with a key (run-through, 2026-11-08).
 */
export const DEFAULT_API_BASE: string = (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "http://localhost:8787";

export function createHttpApi(base: string = DEFAULT_API_BASE, fetchImpl: typeof fetch = (...a) => fetch(...a)): FlowApi {
  const post = async <T>(path: string, body: unknown, signal: AbortSignal): Promise<T> => {
    const pass = getPasscode();
    const res = await fetchImpl(`${base}${path}`, {
      method: "POST",
      // The judges' passcode in the public judge build; none locally.
      headers: { "content-type": "application/json", ...(pass === null ? {} : { [PASS_HEADER]: pass }) },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new WorkerError(res.status);
    return (await res.json()) as T;
  };
  return {
    kohai: (req, signal) => post<KohaiReply>("/kohai", req, signal),
    research: (req, signal) => post<ResearchReply>("/research", req, signal),
    safety: (text, signal) => post<SafetyReply>("/safety", { text }, signal),
    scenes: (req, signal) => post<ScenesReply>("/scenes", req, signal),
    interpret: (req, signal) => post<InterpretReply>("/interpret", req, signal),
    wish: (text, signal) => post<WishReply>("/wish", { text }, signal),
  };
}
