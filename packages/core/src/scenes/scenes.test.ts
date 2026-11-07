// 指示書 第6.7節 手順5 and 第8.5節: everyday scenes for the junior's reading. A scene is a fraction-as-a-multiple
// world made from a material a child can picture at once, with a common-sense sentence core judges as a
// comparison. For a reading, one scene breaks the sentence under that reading and one still keeps it; the
// sentence's own reading keeps both. The numbers stay away from the values of the problems the child meets.
// Written before the implementation.
import { describe, expect, it } from "vitest";
import { FRACTION_BANK } from "../../fixtures/problems/fraction-bank.ts";
import { COMMON_FRACTION_READINGS, CORRECT_READING_ID } from "../research/common.ts";
import { CARD_RULES } from "../research/common.ts";
import { schemas } from "../schema/index.ts";
import { validateWorld } from "../schema/semantic.ts";
import { solve } from "../solve/index.ts";
import { eq, fromSchema } from "../rational/index.ts";
import { gate, hasOperationName, numbersIn, type GateContext } from "../gates/index.ts";
import type { Rational } from "../schema/common.ts";
import {
  SCENE_MATERIALS,
  checkScene,
  checkScenePair,
  pickScenes,
  sceneAvoidValues,
  sceneProposal,
  viewScene,
  type CheckedScene,
  type SceneShape,
  type SceneSpec,
} from "./index.ts";

const correct = COMMON_FRACTION_READINGS.find((h) => h.id === CORRECT_READING_ID);
if (correct === undefined) throw new Error("no correct reading");
const reading = (id: string) => {
  const h = COMMON_FRACTION_READINGS.find((x) => x.id === id);
  if (h === undefined) throw new Error("no reading " + id);
  return h;
};
const misreadings = COMMON_FRACTION_READINGS.filter((h) => h.id !== CORRECT_READING_ID);
const avoidAll = sceneAvoidValues(FRACTION_BANK);
const has = (xs: readonly Rational[], v: Rational): boolean => xs.some((x) => eq(fromSchema(x), fromSchema(v)));
const r = (n: number, d = 1): Rational => ({ num: n, den: d });

const cup: SceneSpec = { material: "cup_juice", frame: "within", known: "reference", order: "relation_first" };

describe("scene materials (指示書 第6.7節 手順5)", () => {
  it("are only things a child can picture at once, each with a common-sense sentence in both languages", () => {
    expect(SCENE_MATERIALS.map((m) => m.id).sort()).toEqual(["cup_juice", "plate_pizza", "tank_water", "wallet_money"]);
    for (const m of SCENE_MATERIALS) {
      expect(m.frames.length).toBeGreaterThan(0);
      expect(m.frames).toContain("within");
    }
  });
});

describe("checkScene", () => {
  it("builds a valid, solvable world whose record passes the schema, and judges the sentence under both readings", () => {
    // The juice is 3/4 of what the cup holds; the cup holds 8 dL. Taking the juice as 1 makes it overflow.
    const res = checkScene(reading("c_swap"), cup, { known: 8, num: 3, den: 4, limit: null });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(schemas.problemRecord.safeParse(res.scene.record).success).toBe(true);
    expect(validateWorld(res.scene.record.world).ok).toBe(true);
    expect(solve(res.scene.record.world).kind).toBe("unique");
    expect(res.underCorrect.holds).toBe(true);
    expect(res.underRule.holds).toBe(false);
    expect(res.underRule.sameAsCorrect).toBe(false);
    // The shape: the cup's tape is the 1 (4 parts) under the sentence's reading; the juice is longer under the swap.
    const tape = (s: SceneShape, h: string) => s.tapes.find((t) => t.holderId === h);
    expect(tape(res.underCorrect.shape, "h_cup")?.segments).toBe(4);
    expect(tape(res.underCorrect.shape, "h_juice")?.segments).toBe(3);
    expect(res.underCorrect.shape.order.at(-1)).toBe("q_cup");
    expect(res.underRule.shape.order.at(-1)).toBe("q_juice");
    expect(tape(res.underRule.shape, "h_juice")?.segments).toBe(4);
    expect(tape(res.underRule.shape, "h_cup")?.segments).toBe(3);
  });

  it("writes only the scene's numbers in its sentences, in both languages, with no operation name", () => {
    const res = checkScene(reading("c_swap"), { ...cup, frame: "cap" }, { known: 4, num: 3, den: 4, limit: 6 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    for (const lang of ["ja", "en"] as const) {
      const text = [...res.scene.lines[lang], res.scene.commonSense[lang]].join(" ");
      for (const n of numbersIn(text)) expect(has(res.scene.numbersShown, n), `${lang}: ${JSON.stringify(n)}`).toBe(true);
      expect(hasOperationName(text), text).toBe(false);
      expect(res.scene.lines[lang].length).toBe(3);
    }
    expect(res.underRule.shape.limit).not.toBeNull();
  });

  it("refuses numbers that do not make a scene: a whole multiple, a zero, a correct reading that breaks the sentence", () => {
    expect(checkScene(correct, cup, { known: 8, num: 4, den: 4, limit: null })).toMatchObject({ ok: false });
    expect(checkScene(correct, cup, { known: 0, num: 3, den: 4, limit: null })).toMatchObject({ ok: false });
    // A cap scene needs its limit, and the sentence's own reading must keep it.
    expect(checkScene(correct, { ...cup, frame: "cap" }, { known: 4, num: 3, den: 4, limit: null })).toMatchObject({ ok: false });
    expect(checkScene(correct, { ...cup, frame: "cap" }, { known: 8, num: 3, den: 4, limit: 7 })).toMatchObject({ ok: false, reason: "correct_breaks" });
    // A material that has no cap frame.
    expect(checkScene(correct, { ...cup, material: "wallet_money", frame: "cap" }, { known: 8, num: 3, den: 4, limit: 9 })).toMatchObject({ ok: false });
  });

  it("refuses a scene whose numbers or values meet a value to avoid", () => {
    const res = checkScene(reading("c_swap"), cup, { known: 8, num: 3, den: 4, limit: null }, [r(6)]);
    expect(res).toMatchObject({ ok: false, reason: "avoided_number" });
  });
});

describe("pickScenes (the program's fallback)", () => {
  for (const h of misreadings) {
    it(`finds one scene that breaks and one that keeps the sentence for ${h.id}, away from the bank's values`, () => {
      const pair = pickScenes(h, avoidAll);
      expect(pair, h.id).not.toBeNull();
      if (pair === null) return;
      expect(pair.breaks.underRule.holds).toBe(false);
      expect(pair.breaks.underCorrect.holds).toBe(true);
      expect(pair.keeps.underRule.holds).toBe(true);
      expect(pair.keeps.underCorrect.holds).toBe(true);
      // The sentence's own reading keeps both.
      for (const s of [pair.breaks, pair.keeps]) {
        expect(viewScene(correct, s.scene).holds).toBe(true);
        expect(validateWorld(s.scene.record.world).ok).toBe(true);
        expect(solve(s.scene.record.world).kind).toBe("unique");
        expect(validateWorld(s.underRule.world).ok).toBe(true);
        // No value to avoid is shown or reached, under either reading.
        for (const v of [...s.scene.numbersShown, ...s.scene.values]) expect(has(avoidAll, v), `${h.id} ${JSON.stringify(v)}`).toBe(false);
        for (const lang of ["ja", "en"] as const) {
          for (const n of numbersIn([...s.scene.lines[lang], s.scene.commonSense[lang]].join(" "))) expect(has(avoidAll, n)).toBe(false);
        }
      }
    });
  }

  it("is deterministic, and gives nothing for the sentence's own reading (it never breaks the sentence)", () => {
    const a = pickScenes(reading("c_swap"), avoidAll);
    const b = pickScenes(reading("c_swap"), avoidAll);
    expect(a?.breaks.scene.key).toBe(b?.breaks.scene.key);
    expect(a?.keeps.scene.key).toBe(b?.keeps.scene.key);
    expect(pickScenes(correct, avoidAll)).toBeNull();
  });

  it("finds pairs for every card option that is not the sentence's own reading, quickly", () => {
    const t0 = performance.now();
    for (const h of CARD_RULES.filter((x) => x.id !== CORRECT_READING_ID)) expect(pickScenes(h, avoidAll), h.id).not.toBeNull();
    expect(performance.now() - t0).toBeLessThan(3000);
  });

  it("keeps away from any other values asked to avoid", () => {
    const first = pickScenes(reading("c_swap"), []);
    expect(first).not.toBeNull();
    if (first === null) return;
    const extra = [...first.breaks.scene.numbersShown, ...first.breaks.scene.values];
    const again = pickScenes(reading("c_swap"), extra);
    expect(again).not.toBeNull();
    for (const v of [...(again?.breaks.scene.numbersShown ?? []), ...(again?.breaks.scene.values ?? [])]) expect(has(extra, v)).toBe(false);
  });
});

describe("sceneAvoidValues", () => {
  it("holds each problem's answer and the size of one part", () => {
    const sticker = FRACTION_BANK.find((x) => x.world.problem_id === "p_bank_sticker");
    if (sticker === undefined) throw new Error("no sticker");
    const v = sceneAvoidValues([sticker]);
    expect(has(v, r(12))).toBe(true); // the answer
    expect(has(v, r(4))).toBe(true); // 20 / 5
    expect(has(v, r(60))).toBe(true); // 20 x 3, on the way when multiplying first
  });
});

describe("checkScenePair (a proposal checked by core)", () => {
  const pick = (s: CheckedScene) => ({ ...s.scene.spec, known_value: s.scene.numbers.known, num: s.scene.numbers.num, den: s.scene.numbers.den, limit: s.scene.numbers.limit });

  it("accepts a proposal that meets the conditions, and refuses one that swaps the roles", () => {
    const swap = reading("c_swap");
    const pair = pickScenes(swap, avoidAll);
    if (pair === null) throw new Error("no pair");
    const proposal = { breaks: pick(pair.breaks), keeps: pick(pair.keeps), reason_for_adult: "test" };
    expect(sceneProposal.safeParse(proposal).success).toBe(true);
    expect(checkScenePair(swap, proposal, avoidAll)).not.toBeNull();
    expect(checkScenePair(swap, { ...proposal, breaks: proposal.keeps, keeps: proposal.breaks }, avoidAll)).toBeNull();
    expect(checkScenePair(swap, proposal, [...avoidAll, ...pair.keeps.scene.numbersShown])).toBeNull();
  });
});

describe("the gate on a scene (関門は「場面」として、場面の数を許す)", () => {
  const ctxOf = (id: string): GateContext => {
    const rec = FRACTION_BANK.find((x) => x.world.problem_id === id);
    if (rec === undefined) throw new Error(id);
    return { correct: rec.world, lang: "ja", childSaid: { numbers: [], words: [] }, grade: 6, interpretationRecorded: true, prediction: "disabled" };
  };

  it("lets a checked scene through, with the scene's own numbers", () => {
    const pair = pickScenes(reading("c_known_whole"), avoidAll);
    if (pair === null) throw new Error("no pair");
    for (const s of [pair.breaks, pair.keeps]) {
      for (const p of FRACTION_BANK) expect(gate({ kind: "show_scene", scene: s.scene, lang: "en" }, ctxOf(p.world.problem_id)).ok).toBe(true);
    }
  });

  it("refuses a scene core did not build, and a scene that reaches a problem's answer", () => {
    const pair = pickScenes(reading("c_swap"), avoidAll);
    if (pair === null) throw new Error("no pair");
    const copy = structuredClone(pair.breaks.scene);
    expect(gate({ kind: "show_scene", scene: copy, lang: "ja" }, ctxOf("p_bank_sticker"))).toMatchObject({ ok: false, reasons: ["unverified"] });
    const res = checkScene(reading("c_swap"), cup, { known: 16, num: 3, den: 4, limit: null });
    if (!res.ok) throw new Error("scene expected");
    // 3/4 of 16 is 12: the sticker problem's answer.
    expect(gate({ kind: "show_scene", scene: res.scene, lang: "ja" }, ctxOf("p_bank_sticker"))).toMatchObject({ ok: false, reasons: ["answer_leak"] });
  });
});
