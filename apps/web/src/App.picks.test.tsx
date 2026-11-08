// @vitest-environment jsdom
// The top page offers where to start (Q64): children are at different steps of learning, so the child picks a problem
// of the route (the whole-known goldfish story, the part-known one, the shirt sale). Each card says only the
// problem's name and who it is for: no number of the problem, no answer, no operation. The pick opens that problem on
// the one-sentence steps, and the route goes on from there.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CHILD_ROUTE, CHILD_SECOND_PROBLEM_ID, CHILD_THIRD_PROBLEM_ID } from "@kimi/core";
import { App } from "./App.tsx";
import { ui } from "./flow/text.ts";

afterEach(cleanup);
const t = ui("ja");
const plain = (el: Element): string => {
  const c = el.cloneNode(true) as Element;
  c.querySelectorAll("rt").forEach((r) => r.remove());
  return c.textContent ?? "";
};
const cards = () => [...screen.getByTestId("home-picks").querySelectorAll("button[data-problem-id]")];

async function pickAndEnter(id: string) {
  const card = cards().find((b) => b.getAttribute("data-problem-id") === id);
  if (card === undefined) throw new Error(`no card for ${id}`);
  fireEvent.click(card);
  fireEvent.click(await screen.findByTestId("btn-next"));
  fireEvent.click(await screen.findByTestId("btn-consent-yes"));
  return screen.findByTestId("screen-steps");
}

describe("the top page's problems to start from", () => {
  it("lists the route's problems in order, each with its name and who it is for", async () => {
    render(<App storeName="kimi-picks-list" api={null} />);
    await screen.findByTestId("screen-home");
    expect(plain(screen.getByTestId("home-picks"))).toContain(t.home.pickTitle);
    expect(cards().map((b) => b.getAttribute("data-problem-id"))).toEqual([...CHILD_ROUTE]);
    for (const b of cards()) {
      const label = t.home.picks[b.getAttribute("data-problem-id") ?? ""];
      expect(label).toBeDefined();
      expect(plain(b)).toContain(label?.title);
      expect(plain(b)).toContain(label?.note);
      // Nothing of the problem's numbers, answers or operations (原則1); the card's own "1" and "2" are its name.
      expect(plain(b).replace(/その[12]|その1が/g, "")).not.toMatch(/\d|[＋−×÷+\-*/]|ぶんの/);
    }
    // The first is the start for a child new to the app (the main action of the page).
    expect(cards()[0]?.getAttribute("data-testid")).toBe("btn-home-start");
  });

  it("picking the second story opens it on its first sentence", async () => {
    render(<App storeName="kimi-picks-second" api={null} />);
    await screen.findByTestId("screen-home");
    const s = await pickAndEnter(CHILD_SECOND_PROBLEM_ID);
    expect(s.getAttribute("data-problem-id")).toBe(CHILD_SECOND_PROBLEM_ID);
    expect(s.getAttribute("data-step")).toBe("fact");
  });

  it("picking the shirt sale opens it on its first sentence", async () => {
    render(<App storeName="kimi-picks-sale" api={null} />);
    await screen.findByTestId("screen-home");
    const s = await pickAndEnter(CHILD_THIRD_PROBLEM_ID);
    expect(s.getAttribute("data-problem-id")).toBe(CHILD_THIRD_PROBLEM_ID);
  });

  it("while a session is under way, the top page offers 「つづきから」 and another problem to start from", async () => {
    render(<App storeName="kimi-picks-underway" api={null} />);
    await screen.findByTestId("screen-home");
    await pickAndEnter(CHILD_ROUTE[0] ?? "");
    fireEvent.click(screen.getByTestId("btn-home"));
    await screen.findByTestId("screen-home");
    expect(screen.getByTestId("btn-home-resume")).toBeTruthy();
    expect(plain(screen.getByTestId("home-picks"))).toContain(t.home.pickOther);
    fireEvent.click(screen.getByTestId(`btn-pick-${CHILD_THIRD_PROBLEM_ID}`));
    // The intro and consent were given on this device: the picked problem opens on its first sentence.
    const s = await screen.findByTestId("screen-steps");
    expect(s.getAttribute("data-problem-id")).toBe(CHILD_THIRD_PROBLEM_ID);
  });

  it("the adults' old flow keeps its one start button and no list", async () => {
    render(<App stepFlow={false} storeName="kimi-picks-old" api={null} />);
    await screen.findByTestId("screen-home");
    expect(screen.queryByTestId("home-picks")).toBeNull();
    expect(screen.getByTestId("btn-home-start").textContent).toContain(t.home.start);
  });
});
