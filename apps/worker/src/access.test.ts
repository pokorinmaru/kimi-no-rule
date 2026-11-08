// The worker hosted for the judges (the public judge build): only the hosted page may call it, and only with the
// passcode the judges are given. Without that setting the worker stays local-only, as on the developer's PC.
import { describe, expect, it, vi } from "vitest";
import type { AgentClient, AgentStep, ClaudeClient } from "@kimi/interpret";
import { createApp, type WorkerDeps } from "./app.ts";

const PAGE = "https://kimi-no-rule.pages.dev";
const HOST = "kimi-no-rule-worker.example.workers.dev";
const PASS = "zz-test-pass-123";

class NoAgent implements AgentClient {
  async step(): Promise<AgentStep> {
    return { stopReason: "end_turn", text: "", toolCalls: [] };
  }
}

function hosted(over: Partial<WorkerDeps> = {}, passcode: string | null = PASS) {
  const complete = vi.fn(async () => ({ stopReason: "end_turn" as const, text: JSON.stringify({ schema_version: "1", safety_flag: "none" }) }));
  const client: ClaudeClient = { complete };
  const app = createApp({ client: () => client, agent: () => new NoAgent(), access: { origins: [PAGE], hosts: [HOST], passcode: () => passcode }, ...over });
  return { app, complete };
}

const call = (app: ReturnType<typeof createApp>, path: string, headers: Record<string, string>, body: unknown = { text: "hi" }) =>
  app.request(`https://${HOST}${path}`, { method: "POST", headers: { "content-type": "application/json", host: HOST, ...headers }, body: JSON.stringify(body) });

describe("the hosted worker", () => {
  it("answers a route from the hosted page with the right passcode", async () => {
    const { app, complete } = hosted();
    const res = await call(app, "/safety", { origin: PAGE, "x-kimi-pass": PASS });
    expect(res.status).toBe(200);
    expect(complete).toHaveBeenCalled();
  });

  it("refuses without the passcode or with a wrong one (401), and never calls Claude", async () => {
    const { app, complete } = hosted();
    expect((await call(app, "/safety", { origin: PAGE })).status).toBe(401);
    expect((await call(app, "/safety", { origin: PAGE, "x-kimi-pass": "wrong" })).status).toBe(401);
    expect((await call(app, "/safety", { origin: PAGE, "x-kimi-pass": `${PASS}x` })).status).toBe(401);
    expect(complete).not.toHaveBeenCalled();
  });

  it("refuses another page and another host (403), even with the passcode", async () => {
    const { app } = hosted();
    expect((await call(app, "/safety", { origin: "https://evil.example.com", "x-kimi-pass": PASS })).status).toBe(403);
    const res = await app.request("https://other.example.com/safety", {
      method: "POST",
      headers: { "content-type": "application/json", host: "other.example.com", origin: PAGE, "x-kimi-pass": PASS },
      body: JSON.stringify({ text: "hi" }),
    });
    expect(res.status).toBe(403);
  });

  it("refuses everything when no passcode is set: a hosted worker is never open", async () => {
    const { app, complete } = hosted({}, null);
    expect((await call(app, "/safety", { origin: PAGE, "x-kimi-pass": PASS })).status).toBe(503);
    expect((await call(app, "/pass", { origin: PAGE, "x-kimi-pass": PASS }, {})).status).toBe(503);
    expect(complete).not.toHaveBeenCalled();
  });

  it("POST /pass checks the passcode without calling Claude", async () => {
    const { app, complete } = hosted();
    expect((await call(app, "/pass", { origin: PAGE, "x-kimi-pass": PASS }, {})).status).toBe(204);
    expect((await call(app, "/pass", { origin: PAGE, "x-kimi-pass": "wrong" }, {})).status).toBe(401);
    expect(complete).not.toHaveBeenCalled();
  });

  it("lets the hosted page's preflight through with the passcode header allowed", async () => {
    const { app } = hosted();
    const res = await app.request(`https://${HOST}/safety`, {
      method: "OPTIONS",
      headers: { host: HOST, origin: PAGE, "access-control-request-method": "POST", "access-control-request-headers": "content-type,x-kimi-pass" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe(PAGE);
    expect((res.headers.get("access-control-allow-headers") ?? "").toLowerCase()).toContain("x-kimi-pass");
  });
});

describe("the local worker (no hosting set)", () => {
  it("still answers this device's pages without a passcode, and still refuses other pages", async () => {
    const client: ClaudeClient = { complete: async () => ({ stopReason: "end_turn", text: JSON.stringify({ schema_version: "1", safety_flag: "none" }) }) };
    const app = createApp({ client: () => client, agent: () => new NoAgent() });
    const local = (origin: string) =>
      app.request("/safety", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ text: "hi" }) });
    expect((await local("http://localhost:5173")).status).toBe(200);
    expect((await local(PAGE)).status).toBe(403);
  });
});
