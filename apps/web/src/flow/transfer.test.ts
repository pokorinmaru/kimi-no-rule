// The transfer problems in the flow (指示書 第6.7節 手順6, Q48): after the child fixes the junior's reading on a
// problem, the next problem is a stored one the old reading fails on, another known phrasing first. When the
// child reads that phrasing without the old reading (the first "1" before any help on its wording) and solves it,
// the device keeps "a reading that does not lean on the wording" (core decides; ids and a yes/no only). Nothing of
// this is said or shown to the child. The child's route uses only problems a person has checked: none is today,
// so the tests check stored problems here. Written before the implementation.
import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import type { ProblemRecord, Rational } from "@kimi/core";
import { STORED_TRANSFER, TRANSFER_LINKS, bankFor } from "./bank.ts";
import { flowMachine, type FlowInput } from "./machine.ts";
import { judgeTotal, judgeUnit } from "./problem.ts";
import { passBook } from "./test-book.ts";
import { childTexts, viewOf } from "./view.ts";
import { researchNote } from "../try/note.ts";

const checked: ProblemRecord[] = STORED_TRANSFER.map((r) => ({ ...r, checks: { ...r.checks, human_checked: true } }));
const CHECKED_BANK = bankFor({ includeUnchecked: false, stored: checked });
const UNCHECKED_BANK = bankFor({ includeUnchecked: false });

type Actor = ReturnType<typeof start>;

function start(input: Partial<FlowInput> = {}) {
  const actor = createActor(flowMachine, { input: { introSeen: true, consented: true, maxProblems: 3, bank: CHECKED_BANK, transfers: TRANSFER_LINKS, ...input } });
  actor.start();
  return actor;
}

const r = (num: number): Rational => ({ num, den: 1 });
function answers(record: ProblemRecord): { unit: Rational; total: Rational } {
  let unit: Rational | null = null;
  let total: Rational | null = null;
  for (let n = 1; n <= 200 && (unit === null || total === null); n++) {
    if (unit === null && judgeUnit(record, r(n))) unit = r(n);
    if (total === null && judgeTotal(record, r(n))) total = r(n);
  }
  if (unit === null || total === null) throw new Error("no answer found");
  return { unit, total };
}

/** Walks the problem on screen: the first "1" on the sentence's own holder (right) or the other end, then fixed, then the answers. */
function walk(actor: Actor, firstRight: boolean): void {
  if (actor.getSnapshot().matches({ active: "researching" })) actor.send({ type: "RESEARCH_RESULT", pool: null });
  actor.send({ type: "GUESS", larger: null });
  actor.send({ type: "PREDICT", answer: "fits" });
  const p = actor.getSnapshot().context.problem;
  if (p === null) throw new Error("no problem");
  const rel = p.record.world.relations.find((x) => x.id === p.relationId);
  const right = rel?.reference as string;
  const other = rel?.subject as string;
  actor.send({ type: "PLACE_ONE", quantityId: firstRight ? right : other });
  actor.send({ type: "CONFIRM_YES" });
  passBook(actor);
  if (!firstRight) {
    actor.send({ type: "PLACE_ONE", quantityId: right });
    actor.send({ type: "CONFIRM_YES" });
    passBook(actor);
  }
  expect(actor.getSnapshot().matches({ active: { problem: "rebuilt" } })).toBe(true);
  actor.send({ type: "NEXT" });
  const a = answers(p.record);
  actor.send({ type: "ANSWER_UNIT", value: a.unit });
  actor.send({ type: "ANSWER_TOTAL", value: a.total });
  expect(actor.getSnapshot().matches({ active: { problem: "solved" } })).toBe(true);
  actor.send({ type: "NEXT" });
  if (actor.getSnapshot().matches({ active: "card" })) actor.send({ type: "NEXT" });
  if (actor.getSnapshot().matches({ active: "researching" })) actor.send({ type: "RESEARCH_RESULT", pool: null });
}

const transferIds = new Set(STORED_TRANSFER.map((r) => r.world.problem_id));

describe("a transfer problem after a fix", () => {
  it("comes next after the child fixed the junior's reading: a problem that reading fails on, another phrasing first", () => {
    const actor = start();
    walk(actor, true);
    const first = actor.getSnapshot().context.log[0];
    expect(first?.fixes).toBeGreaterThan(0);
    const p = actor.getSnapshot().context.problem;
    expect(p?.pickedBy.kind).toBe("transfer");
    if (p?.pickedBy.kind !== "transfer") return;
    expect(transferIds.has(p.record.world.problem_id)).toBe(true);
    expect(p.pickedBy.oldReading.id).toBe(first?.readingId);
    expect(p.pickedBy.fixedProblemId).toBe(first?.problemId);
    expect(p.pickedBy.wording).toBe("different");
  });

  it("keeps 'does not lean on the wording' when the child's first 1 there is the sentence's own and the problem is solved", () => {
    const actor = start();
    walk(actor, true);
    walk(actor, true);
    const log = actor.getSnapshot().context.log[1];
    expect(log?.transfer).toEqual({
      fixedProblemId: actor.getSnapshot().context.log[0]?.problemId,
      oldReadingId: actor.getSnapshot().context.log[0]?.readingId,
      wording: "different",
      beyondWording: true,
    });
  });

  it("does not keep it when the child's first 1 there is the other holder, even when fixed and solved afterwards", () => {
    const actor = start();
    walk(actor, true);
    walk(actor, false);
    expect(actor.getSnapshot().context.log[1]?.transfer?.beyondWording).toBe(false);
  });

  it("is not offered after a problem the child put aside without fixing, and a transfer problem is never an ordinary pick", () => {
    const actor = start();
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "PREDICT", answer: "fits" });
    actor.send({ type: "DONT_KNOW" });
    for (let i = 0; i < 6 && !actor.getSnapshot().matches("stuck"); i++) actor.send({ type: "DONT_KNOW" });
    actor.send({ type: "HOLD" });
    if (actor.getSnapshot().matches({ active: "researching" })) actor.send({ type: "RESEARCH_RESULT", pool: null });
    const p = actor.getSnapshot().context.problem;
    expect(actor.getSnapshot().context.log[0]?.outcome).toBe("held");
    expect(p === null || !transferIds.has(p.record.world.problem_id)).toBe(true);
    expect(p?.pickedBy.kind).not.toBe("transfer");
  });

  it("stays dormant on the child's route while no transfer problem is checked: the session is what it was", () => {
    const withLinks = start({ bank: UNCHECKED_BANK });
    const without = start({ bank: UNCHECKED_BANK, transfers: [] });
    for (const a of [withLinks, without]) {
      walk(a, true);
      walk(a, true);
    }
    const ids = (a: Actor) => a.getSnapshot().context.done;
    expect(ids(withLinks)).toEqual(ids(without));
    for (const id of ids(withLinks)) expect(transferIds.has(id)).toBe(false);
    expect(withLinks.getSnapshot().context.log.every((l) => l.transfer === undefined)).toBe(true);
  });

  it("says nothing of it to the child: the screens of a transfer problem name no transfer, wording or result", () => {
    const actor = start();
    walk(actor, true);
    const seen: string[] = [];
    const look = () => seen.push(...childTexts(viewOf(actor.getSnapshot())));
    look();
    actor.send({ type: "GUESS", larger: null });
    look();
    actor.send({ type: "PREDICT", answer: "fits" });
    look();
    const text = seen.join("\n");
    expect(text).not.toMatch(/転移|言い回し|頼らない|transfer|wording/i);
  });
});

describe("the adults' note on the try route", () => {
  it("says why the problem came: a transfer problem after the fix, with the old reading in words and the wording", () => {
    const actor = start();
    walk(actor, true);
    const note = researchNote(actor.getSnapshot().context, []);
    expect(note.choice?.kind).toBe("transfer");
    if (note.choice?.kind !== "transfer") return;
    expect(note.choice.fixedProblemId).toBe(actor.getSnapshot().context.log[0]?.problemId);
    expect(note.choice.wording).toBe("different");
    expect(note.choice.oldReadingLine.length).toBeGreaterThan(0);
  });
});
