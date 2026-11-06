// M1 step (6): candidates of misreading (指示書 第5.4節, merged by same_world of 第5.8節; the signboard
// line of 第11節 M1). Written before the implementation.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { WorldScene } from "../schema/index.ts";
import { apply } from "../apply/index.ts";
import { num, phrase, worldW } from "../apply/test-worlds.ts";
import { signboardAdditive, signboardCorrect, signboardProcedural } from "../../fixtures/problems/signboard.ts";
import { signboardRecord } from "../../fixtures/problems/signboard-record.ts";
import { sameWorld } from "../world/same-world.ts";
import { misreadCandidates, type Candidate, type FlipKind } from "./candidates.ts";
import {
  differenceRecord,
  eventRecord,
  moveRecord,
  timesRecord,
  totalRecord,
  twoStepRecord,
} from "./test-records.ts";

const PROPERTY_RUNS = { numRuns: 50 };

type Flip = Candidate["flips"][number];
type Relation = WorldScene["relations"][number];

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const flipKey = (x: Flip): string => x.element_id + " " + x.kind;
const sortFlips = (fs: readonly Flip[]): Flip[] => [...fs].sort((a, b) => byCodeUnit(flipKey(a), flipKey(b)));
const f = (kind: FlipKind, element_id: string): Flip => ({ kind, element_id });

function gcd(x: number, y: number): number {
  return y === 0 ? x : gcd(y, x % y);
}

/** The correct world with one flip made by hand (指示書 第5.4節). */
function flipBy(w: WorldScene, flip: Flip): WorldScene {
  const c = structuredClone(w);
  const editR = (g: (r: Relation) => Relation): WorldScene => ({
    ...c,
    relations: c.relations.map((r) => (r.id === flip.element_id ? g(r) : r)),
  });
  switch (flip.kind) {
    case "operator_swap":
      return editR((r) => ({ ...r, operator: r.operator === "more_by" ? "less_by" : "more_by" }));
    case "invert_amount":
      return editR((r) => ({ ...r, amount: r.amount === null ? null : num(r.amount.den, r.amount.num) }));
    case "swap_ends":
      return editR((r) => ({ ...r, subject: r.reference ?? r.subject, reference: r.subject }));
    case "event_type":
      return {
        ...c,
        events: c.events.map((e) => (e.id === flip.element_id ? { ...e, type: e.type === "gain" ? "lose" : "gain" } : e)),
      };
  }
}

/** The fields of the op a child would say for one flip (the number of an inverted amount is checked apart). */
function opFor(w: WorldScene, flip: Flip): Record<string, unknown> {
  const r = w.relations.find((x) => x.id === flip.element_id);
  switch (flip.kind) {
    case "operator_swap":
      return { op: "set_relation_operator", target_id: flip.element_id, operator: r?.operator === "more_by" ? "less_by" : "more_by" };
    case "invert_amount":
      return { op: "set_relation_amount", target_id: flip.element_id };
    case "swap_ends":
      return { op: "swap_relation_direction", target_id: flip.element_id };
    case "event_type": {
      const e = w.events.find((x) => x.id === flip.element_id);
      return { op: "set_event_type", target_id: flip.element_id, event_type: e?.type === "gain" ? "lose" : "gain" };
    }
  }
}

const RECORDS = {
  difference: differenceRecord(),
  times: timesRecord(),
  event: eventRecord(),
  twoStep: twoStepRecord(),
  signboard: signboardRecord,
};

/** Every flip of each record, before merging. */
const ALL_FLIPS: Record<keyof typeof RECORDS, Flip[]> = {
  difference: [f("operator_swap", "r_1"), f("swap_ends", "r_1")],
  times: [f("invert_amount", "r_1"), f("swap_ends", "r_1")],
  event: [f("event_type", "e_1")],
  twoStep: [f("operator_swap", "r_1"), f("swap_ends", "r_1"), f("operator_swap", "r_2"), f("swap_ends", "r_2")],
  signboard: [f("invert_amount", "r_ratio"), f("swap_ends", "r_ratio")],
};

describe("candidates: the four kinds of flip", () => {
  it.each(Object.keys(RECORDS) as (keyof typeof RECORDS)[])("%s: every flip appears once over all candidates", (name) => {
    const cs = misreadCandidates(structuredClone(RECORDS[name].world));
    expect(sortFlips(cs.flatMap((c) => c.flips))).toEqual(sortFlips(ALL_FLIPS[name]));
  });

  it("a move event and a total have nothing to flip", () => {
    expect(misreadCandidates(moveRecord().world)).toEqual([]);
    expect(misreadCandidates(totalRecord().world)).toEqual([]);
  });

  it("each candidate world is the correct world with its first flip, and the other flips give the same world", () => {
    for (const r of Object.values(RECORDS)) {
      for (const c of misreadCandidates(r.world)) {
        const first = c.flips[0];
        if (first === undefined) throw new Error("a candidate without a flip");
        expect(c.world).toEqual(flipBy(r.world, first));
        for (const other of c.flips.slice(1)) expect(sameWorld(flipBy(r.world, other), c.world)).toBe(true);
      }
    }
  });

  it("each candidate carries the one op of its first flip", () => {
    for (const r of Object.values(RECORDS)) {
      for (const c of misreadCandidates(r.world)) {
        const first = c.flips[0];
        if (first === undefined) throw new Error("a candidate without a flip");
        expect(c.ops).toHaveLength(1);
        expect(c.ops[0]).toEqual(expect.objectContaining(opFor(r.world, first)));
      }
    }
  });

  it("an inverted amount is said as the upside-down number", () => {
    for (const r of [timesRecord(4, 3), signboardRecord]) {
      for (const c of misreadCandidates(r.world)) {
        if (c.flips[0]?.kind !== "invert_amount") continue;
        const said = c.ops[0];
        const before = r.world.relations.find((x) => x.id === c.flips[0]?.element_id)?.amount;
        expect(said?.op).toBe("set_relation_amount");
        if (said?.op !== "set_relation_amount" || before == null) throw new Error("not an amount");
        // Compared as fractions: n1/d1 = d0/n0.
        expect(said.number.num * before.num).toBe(said.number.den * before.den);
      }
    }
  });

  it("the op of each candidate, applied with every element touched, gives a world the same as the candidate", () => {
    for (const r of Object.values(RECORDS)) {
      const ids = [...r.world.quantities, ...r.world.relations, ...r.world.events].map((x) => phrase(x.id));
      for (const c of misreadCandidates(r.world)) {
        const child = apply({ correct: r.world, ops: c.ops, phrases: ids });
        expect(sameWorld(child.judgeWorld, c.world)).toBe(true);
      }
    }
  });
});

describe("candidates: merged by same_world", () => {
  it("difference: more for less and swapping the ends are one candidate (b = 2)", () => {
    const cs = misreadCandidates(differenceRecord(5, 3).world);
    expect(cs).toHaveLength(1);
    expect(sortFlips(cs[0]?.flips ?? [])).toEqual(sortFlips([f("operator_swap", "r_1"), f("swap_ends", "r_1")]));
    expect(cs[0]?.answer).toEqual(num(2));
    expect(cs[0]?.impossible).toBe(false);
  });

  it("times: turning the amount over and swapping the ends are one candidate (b = 4/3, cannot happen)", () => {
    const cs = misreadCandidates(timesRecord(4, 3).world);
    expect(cs).toHaveLength(1);
    expect(cs[0]?.answer).toEqual(num(4, 3));
    expect(cs[0]?.impossible).toBe(true);
  });

  it("event: gain read as lose (5 - 3 = 2)", () => {
    const cs = misreadCandidates(eventRecord(5, 3).world);
    expect(cs).toHaveLength(1);
    expect(cs[0]?.answer).toEqual(num(2));
    expect(cs[0]?.impossible).toBe(false);
  });

  it("two steps: the two relations give two candidates, different worlds with the same answer", () => {
    const cs = misreadCandidates(twoStepRecord().world);
    expect(cs).toHaveLength(2);
    expect(cs.map((c) => c.answer)).toEqual([num(5), num(5)]);
    expect(sameWorld(cs[0]?.world as WorldScene, cs[1]?.world as WorldScene)).toBe(false);
    expect(cs.map((c) => [...new Set(c.flips.map((x) => x.element_id))]).sort()).toEqual([["r_1"], ["r_2"]]);
  });

  it("no two candidates are the same world, and no flip is kept twice", () => {
    for (const r of Object.values(RECORDS)) {
      const cs = misreadCandidates(r.world);
      cs.forEach((x, i) => {
        cs.slice(i + 1).forEach((y) => {
          expect(sameWorld(x.world, y.world)).toBe(false);
        });
      });
      const keys = cs.flatMap((c) => c.flips.map(flipKey));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("for any difference world, one candidate whose answer is a - d", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), fc.integer({ min: 1, max: 20 }), (a, d) => {
        // The correct answer is a + d; the misread answer a - d is decided before the world is built.
        const cs = misreadCandidates(differenceRecord(a, d).world);
        expect(cs).toHaveLength(1);
        expect(cs[0]?.answer).toEqual(num(a - d));
        expect(cs[0]?.impossible).toBe(a - d < 0);
      }),
      PROPERTY_RUNS,
    );
  });

  it("for any times world, one candidate whose answer is a / k", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), fc.integer({ min: 2, max: 9 }), (a, k) => {
        const cs = misreadCandidates(timesRecord(a, k).world);
        expect(cs).toHaveLength(1);
        const g = gcd(a, k);
        expect(cs[0]?.answer).toEqual(num(a / g, k / g));
        expect(cs[0]?.impossible).toBe(a % k !== 0);
      }),
      PROPERTY_RUNS,
    );
  });
});

describe("candidates: a candidate whose world has no single answer", () => {
  it("W: flipping r_1 clashes with r_4, so the answer is not fixed", () => {
    const cs = misreadCandidates(worldW());
    const onR1 = cs.filter((c) => c.flips.some((x) => x.element_id === "r_1"));
    expect(onR1.length).toBeGreaterThan(0);
    for (const c of onR1) expect(c.answer).toBeNull();
  });
});

describe("candidates: deterministic and pure", () => {
  it("the same world gives the same list in the same order", () => {
    for (const r of Object.values(RECORDS)) {
      expect(misreadCandidates(structuredClone(r.world))).toEqual(misreadCandidates(structuredClone(r.world)));
    }
  });

  it("does not change the world", () => {
    const w = structuredClone(signboardCorrect);
    misreadCandidates(w);
    expect(w).toEqual(signboardCorrect);
  });
});

describe("candidates: signboard (指示書 第11節 M1)", () => {
  const cs = () => misreadCandidates(signboardRecord.world);

  it("swapping the ends and turning 3/4 over are one candidate", () => {
    expect(cs()).toHaveLength(1);
    expect(sortFlips(cs()[0]?.flips ?? [])).toEqual(sortFlips([f("invert_amount", "r_ratio"), f("swap_ends", "r_ratio")]));
  });

  it("its answer is 9/2, which cannot happen for a countable kind", () => {
    expect(cs()[0]?.answer).toEqual(num(9, 2));
    expect(cs()[0]?.impossible).toBe(true);
  });

  it("its world is the procedural reading, and not the additive one", () => {
    const w = cs()[0]?.world as WorldScene;
    expect(sameWorld(w, signboardProcedural)).toBe(true);
    expect(sameWorld(w, signboardAdditive)).toBe(false);
    expect(sameWorld(w, signboardCorrect)).toBe(false);
  });
});

describe("a relation that says two counts are the same (Q18)", () => {
  it("is not flipped by swapping its ends, which would give back the same world", () => {
    const correct = worldW();
    correct.relations = [
      { id: "r_1", operator: "same_as", subject: "q_b", reference: "q_a", reference_list: null, amount: null, other_description: null },
    ];
    const flips = misreadCandidates(correct).flatMap((c) => c.flips);
    expect(flips.some((f) => f.element_id === "r_1")).toBe(false);
  });
});
