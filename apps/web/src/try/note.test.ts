// 「中身を見る」 (指示書 第6.9節, 第6.7節 研究ノート, 第11節 M5): the research note drawn from the machine's state
// for the adult. Before the adult has answered a problem, nothing in it shows that problem's correct world
// (core's gate show_correct_world with interpretationRecorded), and the asked value is never in any world.
// Written before the implementation.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { FRACTION_BANK, solve, type WorldScene } from "@kimi/core";
import { researchNote } from "./note.ts";
import { TRY_CHILDREN } from "./sim-children.ts";
import { runSim } from "./sim.ts";
import { startSession, type FlowApi } from "../flow/session.ts";
import { openStore, type FlowStore } from "../store/store.ts";

const stores: FlowStore[] = [];
let n = 0;
function store(): FlowStore {
  const s = openStore(`kimi-try-note-${++n}`);
  stores.push(s);
  return s;
}
afterEach(async () => {
  for (const s of stores.splice(0)) await s.close();
});

const down: FlowApi = {
  kohai: () => Promise.reject(new Error("down")),
  research: () => Promise.reject(new Error("down")),
  safety: () => Promise.reject(new Error("down")),
};

const child = (id: string) => {
  const c = TRY_CHILDREN.find((x) => x.id === id);
  if (c === undefined) throw new Error(id);
  return c;
};

/** The asked quantity has no value in any world of the note. */
function askedHidden(w: WorldScene): boolean {
  return w.quantities.every((q) => q.id !== w.question.target_id || q.value === null);
}

async function secondProblem() {
  const s = await startSession({ store: store(), api: down, input: { lang: "ja" } });
  s.send({ type: "NEXT" });
  s.send({ type: "CONSENT_YES" });
  await runSim(s, child("s_known"), 0);
  return s;
}

describe("researchNote", () => {
  it("shows nothing of the research before the first problem's placement, and no choice for the fixed first problem", async () => {
    const s = await startSession({ store: store(), api: down, input: { lang: "ja" } });
    s.send({ type: "NEXT" });
    s.send({ type: "CONSENT_YES" });
    const note = researchNote(s.actor.getSnapshot().context, []);
    expect(note.pool).toEqual([]);
    expect(note.choice?.kind).toBe("first");
    expect(note.observations).toEqual([]);
    expect(note.junior?.source).toBe("competitor");
    s.stop();
  });

  it("after the first problem: the pool with weights and card lines, the choice's gain and each prediction; the correct world only after the adult's placement", async () => {
    const s = await secondProblem();
    const ctx = s.actor.getSnapshot().context;
    const note = researchNote(ctx, ["answer_leak", "answer_leak", "judging_word"]);
    // (a) the pool: every hypothesis with its weight (0..1) and its card line; "other" separately.
    expect(note.pool.length).toBeGreaterThanOrEqual(2);
    for (const h of note.pool) {
      expect(h.weight).toBeGreaterThanOrEqual(0);
      expect(h.weight).toBeLessThanOrEqual(1);
      expect(h.line.length).toBeGreaterThan(0);
    }
    const total = note.pool.reduce((a, h) => a + h.weight, 0) + note.other;
    expect(total).toBeCloseTo(1, 6);
    // (b) why this problem: core chooseNext's gain and each hypothesis's predicted world.
    const choice = note.choice;
    if (choice === null || choice.kind !== "chosen") throw new Error(`expected a chosen problem, got ${JSON.stringify(choice?.kind)}`);
    expect(choice.problemId).toBe(ctx.problem?.record.world.problem_id);
    expect(choice.gain).toBeGreaterThan(0);
    expect(choice.predictions.length).toBeGreaterThanOrEqual(2);
    // Before the adult has answered this problem, the correct world's class is not drawn.
    const hidden = choice.predictions.filter((p) => p.world === null);
    expect(hidden.length).toBeGreaterThan(0);
    for (const p of hidden) expect(p.hiddenReason).toBe("too_early");
    for (const p of choice.predictions) if (p.world !== null) expect(askedHidden(p.world)).toBe(true);
    // (c) the observation of the first problem; (d) the junior's reading and its source; (e) gate kinds only.
    expect(note.observations).toHaveLength(1);
    expect(note.observations[0]?.placedOn.length).toBeGreaterThan(0);
    expect(["mirror", "competitor", "taught"]).toContain(note.junior?.source);
    expect(note.gate).toEqual([
      { kind: "answer_leak", count: 2 },
      { kind: "judging_word", count: 1 },
    ]);
    // (f) the scenes have not been made yet.
    expect(note.scenes).toBeNull();

    // The note never carries the problem's answer.
    const record = ctx.problem?.record;
    if (record === undefined) throw new Error("record");
    const sol = solve(record.world);
    if (sol.kind !== "unique") throw new Error("solve");
    const given = new Set(record.world.quantities.flatMap((q) => (q.value === null ? [] : [`${String(q.value.num)}/${String(q.value.den)}`])));
    const hiddenValues = [...sol.values.entries()].map(([, v]) => `${String(v.num)}/${String(v.den)}`).filter((v) => !given.has(v));
    for (const p of choice.predictions) {
      for (const q of p.world?.quantities ?? []) {
        if (q.value !== null) expect(hiddenValues, `${p.hypothesisId} ${q.id}`).not.toContain(`${String(q.value.num)}/${String(q.value.den)}`);
      }
    }

    // After the adult's prediction and first placement, the correct world may be drawn (still with ？ for the asked value).
    const rel = record.world.relations[0];
    s.send({ type: "PREDICT", answer: "odd" });
    s.send({ type: "PLACE_ONE", quantityId: rel?.reference as string });
    s.send({ type: "CONFIRM_YES" });
    const after = researchNote(s.actor.getSnapshot().context, []);
    if (after.choice === null || after.choice.kind !== "chosen") throw new Error("chosen");
    const correctClass = after.choice.predictions.filter((p) => p.correct);
    expect(correctClass.length).toBeGreaterThan(0);
    for (const p of correctClass) {
      expect(p.world).not.toBeNull();
      expect(askedHidden(p.world as WorldScene)).toBe(true);
    }
    expect(after.observations).toHaveLength(2);
    s.stop();
  });

  it("never marks a prediction as the correct one before the adult answers", async () => {
    const s = await secondProblem();
    const note = researchNote(s.actor.getSnapshot().context, []);
    if (note.choice === null || note.choice.kind !== "chosen") throw new Error("chosen");
    for (const p of note.choice.predictions) expect(p.correct).toBe(false);
    // The class labels do not give away which one is the sentence's own world (labelled by first appearance).
    expect(note.choice.predictions[0]?.label).toBe("A");
    s.stop();
  });

  it("keeps the bank's records whole (the note reads, never writes)", async () => {
    const before = JSON.stringify(FRACTION_BANK);
    const s = await secondProblem();
    researchNote(s.actor.getSnapshot().context, []);
    expect(JSON.stringify(FRACTION_BANK)).toBe(before);
    s.stop();
  });
});
