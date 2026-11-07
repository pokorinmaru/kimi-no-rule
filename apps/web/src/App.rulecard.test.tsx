// @vitest-environment jsdom
// 指示書 第7.1節「後輩のルールカード」and 第2節「自分で直す」on the screen: after two solved problems the junior's
// card and the gallery of this session's problems; choosing who is taken as 1 builds every world again, the
// sentences' light is the only feedback, the AI mark and the three buttons stay. Written before the implementation.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { CARD_RULE_IDS, FRACTION_BANK, cardFailing, COMMON_FRACTION_READINGS, numbersIn, sceneAvoidValues, type ProblemRecord, type Rational } from "@kimi/core";
import { App } from "./App.tsx";
import { judgeTotal, judgeUnit } from "./flow/problem.ts";
import { hasForbiddenPhrase } from "./flow/text.ts";
import { plainText } from "./plain-text.ts";

afterEach(cleanup);

function recordOnScreen(): ProblemRecord {
  const id = document.querySelector("[data-problem-id]")?.getAttribute("data-problem-id");
  const r = FRACTION_BANK.find((x) => x.world.problem_id === id);
  if (r === undefined) throw new Error(`no problem on screen: ${String(id)}`);
  return r;
}

async function typeNumber(n: number): Promise<void> {
  for (const d of String(n)) fireEvent.click(await screen.findByTestId(`pad-${d}`));
  fireEvent.click(screen.getByTestId("pad-ok"));
}

/** Solves the problem on screen by taps: the prediction, the 1 card on the reference's tape, the unit and the total. */
async function solveOnScreen(): Promise<void> {
  fireEvent.click(await screen.findByTestId("btn-guess-unknown"));
  fireEvent.click(await screen.findByTestId("btn-predict-odd"));
  const record = recordOnScreen();
  const rel = record.world.relations[0];
  const holder = record.world.quantities.find((q) => q.id === rel?.reference)?.holder;
  const card = await screen.findByRole("button", { name: /「1」/ });
  await act(async () => {
    fireEvent.pointerDown(card, { clientX: 10, clientY: 10, pointerId: 1 });
  });
  await act(async () => {
    fireEvent.pointerUp(card.closest("svg") as Element, { clientX: 10, clientY: 10, pointerId: 1 });
  });
  const target = document.querySelector(`[data-drop-target="${String(holder)}"]`);
  if (target === null) throw new Error("drop target expected");
  await act(async () => {
    fireEvent.click(target);
  });
  fireEvent.click(await screen.findByTestId("btn-confirm-yes"));
  // The word book opens after the first fix on a wording new in the session (指示書 第7.1節).
  const close = screen.queryByTestId("btn-book-close");
  if (close !== null) fireEvent.click(close);
  fireEvent.click(await screen.findByTestId("btn-next"));
  let unit = 0;
  let total = 0;
  for (let n = 1; n <= 60; n++) {
    const v: Rational = { num: n, den: 1 };
    if (unit === 0 && judgeUnit(record, v)) unit = n;
    if (total === 0 && judgeTotal(record, v)) total = n;
  }
  await typeNumber(unit);
  await typeNumber(total);
  fireEvent.click(await screen.findByTestId("btn-next"));
}

const litOf = (item: Element): number[] => [...item.querySelectorAll('[data-statement][data-glow="true"]')].map((e) => Number(e.getAttribute("data-statement")));
const rule = (id: string) => COMMON_FRACTION_READINGS.find((h) => h.id === id) as never;

describe("the junior's rule card on the screen", () => {
  it("opens after two solved problems; a pick builds every gallery world again and only the sentences light", async () => {
    render(<App storeName="kimi-app-rulecard" api={null} />);
    fireEvent.click(await screen.findByTestId("btn-next"));
    fireEvent.click(await screen.findByTestId("btn-consent-yes"));
    await solveOnScreen();
    expect(screen.queryByTestId("rule-card")).toBeNull();
    await solveOnScreen();

    const cardScreen = await screen.findByTestId("screen-card");
    expect(plainText(screen.getByTestId("rule-card"))).toMatch(/^後輩の読み方：/);
    const options = within(cardScreen)
      .getAllByRole("button")
      .filter((b) => b.hasAttribute("data-rule"));
    expect(options.map((b) => b.getAttribute("data-rule"))).toEqual([...CARD_RULE_IDS]);
    const items = screen.getAllByTestId("gallery-item");
    expect(items).toHaveLength(2);
    // The AI mark and the three buttons stay (原則7, 第9節).
    expect(document.querySelector('[data-role="ai-badge"]')).not.toBeNull();
    for (const b of ["btn-stop", "btn-dont-know", "btn-hard"]) expect(screen.getByTestId(b)).toBeTruthy();

    for (const id of ["c_correct", "c_swap"]) {
      fireEvent.click(within(cardScreen).getByTestId(`card-option-${id}`));
      expect(within(cardScreen).getByTestId(`card-option-${id}`).getAttribute("aria-pressed")).toBe("true");
      for (const item of screen.getAllByTestId("gallery-item")) {
        const rec = FRACTION_BANK.find((r) => r.world.problem_id === item.getAttribute("data-problem-id")) as ProblemRecord;
        expect(litOf(item), `${id} ${rec.world.problem_id}`).toEqual(cardFailing(rule(id), rec));
        // The worlds are drawn again (tapes on screen) and the asked value is never drawn.
        expect(item.querySelectorAll('[data-role="tape"]').length).toBeGreaterThan(0);
      }
    }
    // 身近な場面で見てみる (指示書 第6.7節 手順5): two scenes for the picked reading; with the swap one common-sense
    // sentence is lit, with the sentence's own reading none is.
    const scenes = within(cardScreen).getByTestId("scenes");
    expect(plainText(within(scenes).getByRole("heading", { level: 3 }))).toBe("身近な場面で見てみる");
    expect(within(scenes).getAllByTestId("scene")).toHaveLength(2);
    expect(scenes.querySelectorAll('[data-role="scene-tape"]').length).toBeGreaterThanOrEqual(4);
    // The swap was picked last above.
    expect(scenes.querySelectorAll('[data-role="common-sense"][data-glow="true"]')).toHaveLength(1);
    fireEvent.click(within(cardScreen).getByTestId("card-option-c_correct"));
    expect(scenes.querySelectorAll('[data-role="common-sense"][data-glow="true"]')).toHaveLength(0);
    expect(within(cardScreen).getAllByTestId("scene")).toHaveLength(2);
    const avoid = sceneAvoidValues(FRACTION_BANK);
    for (const n of numbersIn(scenes.textContent ?? "")) expect(avoid.some((a) => a.num * n.den === n.num * a.den)).toBe(false);

    // No word on the card screen judges or names the child's reading.
    const words = [document.body.textContent ?? "", ...[...document.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label") ?? "")];
    for (const w of words) expect(hasForbiddenPhrase(w), w).toBe(false);
    expect(document.body.textContent).not.toMatch(/正し|まちが|間違|合って|正解/);

    // Leaving the card goes on to the next problem.
    fireEvent.click(within(cardScreen).getByTestId("btn-card-next"));
    // The next problem opens on the child's own first prediction (指示書 第7.1節 手順2).
    expect(await screen.findByTestId("guess")).toBeTruthy();
  });
});
