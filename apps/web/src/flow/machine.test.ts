// 指示書 第11節 M7 (submission scope, HANDOFF §3 F1・F2・F3・F8): every path of the one-session machine,
// walked with @xstate/graph. Written before the implementation.
import { describe, expect, it } from "vitest";
import { getShortestPaths, getSimplePaths, getStateNodes } from "@xstate/graph";
import { createActor, transition, type SnapshotFrom } from "xstate";
import { FRACTION_BANK, initialState, observe, sameReading, runRule, type Rational } from "@kimi/core";
import { flowMachine, type FlowEvent, type FlowInput } from "./machine.ts";
import { childTexts, viewOf } from "./view.ts";
import { firstReading, judgeTotal, judgeUnit } from "./problem.ts";
import { FORBIDDEN_CHILD_PHRASES } from "./text.ts";
import { HELPLINES, helplineLine } from "./text.ts";

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
function events(s: Snap, opts: { safety: boolean; research: boolean }): FlowEvent[] {
  const out: FlowEvent[] = [...GLOBAL, { type: "NEXT" }, { type: "CONSENT_YES" }, { type: "CONSENT_NO" }, { type: "RESUME" }, { type: "HOLD" }, { type: "CLOSE" }];
  const p = s.context.problem;
  if (p !== null) {
    const rel = p.record.world.relations.find((x) => x.id === p.relationId);
    for (const q of [rel?.subject, rel?.reference]) if (q !== undefined && q !== null) out.push({ type: "PLACE_ONE", quantityId: q });
    out.push({ type: "CONFIRM_YES" }, { type: "CONFIRM_NO" }, { type: "TAP_WORD", statementIndex: 0, token: 0 });
    const v = values(s);
    if (v !== null) {
      out.push({ type: "ANSWER_UNIT", value: v.unitOk }, { type: "ANSWER_UNIT", value: v.unitNg });
      out.push({ type: "ANSWER_TOTAL", value: v.totalOk }, { type: "ANSWER_TOTAL", value: v.totalNg });
    }
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
    p === null ? null : [p.firstPlacement !== null, p.fixes, p.placement],
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
  const texts = childTexts(viewOf(s));
  for (const t of texts) for (const bad of FORBIDDEN_CHILD_PHRASES) expect(t, `"${bad}" in child text`).not.toContain(bad);
  const p = s.context.problem;
  if (p !== null) {
    // The world on screen is the correct one only after the child's own first placement was recorded.
    if (sameReading(p.shown.world, p.record.world, true)) expect(p.firstPlacement).not.toBeNull();
    // A recheck of the child's teaching never comes before that record.
    if (p.taughtOps.length > 0) expect(p.firstPlacement).not.toBeNull();
    // The junior never reads with a reading that builds the correct world.
    expect(sameReading(runRule(p.reading.hypothesis, p.record), p.record.world, true)).toBe(false);
  }
  // The junior never reports that a taught reading held (it never reads with the taught reading here).
  expect(s.context.line?.key ?? "").not.toBe("kohai.result");
}

function walk(input: FlowInput, opts: { safety: boolean; research: boolean }) {
  return getShortestPaths(flowMachine, {
    input,
    events: (s) => events(s, opts),
    serializeState: (s) => key(s),
  });
}

describe("the session machine: every state is reachable and every screen keeps the rules", () => {
  const paths = walk(FRESH, { safety: true, research: true });

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
      // Inside the session it opens the "don't know" screen; on the safety and rest screens nothing math-like opens.
      if (s.matches("active")) expect(dk.matches("stuck")).toBe(true);
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
const SIMPLE = new Set<FlowEvent["type"]>(["NEXT", "PLACE_ONE", "CONFIRM_YES", "CONFIRM_NO", "ANSWER_UNIT", "ANSWER_TOTAL", "DONT_KNOW", "RESUME", "HOLD", "STOP"]);

describe("simple paths through one problem", () => {
  it("every simple path keeps the rules (one problem, no safety events)", { timeout: 30_000 }, () => {
    const paths = getSimplePaths(flowMachine, {
      input: { introSeen: true, consented: true, maxProblems: 1 },
      events: (s) => events(s, { safety: false, research: false }).filter((e) => SIMPLE.has(e.type)),
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

function run(input: FlowInput = { introSeen: true, consented: true }) {
  const actor = createActor(flowMachine, { input });
  actor.start();
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
  actor.send({ type: "NEXT" });
  place(actor, true);
  actor.send({ type: "CONFIRM_YES" });
  expect(actor.getSnapshot().matches({ active: { problem: "rebuilt" } })).toBe(true);
  actor.send({ type: "NEXT" });
  const v = values(actor.getSnapshot());
  actor.send({ type: "ANSWER_UNIT", value: v?.unitOk as Rational });
  actor.send({ type: "ANSWER_TOTAL", value: v?.totalOk as Rational });
  expect(actor.getSnapshot().matches({ active: { problem: "solved" } })).toBe(true);
  actor.send({ type: "NEXT" });
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
    expect(s.matches({ active: { problem: "reading" } })).toBe(true);
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
    actor.send({ type: "NEXT" });
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
    expect(actor.getSnapshot().context.problem?.firstPlacement).not.toBeNull();
    v = viewOf(actor.getSnapshot());
    expect(v.screen === "problem" && v.step).toBe("rebuilt");
    expect(v.screen === "problem" && v.statements.some((x) => x.lit)).toBe(false);
  });

  it("a wrong placement keeps a sentence lit and goes back to moving the card; three tries hold the problem", () => {
    const actor = run();
    actor.send({ type: "NEXT" });
    for (let i = 0; i < 2; i++) {
      place(actor, false);
      actor.send({ type: "CONFIRM_YES" });
      expect(actor.getSnapshot().matches({ active: { problem: "looking" } })).toBe(true);
    }
    place(actor, false);
    actor.send({ type: "CONFIRM_YES" });
    expect(actor.getSnapshot().matches({ active: { problem: "held" } })).toBe(true);
    expect(actor.getSnapshot().context.log.at(-1)?.outcome).toBe("held");
  });

  it("'no' to the junior's restatement goes back to moving the card without changing the world", () => {
    const actor = run();
    actor.send({ type: "NEXT" });
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
    actor.send({ type: "NEXT" });
    place(actor, true);
    actor.send({ type: "CONFIRM_YES" });
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
    actor.send({ type: "NEXT" });
    place(actor, true);
    actor.send({ type: "CONFIRM_YES" });
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
    for (const bad of FORBIDDEN_CHILD_PHRASES) expect(line).not.toContain(bad);
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
    actor.send({ type: "NEXT" });
    expect(seqs.length).toBeGreaterThan(3);
    for (let i = 1; i < seqs.length; i++) expect(seqs[i] as number).toBeGreaterThan(seqs[i - 1] as number);
  });

  it("the failing sentences' elements glow with them, and nothing glows before the junior's world is shown", () => {
    const actor = run();
    let v = viewOf(actor.getSnapshot());
    expect(v.screen === "problem" && v.glowIds).toEqual([]);
    actor.send({ type: "NEXT" });
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
    actor.send({ type: "NEXT" });
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

describe("the research layer in the flow (F3)", () => {
  it("records the child's first confirmed placement as the research observation, once per problem", () => {
    const actor = run();
    actor.send({ type: "NEXT" });
    place(actor, false);
    // Not yet: the child has not said "yes" to it.
    expect(actor.getSnapshot().context.research.readings).toHaveLength(0);
    expect(actor.getSnapshot().context.researchRequest).toBeNull();
    actor.send({ type: "CONFIRM_YES" });
    const s1 = actor.getSnapshot();
    expect(s1.context.research.readings).toHaveLength(1);
    expect(s1.context.researchRequest).not.toBeNull();
    place(actor, true);
    actor.send({ type: "CONFIRM_YES" });
    expect(actor.getSnapshot().context.research.readings).toHaveLength(1);
  });

  it("a rejected placement is not observed; the confirmed one is, with the words tapped before the confirm", () => {
    const actor = run();
    actor.send({ type: "NEXT" });
    const p = actor.getSnapshot().context.problem;
    const rel = p?.record.world.relations.find((x) => x.id === p.relationId);
    place(actor, true);
    actor.send({ type: "CONFIRM_NO" });
    place(actor, false);
    actor.send({ type: "TAP_WORD", statementIndex: 1, token: 4 });
    actor.send({ type: "CONFIRM_YES" });
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
    actor.send({ type: "NEXT" });
    actor.send({ type: "TAP_WORD", statementIndex: 1, token: 4 });
    place(actor, false);
    actor.send({ type: "CONFIRM_YES" });
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
    actor.send({ type: "NEXT" });
    place(actor, false);
    actor.send({ type: "CONFIRM_YES" });
    place(actor, true);
    actor.send({ type: "CONFIRM_YES" });
    actor.send({ type: "NEXT" });
    const v = values(actor.getSnapshot());
    actor.send({ type: "ANSWER_UNIT", value: v?.unitOk as Rational });
    actor.send({ type: "ANSWER_TOTAL", value: v?.totalOk as Rational });
    actor.send({ type: "NEXT" });
    expect(actor.getSnapshot().matches({ active: "researching" })).toBe(true);
    actor.send({ type: "RESEARCH_RESULT", pool: null });
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
    actor.send({ type: "NEXT" });
    place(actor, false);
    actor.send({ type: "CONFIRM_YES" });
    place(actor, true);
    actor.send({ type: "CONFIRM_YES" });
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
    actor.send({ type: "NEXT" });
    place(actor, false);
    actor.send({ type: "CONFIRM_YES" });
    place(actor, true);
    actor.send({ type: "CONFIRM_YES" });
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
  it("'don't know' opens a waiting screen that resumes where the child was, or holds the problem", () => {
    const actor = run();
    actor.send({ type: "NEXT" });
    place(actor, true);
    actor.send({ type: "DONT_KNOW" });
    expect(viewOf(actor.getSnapshot()).screen).toBe("stuck");
    actor.send({ type: "RESUME" });
    expect(actor.getSnapshot().matches({ active: { problem: "placed" } })).toBe(true);
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
    actor.send({ type: "NEXT" });
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
