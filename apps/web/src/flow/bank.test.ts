// The problems the research layer chooses from (指示書 第6.7節 手順3, Q33): the prepared bank, plus the stored
// discriminating problems. On the child's route only those a person has checked join; the adults' try route may
// add the unchecked ones behind a toggle. A stored record that core does not accept never joins.
import { describe, expect, it } from "vitest";
import { FRACTION_BANK, PREPARED_BANK, type ProblemRecord } from "@kimi/core";
import { STORED_DISCRIMINATING, STORED_PROBLEMS, STORED_TRANSFER, TRANSFER_LINKS, bankFor, discriminatingFrom, uncheckedCount } from "./bank.ts";

const base = FRACTION_BANK[0] as ProblemRecord;
const made = (id: string, checked: boolean): ProblemRecord => ({
  ...structuredClone(base),
  world: { ...structuredClone(base.world), problem_id: id },
  source: "discriminating_bank",
  checks: { double_build_match: true, restate_match: true, misread_pass_rate: 1, human_checked: checked },
});
const modules = (...rs: unknown[]): Record<string, unknown> => Object.fromEntries(rs.map((r, i) => [`/content/problems/discriminating/p_${String(i)}.json`, r]));

describe("discriminatingFrom", () => {
  it("keeps the records core accepts and drops the rest", () => {
    const broken = made("p_disc_broken_1", true);
    broken.world.relations = [];
    const wrongSource = { ...made("p_disc_src_1", true), source: "prepared" };
    const got = discriminatingFrom(modules(made("p_disc_ok_1", true), made("p_disc_un_1", false), broken, wrongSource, { not: "a record" }));
    expect(got.map((r) => r.world.problem_id).sort()).toEqual(["p_disc_ok_1", "p_disc_un_1"]);
  });
});

describe("bankFor", () => {
  const stored = [made("p_disc_ok_1", true), made("p_disc_un_1", false)];

  it("the child's bank: the prepared bank and the checked problems only", () => {
    const ids = bankFor({ includeUnchecked: false, stored }).map((r) => r.world.problem_id);
    expect(ids).toEqual([...PREPARED_BANK.map((r) => r.world.problem_id), "p_disc_ok_1"]);
  });

  it("the try route with the toggle on: the unchecked ones too", () => {
    const ids = bankFor({ includeUnchecked: true, stored }).map((r) => r.world.problem_id);
    expect(ids).toContain("p_disc_un_1");
    expect(ids).toContain("p_disc_ok_1");
  });

  it("a stored problem never replaces a prepared one with the same id", () => {
    const clash = made(base.world.problem_id, true);
    const bank = bankFor({ includeUnchecked: true, stored: [clash] });
    expect(bank).toHaveLength(PREPARED_BANK.length);
    expect(bank[0]).toBe(PREPARED_BANK[0]);
  });

  it("the stored folder reads as records core accepts (whatever is in it now)", () => {
    for (const r of STORED_DISCRIMINATING) expect(r.source).toBe("discriminating_bank");
  });
});

// The transfer problems (指示書 第6.7節 手順6, Q48): read the same way from content/problems/transfer with the list
// of the old readings they were written for. None is checked by a person yet, so the child's bank stays as it was.
describe("the stored transfer problems", () => {
  it("are records core accepts with the transfer source, each linked to its old reading", () => {
    expect(STORED_TRANSFER.length).toBeGreaterThan(0);
    for (const r of STORED_TRANSFER) expect(r.source).toBe("research");
    expect(TRANSFER_LINKS.map((l) => l.problemId).sort()).toEqual(STORED_TRANSFER.map((r) => r.world.problem_id).sort());
  });

  it("join the try route's bank behind the toggle, and the child's bank only once a person has checked them", () => {
    const child = bankFor({ includeUnchecked: false }).map((r) => r.world.problem_id);
    const tryIds = bankFor({ includeUnchecked: true }).map((r) => r.world.problem_id);
    for (const r of STORED_TRANSFER) {
      expect(tryIds).toContain(r.world.problem_id);
      expect(child.includes(r.world.problem_id)).toBe(r.checks.human_checked);
    }
    expect(STORED_PROBLEMS).toEqual([...STORED_DISCRIMINATING, ...STORED_TRANSFER]);
    expect(uncheckedCount()).toBe(STORED_PROBLEMS.filter((r) => !r.checks.human_checked).length);
  });
});
