// M1 step (7): same_reading, same_world plus the base when it was observed (指示書 第5.8節).
// Written before the implementation.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { num } from "../apply/test-worlds.ts";
import { signboardAdditive, signboardCorrect, signboardProcedural } from "../../fixtures/problems/signboard.ts";
import { timesRecord } from "../diagnose/test-records.ts";
import { sameWorld } from "../world/same-world.ts";
import { sameReading } from "./same-reading.ts";
import { withRelation } from "./test-rules.ts";

const inverted = () => withRelation(signboardCorrect, "r_ratio", { amount: num(4, 3) });

describe("sameReading", () => {
  it("a swapped and an inverted reading are the same world, and the same reading only when the base was not seen", () => {
    expect(sameWorld(signboardProcedural, inverted())).toBe(true);
    expect(sameReading(signboardProcedural, inverted(), false)).toBe(true);
    expect(sameReading(signboardProcedural, inverted(), true)).toBe(false);
  });

  it("worlds that differ as worlds are never the same reading", () => {
    for (const seen of [false, true]) {
      expect(sameReading(signboardCorrect, signboardAdditive, seen)).toBe(false);
      expect(sameReading(signboardCorrect, signboardProcedural, seen)).toBe(false);
    }
  });

  it("a world is the same reading as itself", () => {
    for (const w of [signboardCorrect, signboardAdditive, signboardProcedural, inverted()]) {
      expect(sameReading(w, structuredClone(w), true)).toBe(true);
      expect(sameReading(w, structuredClone(w), false)).toBe(true);
    }
  });

  it("is symmetric, and with the base seen implies the same world (property)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 2, max: 9 }),
        fc.constantFrom("as_is", "swap", "invert"),
        fc.constantFrom("as_is", "swap", "invert"),
        fc.boolean(),
        (a, k, x, y, seen) => {
          const base = timesRecord(a, k).world;
          const make = (how: string) =>
            how === "swap"
              ? withRelation(base, "r_1", { subject: "q_a", reference: "q_b" })
              : how === "invert"
                ? withRelation(base, "r_1", { amount: num(1, k) })
                : structuredClone(base);
          const wx = make(x);
          const wy = make(y);
          expect(sameReading(wx, wy, seen)).toBe(sameReading(wy, wx, seen));
          if (sameReading(wx, wy, true)) {
            expect(sameWorld(wx, wy)).toBe(true);
          }
          expect(sameReading(wx, wy, false)).toBe(sameWorld(wx, wy));
        },
      ),
      { numRuns: 60 },
    );
  });
});
