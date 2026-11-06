#!/usr/bin/env node
// Stop: run the whole `pnpm test`; if it fails, block the session from finishing.
// stop_hook_active (already continuing because of a stop hook) passes through to avoid an endless loop.
import { spawnSync } from "node:child_process";
import { projectDir, readInput, tail } from "./lib/common.mjs";

async function main() {
  const input = await readInput();
  if (input["stop_hook_active"] === true) return;

  const root = projectDir(input);
  const r = spawnSync("pnpm test", {
    cwd: root,
    shell: true,
    encoding: "utf8",
    timeout: 540_000,
    env: { ...process.env, CI: "1", FORCE_COLOR: "0" },
  });
  if (r.status === 0) return;

  const out = `${r.stdout ?? ""}${r.stderr ?? ""}${r.error ? String(r.error) : ""}`;
  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason: `pnpm test が失敗しています（exit ${r.status}）。直してから終えてください。\n${tail(out, 60)}`,
    }),
  );
}

main().catch((/** @type {unknown} */ e) => {
  process.stdout.write(JSON.stringify({ decision: "block", reason: `stop-gate internal error: ${String(e)}` }));
});
