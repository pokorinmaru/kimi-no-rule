// @vitest-environment jsdom
// The adults' try route on the screen (指示書 第6.9節, 第11節 M5): marked for adults, the same screens as the
// child's flow, a store of its own that starts empty, the simulated child, and 「中身を見る」 beside the flow.
// The research note never appears on the child's route. Written before the implementation.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Root } from "../Root.tsx";
import { TryApp, TRY_DB_NAME } from "./TryApp.tsx";
import { openStore } from "../store/store.ts";
import { DEFAULT_DB_NAME } from "../store/store.ts";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

const weightsOf = (): string[] => screen.queryAllByTestId("note-weight").map((e) => e.textContent ?? "");

describe("the try route", () => {
  it("is marked for adults, starts from an empty store of its own, and keeps the child's store untouched", async () => {
    // Something kept by an earlier try is gone when the route opens again.
    const old = openStore(TRY_DB_NAME);
    await old.setConsent(true);
    await old.logGate(["answer_leak"]);
    await old.close();
    const child = openStore(DEFAULT_DB_NAME);
    const childSettings = await child.getSettings();

    render(<TryApp api={null} simDelayMs={0} />);
    expect(await screen.findByTestId("try-banner")).toBeTruthy();
    expect(screen.getByTestId("try-banner").textContent).toMatch(/大人/);
    // The same flow: the intro, then consent (the earlier consent in the try store was cleared).
    fireEvent.click(await screen.findByTestId("btn-next"));
    expect(await screen.findByTestId("btn-consent-yes")).toBeTruthy();
    expect(TRY_DB_NAME).not.toBe(DEFAULT_DB_NAME);
    expect(await child.getSettings()).toEqual(childSettings);
    expect(await child.listAttempts()).toEqual([]);
    expect(await child.listGateLog()).toEqual([]);
    await child.close();
  });

  it("the simulated child plays two problems; the note shows the pool's weights change and why the problem was chosen", async () => {
    render(<TryApp api={null} simDelayMs={0} />);
    fireEvent.click(await screen.findByTestId("btn-next"));
    fireEvent.click(await screen.findByTestId("btn-consent-yes"));
    const note = await screen.findByTestId("research-note");
    expect(within(note).getByTestId("note-choice").textContent).toMatch(/最初の問題/);
    fireEvent.change(screen.getByTestId("sim-child"), { target: { value: "s_known" } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-sim-play"));
    });
    // The simulated child plays two whole problems: allow for a loaded machine (the suite runs beside other work).
    await waitFor(() => expect(weightsOf().length).toBeGreaterThanOrEqual(2), { timeout: 30_000 });
    await waitFor(() => expect(within(note).getByTestId("note-choice").textContent).toMatch(/見分け/), { timeout: 30_000 });
    expect(within(note).getByTestId("note-gain").textContent).toMatch(/\d/);
    const before = weightsOf();
    // Each predicted world is drawn small; the sentence's own world waits until the adult answers.
    expect(within(note).getAllByTestId("note-prediction").length).toBeGreaterThanOrEqual(2);
    expect(within(note).getAllByTestId("note-hidden").length).toBeGreaterThan(0);
    expect(within(note).getByTestId("note-junior").textContent).toMatch(/鏡|競合|教わった/);

    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-sim-play"));
    });
    await waitFor(() => expect(within(note).getAllByTestId("note-observation").length).toBe(2));
    expect(weightsOf()).not.toEqual(before);
  });
});

describe("the child's route", () => {
  it("never shows the research note or the try route's controls", async () => {
    window.location.hash = "";
    render(<Root api={null} />);
    fireEvent.click(await screen.findByTestId("btn-next"));
    fireEvent.click(await screen.findByTestId("btn-consent-yes"));
    await screen.findByTestId("guess");
    expect(screen.queryByTestId("research-note")).toBeNull();
    expect(screen.queryByTestId("try-banner")).toBeNull();
    expect(screen.queryByTestId("btn-sim-play")).toBeNull();
    expect(document.body.textContent).not.toMatch(/研究ノート|中身を見る|仮説|鏡|競合|模擬/);
  });

  it("opens the try route only on #/try", async () => {
    window.location.hash = "#/try";
    render(<Root api={null} />);
    expect(await screen.findByTestId("try-banner")).toBeTruthy();
    act(() => {
      window.location.hash = "";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await waitFor(() => expect(screen.queryByTestId("try-banner")).toBeNull());
  });
});
