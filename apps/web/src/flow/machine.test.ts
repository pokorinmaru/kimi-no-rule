// 指示書 第11節 M7 (submission scope, HANDOFF §3 F1・F2・F3・F8): every path of the one-session machine,
// walked with @xstate/graph. Written before the implementation.
import { describe, expect, it } from "vitest";
import { getShortestPaths, getSimplePaths, getStateNodes } from "@xstate/graph";
import { createActor, transition, type SnapshotFrom } from "xstate";
import { FRACTION_BANK, initialState, numbersIn, observe, observeAgreement, sameReading, runRule, TEMPLATES, type Rational } from "@kimi/core";
import { flowMachine, predictionOrder, type FlowEvent, type FlowInput } from "./machine.ts";
import { childTexts, viewOf } from "./view.ts";
import { firstReading, judgeTotal, judgeUnit } from "./problem.ts";
import { HELPLINES, hasForbiddenPhrase, helplineLine, helplinesFor, ui } from "./text.ts";
import { checkText } from "../check/text.ts";
import { passBook } from "./test-book.ts";

/** The text with the checked helpline lines taken out (their numbers are allowed, nothing else). */
const withoutHelplines = (t: string): string => HELPLINES.reduce((acc, h) => acc.replaceAll(helplineLine(h), ""), t);

type Snap = SnapshotFrom<typeof flowMachine>;

const r = (num: number): Rational => ({ num, den: 1 });

type Values = { unitOk: Rational; unitNg: Rational; totalOk: Rational; totalNg: Rational };
const valueCache = new Map<string, Values>();

/** A right and a wrong value for the unit and the total of the problem on screen (core judges). */
function values(s: Snap): Values | null {
  const p = s.context.problem;
  if (p === null) return null;
  const hit = valueCache.get(p.record.world.problem_id);
  if (hit !== undefined) return hit;
  let unitOk: Rational | null = null;
  let unitNg: Rational | null = null;
  let totalOk: Rational | null = null;
  let totalNg: Rational | null = null;
  for (let n = 1; n <= 60; n++) {
    if (judgeUnit(p.record, r(n))) unitOk ??= r(n);
    else unitNg ??= r(n);
    if (judgeTotal(p.record, r(n))) totalOk ??= r(n);
    else totalNg ??= r(n);
  }
  if (unitOk === null || unitNg === null || totalOk === null || totalNg === null) throw new Error("no values found");
  const v = { unitOk, unitNg, totalOk, totalNg };
  valueCache.set(p.record.world.problem_id, v);
  return v;
}

const GLOBAL: FlowEvent[] = [{ type: "STOP" }, { type: "DONT_KNOW" }, { type: "HARD" }];

/** Child events that make sense on the current screen, and the controller's events. */
function events(s: Snap, opts: { safety: boolean; research: boolean; voice?: boolean }): FlowEvent[] {
  const out: FlowEvent[] = [...GLOBAL, { type: "NEXT" }, { type: "CONSENT_YES" }, { type: "CONSENT_NO" }, { type: "RESUME" }, { type: "HOLD" }, { type: "CLOSE" }];
  const p = s.context.problem;
  if (p !== null) {
    const rel = p.record.world.relations.find((x) => x.id === p.relationId);
    for (const q of [rel?.subject, rel?.reference]) if (q !== undefined && q !== null) out.push({ type: "PLACE_ONE", quantityId: q });
    out.push({ type: "CONFIRM_YES" }, { type: "CONFIRM_NO" }, { type: "TAP_WORD", statementIndex: 0, token: 0 });
    out.push({ type: "PREDICT", answer: "fits" }, { type: "PREDICT", answer: "odd" }, { type: "PREDICT", answer: "unknown" });
    // The child's own first prediction: the "1" card on one holder, and who has more (one holder; "not yet").
    const firstHolder = p.record.world.quantities.find((q) => q.id === rel?.reference)?.holder;
    // Offered only while the prediction is open, so the walks stay small.
    if (p.guess === null) {
      if (firstHolder !== undefined && p.guessOne === null) out.push({ type: "GUESS_ONE", holderId: firstHolder }, { type: "GUESS", larger: firstHolder });
      out.push({ type: "GUESS", larger: null });
    }
    // The junior's staged questions: one holder for "which is longer?", and opening the word book.
    const firstEnd = p.record.world.quantities.find((q) => q.id === rel?.subject)?.holder;
    if (firstEnd !== undefined) out.push({ type: "ORDER_GUESS", holderId: firstEnd });
    out.push({ type: "OPEN_BOOK" });
    const v = values(s);
    if (v !== null) {
      out.push({ type: "ANSWER_UNIT", value: v.unitOk }, { type: "ANSWER_UNIT", value: v.unitNg });
      out.push({ type: "ANSWER_TOTAL", value: v.totalOk }, { type: "ANSWER_TOTAL", value: v.totalNg });
    }
  }
  // On the junior's rule card: the reading that keeps the sentence's 1, and one that never fits.
  if (s.context.ruleCard !== null) out.push({ type: "CARD_PICK", ruleId: "c_correct" }, { type: "CARD_PICK", ruleId: "c_swap" });
  // The child's voice (and its ops from the worker): heard, then placed on the sentence's 1, or nothing usable.
  if (opts.voice === true && p !== null) {
    const rel = p.record.world.relations.find((x) => x.id === p.relationId);
    out.push({ type: "VOICE_HEARD", transcript: "弟が1だよ" }, { type: "VOICE_OPS", ops: null });
    if (rel !== undefined && rel.reference !== null) out.push({ type: "VOICE_OPS", ops: [{ op: "set_relation_reference", target_id: rel.id, reference: rel.reference, evidence: "" }] });
  }
  if (opts.research) out.push({ type: "RESEARCH_RESULT", pool: null });
  if (opts.safety) out.push({ type: "SAFETY_RESULT", flag: "unchecked" }, { type: "SAFETY_RESULT", flag: "none" }, { type: "SAFETY_RESULT", flag: "distress" });
  return out;
}

/** The parts of a snapshot that make a different screen (kept coarse so the graph stays small). */
function key(s: Snap): string {
  const c = s.context;
  const p = c.problem;
  return JSON.stringify([
    s.value,
    s.status,
    c.done,
    c.uncheckedStreak > 0,
    c.researchApplied,
    c.researchResult === undefined,
    c.log.filter((l) => l.outcome === "solved").length,
    c.ruleCard?.rule.id ?? null,
    p === null ? null : [p.guessOne !== null, p.firstPlacement !== null, p.fixes, p.placement, p.listening, p.voiceTurns],
  ]);
}

/** Checks each distinct screen of the paths once. */
function checkAll(paths: { steps: { state: Snap }[] }[]): number {
  const seen = new Map<string, Snap>();
  for (const p of paths) for (const st of p.steps) seen.set(key(st.state) + JSON.stringify(st.state.context.problem?.placement ?? null) + String(st.state.context.problem?.words.length ?? 0), st.state);
  for (const s of seen.values()) checkScreen(s);
  return seen.size;
}

/** States left at once by an always transition: never a resting screen. */
const TRANSIENT = new Set(["flow.active.entry", "flow.active.loading", "flow.active.next", "flow.active.problem.checking"]);

const FRESH: FlowInput = { introSeen: false, consented: false, maxProblems: 2 };

/** Invariants that must hold on every screen of every path. */
function checkScreen(s: Snap): void {
  const view = viewOf(s);
  const texts = childTexts(view);
  for (const t of texts) expect(hasForbiddenPhrase(t), `forbidden phrase in child text: ${t}`).toBe(false);
  const p = s.context.problem;
  if (p !== null) {
    // No sentence lights, and nothing glows, before the child's prediction or its skip (指示書 第11節 M7).
    if (view.screen === "problem" && (view.statements.some((x) => x.lit) || view.glowIds.length > 0)) expect(p.prediction).not.toBeNull();
    if (p.taughtOps.length > 0 || p.firstPlacement !== null) expect(p.prediction).not.toBeNull();
    // The junior's world and line come only after the child's own first prediction (指示書 第7.1節 手順2).
    if (p.prediction !== null) expect(p.guess).not.toBeNull();
    if (p.guess === null && !p.logged && view.screen !== "stuck" && view.screen !== "hard" && view.screen !== "rest" && view.screen !== "ended") {
      expect(view.screen).toBe("guess");
      if (view.screen === "guess") {
        expect(view.line).toBeNull();
        // The outlines carry the problem's own numbers or "？" only.
        for (const t of view.tapes) if (t.value !== "？") expect(p.record.world.problem_text).toContain(t.value.replace(/[^0-9/]/g, ""));
      }
    }
    // The world on screen is the correct one only after the child's own first placement was recorded, or, for a
    // reading the child left on the rule card, drawn as the length order only (no "1" card) until then.
    if (sameReading(p.shown.world, p.record.world, true) && p.firstPlacement === null) {
      expect(p.orderOnly).toBe(true);
      if (view.screen === "problem") expect(view.one).toBeNull();
    }
    // A recheck of the child's teaching never comes before that record.
    if (p.taughtOps.length > 0) expect(p.firstPlacement).not.toBeNull();
    // The junior never reads with a reading that builds the correct world, unless the child left it on the rule card.
    if (p.reading.source !== "taught") expect(sameReading(runRule(p.reading.hypothesis, p.record), p.record.world, true)).toBe(false);
  }
  // On the junior's staged questions and the word book, the junior's words never name a holder of the problem
  // (so never the one taken as 1), and the book's page never shows the problem's holders.
  if (p !== null && (view.screen === "help" || view.screen === "wordbook")) {
    for (const h of p.record.world.holders) {
      expect(view.line ?? "", view.line ?? "").not.toContain(h.label);
      if (view.screen === "wordbook") expect((view.page?.lines ?? []).join(""), h.label).not.toContain(h.label);
    }
  }
  // The words heard stay in memory: never in the device's log or the research state (第9節).
  expect(JSON.stringify([s.context.log, s.context.research])).not.toContain("弟が1だよ");
  // The junior never reports that a taught reading held (Q30: no thanks line, even when it reads with the card the child left).
  expect(s.context.line?.key ?? "").not.toBe("kohai.result");
}

function walk(input: FlowInput, opts: { safety: boolean; research: boolean; voice?: boolean }) {
  return getShortestPaths(flowMachine, {
    input,
    events: (s) => events(s, opts),
    serializeState: (s) => key(s),
  });
}

describe("the session machine: every state is reachable and every screen keeps the rules", () => {
  const paths = walk(FRESH, { safety: true, research: true, voice: true });

  it("reaches every state node of the machine", () => {
    const reached = new Set<string>();
    for (const p of paths) for (const st of p.steps) for (const id of st.state._nodes.map((n) => n.id)) reached.add(id);
    const all = getStateNodes(flowMachine.root)
      .filter((n) => n.type !== "history" && !TRANSIENT.has(n.id))
      .map((n) => n.id);
    expect(all.filter((id) => !reached.has(id))).toEqual([]);
  });

  it("keeps the rules on every screen of every shortest path", () => {
    expect(paths.length).toBeGreaterThan(50);
    expect(checkAll(paths)).toBeGreaterThan(50);
  });

  it("from every state, stop ends the session, hard goes to the safety screen and don't know is heard", () => {
    for (const p of paths) {
      const s = p.state;
      if (s.status !== "active") continue;
      const stop = step(s, { type: "STOP" });
      expect(stop.status).toBe("done");
      const hard = step(s, { type: "HARD" });
      expect(hard.matches("hard")).toBe(true);
      const dk = step(s, { type: "DONT_KNOW" });
      // Inside the session it opens the junior's staged questions where the child moves the card (and moves on
      // through them), else the "don't know" screen; on the safety and rest screens nothing math-like opens.
      const onCard = s.matches({ active: { problem: "looking" } }) || s.matches({ active: { problem: "placed" } });
      const earlyHelp = s.matches({ active: { problem: { help: "read" } } }) || s.matches({ active: { problem: { help: "order" } } });
      if (onCard || earlyHelp) expect(dk.matches({ active: { problem: "help" } })).toBe(true);
      else if (s.matches("active")) expect(dk.matches("stuck")).toBe(true);
      else expect(dk.matches("active")).toBe(false);
    }
  });

  it("a distress result stops the math from every state", () => {
    for (const p of paths) {
      const s = p.state;
      if (s.status !== "active") continue;
      const out = step(s, { type: "SAFETY_RESULT", flag: "distress" });
      expect(out.matches("hard")).toBe(true);
      expect(out.context.safetyLog.at(-1)).toBe("distress");
    }
  });
});

/** The child's own moves on one problem (stop, hard and safety are walked by the shortest paths above). */
const SIMPLE = new Set<FlowEvent["type"]>(["NEXT", "GUESS", "PREDICT", "PLACE_ONE", "CONFIRM_YES", "CONFIRM_NO", "ANSWER_UNIT", "ANSWER_TOTAL", "DONT_KNOW", "RESUME", "HOLD", "STOP", "OPEN_BOOK"]);

describe("simple paths through one problem", () => {
  it("every simple path keeps the rules (one problem, no safety events)", { timeout: 30_000 }, () => {
    const paths = getSimplePaths(flowMachine, {
      input: { introSeen: true, consented: true, maxProblems: 1 },
      // The first prediction is passed with "not yet" here (its card and answers are walked by the shortest paths), so
      // the number of simple paths stays bounded.
      events: (s) => events(s, { safety: false, research: false }).filter((e) => SIMPLE.has(e.type) && !(e.type === "GUESS" && e.larger !== null)),
      serializeState: (s) => key(s),
      toState: (s) => s.status === "done",
    });
    expect(paths.length).toBeGreaterThan(20);
    expect(checkAll(paths)).toBeGreaterThan(20);
  });
});

// ---------------------------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------------------------

function step(s: Snap, e: FlowEvent): Snap {
  return transition(flowMachine, s, e)[0];
}

/** Starts a session; on the first problem the child's own first prediction is passed with "not yet" (guess.test.ts walks it). */
function run(input: FlowInput = { introSeen: true, consented: true }) {
  const actor = createActor(flowMachine, { input });
  actor.start();
  actor.send({ type: "GUESS", larger: null });
  return actor;
}

/** The quantity that makes every sentence hold, found by asking core through the machine's own check. */
function place(actor: ReturnType<typeof run>, right: boolean): void {
  const p = actor.getSnapshot().context.problem;
  if (p === null) throw new Error("no problem");
  const rel = p.record.world.relations.find((x) => x.id === p.relationId);
  const q = right ? rel?.reference : rel?.subject;
  actor.send({ type: "PLACE_ONE", quantityId: q as string });
}

function solveProblem(actor: ReturnType<typeof run>): void {
  actor.send({ type: "GUESS", larger: null });
  actor.send({ type: "PREDICT", answer: "fits" });
  place(actor, true);
  actor.send({ type: "CONFIRM_YES" });
  passBook(actor);
  expect(actor.getSnapshot().matches({ active: { problem: "rebuilt" } })).toBe(true);
  actor.send({ type: "NEXT" });
  const v = values(actor.getSnapshot());
  actor.send({ type: "ANSWER_UNIT", value: v?.unitOk as Rational });
  actor.send({ type: "ANSWER_TOTAL", value: v?.totalOk as Rational });
  expect(actor.getSnapshot().matches({ active: { problem: "solved" } })).toBe(true);
  actor.send({ type: "NEXT" });
  // After two solved problems the junior's rule card comes; left as it is, the session's misreading goes on.
  if (actor.getSnapshot().matches({ active: "card" })) actor.send({ type: "NEXT" });
}

describe("the flow of one problem (F1)", () => {
  it("shows the intro once with the AI disclosure, then consent, then the signboard problem", () => {
    const actor = run(FRESH);
    const intro = viewOf(actor.getSnapshot());
    expect(intro.screen).toBe("intro");
    expect(childTexts(intro).join("")).toContain("AI");
    expect(childTexts(intro).join("")).toMatch(/心/);
    actor.send({ type: "NEXT" });
    expect(viewOf(actor.getSnapshot()).screen).toBe("consent");
    actor.send({ type: "CONSENT_YES" });
    const s = actor.getSnapshot();
    expect(s.context.consented).toBe(true);
    expect(s.context.introSeen).toBe(true);
    expect(s.context.problem?.record.world.problem_id).toBe("p_signboard");
    // The child's own first prediction comes before the junior's world (指示書 第7.1節 手順2).
    expect(s.matches({ active: { problem: "guess" } })).toBe(true);
  });

  it("skips the intro and consent when they were already given", () => {
    const actor = run({ introSeen: true, consented: true });
    expect(actor.getSnapshot().matches({ active: { problem: "reading" } })).toBe(true);
  });

  it("declining consent ends the session without a problem", () => {
    const actor = run({ introSeen: true, consented: false });
    actor.send({ type: "CONSENT_NO" });
    expect(actor.getSnapshot().status).toBe("done");
    expect(actor.getSnapshot().context.endedBy).toBe("consent_declined");
  });

  it("the junior reads, sentences light up, the child moves the 1, the junior restates, the world rebuilds", () => {
    const actor = run();
    let v = viewOf(actor.getSnapshot());
    expect(v.screen === "problem" && v.step).toBe("reading");
    expect(v.screen === "problem" && v.line).toMatch(/読/);
    // No sentence lights before the junior has shown its world and said so.
    expect(v.screen === "problem" && v.statements.some((x) => x.lit)).toBe(false);
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "PREDICT", answer: "fits" });
    v = viewOf(actor.getSnapshot());
    expect(v.screen === "problem" && v.step).toBe("looking");
    expect(v.screen === "problem" && v.statements.some((x) => x.lit)).toBe(true);
    expect(actor.getSnapshot().context.problem?.firstPlacement).toBeNull();
    actor.send({ type: "TAP_WORD", statementIndex: 1, token: 4 });
    place(actor, true);
    v = viewOf(actor.getSnapshot());
    expect(v.screen === "problem" && v.step).toBe("placed");
    // The junior hands back the holder and only the child's tapped word.
    expect(v.screen === "problem" && v.line).toContain("弟");
    expect(v.screen === "problem" && v.line).toContain("「の」");
    // A placement is the child's reading only once the child confirms it.
    expect(actor.getSnapshot().context.problem?.firstPlacement).toBeNull();
    actor.send({ type: "CONFIRM_YES" });
    passBook(actor);
    expect(actor.getSnapshot().context.problem?.firstPlacement).not.toBeNull();
    v = viewOf(actor.getSnapshot());
    expect(v.screen === "problem" && v.step).toBe("rebuilt");
    expect(v.screen === "problem" && v.statements.some((x) => x.lit)).toBe(false);
  });

  it("a wrong placement keeps a sentence lit and goes back to moving the card; three tries hold the problem", () => {
    const actor = run();
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "PREDICT", answer: "fits" });
    for (let i = 0; i < 2; i++) {
      place(actor, false);
      actor.send({ type: "CONFIRM_YES" });
      passBook(actor);
      expect(actor.getSnapshot().matches({ active: { problem: "looking" } })).toBe(true);
    }
    place(actor, false);
    actor.send({ type: "CONFIRM_YES" });
    passBook(actor);
    expect(actor.getSnapshot().matches({ active: { problem: "held" } })).toBe(true);
    expect(actor.getSnapshot().context.log.at(-1)?.outcome).toBe("held");
  });

  it("'no' to the junior's restatement goes back to moving the card without changing the world", () => {
    const actor = run();
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "PREDICT", answer: "fits" });
    const before = actor.getSnapshot().context.problem?.shown.world;
    place(actor, true);
    actor.send({ type: "CONFIRM_NO" });
    const s = actor.getSnapshot();
    expect(s.matches({ active: { problem: "looking" } })).toBe(true);
    expect(s.context.problem?.shown.world).toEqual(before);
    expect(s.context.problem?.placement).toBeNull();
    // A placement the child rejected is not an observation and nothing is sent.
    expect(s.context.problem?.firstPlacement).toBeNull();
    expect(s.context.research.readings).toHaveLength(0);
    expect(s.context.researchRequest).toBeNull();
  });

  it("core judges the unit and the total; a wrong unit gets the mismatch words and the child tries again", () => {
    const actor = run();
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "PREDICT", answer: "fits" });
    place(actor, true);
    actor.send({ type: "CONFIRM_YES" });
    passBook(actor);
    actor.send({ type: "NEXT" });
    const v = values(actor.getSnapshot());
    actor.send({ type: "ANSWER_UNIT", value: v?.unitNg as Rational });
    const s = actor.getSnapshot();
    expect(s.matches({ active: { problem: "unit" } })).toBe(true);
    expect(s.context.line?.key).toBe("unit.mismatch");
    actor.send({ type: "ANSWER_UNIT", value: v?.unitOk as Rational });
    actor.send({ type: "ANSWER_TOTAL", value: v?.totalNg as Rational });
    expect(actor.getSnapshot().matches({ active: { problem: "total" } })).toBe(true);
    actor.send({ type: "ANSWER_TOTAL", value: v?.totalOk as Rational });
    expect(actor.getSnapshot().matches({ active: { problem: "solved" } })).toBe(true);
  });

  /** On the signboard: the unit step, with the right values known to the test only. */
  function atUnit() {
    const actor = run();
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "PREDICT", answer: "fits" });
    place(actor, true);
    actor.send({ type: "CONFIRM_YES" });
    passBook(actor);
    actor.send({ type: "NEXT" });
    return { actor, v: values(actor.getSnapshot()) as Values };
  }

  /** The child-visible line, which never holds the right number nor judging words (指示書 第5.7節). */
  function expectMismatchLine(actor: ReturnType<typeof run>, v: Values): void {
    const view = viewOf(actor.getSnapshot());
    const line = view.screen === "problem" ? (view.line ?? "") : "";
    expect(line.length).toBeGreaterThan(0);
    expect(actor.getSnapshot().context.line?.key).toBe("unit.mismatch");
    expect(line).not.toContain(String(v.unitOk.num));
    expect(line).not.toContain(String(v.totalOk.num));
    expect(hasForbiddenPhrase(line), line).toBe(false);
    expect(line).not.toMatch(/正しい|ちがう|ざんねん/);
  }

  it("a wrong unit shows the junior's mismatch line, and a second wrong unit holds the problem (1問2回)", () => {
    const { actor, v } = atUnit();
    actor.send({ type: "ANSWER_UNIT", value: v.unitNg });
    expectMismatchLine(actor, v);
    expect(actor.getSnapshot().matches({ active: { problem: "unit" } })).toBe(true);
    actor.send({ type: "ANSWER_UNIT", value: v.unitNg });
    const s = actor.getSnapshot();
    expect(s.matches({ active: { problem: "held" } })).toBe(true);
    expect(s.context.line?.key).toBe("hold.offer");
    expect(s.context.log.at(-1)?.outcome).toBe("held");
    expect(s.context.log.at(-1)?.unitTries).toBe(2);
    const text = childTexts(viewOf(s)).join("");
    expect(text).not.toContain(`${String(v.unitOk.num)}匹`);
    expect(text).not.toContain(`${String(v.totalOk.num)}匹`);
  });

  it("a wrong total shows the junior's mismatch line, and a second wrong total holds the problem (1問2回)", () => {
    const { actor, v } = atUnit();
    actor.send({ type: "ANSWER_UNIT", value: v.unitOk });
    actor.send({ type: "ANSWER_TOTAL", value: v.totalNg });
    expectMismatchLine(actor, v);
    expect(actor.getSnapshot().matches({ active: { problem: "total" } })).toBe(true);
    actor.send({ type: "ANSWER_TOTAL", value: v.totalNg });
    const s = actor.getSnapshot();
    expect(s.matches({ active: { problem: "held" } })).toBe(true);
    expect(s.context.log.at(-1)?.totalTries).toBe(2);
    // The flow moves on from the held problem.
    actor.send({ type: "NEXT" });
    const after = actor.getSnapshot();
    expect(after.matches({ active: "researching" }) || after.matches({ active: { problem: "reading" } })).toBe(true);
  });

  it("the junior's line number never goes back within a session", () => {
    const actor = run({ introSeen: true, consented: true, maxProblems: 2 });
    const seqs: number[] = [actor.getSnapshot().context.line?.seq as number];
    actor.subscribe((s) => {
      if (s.context.line !== null && s.context.line.seq !== seqs.at(-1)) seqs.push(s.context.line.seq);
    });
    solveProblem(actor);
    actor.send({ type: "RESEARCH_RESULT", pool: null });
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "PREDICT", answer: "fits" });
    expect(seqs.length).toBeGreaterThan(3);
    for (let i = 1; i < seqs.length; i++) expect(seqs[i] as number).toBeGreaterThan(seqs[i - 1] as number);
  });

  it("the failing sentences' elements glow with them, and nothing glows before the junior's world is shown", () => {
    const actor = run();
    let v = viewOf(actor.getSnapshot());
    expect(v.screen === "problem" && v.glowIds).toEqual([]);
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "PREDICT", answer: "fits" });
    v = viewOf(actor.getSnapshot());
    if (v.screen !== "problem") throw new Error("problem expected");
    const p = actor.getSnapshot().context.problem;
    if (p === null) throw new Error("problem expected");
    const expected = [...new Set(p.shown.failing.flatMap((i) => p.record.statements[i]?.element_ids ?? []))];
    expect(expected.length).toBeGreaterThan(0);
    expect([...v.glowIds].sort()).toEqual(expected.sort());
  });

  it("the junior's answer-free line from the server replaces the template only while it is current", () => {
    const actor = run();
    const seq = actor.getSnapshot().context.line?.seq as number;
    actor.send({ type: "KOHAI_LINE", seq, text: "この読み方だと、兄のテープが長いです" });
    expect(actor.getSnapshot().context.line?.text).toBe("この読み方だと、兄のテープが長いです");
    expect(actor.getSnapshot().context.line?.source).toBe("claude");
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "PREDICT", answer: "fits" });
    actor.send({ type: "KOHAI_LINE", seq, text: "おそい返事" });
    expect(actor.getSnapshot().context.line?.text).not.toBe("おそい返事");
  });

  it("a line from the server that names the answer or an operation is not used", () => {
    const actor = run();
    const seq = actor.getSnapshot().context.line?.seq as number;
    const before = actor.getSnapshot().context.line?.text;
    actor.send({ type: "KOHAI_LINE", seq, text: "弟は8匹です" });
    expect(actor.getSnapshot().context.line?.text).toBe(before);
    actor.send({ type: "KOHAI_LINE", seq, text: "6をわってみます" });
    expect(actor.getSnapshot().context.line?.text).toBe(before);
    actor.send({ type: "KOHAI_LINE", seq, text: "きみのルールで読みました" });
    expect(actor.getSnapshot().context.line?.text).toBe(before);
  });
});

// ---------------------------------------------------------------------------------------------
// The child's prediction about the junior's world (指示書 第7.1節 手順4, 第6.7節 手順2 (ii), 第11節 M7)
// ---------------------------------------------------------------------------------------------

describe("the child's prediction: fits or odd, before any sentence lights", () => {
  /** The order of the buttons on the screen now (null when they are not shown). */
  const order = (s: Snap) => {
    const v = viewOf(s);
    return v.screen === "problem" && v.predict !== null ? v.predict.choices.map((c) => c.answer) : null;
  };

  it("asks on the junior's world with fits, odd and not sure, and no button is chosen beforehand", () => {
    const actor = run();
    const v = viewOf(actor.getSnapshot());
    if (v.screen !== "problem") throw new Error("problem expected");
    expect(v.step).toBe("reading");
    expect(v.predict?.question).toMatch(/ぴったり/);
    expect(v.predict?.choices.map((c) => c.answer).slice(0, 2).sort()).toEqual(["fits", "odd"]);
    expect(v.predict?.choices.at(-1)?.answer).toBe("unknown");
    expect(v.predict?.choices.map((c) => c.label)).toEqual(expect.arrayContaining(["ぴったり", "へん"]));
    expect(actor.getSnapshot().context.problem?.prediction).toBeNull();
  });

  it("the order of the two buttons changes on every problem, decided by the problem's number", () => {
    expect(predictionOrder(1)).not.toEqual(predictionOrder(2));
    expect(predictionOrder(1)).toEqual(predictionOrder(3));
    const actor = run({ introSeen: true, consented: true, maxProblems: 3 });
    const seen: (string[] | null)[] = [];
    for (let i = 0; i < 3; i++) {
      if (actor.getSnapshot().matches({ active: "researching" })) actor.send({ type: "RESEARCH_RESULT", pool: null });
      actor.send({ type: "GUESS", larger: null });
      seen.push(order(actor.getSnapshot()));
      expect(order(actor.getSnapshot())?.slice(0, 2)).toEqual([...predictionOrder(i + 1)]);
      solveProblem(actor);
    }
    expect(seen[0]).not.toEqual(seen[1]);
    expect(seen[1]).not.toEqual(seen[2]);
  });

  it("no sentence lights and nothing glows until the child answers; 'next' does not skip the question", () => {
    const actor = run();
    actor.send({ type: "NEXT" });
    let v = viewOf(actor.getSnapshot());
    if (v.screen !== "problem") throw new Error("problem expected");
    expect(v.step).toBe("reading");
    expect(v.statements.some((x) => x.lit)).toBe(false);
    expect(v.glowIds).toEqual([]);
    expect(v.canPlace).toBe(false);
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "PREDICT", answer: "odd" });
    v = viewOf(actor.getSnapshot());
    if (v.screen !== "problem") throw new Error("problem expected");
    expect(v.step).toBe("looking");
    expect(v.statements.some((x) => x.lit)).toBe(true);
    expect(v.predict).toBeNull();
  });

  it("'not sure' skips it: the sentences light and nothing is observed", () => {
    const research = researchedState();
    const actor = run({ introSeen: true, consented: true, research });
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "PREDICT", answer: "unknown" });
    const s = actor.getSnapshot();
    expect(s.matches({ active: { problem: "looking" } })).toBe(true);
    expect(s.context.problem?.prediction).toBe("unknown");
    expect(s.context.research).toEqual(research);
  });

  it("is answered once per problem; later taps change nothing", () => {
    const actor = run();
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "PREDICT", answer: "fits" });
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "PREDICT", answer: "odd" });
    expect(actor.getSnapshot().context.problem?.prediction).toBe("fits");
  });

  it("is observed by core's agreement model on the research state, and kept on the problem's log", () => {
    const research = researchedState();
    const actor = run({ introSeen: true, consented: true, research });
    const before = actor.getSnapshot().context;
    const p = before.problem;
    if (p === null) throw new Error("problem expected");
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "PREDICT", answer: "fits" });
    const expected = observeAgreement(before.research, { record: p.record, shownWorld: p.base, answer: "fits", referencePlaced: true });
    expect(actor.getSnapshot().context.research.weights).toEqual(expected.weights);
    expect(expected.weights).not.toEqual(before.research.weights);
    // It is not a constructive observation: no reading is added.
    expect(actor.getSnapshot().context.research.readings).toHaveLength(research.readings.length);
    actor.send({ type: "STOP" });
    expect(actor.getSnapshot().context.log.at(-1)?.prediction).toBe("fits");
  });

  it("never says whether the prediction fits: every answer leads to the same screen and the same words", () => {
    const screens = (["fits", "odd", "unknown"] as const).map((answer) => {
      const actor = run();
      actor.send({ type: "PREDICT", answer });
      const s = actor.getSnapshot();
      return { key: s.context.line?.key, texts: childTexts(viewOf(s)), value: s.value };
    });
    expect(screens[0]?.key).toBe("kohai.which");
    expect(screens[1]).toEqual(screens[0]);
    expect(screens[2]).toEqual(screens[0]);
  });

  it("stop, don't know and hard work while the question is open", () => {
    let actor = run();
    actor.send({ type: "DONT_KNOW" });
    expect(viewOf(actor.getSnapshot()).screen).toBe("stuck");
    actor.send({ type: "RESUME" });
    expect(actor.getSnapshot().matches({ active: { problem: "reading" } })).toBe(true);
    expect(order(actor.getSnapshot())).not.toBeNull();
    actor.send({ type: "STOP" });
    expect(actor.getSnapshot().status).toBe("done");
    expect(actor.getSnapshot().context.log.at(-1)).toMatchObject({ outcome: "stopped", prediction: null });
    actor = run();
    actor.send({ type: "HARD" });
    expect(viewOf(actor.getSnapshot()).screen).toBe("hard");
    expect(actor.getSnapshot().context.log.at(-1)).toMatchObject({ outcome: "hard", prediction: null });
  });

  it("the question and its buttons hold no forbidden phrase, in Japanese and in English", () => {
    for (const lang of ["ja", "en"] as const) {
      const v = viewOf(run({ introSeen: true, consented: true, lang }).getSnapshot());
      if (v.screen !== "problem" || v.predict === null) throw new Error("question expected");
      for (const t of [v.predict.question, ...v.predict.choices.map((c) => c.label)]) {
        expect(hasForbiddenPhrase(t), t).toBe(false);
        expect(childTexts(v)).toContain(t);
      }
      if (lang === "en") expect([v.predict.question, ...v.predict.choices.map((c) => c.label)].join(" ")).not.toMatch(JAPANESE);
    }
  });
});

/** A research state with a pool, as after one session with the server down (the fallback pool). */
function researchedState() {
  const actor = run();
  solveProblem(actor);
  actor.send({ type: "RESEARCH_RESULT", pool: null });
  const research = actor.getSnapshot().context.research;
  expect(research.pool.length).toBeGreaterThan(0);
  return research;
}

describe("the research layer in the flow (F3)", () => {
  it("records the child's first confirmed placement as the research observation, once per problem", () => {
    const actor = run();
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "PREDICT", answer: "fits" });
    place(actor, false);
    // Not yet: the child has not said "yes" to it.
    expect(actor.getSnapshot().context.research.readings).toHaveLength(0);
    expect(actor.getSnapshot().context.researchRequest).toBeNull();
    actor.send({ type: "CONFIRM_YES" });
    passBook(actor);
    const s1 = actor.getSnapshot();
    expect(s1.context.research.readings).toHaveLength(1);
    expect(s1.context.researchRequest).not.toBeNull();
    place(actor, true);
    actor.send({ type: "CONFIRM_YES" });
    passBook(actor);
    expect(actor.getSnapshot().context.research.readings).toHaveLength(1);
  });

  it("a rejected placement is not observed; the confirmed one is, with the words tapped before the confirm", () => {
    const actor = run();
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "PREDICT", answer: "fits" });
    const p = actor.getSnapshot().context.problem;
    const rel = p?.record.world.relations.find((x) => x.id === p.relationId);
    place(actor, true);
    actor.send({ type: "CONFIRM_NO" });
    place(actor, false);
    actor.send({ type: "TAP_WORD", statementIndex: 1, token: 4 });
    actor.send({ type: "CONFIRM_YES" });
    passBook(actor);
    const s = actor.getSnapshot();
    expect(s.context.problem?.firstPlacement).toBe(rel?.subject);
    const req = s.context.researchRequest;
    expect(req?.readings).toHaveLength(1);
    expect(req?.readings[0]?.words).toEqual(["の"]);
    // The observed world puts the "1" where the child confirmed it.
    expect(req?.readings[0]?.childWorld.relations[0]?.reference).toBe(rel?.subject);
  });

  it("sends at most the 12 most recent readings; the device keeps them all", () => {
    let research = initialState();
    const others = FRACTION_BANK.filter((x) => x.world.problem_id !== "p_signboard");
    for (let i = 0; i < 15; i++) {
      const rec = others[i % others.length] as (typeof FRACTION_BANK)[number];
      const rel = rec.world.relations[0];
      const reading = firstReading(rec, rel?.id as string, rel?.subject as string);
      if (reading !== null) research = observe(research, reading);
    }
    expect(research.readings.length).toBe(15);
    const actor = run({ introSeen: true, consented: true, research });
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "PREDICT", answer: "fits" });
    actor.send({ type: "TAP_WORD", statementIndex: 1, token: 4 });
    place(actor, false);
    actor.send({ type: "CONFIRM_YES" });
    passBook(actor);
    const s = actor.getSnapshot();
    expect(s.context.research.readings).toHaveLength(16);
    const req = s.context.researchRequest;
    expect(req?.readings).toHaveLength(12);
    expect(req?.readings.at(-1)?.problem_id).toBe("p_signboard");
    expect(req?.readings.at(-1)?.words).toEqual(["の"]);
    expect(req?.readings.slice(0, -1).every((x) => x.words.length === 0)).toBe(true);
  });

  it("with the server down, falls back to the common readings that reproduce the first reading and goes on", () => {
    const actor = run();
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "PREDICT", answer: "fits" });
    place(actor, false);
    actor.send({ type: "CONFIRM_YES" });
    passBook(actor);
    place(actor, true);
    actor.send({ type: "CONFIRM_YES" });
    passBook(actor);
    actor.send({ type: "NEXT" });
    const v = values(actor.getSnapshot());
    actor.send({ type: "ANSWER_UNIT", value: v?.unitOk as Rational });
    actor.send({ type: "ANSWER_TOTAL", value: v?.totalOk as Rational });
    actor.send({ type: "NEXT" });
    expect(actor.getSnapshot().matches({ active: "researching" })).toBe(true);
    actor.send({ type: "RESEARCH_RESULT", pool: null });
    actor.send({ type: "GUESS", larger: null });
    const s = actor.getSnapshot();
    expect(s.matches({ active: { problem: "reading" } })).toBe(true);
    const ids = s.context.research.pool.map((e) => e.hypothesis.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toContain("c_swap");
    expect(s.context.problem?.record.world.problem_id).not.toBe("p_signboard");
  });

  it("from the second problem the junior's card shows its reading; the first problem has none", () => {
    const actor = run();
    expect(actor.getSnapshot().context.problem?.card).toBeNull();
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "PREDICT", answer: "fits" });
    place(actor, false);
    actor.send({ type: "CONFIRM_YES" });
    passBook(actor);
    place(actor, true);
    actor.send({ type: "CONFIRM_YES" });
    passBook(actor);
    actor.send({ type: "NEXT" });
    const v = values(actor.getSnapshot());
    actor.send({ type: "ANSWER_UNIT", value: v?.unitOk as Rational });
    actor.send({ type: "ANSWER_TOTAL", value: v?.totalOk as Rational });
    actor.send({ type: "NEXT" });
    actor.send({ type: "RESEARCH_RESULT", pool: null });
    const card = actor.getSnapshot().context.problem?.card;
    expect(card).toMatch(/^後輩の読み方：/);
  });

  it("uses one misreading kind in the session, and never a problem where it builds the correct world", () => {
    const actor = run({ introSeen: true, consented: true, maxProblems: 5 });
    const used: string[] = [];
    for (let i = 0; i < 5; i++) {
      const s = actor.getSnapshot();
      if (s.matches({ active: "researching" })) actor.send({ type: "RESEARCH_RESULT", pool: null });
      actor.send({ type: "GUESS", larger: null });
      const p = actor.getSnapshot().context.problem;
      if (p === null || !actor.getSnapshot().matches({ active: { problem: "reading" } })) break;
      used.push(p.reading.hypothesis.id);
      solveProblem(actor);
    }
    expect(used.length).toBeGreaterThanOrEqual(3);
    // From the second problem the session's one misreading is kept.
    expect(new Set(used.slice(1)).size).toBe(1);
    // The first problem's reading builds the same world there as the session's misreading.
    const first = FRACTION_BANK.find((x) => x.world.problem_id === "p_signboard");
    const session = actor.getSnapshot().context.session;
    expect(session).not.toBeNull();
    if (first !== undefined && session !== null) {
      const p1 = actor.getSnapshot().context.log[0];
      expect(p1?.problemId).toBe("p_signboard");
      expect(sameReading(runRule(session.hypothesis, first), runRule(p1?.reading as never, first), true)).toBe(true);
    }
  });

  it("a pool from the research agent is checked by core before it is used", () => {
    const actor = run();
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "PREDICT", answer: "fits" });
    place(actor, false);
    actor.send({ type: "CONFIRM_YES" });
    passBook(actor);
    place(actor, true);
    actor.send({ type: "CONFIRM_YES" });
    passBook(actor);
    actor.send({ type: "NEXT" });
    const v = values(actor.getSnapshot());
    actor.send({ type: "ANSWER_UNIT", value: v?.unitOk as Rational });
    actor.send({ type: "ANSWER_TOTAL", value: v?.totalOk as Rational });
    // An invalid rule comes back; core refuses it and the fallback is used.
    actor.send({ type: "RESEARCH_RESULT", pool: [{ id: "x_bad", clauses: "nope" } as never] });
    actor.send({ type: "NEXT" });
    const ids = actor.getSnapshot().context.research.pool.map((e) => e.hypothesis.id);
    expect(ids).not.toContain("x_bad");
    expect(ids.length).toBeGreaterThan(0);
  });
});

describe("stopping, not knowing and hard (F8)", () => {
  it("'don't know' on the card opens the junior's staged questions; past them, a waiting screen that resumes where the child was, or holds the problem", () => {
    const actor = run();
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "PREDICT", answer: "fits" });
    place(actor, true);
    actor.send({ type: "DONT_KNOW" });
    expect(viewOf(actor.getSnapshot()).screen).toBe("help");
    actor.send({ type: "DONT_KNOW" });
    actor.send({ type: "DONT_KNOW" });
    actor.send({ type: "DONT_KNOW" });
    expect(viewOf(actor.getSnapshot()).screen).toBe("stuck");
    actor.send({ type: "RESUME" });
    expect(actor.getSnapshot().matches({ active: { problem: { help: "offer" } } })).toBe(true);
    actor.send({ type: "DONT_KNOW" });
    actor.send({ type: "HOLD" });
    const s = actor.getSnapshot();
    expect(s.context.log.at(-1)?.outcome).toBe("held");
    expect(s.matches("active")).toBe(true);
  });

  it("'hard' stops the math: kind words, a trusted grown-up, and the helpline slot without a phone number", () => {
    const actor = run();
    actor.send({ type: "HARD" });
    const v = viewOf(actor.getSnapshot());
    expect(v.screen).toBe("hard");
    const text = childTexts(v).join("\n");
    expect(text).toMatch(/大人/);
    // The child is told to tell a grown-up nearby, and is shown the helplines checked against their
    // operators' pages (B2); no other number appears on the screen.
    expect(text).toMatch(/近くにいる大人/);
    for (const h of HELPLINES) expect(text).toContain(h.number);
    expect(withoutHelplines(text)).not.toMatch(/[0-9０-９]{2,}/);
    // Nothing math-like is reachable from here.
    for (const e of [{ type: "NEXT" }, { type: "DONT_KNOW" }, { type: "RESUME" }, { type: "PLACE_ONE", quantityId: "q_ani" }] as FlowEvent[]) {
      actor.send(e);
      expect(actor.getSnapshot().matches("hard")).toBe(true);
    }
    actor.send({ type: "CLOSE" });
    expect(actor.getSnapshot().status).toBe("done");
    expect(actor.getSnapshot().context.endedBy).toBe("hard");
  });

  it("an unchecked safety result highlights the three buttons; two in a row open the rest screen", () => {
    const actor = run();
    actor.send({ type: "SAFETY_RESULT", flag: "unchecked" });
    let v = viewOf(actor.getSnapshot());
    expect(v.highlightButtons).toBe(true);
    expect(v.screen).toBe("problem");
    actor.send({ type: "SAFETY_RESULT", flag: "none" });
    expect(viewOf(actor.getSnapshot()).highlightButtons).toBe(false);
    actor.send({ type: "SAFETY_RESULT", flag: "unchecked" });
    actor.send({ type: "SAFETY_RESULT", flag: "unchecked" });
    v = viewOf(actor.getSnapshot());
    expect(v.screen).toBe("rest");
    expect(withoutHelplines(childTexts(v).join(" "))).not.toMatch(/[0-9０-９]{2,}/);
  });

  it("stop ends at once and logs the open problem without the child's words", () => {
    const actor = run();
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "PREDICT", answer: "fits" });
    actor.send({ type: "TAP_WORD", statementIndex: 1, token: 4 });
    place(actor, true);
    actor.send({ type: "STOP" });
    const s = actor.getSnapshot();
    expect(s.status).toBe("done");
    expect(s.context.endedBy).toBe("stop");
    const log = s.context.log.at(-1);
    expect(log?.outcome).toBe("stopped");
    for (const o of log?.ops ?? []) expect(o.evidence).toBe("");
  });
});

describe("works with templates only (server down)", () => {
  it("runs a whole session with no server event other than the research timeout", () => {
    const actor = run({ introSeen: false, consented: false, maxProblems: 3 });
    actor.send({ type: "NEXT" });
    actor.send({ type: "CONSENT_YES" });
    for (let i = 0; i < 3; i++) {
      if (actor.getSnapshot().matches({ active: "researching" })) actor.send({ type: "RESEARCH_RESULT", pool: null });
      actor.send({ type: "GUESS", larger: null });
      expect(actor.getSnapshot().matches({ active: { problem: "reading" } })).toBe(true);
      expect(actor.getSnapshot().context.line?.source).toBe("template");
      solveProblem(actor);
    }
    expect(viewOf(actor.getSnapshot()).screen).toBe("finished");
    actor.send({ type: "NEXT" });
    expect(actor.getSnapshot().context.endedBy).toBe("finished");
    expect(actor.getSnapshot().context.log.map((l) => l.outcome)).toEqual(["solved", "solved", "solved"]);
  });
});

// ---------------------------------------------------------------------------------------------
// The English screen (HANDOFF §7 の4; 指示書 第11節 M8, 第1節 原則1・10・11)
// ---------------------------------------------------------------------------------------------

/** Japanese letters and the full-width marks Japanese text uses. */
const JAPANESE = /[\u3000-\u303f\u3040-\u30ff\u3400-\u9fff\uff01-\uff60]/;

/** What may stay in Japanese on the English screen: the problem as written, its holders and items, the helplines' names. */
function allowedJapanese(s: Snap): string[] {
  const out: string[] = helplinesFor("en").map((h) => h.name);
  const p = s.context.problem;
  for (const g of s.context.ruleCard?.gallery ?? []) for (const st of g.record.statements) out.push(st.text, ...st.tokens);
  if (p !== null) {
    for (const st of p.record.statements) out.push(st.text, ...st.tokens);
    const w = p.record.world;
    out.push(...w.holders.map((h) => h.label), ...w.item_kinds.flatMap((k) => [k.noun, k.counter]));
  }
  return out.filter((x) => x !== "").sort((a, b) => b.length - a.length);
}

const stripAll = (t: string, parts: readonly string[]): string => parts.reduce((acc, x) => acc.replaceAll(x, " "), t);
const withoutEnHelplines = (t: string): string => helplinesFor("en").reduce((acc, h) => acc.replaceAll(helplineLine(h, "en"), ""), t);
/** The "1" card's name is a card, not a number (core's gate reads it the same way). */
const withoutCard = (t: string): string => t.replace(/"1"|“1”/g, "").replace(/\bas 1\b/g, "");

function checkScreenEn(s: Snap): void {
  const v = viewOf(s);
  expect(v.lang).toBe("en");
  const texts = childTexts(v);
  for (const t of texts) expect(hasForbiddenPhrase(t), t).toBe(false);
  // No Japanese UI string is left: only the problem as written, holder names and helpline names.
  expect(stripAll(texts.join("\n"), allowedJapanese(s)), JSON.stringify(s.value)).not.toMatch(JAPANESE);
  // Numbers: the problem's sentences and the junior's line are checked by core's gate; nothing else carries a number.
  const own = new Set<string>(
    v.screen === "problem"
      ? [...v.statements.map((x) => x.text), ...(v.line === null ? [] : [v.line])]
      : v.screen === "card"
        ? // The everyday scenes' sentences carry the scenes' own numbers, checked by core's gate show_scene.
          [...v.gallery.flatMap((g) => g.statements.map((x) => x.text)), ...(v.scenes?.items ?? []).flatMap((i) => i.lines)]
        : v.screen === "help"
          ? v.statements.map((x) => x.text)
          : v.screen === "guess"
            ? // The outlines carry the problem's own number only (core's gate show_world passed them).
              [...v.statements.map((x) => x.text), ...v.tapes.map((x) => x.value)]
          : v.screen === "wordbook"
            ? // The word book's sentences carry the page's own numbers, checked by core (wordbookPage).
              (v.page?.lines ?? [])
            : [],
  );
  for (const t of texts.filter((x) => !own.has(x))) {
    const plain = withoutCard(withoutEnHelplines(t));
    expect(numbersIn(plain), t).toEqual([]);
    expect(plain, t).not.toMatch(/[0-9０-９]/);
  }
}

describe("the English screen", () => {
  it("every screen of every shortest path has no Japanese UI string, no forbidden phrase and no number", () => {
    const paths = walk({ ...FRESH, lang: "en" }, { safety: true, research: true });
    const seen = new Map<string, Snap>();
    for (const p of paths) for (const st of p.steps) seen.set(key(st.state) + JSON.stringify(st.state.context.problem?.placement ?? null), st.state);
    for (const st of seen.values()) checkScreenEn(st);
    expect(seen.size).toBeGreaterThan(50);
  });

  it("the problem is shown as written, with an English note that it is in Japanese", () => {
    const actor = run({ introSeen: true, consented: true, lang: "en" });
    const v = viewOf(actor.getSnapshot());
    if (v.screen !== "problem") throw new Error("problem expected");
    const record = FRACTION_BANK.find((r) => r.world.problem_id === "p_signboard");
    expect(v.statements.map((x) => x.text)).toEqual(record?.statements.map((x) => x.text));
    expect(v.note).toBe("The problem is written in Japanese.");
    expect(viewOf(run({ introSeen: true, consented: true }).getSnapshot())).toMatchObject({ screen: "problem", note: null });
  });

  it("asks the worker for the junior's words in English, and the template lines are English", () => {
    const actor = run({ introSeen: true, consented: true, lang: "en" });
    const line = actor.getSnapshot().context.line;
    expect(line?.request?.lang).toBe("en");
    expect(line?.text).not.toMatch(JAPANESE);
    expect(line?.text).not.toBe("");
  });

  it("the restatement in English keeps the holder's name as in the problem", () => {
    const actor = run({ introSeen: true, consented: true, lang: "en" });
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "PREDICT", answer: "fits" });
    place(actor, true);
    const p = actor.getSnapshot().context.problem;
    const holder = p?.record.world.holders.find((h) => h.id === p.record.world.quantities.find((q) => q.id === p.placement)?.holder);
    expect(actor.getSnapshot().context.line?.text).toContain(holder?.label ?? "??");
    expect(actor.getSnapshot().context.line?.text).toMatch(/"1"|\bas 1\b/);
  });

  it("a generated English line that judges, names the child's rule or names an operation is not shown", () => {
    for (const bad of ["That is wrong.", "Correct!", "I copied your reading.", "Is this your rule?", "Should we add them?", "This is a mistake."]) {
      const actor = run({ introSeen: true, consented: true, lang: "en" });
      const before = actor.getSnapshot().context.line;
      actor.send({ type: "KOHAI_LINE", seq: before?.seq ?? 0, text: bad });
      expect(actor.getSnapshot().context.line?.text, bad).toBe(before?.text);
    }
    const actor = run({ introSeen: true, consented: true, lang: "en" });
    const seq = actor.getSnapshot().context.line?.seq ?? 0;
    actor.send({ type: "KOHAI_LINE", seq, text: "I read the tapes like this." });
    expect(actor.getSnapshot().context.line).toMatchObject({ text: "I read the tapes like this.", source: "claude" });
  });

  it("the forbidden phrases are found in any case, in Japanese and in English", () => {
    for (const t of ["YOUR RULE", "You copied your reading", "wrong", "Correct", "a mistake", "君のルール", "まちがい"]) expect(hasForbiddenPhrase(t), t).toBe(true);
    for (const t of ["Which sentence shall we look at first?", "Is that right?", "Take your time. I will wait."]) expect(hasForbiddenPhrase(t), t).toBe(false);
  });

  it("finds judging, praise and attribution words in English, whatever the case", () => {
    const bad = [
      "Is this your way?", "That is your reading.", "So you read it like this.", "I read it like you.", "It is the same as you.",
      "Was it your idea?", "I copied it.", "I learned from you.", "You taught me.", "That's right!", "You're right.", "Exactly!",
      "Good job.", "Great!", "Nice.", "Well done.", "Perfect.", "Awesome!", "Amazing.", "You are smart.", "Thank you.", "Thanks!",
      "Look at the keyword.",
    ];
    for (const t of bad) expect(hasForbiddenPhrase(t), t).toBe(true);
  });

  it("sees through full-width letters, zero-width characters, hyphens, extra spaces and curly apostrophes", () => {
    const tricks = [
      "ＷＲＯＮＧ", "ｗｒｏｎｇ", "wr​ong", "cor‌rect", "mis‍take", "﻿your rule", "your-rule", "your   rule",
      "your　rule", "your - rule", "Ｙｏｕｒ Ｒｕｌｅ", "That’s right", "you’re right", "good-job", "well  done",
      "learned​ from you", "まち​がい", "正​解", "your‑rule",
    ];
    for (const t of tricks) expect(hasForbiddenPhrase(t), JSON.stringify(t)).toBe(true);
  });

  it("does not block a restating question that ends with \", right?\"", () => {
    for (const t of ['Bob is the "1", right?', 'Your clue was "まい", right?', "So it goes here, right?", "Is that right?"]) expect(hasForbiddenPhrase(t), t).toBe(false);
  });

  it("from the second problem the junior's card is in English", () => {
    const actor = run({ introSeen: true, consented: true, lang: "en" });
    solveProblem(actor);
    actor.send({ type: "RESEARCH_RESULT", pool: null });
    const card = actor.getSnapshot().context.problem?.card;
    expect(card).toMatch(/^Junior's reading: /);
  });

  it("the language changes only while no problem is on screen", () => {
    const actor = run({ introSeen: false, consented: false });
    actor.send({ type: "SET_LANG", lang: "en" });
    expect(viewOf(actor.getSnapshot())).toMatchObject({ screen: "intro", lang: "en" });
    actor.send({ type: "NEXT" });
    actor.send({ type: "CONSENT_YES" });
    actor.send({ type: "SET_LANG", lang: "ja" });
    // A problem is open: its lines and card stay in the language they were made in.
    expect(actor.getSnapshot().context.lang).toBe("en");
    actor.send({ type: "STOP" });
    expect(viewOf(actor.getSnapshot()).screen).toBe("ended");
  });
});

describe("the English words for help, for parents and for the end", () => {
  it("each helpline in English says plainly what it is, next to its Japanese name, and no line or number is added", () => {
    const en = helplinesFor("en");
    const ja = helplinesFor("ja");
    expect(en.map((h) => h.number)).toEqual(ja.map((h) => h.number));
    expect(en.map((h) => h.name)).toEqual(ja.map((h) => h.name));
    const abouts = en.map((h) => h.about ?? "");
    expect(abouts[0]).toMatch(/24-hour SOS line for children/i);
    expect(abouts[1]).toMatch(/Childline.*up to 18/i);
    expect(abouts[2]).toMatch(/children's human rights line.*weekdays/i);
    expect(abouts[3]).toMatch(/someone at home is hurting you/i);
    expect(abouts[3]).toMatch(/child guidance center/i);
    en.forEach((h) => {
      const line = helplineLine(h, "en");
      expect(line.startsWith(h.name), line).toBe(true);
      expect(line).toContain(h.about ?? "??");
      expect(line).toContain(h.number);
      expect(hasForbiddenPhrase(line), line).toBe(false);
    });
    // The Japanese screen stays as it was: no English description.
    ja.forEach((h, i) => expect(helplineLine(h, "ja")).not.toContain(en[i]?.about ?? "??"));
  });

  it("the English helpline note says the people speak Japanese and to show the screen to a trusted grown-up", () => {
    const note = ui("en").helpline.note ?? "";
    expect(note).toMatch(/free phone lines in Japan/);
    expect(note).toMatch(/speak Japanese/);
    expect(note).toMatch(/show this screen to a grown-up you trust/);
    expect(hasForbiddenPhrase(note)).toBe(false);
    expect(numbersIn(note)).toEqual([]);
  });

  it("the hard screen in English shows the described helplines and the note", () => {
    const actor = run({ introSeen: true, consented: true, lang: "en" });
    actor.send({ type: "HARD" });
    const texts = childTexts(viewOf(actor.getSnapshot()));
    const all = texts.join("\n");
    for (const h of helplinesFor("en")) expect(all).toContain(helplineLine(h, "en"));
    expect(all).toContain(ui("en").helpline.note ?? "??");
    for (const t of texts) expect(hasForbiddenPhrase(t), t).toBe(false);
  });

  it("the parent screen names no misreading and no correctness, and keeps no forbidden phrase", () => {
    for (const lang of ["ja", "en"] as const) {
      const p = ui(lang).parent;
      const texts = [...p.lines, p.checksTitle, p.checksNone, p.checkRow("2026-11-07", 2, 3), p.checksNote, p.deleteAsk, p.deleteWarn, p.label];
      for (const t of texts) {
        expect(hasForbiddenPhrase(t), t).toBe(false);
        expect(t, t).not.toMatch(/正し|読み違い|misread/i);
      }
    }
    expect(ui("ja").parent.lines.join("")).toContain("多くの子がする別の読み方");
    expect(ui("en").parent.lines.join("")).toContain("a way of reading many children use");
    expect(ui("ja").parent.checkRow("2026-11-07", 2, 3)).toContain("プログラムの答えと同じ数を入れました");
    expect(ui("en").parent.checkRow("2026-11-07", 2, 3)).toContain("entered the same number as the program's answer");
  });

  it("the English '1' is always said 'as 1', and the end says 'That's all for now.'", () => {
    expect(ui("en").problem.looking).toContain("the person you take as 1");
    expect(ui("en").problem.looking).not.toMatch(/count as 1/);
    expect(ui("en").ended.line).toBe("That's all for now.");
    expect(checkText("en").done).toContain("That's all for now.");
    expect([ui("en").ended.line, ...checkText("en").done].join(" ")).not.toMatch(/See you/);
    // The junior's and the guide's English lines say the same "as 1", and none holds a forbidden phrase.
    for (const [key, t] of Object.entries(TEMPLATES)) {
      for (const v of t.en) {
        expect(hasForbiddenPhrase(v), `${key}: ${v}`).toBe(false);
        expect(v, key).not.toMatch(/gets the "1"|give the "1"|is the "1"|"1" goes|count as 1/);
      }
    }
  });
});
