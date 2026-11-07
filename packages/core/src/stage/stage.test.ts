// The stage picture's numbers (指示書 第8節 舞台の絵): each holder's things, the dishes the relation deals them
// onto, and the gate that no value of the correct world the child has not said is ever drawn as things.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { FRACTION_BANK } from "../../fixtures/problems/fraction-bank.ts";
import { COMMON_FRACTION_READINGS, COMMON_MISREADINGS } from "../research/common.ts";
import { runRule } from "../rules/run.ts";
import { eq, fromSchema, rat, toSchema } from "../rational/index.ts";
import type { ProblemRecord, Rational, WorldScene } from "../schema/index.ts";
import { amountValue, drawnValues, objectScene, type ObjectScene } from "./index.ts";

const bank = (id: string): ProblemRecord => {
  const r = FRACTION_BANK.find((x) => x.world.problem_id === id);
  if (r === undefined) throw new Error(id);
  return r;
};
const rule = (id: string) => {
  const h = COMMON_FRACTION_READINGS.find((x) => x.id === id);
  if (h === undefined) throw new Error(id);
  return h;
};
const n = (num: number, den = 1): Rational => ({ num, den });
const holder = (s: ObjectScene, id: string) => {
  const h = s.holders.find((x) => x.holderId === id);
  if (h === undefined) throw new Error(id);
  return h;
};
/** The world the screen draws: the asked quantity has no value of its own (apply's drawing world). */
const asDrawn = (w: WorldScene): WorldScene => ({
  ...w,
  quantities: w.quantities.map((q) => (q.id === w.question.target_id ? { ...q, value: null } : q)),
});

const isHidden = (s: ObjectScene, v: Rational): boolean => s.hidden.some((h) => eq(fromSchema(h), fromSchema(v)));

/** Every value the picture draws as things must not be a hidden value of the correct world. */
function assertNoHiddenDrawn(s: ObjectScene, where: string): void {
  for (const v of drawnValues(s)) expect(isHidden(s, v), `${where}: drew ${String(v.num)}/${String(v.den)}`).toBe(false);
}

describe("objectScene on the signboard", () => {
  const r = bank("p_signboard");

  it("the junior who multiplies what is given: 6 goldfish dealt onto 4 dishes is 1 and a half each, the younger has 4 and a half", () => {
    const s = objectScene(asDrawn(runRule(rule("c_known_whole"), r)), r.world, { values: [] });
    expect(s).not.toBeNull();
    if (s === null) return;
    const ani = holder(s, "h_ani");
    const oto = holder(s, "h_otouto");
    expect(ani.isOne).toBe(true);
    expect(ani.dishes).toBe(4);
    expect(ani.count).toEqual({ wholes: 6, piece: null });
    expect(oto.dishes).toBe(3);
    expect(oto.count).toEqual({ wholes: 4, piece: n(1, 2) });
    expect(oto.impossible).toBe(true);
    expect(s.share).toEqual({ wholes: 1, piece: n(1, 2) });
    expect(s.breaks).toBe(true);
    expect(s.item).toEqual({ id: "k_kingyo", noun: "金魚", counter: "匹", continuous: false });
  });

  it("hides the correct answer and the correct one segment until the child says them", () => {
    const s = objectScene(asDrawn(runRule(rule("c_known_whole"), r)), r.world, { values: [] });
    expect(s?.hidden.map((x) => fromSchema(x))).toEqual(expect.arrayContaining([rat(8), rat(2)]));
    const said = objectScene(asDrawn(runRule(rule("c_known_whole"), r)), r.world, { values: [n(2)] });
    expect(said?.hidden.some((x) => eq(fromSchema(x), rat(2)))).toBe(false);
  });

  it("in the correct world the asked holder stays hidden and nothing is dealt before the child says one segment", () => {
    const s = objectScene(asDrawn(r.world), r.world, { values: [] });
    expect(s).not.toBeNull();
    if (s === null) return;
    expect(holder(s, "h_otouto").count).toBeNull();
    expect(holder(s, "h_otouto").hidden).toBe(true);
    expect(holder(s, "h_ani").count).toEqual({ wholes: 6, piece: null });
    expect(s.share).toBeNull();
    for (const h of s.holders) expect(h.dishes).toBe(0);
  });

  it("after the child says one segment is 2, the given holder is dealt 2 on each of 3 dishes; the asked one stays hidden", () => {
    const s = objectScene(asDrawn(r.world), r.world, { values: [n(2)] });
    if (s === null) throw new Error("scene");
    expect(s.share).toEqual({ wholes: 2, piece: null });
    expect(holder(s, "h_ani").dishes).toBe(3);
    expect(holder(s, "h_otouto").count).toBeNull();
    expect(holder(s, "h_otouto").dishes).toBe(0);
  });

  it("after the child answers 8 (drawn by apply), the asked holder shows 8", () => {
    const w = r.world;
    const answered: WorldScene = { ...w, quantities: w.quantities.map((q) => (q.id === "q_otouto" ? { ...q, value: n(8) } : q)) };
    const s = objectScene(answered, w, { values: [n(8)] });
    if (s === null) throw new Error("scene");
    expect(holder(s, "h_otouto").count).toEqual({ wholes: 8, piece: null });
  });

  it("a wrong world whose value coincides with a hidden correct value draws that holder as hidden", () => {
    // The additive reading: older = younger - 3, so the younger has 9; 9 is not hidden. Force a coincidence:
    // a world where the younger is 8 by a different relation (the junior read 6 = younger - 2).
    const w = asDrawn(r.world);
    const odd: WorldScene = {
      ...w,
      relations: w.relations.map((x) => ({ ...x, operator: "less_by" as const, subject: "q_ani", reference: "q_otouto", amount: n(2) })),
    };
    const s = objectScene(odd, r.world, { values: [] });
    if (s === null) throw new Error("scene");
    expect(holder(s, "h_otouto").hidden).toBe(true);
    expect(holder(s, "h_otouto").count).toBeNull();
    expect(s.share).toBeNull();
  });
});

describe("whole things a child can count are gated too", () => {
  it("a holder of 8 and a half goldfish when 8 is the hidden answer is drawn hidden (8 whole goldfish would show 8)", () => {
    const r = bank("p_signboard");
    const w = asDrawn(r.world);
    const odd: WorldScene = { ...w, relations: w.relations.map((x) => ({ ...x, amount: n(12, 17) })) };
    const s = objectScene(odd, r.world, { values: [] });
    if (s === null) throw new Error("scene");
    expect(holder(s, "h_otouto").hidden).toBe(true);
    expect(holder(s, "h_otouto").count).toBeNull();
    assertNoHiddenDrawn(s, "8 and a half");
  });
});

describe("objectScene refuses what it does not draw", () => {
  it("draws a continuous unit too: a piece of it is possible, so nothing is impossible and no dealing breaks", () => {
    const r = bank("p_signboard");
    const w: WorldScene = { ...r.world, item_kinds: r.world.item_kinds.map((k) => ({ ...k, countable: false })) };
    const misread = asDrawn(runRule(rule("c_known_whole"), { ...r, world: w }));
    const s = objectScene(misread, w, { values: [] });
    if (s === null) throw new Error("scene");
    expect(s.item.continuous).toBe(true);
    expect(s.holders.find((h) => h.holderId === "h_otouto")?.count).toEqual({ wholes: 4, piece: n(1, 2) });
    expect(s.holders.every((h) => !h.impossible)).toBe(true);
    expect(s.share).toEqual({ wholes: 1, piece: n(1, 2) });
    expect(s.breaks).toBe(false);
    expect(objectScene(asDrawn(r.world), r.world, { values: [] })?.item.continuous).toBe(false);
  });
});

describe("the stored continuous problems (juice dL, water L, yarn m) keep the gate", () => {
  const dir = fileURLToPath(new URL("../../../../content/problems/", import.meta.url));
  const stored: ProblemRecord[] = ["discriminating", "transfer"].flatMap((d) =>
    readdirSync(join(dir, d))
      .filter((f) => /^p_.*\.json$/.test(f))
      .map((f) => JSON.parse(readFileSync(join(dir, d, f), "utf8")) as ProblemRecord),
  );
  const continuous = stored.filter((r) => r.world.item_kinds.some((k) => !k.countable));

  it("are there: juice, water and yarn", () => {
    expect(continuous.map((r) => r.world.problem_id).sort()).toEqual(
      ["p_disc_c_first_whole_s_motoni_plain_2", "p_transfer_c_additive_different_1", "p_transfer_c_swap_different_1", "p_transfer_c_swap_same_1"].sort(),
    );
  });

  it.each(continuous.map((r) => [r.world.problem_id, r] as const))("%s: every common reading draws no hidden correct value", (_id, r) => {
    for (const h of COMMON_FRACTION_READINGS) {
      const s = objectScene(asDrawn(runRule(h, r)), r.world, { values: [] });
      if (s === null) throw new Error(`${r.world.problem_id} ${h.id}`);
      expect(s.item.continuous).toBe(true);
      expect(isHidden(s, r.expected_answer as Rational)).toBe(true);
      assertNoHiddenDrawn(s, `${r.world.problem_id} ${h.id}`);
    }
  });
});

describe("amountValue", () => {
  it("puts the wholes and the piece back together", () => {
    expect(fromSchema(amountValue({ wholes: 4, piece: n(1, 2) }))).toEqual(rat(9, 2));
    expect(fromSchema(amountValue({ wholes: 0, piece: n(3, 4) }))).toEqual(rat(3, 4));
  });
});

describe("the gate over the bank and the common readings (no hidden correct value is ever drawn)", () => {
  const problems = FRACTION_BANK.filter((r) => r.world.item_kinds.every((k) => k.countable));

  it("handles the nine countable bank problems", () => {
    expect(problems.length).toBe(9);
    for (const r of problems) expect(objectScene(asDrawn(r.world), r.world, { values: [] }), r.world.problem_id).not.toBeNull();
  });

  it.each(problems.map((r) => [r.world.problem_id, r] as const))("%s: every common reading, before the child says anything", (_id, r) => {
    for (const h of COMMON_FRACTION_READINGS) {
      const s = objectScene(asDrawn(runRule(h, r)), r.world, { values: [] });
      if (s === null) throw new Error(`${r.world.problem_id} ${h.id}`);
      // The correct answer is hidden in every scene before the child says it.
      expect(isHidden(s, r.expected_answer as Rational)).toBe(true);
      assertNoHiddenDrawn(s, `${r.world.problem_id} ${h.id}`);
    }
  });

  it("a misreading of the bank is drawn with its own values, and the counts agree with the dealing", () => {
    let dealt = 0;
    for (const r of problems)
      for (const h of COMMON_MISREADINGS) {
        const s = objectScene(asDrawn(runRule(h, r)), r.world, { values: [] });
        if (s === null) continue;
        if (s.share === null) continue;
        dealt++;
        const share = fromSchema(amountValue(s.share));
        for (const x of s.holders) {
          if (x.count === null || x.dishes === 0) continue;
          const total = fromSchema(amountValue(x.count));
          // dishes x share = count, in core's exact arithmetic
          expect(total.num * share.den).toBe(share.num * total.den * BigInt(x.dishes));
        }
      }
    expect(dealt).toBeGreaterThan(5);
  });

  it("the drawn things stay few enough to draw one by one", () => {
    for (const r of problems)
      for (const h of COMMON_FRACTION_READINGS) {
        const s = objectScene(asDrawn(runRule(h, r)), r.world, { values: [] });
        for (const x of s?.holders ?? []) if (x.count !== null) expect(x.count.wholes).toBeLessThanOrEqual(60);
      }
  });

  it("property: any given number and multiple, any common reading, any said subset: no hidden value is drawn", () => {
    const base = bank("p_signboard");
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: 2, max: 9 }),
        fc.constantFrom(...COMMON_FRACTION_READINGS),
        fc.subarray([0, 1]),
        (given, p, q, h, saidIdx) => {
          if (p === q) return;
          const amount = toSchema(rat(p, q));
          const world: WorldScene = {
            ...base.world,
            quantities: base.world.quantities.map((x) => (x.id === "q_ani" ? { ...x, value: n(given) } : x)),
            relations: base.world.relations.map((x) => ({ ...x, amount })),
          };
          const record: ProblemRecord = { ...base, world, expected_answer: toSchema(rat(given * q, p)) };
          const correctAnswer = rat(given * q, p);
          const correctShare = rat(given, p);
          const said = saidIdx.map((i) => toSchema(i === 0 ? correctAnswer : correctShare));
          const s = objectScene(asDrawn(runRule(h, record)), world, { values: said });
          if (s === null) return;
          assertNoHiddenDrawn(s, `${String(given)} ${String(p)}/${String(q)} ${h.id}`);
        },
      ),
      { seed: 20261108, numRuns: 300 },
    );
  });
});

describe("an additive reading is drawn as a one-to-one pairing", () => {
  it("the signboard read as '3 fewer': the older brother's 6 pair with 6 of the younger's 9, 3 have no partner", () => {
    const r = bank("p_signboard");
    const s = objectScene(asDrawn(runRule(rule("c_additive"), r)), r.world, { values: [] });
    if (s === null) throw new Error("scene");
    expect(s.pairing).toEqual({ paired: 6, extra: 3, larger: "h_otouto" });
    expect(s.share).toBeNull();
  });

  it("is absent for a multiple, and for the correct world", () => {
    const r = bank("p_signboard");
    expect(objectScene(asDrawn(runRule(rule("c_known_whole"), r)), r.world, { values: [] })?.pairing).toBeNull();
    expect(objectScene(asDrawn(r.world), r.world, { values: [] })?.pairing).toBeNull();
  });

  it("falls back (no pairing) when the paired or the extra count is a hidden correct value", () => {
    const r = bank("p_signboard");
    const w = asDrawn(r.world);
    // 6 = younger - 2: the younger has 8 (hidden: the answer) -> the holder itself is hidden, no pairing.
    const eight: WorldScene = { ...w, relations: w.relations.map((x) => ({ ...x, operator: "less_by" as const, subject: "q_ani", reference: "q_otouto", amount: n(2) })) };
    expect(objectScene(eight, r.world, { values: [] })?.pairing).toBeNull();
    // 6 = younger - 4: the younger has 10, the extra is 4... not hidden; but 6 + 2 = 8 is not drawn. Pairing shows.
    const ten: WorldScene = { ...w, relations: w.relations.map((x) => ({ ...x, operator: "less_by" as const, subject: "q_ani", reference: "q_otouto", amount: n(4) })) };
    expect(objectScene(ten, r.world, { values: [] })?.pairing).toEqual({ paired: 6, extra: 4, larger: "h_otouto" });
    // 6 = younger - 2 with a hidden one segment of 2: the extra 2 equals the hidden one segment -> no pairing.
    // (the younger then has 8, hidden anyway); use 6 = younger + 2 instead: younger 4, extra 2 = hidden one segment.
    const four: WorldScene = { ...w, relations: w.relations.map((x) => ({ ...x, operator: "more_by" as const, subject: "q_ani", reference: "q_otouto", amount: n(2) })) };
    const s4 = objectScene(four, r.world, { values: [] });
    expect(s4?.holders.find((h) => h.holderId === "h_otouto")?.count).toEqual({ wholes: 4, piece: null });
    expect(s4?.pairing).toBeNull();
    // Once the child said 2, the pairing may show.
    expect(objectScene(four, r.world, { values: [n(2)] })?.pairing).toEqual({ paired: 4, extra: 2, larger: "h_ani" });
  });

  it("over the bank's additive readings, no paired or extra count is ever a hidden value", () => {
    for (const r of FRACTION_BANK.filter((x) => x.world.item_kinds.every((k) => k.countable))) {
      const s = objectScene(asDrawn(runRule(rule("c_additive"), r)), r.world, { values: [] });
      if (s === null) continue;
      assertNoHiddenDrawn(s, `${r.world.problem_id} c_additive`);
      if (s.pairing === null) continue;
      const counts = s.holders.map((h) => h.count?.wholes ?? -1);
      expect(Math.min(...counts)).toBe(s.pairing.paired);
      expect(Math.max(...counts) - Math.min(...counts)).toBe(s.pairing.extra);
    }
  });
});
