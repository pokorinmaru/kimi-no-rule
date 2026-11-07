// The offline bank of discriminating problems (指示書 第6.7節 手順3, Q33): which reading pairs the bank does not
// tell apart, the expected number of calls, the files written (records unchecked by a person, the pairs, and a
// build log marked for adults because it holds answers), and the checker that runs core again on every stored
// record. Fake Claude only. Written before the implementation.
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMMON_FRACTION_READINGS, FRACTION_BANK, predict, schemas, type Hypothesis, type ProblemRecord } from "@kimi/core";
import type { BuildDeps, BuildInput, BuildOutcome } from "@kimi/interpret";
import { FakeAgent, FakeClaude, json } from "../../../packages/interpret/src/fake.ts";
import {
  MAX_PAIRS,
  PER_PAIR,
  PAIR_READINGS,
  checkStored,
  expectedCalls,
  makeDiscriminating,
  readStored,
  weakPairs,
  writeMade,
} from "./discriminating.ts";

const splits = (r: ProblemRecord, a: Hypothesis, b: Hypothesis): boolean => new Set(predict([a, b], r, true).predictions.map((p) => p.worldClass)).size > 1;

describe("weakPairs", () => {
  it("draws from the common readings and the eval's simulated children, one entry per id", () => {
    for (const h of COMMON_FRACTION_READINGS) expect(PAIR_READINGS.some((x) => x.id === h.id)).toBe(true);
    expect(new Set(PAIR_READINGS.map((h) => h.id)).size).toBe(PAIR_READINGS.length);
    expect(PAIR_READINGS.some((h) => h.id === "s_unit_additive")).toBe(true);
  });

  it("finds the pairs the bank splits at most once, each with a common reading, fewest splits first, at most the cap", () => {
    const pairs = weakPairs(FRACTION_BANK);
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.length).toBeLessThanOrEqual(MAX_PAIRS);
    const commonIds = new Set(COMMON_FRACTION_READINGS.map((h) => h.id));
    for (const p of pairs) {
      expect(p.a.id).not.toBe(p.b.id);
      expect(commonIds.has(p.a.id) || commonIds.has(p.b.id)).toBe(true);
      expect(p.splits).toBe(FRACTION_BANK.filter((r) => splits(r, p.a, p.b)).length);
      expect(p.splits).toBeLessThanOrEqual(1);
    }
    for (let i = 1; i < pairs.length; i++) expect((pairs[i] as { splits: number }).splits).toBeGreaterThanOrEqual((pairs[i - 1] as { splits: number }).splits);
    expect(weakPairs(FRACTION_BANK, { cap: 1 })).toHaveLength(1);
  });

  it("a pair the stored problems already split twice is no longer weak", () => {
    const [first] = weakPairs(FRACTION_BANK);
    if (first === undefined) throw new Error("no weak pair");
    const splitting = FRACTION_BANK.filter((r) => splits(r, first.a, first.b));
    const more = [...FRACTION_BANK, ...splitting.map((r) => ({ ...r, world: { ...r.world, problem_id: `${r.world.problem_id}_again` } }))];
    const ids = (ps: ReturnType<typeof weakPairs>) => ps.map((p) => `${p.a.id}|${p.b.id}`);
    if (first.splits === 1) expect(ids(weakPairs(more))).not.toContain(`${first.a.id}|${first.b.id}`);
  });
});

describe("expectedCalls", () => {
  it("counts the writer calls and, per problem, two builds and the judge calls, with the retries", () => {
    const c = expectedCalls(2);
    expect(c.problems).toBe(2 * PER_PAIR);
    expect(c.opusMax).toBe(2 * 2 + 2 * PER_PAIR * (2 * 12 + 3 * 2));
    expect(c.opusTypical).toBeLessThan(c.opusMax);
    expect(c.haikuMax).toBe(2 * PER_PAIR * 20);
  });
});

/** A record of the bank under a new id and the discriminating source: what an adopted build hands back. */
const asMade = (r: ProblemRecord, id: string): ProblemRecord => ({
  ...structuredClone(r),
  world: { ...structuredClone(r.world), problem_id: id },
  source: "discriminating_bank",
  checks: { double_build_match: true, restate_match: true, misread_pass_rate: 1, human_checked: false },
});

describe("makeDiscriminating and the files", () => {
  const [pair] = weakPairs(FRACTION_BANK);
  if (pair === undefined) throw new Error("no weak pair");
  const splitting = FRACTION_BANK.find((r) => splits(r, pair.a, pair.b)) ?? FRACTION_BANK[0];
  if (splitting === undefined) throw new Error("empty bank");
  const deps: BuildDeps = {
    agent: new FakeAgent([{ stopReason: "end_turn", text: "done", toolCalls: [] }]),
    judge: new FakeClaude([json({ problems: [{ problem_text: "新しく書いた問題の文", consistency: "consistent", why: "w" }] })]),
    listen: new FakeClaude([json({})]),
  };
  const build = async (_d: BuildDeps, i: BuildInput): Promise<BuildOutcome> => ({ status: "adopted", record: asMade(splitting, i.problemId), log: [{ step: "adopt", ok: true, detail: i.problemId }] });

  it("writes each kept record unchecked, the pair it splits, and a build log marked for adults; the checker passes them", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kimi-disc-"));
    const made = await makeDiscriminating(deps, { pairs: [pair], bank: FRACTION_BANK, stored: readStored(dir) }, { build });
    expect(made.accepted).toHaveLength(1);
    writeMade(dir, made);
    const files = readdirSync(dir).sort();
    const recordFile = files.find((f) => f.startsWith("p_disc_"));
    expect(recordFile).toBeDefined();
    expect(files).toContain("pairs.json");
    const logFile = files.find((f) => f.includes("log"));
    expect(logFile).toMatch(/adult/);
    const log = readFileSync(join(dir, logFile as string), "utf8");
    expect(log).toMatch(/大人/);
    expect(log).toContain(pair.a.id);
    const rec = schemas.problemRecord.parse(JSON.parse(readFileSync(join(dir, recordFile as string), "utf8")));
    expect(rec.checks.human_checked).toBe(false);
    expect(rec.source).toBe("discriminating_bank");
    expect(checkStored(dir)).toEqual({ records: 1, errors: [] });

    // A second run numbers past what is there and keeps the earlier records, pairs and log.
    const again = await makeDiscriminating(deps, { pairs: [pair], bank: FRACTION_BANK, stored: readStored(dir) }, { build });
    writeMade(dir, again);
    expect(readdirSync(dir).filter((f) => f.startsWith("p_disc_"))).toHaveLength(2);
    expect(Object.keys(JSON.parse(readFileSync(join(dir, "pairs.json"), "utf8")) as object)).toHaveLength(2);
    expect(readFileSync(join(dir, logFile as string), "utf8")).toContain(log.trim().split("\n")[0] as string);
  });

  it("never writes human_checked true, whatever the record said", () => {
    const dir = mkdtempSync(join(tmpdir(), "kimi-disc-"));
    const rec = asMade(splitting, "p_disc_x_1");
    writeMade(dir, { accepted: [{ ...rec, checks: { ...rec.checks, human_checked: true } }], pairs: { p_disc_x_1: { readingA: pair.a, readingB: pair.b } }, log: "x\n" });
    const back = schemas.problemRecord.parse(JSON.parse(readFileSync(join(dir, "p_disc_x_1.json"), "utf8")));
    expect(back.checks.human_checked).toBe(false);
  });
});

describe("checkStored", () => {
  const [pair] = weakPairs(FRACTION_BANK);
  if (pair === undefined) throw new Error("no weak pair");
  const splitting = FRACTION_BANK.find((r) => splits(r, pair.a, pair.b));
  const notSplitting = FRACTION_BANK.find((r) => !splits(r, pair.a, pair.b));
  if (splitting === undefined || notSplitting === undefined) throw new Error("fixtures");
  const put = (dir: string, recs: ProblemRecord[], pairs: Record<string, unknown>): void => {
    for (const r of recs) writeFileSync(join(dir, `${r.world.problem_id}.json`), JSON.stringify(r));
    writeFileSync(join(dir, "pairs.json"), JSON.stringify(pairs));
  };

  it("an empty folder passes", () => {
    expect(checkStored(mkdtempSync(join(tmpdir(), "kimi-disc-")))).toEqual({ records: 0, errors: [] });
  });

  it("reports a record that no longer splits its pair, one with no pair, a broken world, a wrong answer and a misnamed file", () => {
    const dir = mkdtempSync(join(tmpdir(), "kimi-disc-"));
    const noSplit = asMade(notSplitting, "p_disc_nosplit_1");
    const noPair = asMade(splitting, "p_disc_nopair_1");
    const wrongAnswer = asMade(splitting, "p_disc_answer_1");
    wrongAnswer.expected_answer = { num: 999, den: 1 };
    const broken = asMade(splitting, "p_disc_broken_1");
    broken.world.relations = [];
    put(dir, [noSplit, noPair, wrongAnswer, broken], {
      p_disc_nosplit_1: { readingA: pair.a, readingB: pair.b },
      p_disc_answer_1: { readingA: pair.a, readingB: pair.b },
      p_disc_broken_1: { readingA: pair.a, readingB: pair.b },
    });
    writeFileSync(join(dir, "p_disc_misnamed_1.json"), JSON.stringify(asMade(splitting, "p_disc_other_1")));
    const res = checkStored(dir);
    expect(res.records).toBe(5);
    const text = res.errors.join("\n");
    expect(text).toMatch(/p_disc_nosplit_1.*split/);
    expect(text).toMatch(/p_disc_nopair_1.*pair/);
    expect(text).toMatch(/p_disc_answer_1.*answer/);
    expect(text).toMatch(/p_disc_broken_1/);
    expect(text).toMatch(/p_disc_misnamed_1/);
    expect(text).not.toMatch(/p_disc_nosplit_1.*answer/);
  });
});
