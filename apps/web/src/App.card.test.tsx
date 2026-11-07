// @vitest-environment jsdom
// The screen's card rule goes through core's gate (指示書 第5.5節): the "1" card is placed on a whole tape
// only after gate({kind: "place_card", covers: "whole_tape"}) passes.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as core from "@kimi/core";

const calls: unknown[] = [];
vi.mock("@kimi/core", async (importOriginal) => {
  const real = await importOriginal<typeof core>();
  return {
    ...real,
    gate: (action: Parameters<typeof real.gate>[0], ctx: Parameters<typeof real.gate>[1]) => {
      if (action.kind === "place_card") calls.push(action);
      return real.gate(action, ctx);
    },
  };
});

const { App } = await import("./App.tsx");

afterEach(cleanup);

describe("placing the card from the screen", () => {
  it("asks core's gate about a whole-tape card before the junior hears the placement", async () => {
    render(<App storeName="kimi-app-card" api={null} />);
    fireEvent.click(await screen.findByTestId("btn-next"));
    fireEvent.click(await screen.findByTestId("btn-consent-yes"));
    // The child first says whether the junior's world fits (指示書 第7.1節 手順4).
    fireEvent.click(await screen.findByTestId("btn-guess-unknown"));
    fireEvent.click(await screen.findByTestId("btn-predict-fits"));
    // The card is a button only once the child may move it.
    const card = await screen.findByRole("button", { name: /「1」/ });
    await act(async () => {
      fireEvent.pointerDown(card, { clientX: 10, clientY: 10, pointerId: 1 });
    });
    await act(async () => {
      fireEvent.pointerUp(card.closest("svg") as Element, { clientX: 10, clientY: 10, pointerId: 1 });
    });
    const target = document.querySelector('[data-drop-target="h_otouto"]');
    if (target === null) throw new Error("drop target expected");
    await act(async () => {
      fireEvent.click(target);
    });
    expect(await screen.findByTestId("btn-confirm-yes")).toBeTruthy();
    expect(calls).toContainEqual({ kind: "place_card", covers: "whole_tape" });
  });
});
