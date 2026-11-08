// @vitest-environment jsdom
// The child's route one sentence at a time (Q62): only the sentences so far, the picture of the step and one question;
// no tape diagram, no "1" card, no prediction, no word book; the parent sees where the child stopped.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "./App.tsx";

afterEach(cleanup);

const plain = (el: Element): string => {
  const c = el.cloneNode(true) as Element;
  c.querySelectorAll("rt").forEach((r) => r.remove());
  return c.textContent ?? "";
};
const stepOf = () => screen.getByTestId("screen-steps").getAttribute("data-step");
async function typeNumber(n: number) {
  for (const d of String(n)) fireEvent.click(await screen.findByTestId(`pad-${d}`));
  fireEvent.click(await screen.findByTestId("pad-ok"));
}
async function start(storeName: string) {
  render(<App storeName={storeName} api={null} parentHoldMs={0} />);
  fireEvent.click(await screen.findByTestId("btn-home-start"));
  fireEvent.click(await screen.findByTestId("btn-next"));
  fireEvent.click(await screen.findByTestId("btn-consent-yes"));
  return screen.findByTestId("screen-steps");
}

describe("the child's route, one sentence at a time", () => {
  it("opens on the first sentence alone, with the child's goldfish alone and one question; nothing of the old screens", async () => {
    const s = await start("kimi-steps-open");
    expect(stepOf()).toBe("fact");
    expect(s.querySelectorAll("[data-statement]")).toHaveLength(1);
    expect(plain(s)).toContain("8匹");
    expect(plain(screen.getByTestId("steps-question"))).toContain("なん匹");
    for (const id of ["guess", "predict", "looking-line", "btn-confirm-yes"]) expect(screen.queryByTestId(id)).toBeNull();
    expect(s.querySelector('[data-role="tape"]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/「1」の札|1とみる/);
  });

  it("asks who is compared with at the relation sentence, and shows the other reading's world when the other holder is chosen", async () => {
    await start("kimi-steps-relation");
    await typeNumber(8);
    await waitFor(() => expect(stepOf()).toBe("relation"));
    expect(plain(screen.getByTestId("steps-question"))).toContain("だれの");
    fireEvent.click(screen.getByTestId("btn-step-h_ai"));
    expect(plain(await screen.findByTestId("steps-lead"))).toContain("くらべて 読むと");
    fireEvent.click(screen.getByTestId("btn-step-again"));
    fireEvent.click(await screen.findByTestId("btn-step-h_me"));
    await waitFor(() => expect(stepOf()).toBe("unit"));
    // The one part step opens with the empty plates and every goldfish waiting (5d59d9c).
    expect(plain(screen.getByTestId("steps-lead"))).toContain("4つの おさらに");
  });

  it("goes to the end, and the parent sees each step with where it needed help", async () => {
    await start("kimi-steps-end");
    await typeNumber(8);
    fireEvent.click(await screen.findByTestId("btn-step-h_ai"));
    fireEvent.click(await screen.findByTestId("btn-step-again"));
    fireEvent.click(await screen.findByTestId("btn-step-h_me"));
    await typeNumber(4);
    await typeNumber(2);
    await typeNumber(6);
    await waitFor(() => expect(stepOf()).toBe("solved"));
    fireEvent.click(screen.getByTestId("btn-home"));
    fireEvent.pointerDown(await screen.findByTestId("btn-parent"));
    const note = await screen.findByTestId("steps-note");
    await waitFor(() => expect(note.querySelectorAll("[data-outcome]")).toHaveLength(4));
    expect([...note.querySelectorAll("[data-outcome]")].map((e) => e.getAttribute("data-outcome"))).toEqual(["ok", "helped", "helped", "ok"]);
    expect(note.textContent).toContain("選び直した");
  });
});
