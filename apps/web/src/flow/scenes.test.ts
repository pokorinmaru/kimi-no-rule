// 指示書 第6.7節 手順5 on the rule card: 「身近な場面で見てみる」 shows two everyday scenes for the junior's reading
// (the rule on the card), drawn as that rule's worlds, with the common-sense sentence lit where it does not
// hold. The program's pair shows at once; a proposal from the worker replaces it only when core passes it for
// the same reading. No judging word, no number of a problem the child has not read, both languages.
// Written before the implementation.
import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import {
  COMMON_FRACTION_READINGS,
  CORRECT_READING_ID,
  FRACTION_BANK,
  choiceOf,
  numbersIn,
  pickScenes,
  sceneAvoidValues,
  viewScene,
  type Rational,
  type SceneProposal,
} from "@kimi/core";
import { flowMachine, type FlowInput } from "./machine.ts";
import { childTexts, viewOf, type FlowView } from "./view.ts";
import { judgeTotal, judgeUnit } from "./problem.ts";
import { hasForbiddenPhrase } from "./text.ts";
import { passBook } from "./test-book.ts";

type CardView = Extract<FlowView, { screen: "card" }>;
const r = (num: number): Rational => ({ num, den: 1 });
const rule = (id: string) => {
  const h = COMMON_FRACTION_READINGS.find((x) => x.id === id);
  if (h === undefined) throw new Error("no rule " + id);
  return h;
};
const avoid = sceneAvoidValues(FRACTION_BANK);
const same = (a: Rational, b: Rational): boolean => a.num * b.den === b.num * a.den;

function run(input: FlowInput = {}) {
  const actor = createActor(flowMachine, { input: { introSeen: true, consented: true, maxProblems: 3, ...input } });
  actor.start();
  return actor;
}
type Actor = ReturnType<typeof run>;

function solve(actor: Actor): void {
  if (actor.getSnapshot().matches({ active: "researching" })) actor.send({ type: "RESEARCH_RESULT", pool: null });
  const p = actor.getSnapshot().context.problem;
  if (p === null) throw new Error("no problem");
  actor.send({ type: "PREDICT", answer: "odd" });
  const rel = p.record.world.relations.find((x) => x.id === p.relationId);
  // The child taps a word of the problem as the reason, then puts the 1.
  actor.send({ type: "PLACE_ONE", quantityId: rel?.reference as string });
  actor.send({ type: "TAP_WORD", statementIndex: 0, token: 0 });
  actor.send({ type: "CONFIRM_YES" });
  passBook(actor);
  actor.send({ type: "NEXT" });
  let unit: Rational | null = null;
  let total: Rational | null = null;
  for (let n = 1; n <= 60; n++) {
    if (unit === null && judgeUnit(p.record, r(n))) unit = r(n);
    if (total === null && judgeTotal(p.record, r(n))) total = r(n);
  }
  actor.send({ type: "ANSWER_UNIT", value: unit as Rational });
  actor.send({ type: "ANSWER_TOTAL", value: total as Rational });
  actor.send({ type: "NEXT" });
}

function onCard(input: FlowInput = {}): Actor {
  const actor = run(input);
  solve(actor);
  solve(actor);
  if (viewOf(actor.getSnapshot()).screen !== "card") throw new Error("expected the card");
  return actor;
}

function cardView(actor: Actor): CardView {
  const v = viewOf(actor.getSnapshot());
  if (v.screen !== "card") throw new Error(`expected the card screen, got ${v.screen}`);
  return v;
}

describe("身近な場面で見てみる on the rule card", () => {
  it("shows two scenes for the card's reading: the sentence lit in one, not in the other", () => {
    const actor = onCard();
    const v = cardView(actor);
    const cardRule = actor.getSnapshot().context.ruleCard?.rule;
    expect(cardRule?.id).not.toBe(CORRECT_READING_ID);
    expect(v.scenes).not.toBeNull();
    expect(v.scenes?.label).toBe("身近な場面で見てみる");
    expect(v.scenes?.items).toHaveLength(2);
    expect(v.scenes?.items.map((i) => i.lit).sort()).toEqual([false, true]);
    for (const item of v.scenes?.items ?? []) {
      expect(item.tapes.length).toBeGreaterThanOrEqual(2);
      // Nothing the scene writes is a value of a problem of the bank (answers, one part).
      for (const n of numbersIn([...item.lines, item.commonSense].join(" "))) expect(avoid.some((a) => same(a, n))).toBe(false);
    }
  });

  it("is built again for the reading the child picks; the sentence's own reading lights nothing", () => {
    const actor = onCard();
    actor.send({ type: "CARD_PICK", ruleId: "c_swap" });
    const swapped = cardView(actor).scenes;
    const pair = pickScenes(rule("c_swap"), avoid);
    expect(swapped?.items.map((i) => i.key)).toEqual([pair?.breaks.scene.key, pair?.keeps.scene.key]);
    expect(swapped?.items.map((i) => i.lit)).toEqual([true, false]);
    actor.send({ type: "CARD_PICK", ruleId: CORRECT_READING_ID });
    const plain = cardView(actor).scenes;
    expect(plain?.items).toHaveLength(2);
    expect(plain?.items.every((i) => !i.lit)).toBe(true);
  });

  it("asks the worker with the reading and the kinds of the tapped words only (never the words)", () => {
    const actor = onCard();
    actor.send({ type: "CARD_PICK", ruleId: "c_swap" });
    const req = actor.getSnapshot().context.ruleCard?.scenes?.request;
    expect(req?.rule.id).toBe("c_swap");
    expect(req?.lang).toBe("ja");
    expect(Object.keys(req ?? {}).sort()).toEqual(["lang", "rule", "word_kinds"]);
    expect(req?.word_kinds.length).toBeGreaterThan(0);
    // The reading goes as clauses only: no cue words, no note for grown-ups (safety review).
    expect(req?.rule.word_cues).toEqual([]);
    expect(req?.rule.note_for_adult).toBe("");
    for (const k of req?.word_kinds ?? []) expect(["holder_mention", "ratio_notation", "relation_word", "unit_word", "demonstrative", "sentence_pattern", "other"]).toContain(k);
  });

  it("takes a proposal core passes for the same reading; drops a failing one and a late one for another reading", () => {
    const actor = onCard();
    actor.send({ type: "CARD_PICK", ruleId: "c_swap" });
    const good: Pick<SceneProposal, "breaks" | "keeps"> = {
      breaks: { material: "cup_juice", frame: "within", known: "reference", order: "relation_first", known_value: 28, num: 3, den: 4, limit: null },
      keeps: { material: "tank_water", frame: "cap", known: "subject", order: "known_first", known_value: 21, num: 3, den: 4, limit: 29 },
    };
    const program = actor.getSnapshot().context.ruleCard?.scenes;
    // Another reading's proposal: dropped.
    actor.send({ type: "SCENES_RESULT", focusId: "c_known_whole", proposal: good, reason: "x" });
    expect(actor.getSnapshot().context.ruleCard?.scenes).toBe(program);
    // A proposal that does not pass core: dropped.
    actor.send({ type: "SCENES_RESULT", focusId: "c_swap", proposal: { breaks: good.keeps, keeps: good.breaks }, reason: "x" });
    expect(actor.getSnapshot().context.ruleCard?.scenes).toBe(program);
    // A passing one replaces the program's pair; its reason stays off the child's screen.
    actor.send({ type: "SCENES_RESULT", focusId: "c_swap", proposal: good, reason: "for grown-ups zz" });
    const s = actor.getSnapshot().context.ruleCard?.scenes;
    expect(s?.source).toBe("claude");
    expect(choiceOf(s?.pair.breaks as never)).toEqual(good.breaks);
    const v = cardView(actor);
    expect(v.scenes?.items.map((i) => i.lit)).toEqual([true, false]);
    expect(childTexts(v).join(" ")).not.toContain("zz");
  });

  it("draws each scene as core's world of the picked reading", () => {
    const actor = onCard();
    actor.send({ type: "CARD_PICK", ruleId: "c_known_whole" });
    const s = actor.getSnapshot().context.ruleCard?.scenes;
    const v = cardView(actor);
    for (const [i, c] of [s?.pair.breaks, s?.pair.keeps].entries()) {
      const shown = viewScene(rule("c_known_whole"), c?.scene as never);
      expect(v.scenes?.items[i]?.lit).toBe(!shown.holds);
      expect(v.scenes?.items[i]?.tapes.map((t) => t.length)).toEqual(shown.shape.tapes.map((t) => t.length));
    }
  });

  for (const lang of ["ja", "en"] as const) {
    it(`has no judging word and no word that puts the reading on the child (${lang})`, () => {
      const actor = onCard({ lang });
      for (const id of ["c_swap", "c_first_whole", "c_known_whole", CORRECT_READING_ID]) {
        actor.send({ type: "CARD_PICK", ruleId: id });
        const v = cardView(actor);
        expect(v.scenes).not.toBeNull();
        const texts = childTexts(v);
        for (const item of v.scenes?.items ?? []) {
          for (const t of [...item.lines, item.commonSense, ...item.tapes.map((x) => x.label)]) expect(texts).toContain(t);
          if (lang === "en") expect([...item.lines, item.commonSense].join(" ")).not.toMatch(/[぀-ヿ一-鿿]/);
        }
        for (const t of texts) expect(hasForbiddenPhrase(t), t).toBe(false);
        expect(texts.join(" ")).not.toMatch(/正し|まちが|間違|正解|あってる|\bright\b|\bwrong\b/i);
      }
    });
  }
});
