// The worker hosted on Cloudflare Workers for the judges (the public judge build). The same app as the local worker,
// with the key, the passcode, the page's origins and the worker's host names from the Cloudflare environment (secrets
// and vars, never code), and the stored problems from the bundled JSON (no file system there). Nothing is logged or
// stored, as locally; without a passcode the worker refuses everything.
import { PREPARED_BANK, acceptStored, withStored, type ProblemRecord } from "@kimi/core";
import { anthropicAgentClient, anthropicClient } from "@kimi/interpret";
import { createApp, type HostedAccess } from "./app.ts";
import bundle from "./stored.gen.json" with { type: "json" };

export interface CloudflareEnv {
  ANTHROPIC_API_KEY?: string;
  JUDGE_PASSCODE?: string;
  /** The hosted page's origins, comma-separated (e.g. https://kimi-no-rule.pages.dev). */
  ALLOWED_ORIGINS?: string;
  /** The worker's own host names, comma-separated (e.g. kimi-no-rule-worker.<account>.workers.dev). */
  WORKER_HOSTS?: string;
}

const list = (s: string | undefined): string[] =>
  (s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x !== "");

export function accessOf(env: CloudflareEnv): HostedAccess {
  const pass = env.JUDGE_PASSCODE?.trim() ?? "";
  return { origins: list(env.ALLOWED_ORIGINS), hosts: list(env.WORKER_HOSTS), passcode: () => (pass === "" ? null : pass) };
}

/** The prepared bank, then the bundled stored problems core accepts (the same as the local worker's). */
export function bankOf(): readonly ProblemRecord[] {
  return withStored(PREPARED_BANK, [...acceptStored(bundle.discriminating, "discriminating_bank"), ...acceptStored(bundle.transfer, "research")]);
}

const BANK = bankOf();
let built: { env: CloudflareEnv; app: ReturnType<typeof createApp> } | null = null;

function appFor(env: CloudflareEnv): ReturnType<typeof createApp> {
  if (built !== null && built.env === env) return built.app;
  const key = env.ANTHROPIC_API_KEY?.trim() ?? "";
  const app = createApp({
    bank: BANK,
    client: () => (key === "" ? null : anthropicClient({ apiKey: key })),
    agent: () => (key === "" ? null : anthropicAgentClient({ apiKey: key })),
    access: accessOf(env),
  });
  built = { env, app };
  return app;
}

export default {
  fetch(request: Request, env: CloudflareEnv): Response | Promise<Response> {
    return appFor(env).fetch(request);
  },
};
