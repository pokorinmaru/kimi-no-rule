// The stored problems as one JSON for the worker hosted on Cloudflare, where there is no file system to read
// content/problems from (the public judge build). The same files the local worker reads with node fs; a test keeps
// the bundle equal to them, and `pnpm --filter @kimi/worker bundle:stored` writes it again.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTENT_DIR } from "./stored.ts";

export interface StoredBundle {
  discriminating: unknown[];
  transfer: unknown[];
}

export const BUNDLE_PATH = fileURLToPath(new URL("./stored.gen.json", import.meta.url));

function rawsIn(dir: string): unknown[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((x) => /^p_.*\.json$/.test(x))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as unknown);
}

/** The stored problems' raw records, as the local worker would read them. */
export function storedBundle(root: string = CONTENT_DIR): StoredBundle {
  return { discriminating: rawsIn(join(root, "discriminating")), transfer: rawsIn(join(root, "transfer")) };
}

export function writeBundle(path: string = BUNDLE_PATH): void {
  writeFileSync(path, `${JSON.stringify(storedBundle(), null, 2)}\n`);
}
