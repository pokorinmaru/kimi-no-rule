// The offline transfer problems (指示書 第6.7節 手順6; Q33): the plan (each common misreading × same/different
// wording, a fixed problem the misreading fails on, at most 8 a run, slots already stored skipped), the expected
// number of calls, the files written (records unchecked by a person, the transfer list, a build log marked for
// adults), the checker that runs core again, and the loader. Fake Claude only. Written before the implementation.
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMMON_MISREADINGS, FRACTION_BANK, schemas, type ProblemRecord } from "@kimi/core";
import { oldReadingFails, type BuildDeps, type BuildInput, type BuildOutcome } from "@kimi/interpret";
import { FakeAgent, FakeClaude, json } from "../../../packages/interpret/src/fake.ts";
import {
  MAX_TRANSFER,
  TRANSFERS_FILE,
  checkStoredTransfer,
  expectedTransferCalls,
  makeTransfer,
  planTransfer,
  readStoredTransfer,
  writeMadeTransfer,
  type TransferMeta,
} from "./transfer.ts";
import { transferBankFor, transferPairFor } from "./transfer-bank.ts";

const bank = (id: string): ProblemRecord => {
  const r = FRACTION_BANK.find((x) => x.world.problem_id === id);
  if (r === undefined) throw new Error(id);
  return r;
};
const swap = COMMON_MISREADINGS.find((h) => h.id === "c_swap");
if (swap === undefined) throw new Error("c_swap");
const fixed = bank("p_fraction_c");
const plainOther = bank("p_bank_sticker");
const taishite = bank("p_bank_taishite");

const asMade = (r: ProblemRecord, id: string): ProblemRecord => ({
  ...structuredClone(r),
  world: { ...structuredClone(r.world), problem_id: id },
  source: "research",
  checks: { double_build_match: true, restate_match: true, misread_pass_rate: 0.55, human_checked: false },
});

describe("planTransfer", () => {
  it("one slot per common misreading and wording, each with a bank problem the misreading fails on, at most the cap", () => {
    const plan = planTransfer(FRACTION_BANK, { records: [], meta: {} });
    expect(MAX_TRANSFER).toBe(8);
    expect(plan.slots.length).toBeLessThanOrEqual(MAX_TRANSFER);
    expect(plan.slots.length).toBe(Math.min(MAX_TRANSFER, 2 * (COMMON_MISREADINGS.length - plan.noFixed.length)));
    for (const s of plan.slots) {
      expect(COMMON_MISREADINGS.some((h) => h.id === s.reading.id)).toBe(true);
      expect(oldReadingFails(s.fixed, s.reading)).toBe(true);
    }
    const keys = plan.slots.map((s) => `${s.reading.id}|${s.wording}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(plan.slots[0]).toMatchObject({ wording: "same" });
    expect(plan.slots[1]).toMatchObject({ wording: "different", reading: plan.slots[0]?.reading });
    expect(planTransfer(FRACTION_BANK, { records: [], meta: {} }, { cap: 3 }).slots).toHaveLength(3);
  });

  it("skips the slots already stored, so the next run fills the rest", () => {
    const first = planTransfer(FRACTION_BANK, { records: [], meta: {} });
    const s0 = first.slots[0];
    if (s0 === undefined) throw new Error("no slot");
    const meta: Record<string, TransferMeta> = { p_x: { oldReading: s0.reading, wording: s0.wording, fixedProblemId: s0.fixed.world.problem_id, fixedText: s0.fixed.world.problem_text } };
    const next = planTransfer(FRACTION_BANK, { records: [], meta });
    expect(next.slots.some((s) => s.reading.id === s0.reading.id && s.wording === s0.wording)).toBe(false);
  });
});

describe("expectedTransferCalls", () => {
  it("per problem one writer call (two with the retry), two builds and the judge calls, and the Haiku misread calls", () => {
    const c = expectedTransferCalls(8);
    expect(c.problems).toBe(8);
    expect(c.opusTypical).toBe(8 * (1 + 2 * 5 + 3));
    expect(c.opusMax).toBe(8 * (2 + 2 * 12 + 3 * 2));
    expect(c.haikuMax).toBe(8 * 20);
  });
});

describe("makeTransfer and the files", () => {
  const deps = (text: string): BuildDeps => ({
    agent: new FakeAgent([{ stopReason: "end_turn", text: "done", toolCalls: [] }]),
    judge: new FakeClaude([json({ problem_text: text, consistency: "consistent", why: "w" })]),
    listen: new FakeClaude([json({})]),
  });
  const adopt = (r: ProblemRecord) => async (_d: BuildDeps, i: BuildInput): Promise<BuildOutcome> => ({ status: "adopted", record: asMade(r, i.problemId), log: [{ step: "adopt", ok: true, detail: i.problemId }] });
  const sameSlot = { reading: swap, wording: "same" as const, fixed };
  const diffSlot = { reading: swap, wording: "different" as const, fixed };

  it("writes each kept record unchecked, its transfer entry and a build log marked for adults; the checker and the loader pass them", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kimi-transfer-"));
    const seen: { kept: number; refused: number; index: number; total: number }[] = [];
    const a = await makeTransfer(deps(plainOther.world.problem_text), { slots: [sameSlot], bank: [], stored: readStoredTransfer(dir) }, { build: adopt(plainOther) }, {
      onSlot: (d) => seen.push({ kept: d.kept, refused: d.refused, index: d.index, total: d.total }),
    });
    expect(seen).toEqual([{ kept: 1, refused: 0, index: 1, total: 1 }]);
    writeMadeTransfer(dir, a);
    const b = await makeTransfer(deps(taishite.world.problem_text), { slots: [diffSlot], bank: [], stored: readStoredTransfer(dir) }, { build: adopt(taishite) });
    writeMadeTransfer(dir, b);
    const files = readdirSync(dir).sort();
    expect(files).toEqual(["build-log.adult-only.md", "p_transfer_c_swap_different_1.json", "p_transfer_c_swap_same_1.json", TRANSFERS_FILE]);
    const log = readFileSync(join(dir, "build-log.adult-only.md"), "utf8");
    expect(log).toMatch(/大人/);
    expect(log).toContain("c_swap");
    expect(log.match(/^# /gm)).toHaveLength(1);
    const rec = schemas.problemRecord.parse(JSON.parse(readFileSync(join(dir, "p_transfer_c_swap_same_1.json"), "utf8")));
    expect(rec.source).toBe("research");
    expect(rec.checks.human_checked).toBe(false);
    expect(rec.checks.misread_pass_rate).toBe(0.55);
    const meta = JSON.parse(readFileSync(join(dir, TRANSFERS_FILE), "utf8")) as Record<string, TransferMeta>;
    expect(meta.p_transfer_c_swap_same_1).toMatchObject({ wording: "same", fixedProblemId: fixed.world.problem_id });
    expect(checkStoredTransfer(dir)).toEqual({ records: 2, errors: [] });

    // The loader: nothing while unchecked unless asked; both wordings for the reading when asked.
    expect(transferBankFor({ dir })).toEqual([]);
    const all = transferBankFor({ dir, includeUnchecked: true });
    expect(all.map((e) => e.record.world.problem_id).sort()).toEqual(["p_transfer_c_swap_different_1", "p_transfer_c_swap_same_1"]);
    const pair = transferPairFor(all, "c_swap");
    expect(pair.same?.wording).toBe("same");
    expect(pair.different?.wording).toBe("different");
    expect(transferPairFor(all, "c_invert")).toEqual({ same: null, different: null });

    // A second run numbers past what is there.
    const c = await makeTransfer(deps(bank("p_bank_card").world.problem_text), { slots: [sameSlot], bank: [], stored: readStoredTransfer(dir) }, { build: adopt(bank("p_bank_card")) });
    expect(c.accepted[0]?.world.problem_id).toBe("p_transfer_c_swap_same_2");
  });

  it("logs a refusal and keeps nothing for it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kimi-transfer-"));
    const made = await makeTransfer(deps(taishite.world.problem_text), { slots: [sameSlot], bank: [], stored: readStoredTransfer(dir) }, { build: adopt(taishite) });
    expect(made.accepted).toEqual([]);
    expect(made.log).toContain("wording_mismatch");
    // The bank's texts are never repeated.
    const again = await makeTransfer(deps(plainOther.world.problem_text), { slots: [sameSlot], bank: FRACTION_BANK, stored: readStoredTransfer(dir) }, { build: adopt(plainOther) });
    expect(again.log).toContain("duplicate_text");
  });

  it("never writes human_checked true, whatever the record said", () => {
    const dir = mkdtempSync(join(tmpdir(), "kimi-transfer-"));
    const rec = asMade(plainOther, "p_transfer_c_swap_same_1");
    writeMadeTransfer(dir, {
      accepted: [{ ...rec, checks: { ...rec.checks, human_checked: true } }],
      meta: { p_transfer_c_swap_same_1: { oldReading: swap, wording: "same", fixedProblemId: fixed.world.problem_id, fixedText: fixed.world.problem_text } },
      log: "x\n",
    });
    const back = schemas.problemRecord.parse(JSON.parse(readFileSync(join(dir, "p_transfer_c_swap_same_1.json"), "utf8")));
    expect(back.checks.human_checked).toBe(false);
  });
});

describe("checkStoredTransfer", () => {
  const metaFor = (wording: "same" | "different", reading = swap): TransferMeta => ({ oldReading: reading, wording, fixedProblemId: fixed.world.problem_id, fixedText: fixed.world.problem_text });

  it("an empty or missing folder passes", () => {
    expect(checkStoredTransfer(mkdtempSync(join(tmpdir(), "kimi-transfer-")))).toEqual({ records: 0, errors: [] });
    expect(checkStoredTransfer(join(tmpdir(), "kimi-transfer-none-here"))).toEqual({ records: 0, errors: [] });
  });

  it("reports a wrong wording tag, an old reading that holds, a missing entry, a wrong answer, a wrong source and a misnamed file", () => {
    const dir = mkdtempSync(join(tmpdir(), "kimi-transfer-"));
    const knownWhole = COMMON_MISREADINGS.find((h) => h.id === "c_known_whole");
    if (knownWhole === undefined) throw new Error("c_known_whole");
    const recs: [ProblemRecord, TransferMeta | null][] = [
      [asMade(taishite, "p_t_wording_1"), metaFor("same")],
      [asMade(taishite, "p_t_holds_1"), metaFor("different", knownWhole)],
      [asMade(plainOther, "p_t_nometa_1"), null],
      [{ ...asMade(plainOther, "p_t_answer_1"), expected_answer: { num: 999, den: 1 } }, metaFor("same")],
      [{ ...asMade(plainOther, "p_t_source_1"), source: "discriminating_bank" }, metaFor("same")],
    ];
    const meta: Record<string, TransferMeta> = {};
    for (const [r, m] of recs) {
      writeFileSync(join(dir, `${r.world.problem_id}.json`), JSON.stringify(r));
      if (m !== null) meta[r.world.problem_id] = m;
    }
    writeFileSync(join(dir, "p_t_misnamed_1.json"), JSON.stringify(asMade(plainOther, "p_t_other_1")));
    writeFileSync(join(dir, TRANSFERS_FILE), JSON.stringify(meta));
    const res = checkStoredTransfer(dir);
    expect(res.records).toBe(6);
    const text = res.errors.join("\n");
    expect(text).toMatch(/p_t_wording_1.*wording/);
    expect(text).toMatch(/p_t_holds_1.*old reading/);
    expect(text).toMatch(/p_t_nometa_1.*transfers\.json/);
    expect(text).toMatch(/p_t_answer_1.*answer/);
    expect(text).toMatch(/p_t_source_1.*source/);
    expect(text).toMatch(/p_t_misnamed_1/);
    // The loader leaves out every record that fails core's checks, even when unchecked records are asked for.
    expect(transferBankFor({ dir, includeUnchecked: true })).toEqual([]);
  });
});
