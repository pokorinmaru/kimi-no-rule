// The worker knows the stored problems the device may send (指示書 第6.7節 手順3・手順6, Q33・Q48): the prepared
// bank and every file under content/problems/discriminating and content/problems/transfer that core accepts,
// read once at start. Unknown ids are still refused. Written before the implementation.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FRACTION_BANK, PREPARED_BANK, type ProblemRecord } from "@kimi/core";
import { CONTENT_DIR, readStored, workerBank } from "./stored.ts";
import { WORKER_BANK } from "./index.ts";

const ids = (rs: readonly ProblemRecord[]) => rs.map((r) => r.world.problem_id);
const filesIn = (sub: string) => readdirSync(join(CONTENT_DIR, sub)).filter((f) => /^p_.*\.json$/.test(f)).map((f) => f.replace(/\.json$/, ""));

const base = FRACTION_BANK[0] as ProblemRecord;
const made = (id: string, source: ProblemRecord["source"]): ProblemRecord => ({
  ...structuredClone(base),
  world: { ...structuredClone(base.world), problem_id: id },
  source,
  checks: { double_build_match: true, restate_match: true, misread_pass_rate: 1, human_checked: false },
});

let tmp: string | null = null;
afterEach(() => {
  if (tmp !== null) rmSync(tmp, { recursive: true, force: true });
  tmp = null;
});

describe("the worker's bank", () => {
  it("is the prepared bank, then every stored discriminating and transfer problem (checked by a person or not)", () => {
    const bank = workerBank();
    expect(ids(bank).slice(0, PREPARED_BANK.length)).toEqual(ids(PREPARED_BANK));
    for (const id of [...filesIn("discriminating"), ...filesIn("transfer")]) expect(ids(bank)).toContain(id);
    expect(ids(WORKER_BANK)).toEqual(ids(bank));
  });

  it("takes only what core accepts, each folder with its own source, and skips files that are not records", () => {
    tmp = mkdtempSync(join(tmpdir(), "kimi-stored-"));
    mkdirSync(join(tmp, "discriminating"));
    mkdirSync(join(tmp, "transfer"));
    const broken = made("p_disc_broken_1", "discriminating_bank");
    broken.world.relations = [];
    writeFileSync(join(tmp, "discriminating", "p_disc_ok_1.json"), JSON.stringify(made("p_disc_ok_1", "discriminating_bank")));
    writeFileSync(join(tmp, "discriminating", "p_disc_broken_1.json"), JSON.stringify(broken));
    writeFileSync(join(tmp, "discriminating", "p_disc_bad_1.json"), "{not json");
    writeFileSync(join(tmp, "discriminating", "pairs.json"), JSON.stringify(made("p_disc_pairs_1", "discriminating_bank")));
    writeFileSync(join(tmp, "transfer", "p_transfer_ok_1.json"), JSON.stringify(made("p_transfer_ok_1", "research")));
    writeFileSync(join(tmp, "transfer", "p_transfer_src_1.json"), JSON.stringify(made("p_transfer_src_1", "discriminating_bank")));
    expect(ids(readStored(tmp))).toEqual(["p_disc_ok_1", "p_transfer_ok_1"]);
  });

  it("is the prepared bank alone when the folders are missing", () => {
    tmp = mkdtempSync(join(tmpdir(), "kimi-stored-"));
    expect(readStored(tmp)).toEqual([]);
    expect(workerBank(tmp)).toBe(PREPARED_BANK);
  });
});
