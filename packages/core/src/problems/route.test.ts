// The child's route (Q64): the problems the top page offers, in the order of the steps of learning. Each is in the
// prepared bank and core can take it one sentence at a time, so whichever the child picks opens on the steps.
import { describe, expect, it } from "vitest";
import { CHILD_FIRST_PROBLEM_ID, CHILD_ROUTE, CHILD_SECOND_PROBLEM_ID, CHILD_THIRD_PROBLEM_ID, PREPARED_BANK } from "../index.ts";
import { stepsOf } from "../steps/index.ts";

describe("the child's route", () => {
  it("is the whole-known story, then the part-known story, then the percent off", () => {
    expect(CHILD_ROUTE).toEqual([CHILD_FIRST_PROBLEM_ID, CHILD_SECOND_PROBLEM_ID, CHILD_THIRD_PROBLEM_ID]);
  });
  it("holds only prepared problems core can step", () => {
    for (const id of CHILD_ROUTE) {
      const r = PREPARED_BANK.find((x) => x.world.problem_id === id);
      expect(r, id).toBeDefined();
      expect(r === undefined ? null : stepsOf(r), id).not.toBeNull();
    }
  });
});
