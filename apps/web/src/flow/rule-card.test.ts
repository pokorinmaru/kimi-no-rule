// 指示書 第7.1節「後輩のルールカード」and 第2節「自分で直す」: after two solved problems the junior brings its
// reading card and the problems of this session drawn as its worlds; the child chooses who is taken as 1 and
// every world is built again by core. The card the child leaves is recorded, and becomes the junior's taught
// reading only when every world of the gallery fits. Written before the implementation.
import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import {
  CARD_RULE_IDS,
  COMMON_FRACTION_READINGS,
  CORRECT_READING_ID,
  FRACTION_BANK,
  cardFailing,
  cardSlot,
  initialState,
  numbersIn,
  readingCard,
  runRule,
  sameReading,
  sceneAvoidValues,
  type Rational,
} from "@kimi/core";
import { flowMachine, type FlowInput } from "./machine.ts";
import { childTexts, viewOf, type FlowView } from "./view.ts";
import { judgeTotal, judgeUnit, selectNext } from "./problem.ts";
import { hasForbiddenPhrase } from "./text.ts";
import { passBook } from "./test-book.ts";

type Actor = ReturnType<typeof run>;
const avoid = sceneAvoidValues(FRACTION_BANK);
type CardView = Extract<FlowView, { screen: "card" }>;

const r = (num: number): Rational => ({ num, den: 1 });
const rule = (id: string) => {
  const h = COMMON_FRACTION_READINGS.find((x) => x.id === id);
  if (h === undefined) throw new Error("no rule " + id);
  return h;
};
const record = (id: string) => {
  const x = FRACTION_BANK.find((b) => b.world.problem_id === id);
  if (x === undefined) throw new Error("no problem " + id);
  return x;
};

function run(input: FlowInput = {}) {
  const actor = createActor(flowMachine, { input: { introSeen: true, consented: true, maxProblems: 3, ...input } });
  actor.start();
  return actor;
}

/** Leaves the research wait (server down) when the flow is there. */
function settle(actor: Actor): void {
  if (actor.getSnapshot().matches({ active: "researching" })) actor.send({ type: "RESEARCH_RESULT", pool: null });
  // The child's own first prediction, passed with "not yet" (guess.test.ts walks it).
  actor.send({ type: "GUESS", larger: null });
}

function placeRight(actor: Actor): void {
  const p = actor.getSnapshot().context.problem;
  if (p === null) throw new Error("no problem");
  const rel = p.record.world.relations.find((x) => x.id === p.relationId);
  actor.send({ type: "PLACE_ONE", quantityId: rel?.reference as string });
}

/** Solves the problem on screen with core's own judging, then moves on. */
function solve(actor: Actor): void {
  settle(actor);
  const p = actor.getSnapshot().context.problem;
  if (p === null) throw new Error("no problem");
  actor.send({ type: "GUESS", larger: null });
  actor.send({ type: "PREDICT", answer: "odd" });
  placeRight(actor);
  actor.send({ type: "CONFIRM_YES" });
  passBook(actor);
  expect(actor.getSnapshot().matches({ active: { problem: "rebuilt" } })).toBe(true);
  actor.send({ type: "NEXT" });
  let unit: Rational | null = null;
  let total: Rational | null = null;
  for (let n = 1; n <= 60; n++) {
    if (unit === null && judgeUnit(p.record, r(n))) unit = r(n);
    if (total === null && judgeTotal(p.record, r(n))) total = r(n);
  }
  actor.send({ type: "ANSWER_UNIT", value: unit as Rational });
  actor.send({ type: "ANSWER_TOTAL", value: total as Rational });
  expect(actor.getSnapshot().matches({ active: { problem: "solved" } })).toBe(true);
  actor.send({ type: "NEXT" });
}

/** Holds the problem on screen ("don't know", then "later"). */
function hold(actor: Actor): void {
  settle(actor);
  actor.send({ type: "GUESS", larger: null });
  actor.send({ type: "PREDICT", answer: "unknown" });
  // Through the junior's staged questions to the waiting screen, then "later".
  for (let i = 0; i < 5 && !actor.getSnapshot().matches("stuck"); i++) actor.send({ type: "DONT_KNOW" });
  actor.send({ type: "HOLD" });
}

function cardView(actor: Actor): CardView {
  const v = viewOf(actor.getSnapshot());
  if (v.screen !== "card") throw new Error(`expected the card screen, got ${v.screen}`);
  return v;
}

describe("when the junior's rule card appears", () => {
  it("not after one solved problem; after the second solved problem, before the next problem", () => {
    const actor = run();
    solve(actor);
    settle(actor);
    expect(viewOf(actor.getSnapshot()).screen).toBe("problem");
    solve(actor);
    expect(viewOf(actor.getSnapshot()).screen).toBe("card");
    expect(actor.getSnapshot().context.done).toHaveLength(2);
  });

  it("a held problem does not count: one solved and one held give no card", () => {
    const actor = run();
    hold(actor);
    settle(actor);
    solve(actor);
    settle(actor);
    expect(viewOf(actor.getSnapshot()).screen).toBe("problem");
    // The third problem makes two solved: the card comes at the session's end.
    solve(actor);
    expect(viewOf(actor.getSnapshot()).screen).toBe("card");
    actor.send({ type: "NEXT" });
    expect(viewOf(actor.getSnapshot()).screen).toBe("finished");
  });

  it("comes at the session's end too, and only once after each problem", () => {
    const actor = run({ maxProblems: 2 });
    solve(actor);
    solve(actor);
    expect(viewOf(actor.getSnapshot()).screen).toBe("card");
    actor.send({ type: "NEXT" });
    expect(viewOf(actor.getSnapshot()).screen).toBe("finished");
  });
});

describe("what the card screen shows", () => {
  it("the junior's current card, the four options from core, and a gallery of the solved problems as the junior's worlds", () => {
    const actor = run();
    solve(actor);
    solve(actor);
    const s = actor.getSnapshot();
    const v = cardView(actor);
    const current = s.context.log.at(-1)?.reading;
    expect(current).toBeDefined();
    expect(v.card).toMatch(/^AIくんの読み方：/);
    expect(v.card).toBe(readingCard(current as never, undefined, "ja", { forEdit: true }) ?? readingCard(current as never, undefined, "ja"));
    expect(v.options.map((o) => o.ruleId)).toEqual([...CARD_RULE_IDS]);
    expect(v.options.map((o) => o.label)).toEqual(CARD_RULE_IDS.map((id) => cardSlot(rule(id), "ja")));
    // Nothing is chosen for the child beyond the junior's own card.
    expect(v.options.filter((o) => o.chosen).map((o) => o.ruleId)).toEqual(CARD_RULE_IDS.includes(current?.id as never) ? [current?.id] : []);
    const solvedIds = s.context.log.filter((l) => l.outcome === "solved").map((l) => l.problemId);
    expect(v.gallery.map((g) => g.problemId)).toEqual(solvedIds);
    for (const g of v.gallery) {
      const rec = record(g.problemId);
      const lit = g.statements.filter((x) => x.lit).map((x) => x.index);
      // Which sentences light is core's: the rule run on the problem, every sentence checked.
      expect(lit).toEqual(cardFailing(current as never, rec));
      expect(g.world).not.toBeNull();
      // The world is the one the junior's rule builds (core runRule).
      expect(sameReading(g.world as never, runRule(current as never, rec), true)).toBe(true);
      // The asked value is never drawn (？).
      const asked = g.world?.quantities.find((q) => q.id === rec.world.question.target_id);
      expect(asked?.value ?? null).toBeNull();
    }
  });

  it("each pick runs every gallery world again with core, and only the sentences' light changes as feedback", () => {
    const actor = run();
    solve(actor);
    solve(actor);
    const before = cardView(actor);
    for (const id of CARD_RULE_IDS) {
      actor.send({ type: "CARD_PICK", ruleId: id });
      const v = cardView(actor);
      expect(v.options.filter((o) => o.chosen).map((o) => o.ruleId)).toEqual([id]);
      expect(v.card).toBe(readingCard(rule(id), undefined, "ja", { forEdit: true }));
      for (const g of v.gallery) {
        const rec = record(g.problemId);
        expect(g.statements.filter((x) => x.lit).map((x) => x.index), `${id} ${g.problemId}`).toEqual(cardFailing(rule(id), rec));
        expect(sameReading(g.world as never, runRule(rule(id), rec), true)).toBe(true);
      }
      // The screen says nothing about right or wrong: the words are the same for every pick.
      expect(v.lines).toEqual(before.lines);
      expect(v.next).toBe(before.next);
    }
    // The reading that keeps the sentence's own 1 lights nothing; swapping lights something on every world.
    actor.send({ type: "CARD_PICK", ruleId: CORRECT_READING_ID });
    expect(cardView(actor).gallery.every((g) => g.statements.every((x) => !x.lit))).toBe(true);
    actor.send({ type: "CARD_PICK", ruleId: "c_swap" });
    expect(cardView(actor).gallery.every((g) => g.statements.some((x) => x.lit))).toBe(true);
    expect(actor.getSnapshot().context.ruleCard?.picks).toBe(CARD_RULE_IDS.length + 2);
  });

  it("an unknown rule id changes nothing", () => {
    const actor = run();
    solve(actor);
    solve(actor);
    const before = actor.getSnapshot().context.ruleCard;
    actor.send({ type: "CARD_PICK", ruleId: "c_additive" });
    actor.send({ type: "CARD_PICK", ruleId: "anything" });
    expect(actor.getSnapshot().context.ruleCard).toEqual(before);
  });

  it("every word on the card screen is safe, in Japanese and in English; no number outside the problems and the 1", () => {
    for (const lang of ["ja", "en"] as const) {
      const actor = run({ lang });
      solve(actor);
      solve(actor);
      for (const id of CARD_RULE_IDS) {
        actor.send({ type: "CARD_PICK", ruleId: id });
        const v = cardView(actor);
        const problemTexts = new Set(v.gallery.flatMap((g) => g.statements.map((x) => x.text)));
        // The everyday scenes write their own numbers (core's gate show_scene lets only those through), never a bank value.
        const sceneTexts = new Set((v.scenes?.items ?? []).flatMap((i) => i.lines));
        for (const t of sceneTexts) for (const n of numbersIn(t)) expect(avoid.some((a) => a.num * n.den === n.num * a.den), t).toBe(false);
        for (const t of childTexts(v)) {
          expect(hasForbiddenPhrase(t), t).toBe(false);
          if (problemTexts.has(t) || sceneTexts.has(t)) continue;
          const plain = t.split("1とみる").join("").replace(/\bas 1\b/g, "").replace(/「1」|"1"/g, "");
          expect(numbersIn(plain), t).toEqual([]);
        }
        if (lang === "en") {
          const ui = childTexts(v).filter((t) => !problemTexts.has(t));
          expect(ui.join("\n")).not.toMatch(/[぀-ヿ㐀-鿿]/);
        }
      }
    }
  });
});

describe("the card the child leaves", () => {
  it("is recorded, and becomes the junior's taught reading when every gallery world fits", () => {
    const actor = run();
    solve(actor);
    solve(actor);
    const session = actor.getSnapshot().context.session?.id;
    actor.send({ type: "CARD_PICK", ruleId: "c_swap" });
    actor.send({ type: "CARD_PICK", ruleId: CORRECT_READING_ID });
    actor.send({ type: "NEXT" });
    settle(actor);
    const s = actor.getSnapshot();
    expect(s.context.cardLog).toHaveLength(1);
    const entry = s.context.cardLog[0];
    expect(entry?.leftRuleId).toBe(CORRECT_READING_ID);
    expect(entry?.fitsAll).toBe(true);
    expect(entry?.picks).toBe(2);
    expect(entry?.startRuleId).toBe(session);
    expect(entry?.galleryIds).toEqual(s.context.log.filter((l) => l.outcome === "solved").map((l) => l.problemId));
    expect(s.context.taught?.id).toBe(CORRECT_READING_ID);
    // The next problem is read with the taught reading (core kohaiReading taught).
    const p = s.context.problem;
    expect(p?.reading.source).toBe("taught");
    expect(p?.reading.hypothesis.id).toBe(CORRECT_READING_ID);
  });

  it("a taught reading that builds the sentence's own world is drawn as the length order only, until the child's own 1", () => {
    const actor = run();
    solve(actor);
    solve(actor);
    actor.send({ type: "CARD_PICK", ruleId: CORRECT_READING_ID });
    actor.send({ type: "NEXT" });
    settle(actor);
    let v = viewOf(actor.getSnapshot());
    if (v.screen !== "problem") throw new Error("expected a problem");
    // No "1" card is drawn on the junior's world, so no segment shows (指示書 第7.1節 手順3, Q29).
    expect(v.one).toBeNull();
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "PREDICT", answer: "fits" });
    v = viewOf(actor.getSnapshot());
    if (v.screen !== "problem") throw new Error("expected a problem");
    expect(v.one).toBeNull();
    expect(v.statements.some((x) => x.lit)).toBe(false);
    // The junior never reports that the taught reading held (Q30).
    expect(actor.getSnapshot().context.line?.key ?? "").not.toBe("kohai.result");
    // The child still places the 1 first; the research observation is the child's own.
    placeRight(actor);
    actor.send({ type: "CONFIRM_YES" });
    passBook(actor);
    expect(actor.getSnapshot().context.problem?.firstPlacement).not.toBeNull();
    expect(actor.getSnapshot().matches({ active: { problem: "rebuilt" } })).toBe(true);
  });

  it("a card that leaves a gallery world unfit is recorded, and the session's misreading goes on", () => {
    const actor = run();
    solve(actor);
    solve(actor);
    const session = actor.getSnapshot().context.session?.id;
    actor.send({ type: "CARD_PICK", ruleId: "c_swap" });
    actor.send({ type: "NEXT" });
    settle(actor);
    const s = actor.getSnapshot();
    expect(s.context.cardLog.at(-1)).toMatchObject({ leftRuleId: "c_swap", fitsAll: false, picks: 1 });
    expect(s.context.taught).toBeNull();
    expect(s.context.problem?.reading.source).not.toBe("taught");
    expect(s.context.problem?.reading.hypothesis.id).toBe(session);
  });

  it("leaving the card unchanged keeps the session's misreading (it does not fit the solved worlds)", () => {
    const actor = run();
    solve(actor);
    solve(actor);
    actor.send({ type: "NEXT" });
    settle(actor);
    const s = actor.getSnapshot();
    expect(s.context.cardLog.at(-1)?.fitsAll).toBe(false);
    expect(s.context.cardLog.at(-1)?.picks).toBe(0);
    expect(s.context.taught).toBeNull();
  });

  it("with a taught reading, the next problem is one where it changes the world when the bank has one (a transfer problem)", () => {
    const known = rule("c_known_whole");
    const pick = selectNext(FRACTION_BANK, [], initialState(), null, "ja", known);
    expect(pick).not.toBeNull();
    expect(pick?.junior.reading.source).toBe("taught");
    expect(pick?.junior.orderOnly).toBe(false);
    expect(sameReading(runRule(known, pick?.record as never), pick?.record.world as never, true)).toBe(false);
    // The reading that keeps the sentence's own 1 changes no world: its problem is drawn as the order only.
    const kept = selectNext(FRACTION_BANK, [], initialState(), null, "ja", rule(CORRECT_READING_ID));
    expect(kept?.junior.orderOnly).toBe(true);
    expect(kept?.junior.shown.failing).toEqual([]);
  });
});

describe("stop, don't know and hard on the card screen", () => {
  function atCard(): Actor {
    const actor = run();
    solve(actor);
    solve(actor);
    expect(viewOf(actor.getSnapshot()).screen).toBe("card");
    return actor;
  }

  it("stop ends the session", () => {
    const actor = atCard();
    actor.send({ type: "STOP" });
    expect(actor.getSnapshot().status).toBe("done");
    expect(actor.getSnapshot().context.endedBy).toBe("stop");
  });

  it("don't know waits and resumes on the card with the child's pick kept; there is no problem to hold", () => {
    const actor = atCard();
    actor.send({ type: "CARD_PICK", ruleId: "c_first_whole" });
    actor.send({ type: "DONT_KNOW" });
    const stuck = viewOf(actor.getSnapshot());
    expect(stuck.screen).toBe("stuck");
    expect(stuck.screen === "stuck" && stuck.hold).toBeNull();
    actor.send({ type: "HOLD" });
    expect(viewOf(actor.getSnapshot()).screen).toBe("stuck");
    actor.send({ type: "RESUME" });
    const v = cardView(actor);
    expect(v.options.filter((o) => o.chosen).map((o) => o.ruleId)).toEqual(["c_first_whole"]);
    expect(actor.getSnapshot().context.ruleCard?.picks).toBe(1);
  });

  it("hard stops the math at once", () => {
    const actor = atCard();
    actor.send({ type: "HARD" });
    expect(actor.getSnapshot().matches("hard")).toBe(true);
    expect(actor.getSnapshot().context.safetyLog.at(-1)).toBe("hard_button");
  });
});
