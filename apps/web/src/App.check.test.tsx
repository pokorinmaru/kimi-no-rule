// @vitest-environment jsdom
// The way into the AI-free check and its result on the grown-up's screen (指示書 第7.3節・第7.4節, HANDOFF §3 F7).
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { FRACTION_BANK } from "@kimi/core";
import { App } from "./App.tsx";

afterEach(cleanup);

describe("the AI-free check from the intro screen", () => {
  it("runs three problems with the AI mark and the three buttons, then the grown-up sees 3問中k問 with the date", async () => {
    render(<App storeName="kimi-app-check" api={null} />);
    fireEvent.click(await screen.findByRole("button", { name: "AIなしで ためしてみる" }));
    for (let i = 0; i < 3; i++) {
      const el = await screen.findByTestId("check-problem");
      const r = FRACTION_BANK.find((x) => x.world.problem_id === el.getAttribute("data-problem-id"));
      if (r === undefined) throw new Error("bank problem expected");
      expect(document.querySelector('[data-role="ai-badge"]')).not.toBeNull();
      expect(screen.getByTestId("btn-hard")).toBeTruthy();
      expect(screen.queryByTestId("btn-parent")).toBeNull();
      // Two right, the last one wrong.
      const v = (r.expected_answer as { num: number }).num + (i === 2 ? 1 : 0);
      for (const d of String(v)) fireEvent.click(screen.getByTestId(`pad-${d}`));
      fireEvent.click(screen.getByTestId("pad-ok"));
      fireEvent.click(await screen.findByTestId("btn-check-next"));
    }
    fireEvent.click(await screen.findByTestId("btn-check-back"));
    fireEvent.click(await screen.findByTestId("btn-parent"));
    const results = await screen.findByTestId("check-results");
    const row = await within(results).findByText(/3問中2問/);
    expect(row.textContent).toMatch(/\d{4}\/\d{1,2}\/\d{1,2}/);
  });
});
