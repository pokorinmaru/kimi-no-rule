// The worker's app with the key from the environment (never from code). The key is read on each request,
// so a key set after start is used, and no key answers 503.
import { anthropicAgentClient, anthropicClient } from "@kimi/interpret";
import { createApp } from "./app.ts";

export const PACKAGE = "@kimi/worker";

const key = (): string | null => {
  const k = process.env.ANTHROPIC_API_KEY;
  return k === undefined || k.trim() === "" ? null : k;
};

export const app = createApp({
  client: () => {
    const k = key();
    return k === null ? null : anthropicClient({ apiKey: k });
  },
  agent: () => {
    const k = key();
    return k === null ? null : anthropicAgentClient({ apiKey: k });
  },
});

export { createApp, BODY_LIMITS, type WorkerDeps } from "./app.ts";
