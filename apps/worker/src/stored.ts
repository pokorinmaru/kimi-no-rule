// The stored problems the device may send (Q33・Q48): every file under content/problems/discriminating and
// content/problems/transfer, read once with node fs when the worker starts, joins the prepared bank only when
// core accepts it (core acceptStored, the same check as the device's bank). Whether a person has checked it does
// not matter here: the adults' try route may send the unchecked ones, and the child's route never does.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FRACTION_BANK, acceptStored, withStored, type ProblemRecord } from "@kimi/core";

export const CONTENT_DIR = fileURLToPath(new URL("../../../content/problems/", import.meta.url));

/** Each folder and the source its records carry. */
const FOLDERS: readonly { dir: string; source: ProblemRecord["source"] }[] = [
  { dir: "discriminating", source: "discriminating_bank" },
  { dir: "transfer", source: "research" },
];

function rawsIn(dir: string): unknown[] {
  if (!existsSync(dir)) return [];
  const out: unknown[] = [];
  for (const f of readdirSync(dir).filter((x) => /^p_.*\.json$/.test(x)).sort()) {
    try {
      out.push(JSON.parse(readFileSync(join(dir, f), "utf8")));
    } catch {
      // not JSON: never a record
    }
  }
  return out;
}

/** The stored records core accepts, the discriminating ones first, then the transfer ones. */
export function readStored(root: string = CONTENT_DIR): ProblemRecord[] {
  return FOLDERS.flatMap((f) => acceptStored(rawsIn(join(root, f.dir)), f.source));
}

/** The prepared bank, then the stored records (a prepared id is never replaced). */
export function workerBank(root: string = CONTENT_DIR): readonly ProblemRecord[] {
  return withStored(FRACTION_BANK, readStored(root));
}
