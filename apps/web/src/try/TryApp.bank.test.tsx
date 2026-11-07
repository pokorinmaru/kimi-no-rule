// @vitest-environment jsdom
// Discriminating problems written offline by AI (指示書 第6.7節 手順3, Q33) on the screens: the child's route never
// uses one a person has not checked; the adults' try route may, behind a visible toggle that starts off.
// Written before the implementation.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FRACTION_BANK, type ProblemRecord } from "@kimi/core";
import { App, type SessionHandle } from "../App.tsx";
import { Root } from "../Root.tsx";
import { TryApp, UNCHECKED_TOGGLE_LABEL } from "./TryApp.tsx";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

const base = FRACTION_BANK[1] as ProblemRecord;
const made = (id: string, checked: boolean): ProblemRecord => ({
  ...structuredClone(base),
  world: { ...structuredClone(base.world), problem_id: id },
  source: "discriminating_bank",
  checks: { double_build_match: true, restate_match: true, misread_pass_rate: 1, human_checked: checked },
});
const stored = [made("p_disc_checked_1", true), made("p_disc_unchecked_1", false)];

describe("the bank on the screens", () => {
  it("App hands the bank it is given to the flow", async () => {
    let handle: SessionHandle | null = null;
    const bank = [...FRACTION_BANK, made("p_disc_x_1", true)];
    render(<App storeName="kimi-bank-test" api={null} bank={bank} onSession={(h) => (handle = h)} />);
    await waitFor(() => expect(handle).not.toBeNull());
    const ids = (handle as unknown as SessionHandle).session.actor.getSnapshot().context.bank.map((r) => r.world.problem_id);
    expect(ids).toContain("p_disc_x_1");
  });

  it("the try route shows the toggle off; turning it on adds the unchecked problems to the flow", async () => {
    render(<TryApp api={null} simDelayMs={0} stored={stored} />);
    const toggle = (await screen.findByLabelText(UNCHECKED_TOGGLE_LABEL)) as HTMLInputElement;
    expect(UNCHECKED_TOGGLE_LABEL).toBe("AIが作った未確認の問題も使う");
    expect(toggle.checked).toBe(false);
    const size = () => screen.getByTestId("try-bank").getAttribute("data-ids") ?? "";
    expect(size()).toContain("p_disc_checked_1");
    expect(size()).not.toContain("p_disc_unchecked_1");
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(true);
    expect(size()).toContain("p_disc_unchecked_1");
    // The flow starts again with the new bank.
    expect(await screen.findByTestId("btn-next")).toBeTruthy();
  });

  it("the child's route has no such toggle", async () => {
    window.location.hash = "";
    render(<Root api={null} />);
    await screen.findByTestId("btn-next");
    expect(screen.queryByLabelText(UNCHECKED_TOGGLE_LABEL)).toBeNull();
    expect(document.body.textContent).not.toMatch(/未確認/);
  });
});
