// The problems written offline and stored as files (指示書 第6.7節 手順3・手順6, Q33・Q48): a stored record joins a
// bank only when core accepts it (the record schema, its source, the world, the sentences and the problem
// conditions). The same check serves the device and the local worker, so both know the same problems.
// Written before the implementation.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FRACTION_BANK } from "../../fixtures/problems/fraction-bank.ts";
import type { ProblemRecord } from "../schema/problem-record.ts";
import { acceptStored, withStored } from "./stored.ts";
import { problemConditions } from "../diagnose/conditions.ts";
import { validateStatements, validateWorld } from "../schema/semantic.ts";

const base = FRACTION_BANK[0] as ProblemRecord;
const made = (id: string, source: ProblemRecord["source"], checked = false): ProblemRecord => ({
  ...structuredClone(base),
  world: { ...structuredClone(base.world), problem_id: id },
  source,
  checks: { double_build_match: true, restate_match: true, misread_pass_rate: 1, human_checked: checked },
});

describe("acceptStored", () => {
  it("keeps the records of the source core accepts, sorted by id, and drops the rest", () => {
    const broken = made("p_disc_broken_1", "discriminating_bank");
    broken.world.relations = [];
    const got = acceptStored(
      [made("p_disc_b_1", "discriminating_bank", true), made("p_disc_a_1", "discriminating_bank"), broken, made("p_transfer_x_1", "research"), { not: "a record" }, null, "text"],
      "discriminating_bank",
    );
    expect(got.map((r) => r.world.problem_id)).toEqual(["p_disc_a_1", "p_disc_b_1"]);
  });

  // Review, 2026-11-07: each later check drops a record the earlier ones pass, so removing one check fails a test.
  it("drops a record whose sentences core does not accept (the world itself is fine)", () => {
    const r = made("p_disc_sentences_1", "discriminating_bank");
    const st = r.statements[0];
    if (st === undefined) throw new Error("no sentence");
    st.tokens = ["ぜんぜん", "ちがう"];
    st.text = "ぜんぜんちがう";
    expect(validateWorld(r.world).ok).toBe(true);
    expect(validateStatements(r.world, r.statements, r.syntax_marks).ok).toBe(false);
    expect(acceptStored([r], "discriminating_bank")).toEqual([]);
  });

  it("drops a record that fails the problem conditions only (the world and sentences pass)", () => {
    const r = made("p_disc_conditions_1", "discriminating_bank");
    const q = r.world.quantities.find((x) => x.value !== null);
    if (q === undefined) throw new Error("no given value");
    q.value = null;
    expect(validateWorld(r.world).ok).toBe(true);
    expect(validateStatements(r.world, r.statements, r.syntax_marks).ok).toBe(true);
    expect(problemConditions(r).ok).toBe(false);
    expect(acceptStored([r], "discriminating_bank")).toEqual([]);
  });

  it("reads the transfer problems by their own source", () => {
    const got = acceptStored([made("p_transfer_x_1", "research"), made("p_disc_a_1", "discriminating_bank")], "research");
    expect(got.map((r) => r.world.problem_id)).toEqual(["p_transfer_x_1"]);
  });

  it("never throws on a record core cannot check", () => {
    const odd = made("p_disc_odd_1", "discriminating_bank");
    (odd.world as { quantities: unknown }).quantities = [{ id: "q", holder: "nobody" }];
    expect(() => acceptStored([odd], "discriminating_bank")).not.toThrow();
    expect(acceptStored([odd], "discriminating_bank")).toEqual([]);
  });

  it("accepts every record stored in the content folders now", () => {
    for (const [dir, source] of [
      ["discriminating", "discriminating_bank"],
      ["transfer", "research"],
    ] as const) {
      const url = new URL(`../../../../content/problems/${dir}/`, import.meta.url);
      const files = readdirSync(url).filter((f) => /^p_.*\.json$/.test(f));
      const raws = files.map((f) => JSON.parse(readFileSync(new URL(f, url), "utf8")) as unknown);
      expect(acceptStored(raws, source)).toHaveLength(files.length);
    }
  });
});

describe("withStored", () => {
  it("the prepared problems first, then the stored ones; a stored one never replaces a prepared id", () => {
    const clash = made(base.world.problem_id, "discriminating_bank");
    const extra = made("p_disc_a_1", "discriminating_bank");
    const bank = withStored(FRACTION_BANK, [clash, extra]);
    expect(bank.map((r) => r.world.problem_id)).toEqual([...FRACTION_BANK.map((r) => r.world.problem_id), "p_disc_a_1"]);
    expect(bank[0]).toBe(FRACTION_BANK[0]);
  });

  it("keeps the prepared bank itself when nothing is added", () => {
    expect(withStored(FRACTION_BANK, [])).toBe(FRACTION_BANK);
  });

  it("adds a stored id once", () => {
    const a = made("p_disc_a_1", "discriminating_bank");
    expect(withStored(FRACTION_BANK, [a, structuredClone(a)])).toHaveLength(FRACTION_BANK.length + 1);
  });
});
