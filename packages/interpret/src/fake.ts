// Test-only stand-ins for Claude (指示書 第11節 M1b). No test in this package talks to the real API.
// FakeClaude records every request and answers from a list in order; when the list runs out it keeps
// giving the last reply. A reply can wait before answering, and gives up when the request is aborted.
import type { AgentClient, AgentStep, AgentTool } from "./agent.ts";
import type { ClaudeClient, ClaudeRequest, ClaudeResponse } from "./client.ts";

export type FakeReply =
  | { kind: "response"; response: ClaudeResponse; delayMs?: number }
  | { kind: "throw"; error: Error; delayMs?: number };

/** A finished answer whose text is the JSON of `value`. */
export const json = (value: unknown, delayMs = 0): FakeReply => ({
  kind: "response",
  response: { stopReason: "end_turn", text: JSON.stringify(value) },
  delayMs,
});

/** An answer with raw text (for text that is not JSON). */
export const text = (body: string, delayMs = 0): FakeReply => ({
  kind: "response",
  response: { stopReason: "end_turn", text: body },
  delayMs,
});

/** An answer that stopped for a reason other than finishing. */
export const stopped = (stopReason: ClaudeResponse["stopReason"], delayMs = 0): FakeReply => ({
  kind: "response",
  response: { stopReason, text: "" },
  delayMs,
});

/** A call that fails. */
export const fails = (message = "fake failure", delayMs = 0): FakeReply => ({ kind: "throw", error: new Error(message), delayMs });

function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    if (ms <= 0) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class FakeClaude implements ClaudeClient {
  readonly requests: ClaudeRequest[] = [];
  private next = 0;

  constructor(private readonly replies: readonly FakeReply[]) {
    if (replies.length === 0) throw new Error("FakeClaude needs at least one reply");
  }

  async complete(req: ClaudeRequest): Promise<ClaudeResponse> {
    this.requests.push(req);
    const reply = this.replies[Math.min(this.next, this.replies.length - 1)] as FakeReply;
    this.next++;
    await wait(reply.delayMs ?? 0, req.signal);
    if (reply.kind === "throw") throw reply.error;
    return reply.response;
  }
}

export interface RecordedStep {
  model: string;
  system: string;
  /** A copy taken when the step was asked for, so later changes to the array do not show here. */
  messages: unknown[];
  toolNames: string[];
}

export class FakeAgent implements AgentClient {
  readonly steps: RecordedStep[] = [];
  private next = 0;

  constructor(private readonly replies: readonly AgentStep[]) {
    if (replies.length === 0) throw new Error("FakeAgent needs at least one reply");
  }

  async step(req: { model: string; system: string; messages: unknown[]; tools: AgentTool[] }): Promise<AgentStep> {
    this.steps.push({
      model: req.model,
      system: req.system,
      messages: structuredClone(req.messages),
      toolNames: req.tools.map((t) => t.name),
    });
    const reply = this.replies[Math.min(this.next, this.replies.length - 1)] as AgentStep;
    this.next++;
    return structuredClone(reply);
  }
}
