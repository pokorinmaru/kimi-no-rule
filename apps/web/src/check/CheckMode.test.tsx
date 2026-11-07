// @vitest-environment jsdom
// The AI-free check on screen (指示書 第7.3節, 第1節 原則1・3・7; HANDOFF §3 F7・F8): only the problem's text
// and a number pad, no junior and no world; after each answer one neutral line that the answer was kept;
// the three buttons stay. Written before the implementation.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FRACTION_BANK, type ProblemRecord } from "@kimi/core";
import { openStore, type FlowStore } from "../store/store.ts";
import { FORBIDDEN_CHILD_PHRASES, hardLines } from "../flow/text.ts";
import { CheckMode } from "./CheckMode.tsx";
import { CHECK_TEXT } from "./text.ts";

let n = 0;
const stores: FlowStore[] = [];
function fresh(): FlowStore {
  const s = openStore(`kimi-check-${String(++n)}`);
  stores.push(s);
  return s;
}
afterEach(async () => {
  cleanup();
  for (const s of stores.splice(0)) await s.close();
});

/** Judging words and anything that would tell the child whether the answer was right (原則1・3). */
const JUDGING = [...FORBIDDEN_CHILD_PHRASES, "正し", "ただし", "合って", "あって", "ちがう", "ちがい", "あたり", "はずれ", "ざんねん", "おしい", "できた", "すごい"];

async function currentProblem(): Promise<ProblemRecord> {
  const el = await screen.findByTestId("check-problem");
  const id = el.getAttribute("data-problem-id");
  const r = FRACTION_BANK.find((x) => x.world.problem_id === id);
  if (r === undefined) throw new Error(`no bank problem ${String(id)}`);
  return r;
}

function typeNumber(v: number) {
  for (const d of String(v)) fireEvent.click(screen.getByTestId(`pad-${d}`));
  fireEvent.click(screen.getByTestId("pad-ok"));
}

function answerOf(r: ProblemRecord): number {
  return (r.expected_answer as { num: number }).num;
}

function expectNothingJudged(r: ProblemRecord) {
  const text = document.body.textContent ?? "";
  for (const w of JUDGING) expect(text, w).not.toContain(w);
  const counter = r.world.item_kinds[0]?.counter ?? "";
  expect(text).not.toContain(`${String(answerOf(r))}${counter}`);
}

describe("the check screen", () => {
  it("shows the problem's sentences and a number pad, with no junior and no world", async () => {
    const store = fresh();
    render(<CheckMode store={store} lang="ja" onExit={() => {}} />);
    const r = await currentProblem();
    for (const s of r.statements) expect(screen.getByTestId("check-problem").textContent).toContain(s.text);
    expect(screen.getByTestId("pad-ok")).toBeTruthy();
    expect(screen.queryByTestId("junior-line")).toBeNull();
    expect(document.querySelector("svg")).toBeNull();
    expect(screen.getByTestId("btn-stop")).toBeTruthy();
    expect(screen.getByTestId("btn-dont-know")).toBeTruthy();
    expect(screen.getByTestId("btn-hard")).toBeTruthy();
  });

  it("keeps three answers with only the neutral line, judges them with core and saves the check", async () => {
    const store = fresh();
    render(<CheckMode store={store} lang="ja" onExit={() => {}} />);
    const seen: string[] = [];

    // 1: a wrong answer.
    const r1 = await currentProblem();
    seen.push(r1.world.problem_id);
    typeNumber(answerOf(r1) + 1);
    expect((await screen.findByTestId("check-line")).textContent).toBe(CHECK_TEXT.kept);
    // The number the child typed is not shown back, and the pad is gone until the next problem.
    expect(screen.queryByTestId("pad-value")).toBeNull();
    expectNothingJudged(r1);
    fireEvent.click(screen.getByTestId("btn-check-next"));

    // 2: the right answer gets the very same line.
    const r2 = await currentProblem();
    expect(seen).not.toContain(r2.world.problem_id);
    seen.push(r2.world.problem_id);
    typeNumber(answerOf(r2));
    expect((await screen.findByTestId("check-line")).textContent).toBe(CHECK_TEXT.kept);
    expectNothingJudged(r2);
    fireEvent.click(screen.getByTestId("btn-check-next"));

    // 3: "わからない" leaves the problem.
    const r3 = await currentProblem();
    expect(seen).not.toContain(r3.world.problem_id);
    fireEvent.click(screen.getByTestId("btn-dont-know"));

    expect(await screen.findByTestId("check-done")).toBeTruthy();
    expectNothingJudged(r3);
    await vi.waitFor(async () => expect(await store.listChecks()).toHaveLength(1));
    const [row] = await store.listChecks();
    expect(row?.items).toEqual([
      { problemId: r1.world.problem_id, consistency: r1.consistency, outcome: "not_right" },
      { problemId: r2.world.problem_id, consistency: r2.consistency, outcome: "right" },
      { problemId: r3.world.problem_id, consistency: r3.consistency, outcome: "skipped" },
    ]);
  });

  it("does not give a problem the child met with the junior while an unmet one is left", async () => {
    const store = fresh();
    const met = FRACTION_BANK.slice(0, 6);
    for (const r of met) {
      await store.addAttempt({
        problemId: r.world.problem_id,
        consistency: r.consistency,
        source: "competitor",
        readingId: "c_swap",
        reading: null as never,
        firstPlacement: null,
        ops: [],
        fixes: 0,
        unitTries: 1,
        totalTries: 1,
        outcome: "solved",
      });
    }
    render(<CheckMode store={store} lang="ja" onExit={() => {}} />);
    const r = await currentProblem();
    expect(met.map((x) => x.world.problem_id)).not.toContain(r.world.problem_id);
  });

  it("つらい stops the math and shows the same hard lines when the session's screen is not reachable", async () => {
    const store = fresh();
    render(<CheckMode store={store} lang="ja" onExit={() => {}} />);
    const r = await currentProblem();
    typeNumber(answerOf(r));
    fireEvent.click(screen.getByTestId("btn-hard"));
    const hard = await screen.findByTestId("screen-hard");
    for (const l of hardLines("ja")) expect(hard.textContent).toContain(l);
    expect(screen.queryByTestId("pad-ok")).toBeNull();
    expect(screen.queryByTestId("check-problem")).toBeNull();
    expect(screen.queryByTestId("btn-dont-know")).toBeNull();
    expect(screen.getByTestId("btn-stop")).toBeTruthy();
    expect(hard.textContent ?? "").not.toMatch(/\d{2,4}-\d{2,4}-\d{3,4}|0120/);
    await vi.waitFor(async () => expect((await store.listSafety()).map((x) => x.kind)).toEqual(["hard_button"]));
    // What was answered before stays as a shorter check.
    await vi.waitFor(async () => expect((await store.listChecks())[0]?.items).toHaveLength(1));
  });

  it("つらい goes to the session's hard screen when the app can reach it", async () => {
    const store = fresh();
    const toSession = vi.fn();
    render(<CheckMode store={store} lang="ja" onExit={() => {}} onSessionHard={toSession} />);
    await currentProblem();
    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-hard"));
    });
    expect(toSession).toHaveBeenCalledTimes(1);
  });

  it("やめる leaves the check at once, and saves no empty check", async () => {
    const store = fresh();
    const exit = vi.fn();
    render(<CheckMode store={store} lang="ja" onExit={exit} />);
    await currentProblem();
    fireEvent.click(screen.getByTestId("btn-stop"));
    expect(exit).toHaveBeenCalledTimes(1);
    expect(await store.listChecks()).toEqual([]);
  });
});
