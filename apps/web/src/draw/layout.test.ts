// The value tests of 指示書 第8.7節 on the layout, before anything is drawn: lengths come from core's
// values, the asked quantity and every value on the way stay 「？」, segments follow the multiple of the
// problem text (第8.5節), and a reading that equals the correct world shows only the length order.
import { describe, expect, it } from "vitest";
import { FRACTION_BANK, div, fromSchema, solve, toSchema, type Rational, type WorldScene } from "@kimi/core";
import { signboard } from "../../../../packages/core/fixtures/problems/signboard.ts";
import { layoutWorld, type TapeLayout, type WorldLayout } from "./layout.ts";

function tapeOf(l: WorldLayout, holderId: string): TapeLayout {
  const t = l.tapes.find((x) => x.holderId === holderId);
  if (t === undefined) throw new Error(`no tape for ${holderId}`);
  return t;
}

const n = (num: number, den = 1): Rational => ({ num, den });

/** A two-holder multiple, for numbers the bank does not have. */
function multiple(num: number, den: number): WorldScene {
  return {
    ...signboard.correct,
    problem_id: "p_test_big",
    relations: [{ ...(signboard.correct.relations[0] as WorldScene["relations"][number]), amount: { num, den } }],
  };
}

describe("lengths (指示書 第8.5節, 第8.7節)", () => {
  it("draws the signboard's correct world with the younger brother's tape 4/3 of the older brother's", () => {
    const l = layoutWorld(signboard.correct);
    expect(l.mode).toBe("proportional");
    expect(tapeOf(l, "h_otouto").width / tapeOf(l, "h_ani").width).toBeCloseTo(4 / 3, 6);
    expect(tapeOf(l, "h_otouto").isUnit).toBe(true);
    expect(tapeOf(l, "h_ani").isUnit).toBe(false);
  });

  it("keeps every tape proportional to core's solved values on every bank problem", () => {
    for (const record of FRACTION_BANK) {
      const w = record.world;
      const res = solve(w);
      expect(res.kind, w.problem_id).toBe("unique");
      if (res.kind !== "unique") continue;
      const l = layoutWorld(w);
      const [a, b] = l.tapes;
      if (a === undefined || b === undefined) throw new Error("two tapes expected");
      const va = res.values.get(a.quantityId);
      const vb = res.values.get(b.quantityId);
      if (va === undefined || vb === undefined) throw new Error("solved values expected");
      const ratio = toSchema(div(va, vb));
      expect(a.width / b.width, w.problem_id).toBeCloseTo(ratio.num / ratio.den, 6);
    }
  });

  it("shows only the length order when the reading is the correct world (第7.1節 手順3)", () => {
    const l = layoutWorld(signboard.correct, { correct: signboard.correct });
    expect(l.mode).toBe("order");
    expect(l.tapes.every((t) => t.segments.length === 0)).toBe(true);
    const younger = tapeOf(l, "h_otouto").width;
    const older = tapeOf(l, "h_ani").width;
    expect(younger).toBeGreaterThan(older);
    // The order only: the ratio of the problem is not readable from the lengths.
    expect(younger / older).not.toBeCloseTo(4 / 3, 2);
  });

  it("shows only the length order before the 「1」 card is placed", () => {
    const l = layoutWorld(signboard.correct, { cardHolder: null });
    expect(l.mode).toBe("order");
    expect(l.card.placedOn).toBeNull();
    expect(l.tapes.every((t) => t.segments.length === 0)).toBe(true);
  });

  it("draws a difference reading with fixed lengths, not proportional to its values", () => {
    const l = layoutWorld(signboard.additive);
    const ratio = tapeOf(l, "h_ani").width / tapeOf(l, "h_otouto").width;
    // Solved: older 6, younger 9. The drawing must not read as 6/9.
    expect(ratio).toBeLessThan(1);
    expect(ratio).not.toBeCloseTo(6 / 9, 2);
    expect(l.differences).toHaveLength(1);
  });
});

describe("「？」 and the numbers that may show (指示書 第1節 原則1, 第8.5節)", () => {
  it("draws the asked quantity as 「？」 and never its value", () => {
    for (const record of FRACTION_BANK) {
      for (const cardHolder of [undefined, null]) {
        const l = layoutWorld(record.world, cardHolder === undefined ? {} : { cardHolder });
        const asked = l.tapes.find((t) => t.quantityId === record.world.question.target_id);
        expect(asked?.value, record.world.problem_id).toEqual({ kind: "unknown" });
        expect(asked?.asked).toBe(true);
      }
    }
  });

  it("shows a number of the problem text on a tape without segments", () => {
    const l = layoutWorld(signboard.correct, { cardHolder: null });
    expect(tapeOf(l, "h_ani").value).toEqual({ kind: "number", value: n(6), text: "6", counter: "匹" });
  });

  it("puts no number card on a tape with segments (第1節 原則1)", () => {
    const l = layoutWorld(signboard.correct);
    expect(tapeOf(l, "h_ani").segments.length).toBeGreaterThan(0);
    expect(tapeOf(l, "h_ani").value).toEqual({ kind: "none" });
  });

  it("shows the asked value only once the child has said it, and then the child's own number", () => {
    const l = layoutWorld(signboard.correct, { cardHolder: null, answered: { q_otouto: n(9) } });
    expect(tapeOf(l, "h_otouto").value).toEqual({ kind: "number", value: n(9), text: "9", counter: "匹" });
  });

  it("keeps a value written into the world but not in the text nor said by the child as 「？」", () => {
    const w: WorldScene = {
      ...signboard.correct,
      quantities: signboard.correct.quantities.map((q) => (q.id === "q_otouto" ? { ...q, value: n(8) } : q)),
      question: { target_type: "quantity", target_id: "q_ani" },
    };
    const l = layoutWorld(w, { cardHolder: null });
    expect(tapeOf(l, "h_otouto").value).toEqual({ kind: "unknown" });
  });

  it("labels a difference with its amount only when the text or the child gave it", () => {
    const hidden = layoutWorld(signboard.additive);
    expect(hidden.differences[0]?.label).toEqual({ kind: "unknown" });
    const said = layoutWorld(signboard.additive, { childNumbers: [n(3)] });
    expect(said.differences[0]?.label).toEqual({ kind: "number", value: n(3), text: "3", counter: "匹" });
  });
});

describe("segments (指示書 第8.5節)", () => {
  it("cuts the unit tape into the denominator and the other into the numerator, all the same size", () => {
    const l = layoutWorld(signboard.correct);
    const unit = tapeOf(l, "h_otouto");
    const other = tapeOf(l, "h_ani");
    expect(unit.segments).toHaveLength(4);
    expect(other.segments).toHaveLength(3);
    const sizes = [...unit.segments, ...other.segments].map((s) => s.width);
    for (const s of sizes) expect(s).toBeCloseTo(sizes[0] ?? 0, 6);
    expect(unit.segments.reduce((a, s) => a + s.width, 0)).toBeCloseTo(unit.width, 6);
  });

  it("cuts by the reading's own unit: the procedural reading takes the older brother as 1", () => {
    const l = layoutWorld(signboard.procedural, { correct: signboard.correct });
    expect(l.mode).toBe("proportional");
    expect(tapeOf(l, "h_ani").isUnit).toBe(true);
    expect(tapeOf(l, "h_ani").segments).toHaveLength(4);
    expect(tapeOf(l, "h_otouto").segments).toHaveLength(3);
  });

  it("uses the multiple in lowest terms on every bank problem", () => {
    for (const record of FRACTION_BANK) {
      const rel = record.world.relations[0];
      if (rel?.amount == null) throw new Error("a multiple expected");
      const p = fromSchema(rel.amount);
      const l = layoutWorld(record.world);
      const unit = l.tapes.find((t) => t.isUnit);
      const other = l.tapes.find((t) => !t.isUnit);
      expect(unit?.segments.length, record.world.problem_id).toBe(Number(p.den));
      expect(other?.segments.length, record.world.problem_id).toBe(Number(p.num));
    }
  });

  it("draws no segments when the numerator or denominator is above 10, but keeps the ratio", () => {
    const l = layoutWorld(multiple(11, 12));
    expect(l.tapes.every((t) => t.segments.length === 0)).toBe(true);
    expect(l.mode).toBe("proportional");
    expect(tapeOf(l, "h_otouto").width / tapeOf(l, "h_ani").width).toBeCloseTo(12 / 11, 6);
  });
});

describe("the size of one segment the child said (Q29)", () => {
  it("draws nothing on any segment before the child has said it", () => {
    const l = layoutWorld(signboard.correct);
    for (const t of l.tapes) for (const s of t.segments) expect(s.value).toBeUndefined();
  });

  it("draws the child's number on every segment of the 「1」 tape only, once said", () => {
    const l = layoutWorld(signboard.correct, { unitValue: n(2), childNumbers: [n(2)] });
    const unit = tapeOf(l, "h_otouto");
    expect(unit.segments.length).toBeGreaterThan(0);
    for (const s of unit.segments) expect(s.value).toEqual({ kind: "number", value: n(2), text: "2", counter: "匹" });
    for (const s of tapeOf(l, "h_ani").segments) expect(s.value).toBeUndefined();
    // The asked quantity stays 「？」.
    expect(unit.value).toEqual({ kind: "unknown" });
  });

  it("draws nothing on segments when only the length order is shown", () => {
    const l = layoutWorld(signboard.correct, { cardHolder: null, unitValue: n(2) });
    expect(l.tapes.every((t) => t.segments.length === 0)).toBe(true);
  });
});

describe("the 「1」 card (指示書 第1節 原則1, 第8.5節)", () => {
  it("covers the whole unit tape by default", () => {
    const l = layoutWorld(signboard.correct);
    const unit = tapeOf(l, "h_otouto");
    expect(l.card.placedOn).toBe("h_otouto");
    expect(l.card.x).toBeCloseTo(unit.x, 6);
    expect(l.card.width).toBeCloseTo(unit.width, 6);
  });

  it("covers whichever whole tape the child put it on", () => {
    const l = layoutWorld(signboard.correct, { cardHolder: "h_ani" });
    expect(l.card.placedOn).toBe("h_ani");
    expect(l.card.width).toBeCloseTo(tapeOf(l, "h_ani").width, 6);
  });

  it("offers only whole tapes as places for the card", () => {
    const l = layoutWorld(signboard.correct);
    expect(l.dropTargets.map((d) => d.holderId).sort()).toEqual(["h_ani", "h_otouto"]);
    for (const d of l.dropTargets) {
      const t = tapeOf(l, d.holderId);
      expect(d.x).toBeLessThanOrEqual(t.x);
      expect(d.x + d.width).toBeGreaterThanOrEqual(t.x + t.width);
      expect(d.height).toBeGreaterThanOrEqual(44);
    }
  });
});

describe("worlds that cannot happen (指示書 第8.5節)", () => {
  it("still draws the procedural reading (4.5 fish), with the asked tape 「？」 and a flag", () => {
    const l = layoutWorld(signboard.procedural);
    expect(l.impossible).toBe(true);
    const younger = tapeOf(l, "h_otouto");
    expect(younger.value).toEqual({ kind: "unknown" });
    expect(younger.impossible).toBe(true);
    expect(younger.width / tapeOf(l, "h_ani").width).toBeCloseTo(3 / 4, 6);
  });

  it("does not flag a world that can happen", () => {
    expect(layoutWorld(signboard.correct).impossible).toBe(false);
  });
});
