// Runs the worker on this PC (HANDOFF §3: no cloud). `node src/serve.ts` from apps/worker.
// Only the port is printed; no request is ever logged.
import { serve } from "@hono/node-server";
import { app } from "./index.ts";

export const PORT = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port: PORT, hostname: "127.0.0.1" }, (info) => {
  process.stdout.write(`kimi worker on http://127.0.0.1:${info.port}\n`);
});
