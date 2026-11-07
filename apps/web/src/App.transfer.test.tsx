// @vitest-environment jsdom
// "A reading that does not lean on the wording" (指示書 第6.7節 手順6, Q48) on the grown-up's screen only: after the
// child fixed the junior's reading, a problem in another phrasing read without that reading and solved. The device
// keeps ids and core's yes/no; the line names the junior's reading in core's words (never the child's), and holds
// no number of any problem. Nothing of it on a child's screen. Written before the implementation.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { COMMON_FRACTION_READINGS, FRACTION_BANK, readingLine, type Hypothesis, type Lang } from "@kimi/core";
import { App } from "./App.tsx";
import { openStore, type FlowStore } from "./store/store.ts";
import { hasForbiddenPhrase, ui } from "./flow/text.ts";
import type { ProblemLog, TransferLog } from "./flow/machine.ts";

const stores: FlowStore[] = [];
afterEach(async () => {
  cleanup();
  for (const s of stores.splice(0)) await s.close();
});

const swap = COMMON_FRACTION_READINGS.find((h) => h.id === "c_swap") as Hypothesis;
const fixed = FRACTION_BANK.find((r) => r.world.problem_id === "p_fraction_c");
if (fixed === undefined) throw new Error("no p_fraction_c");

function attempt(transfer: TransferLog | undefined, problemId: string): ProblemLog {
  return {
    problemId,
    consistency: "consistent",
    source: "mirror",
    readingId: "c_swap",
    reading: swap,
    prediction: "odd",
    firstPlacement: null,
    ops: [],
    fixes: 1,
    unitTries: 1,
    totalTries: 1,
    outcome: "solved",
    ...(transfer === undefined ? {} : { transfer }),
  };
}

const kept = (beyondWording: boolean, wording: TransferLog["wording"] = "different"): TransferLog => ({ fixedProblemId: "p_fraction_c", oldReadingId: "c_swap", wording, beyondWording });

let n = 0;
async function seeded(lang: Lang, rows: ProblemLog[]): Promise<string> {
  const name = `kimi-transfer-note-${lang}-${String(++n)}`;
  const s = openStore(name);
  await s.setLang(lang);
  for (const r of rows) await s.addAttempt(r);
  await s.close();
  return name;
}

async function openParent(name: string): Promise<void> {
  render(<App storeName={name} api={null} parentHoldMs={0} />);
  fireEvent.pointerDown(await screen.findByTestId("btn-parent"));
}

describe("the device keeps a transfer problem's verdict", () => {
  it("as ids, the wording and a yes/no, and nothing on any other problem", async () => {
    const name = `kimi-transfer-store-${String(++n)}`;
    const s = openStore(name);
    stores.push(s);
    await s.addAttempt(attempt(kept(true), "p_transfer_c_swap_different_1"));
    await s.addAttempt(attempt(undefined, "p_fraction_c"));
    const rows = await s.listAttempts();
    expect(rows[0]?.transfer).toEqual(kept(true));
    expect(rows[1]?.transfer).toBeUndefined();
  });
});

describe("the grown-up's screen", () => {
  for (const lang of ["ja", "en"] as const) {
    it(`lists each reading that did not lean on the wording, with the junior's reading in core's words (${lang})`, async () => {
      const t = ui(lang).parent;
      await openParent(
        await seeded(lang, [
          attempt(undefined, "p_fraction_c"),
          attempt(kept(true), "p_transfer_c_swap_different_1"),
          attempt(kept(false), "p_transfer_c_additive_different_1"),
          attempt(kept(true, "same"), "p_transfer_c_swap_same_1"),
        ]),
      );
      const note = await screen.findByTestId("wording-note");
      expect(within(note).getByText(t.wordingTitle)).toBeTruthy();
      for (const l of t.wordingLines) expect(within(note).getByText(l)).toBeTruthy();
      const rows = await within(note).findAllByTestId("wording-entry");
      expect(rows).toHaveLength(1);
      expect(rows[0]?.textContent).toContain(t.wordingRow("", readingLine(swap, lang)).replace(/^[:：]\s*/, ""));
    });
  }

  it("says plainly when there is none yet", async () => {
    const t = ui("ja").parent;
    await openParent(await seeded("ja", [attempt(kept(false), "p_transfer_c_swap_different_1")]));
    // The records have loaded once the day's row is drawn.
    await screen.findAllByTestId("trend-day");
    const note = await screen.findByTestId("wording-note");
    expect(within(note).getByText(t.wordingNone)).toBeTruthy();
    expect(within(note).queryAllByTestId("wording-entry")).toHaveLength(0);
  });

  it("is not on a child's screen", async () => {
    const t = ui("ja").parent;
    render(<App storeName={await seeded("ja", [attempt(kept(true), "p_transfer_c_swap_different_1")])} api={null} parentHoldMs={0} />);
    await screen.findByTestId("btn-parent");
    expect(screen.queryByTestId("wording-note")).toBeNull();
    expect((document.body.textContent ?? "").includes(t.wordingTitle)).toBe(false);
  });
});

describe("the words", () => {
  const BANNED_JA = ["君", "きみ", "あなた", "まちがい", "間違", "正し", "正解", "読み違い", "つられ", "苦手", "確定", "障害"];
  const BANNED_EN = /\b(?:you|your|wrong|mistakes?|misread\w*|correct(?:ly)?|incorrect|error|weak|poor|bad|disorder)\b/i;
  for (const lang of ["ja", "en"] as const) {
    it(`pass the forbidden-phrase check, pin nothing on the child and hold no number (${lang})`, () => {
      const t = ui(lang).parent;
      const words = [t.wordingTitle, ...t.wordingLines, t.wordingNone, t.wordingUnknown, t.wordingRow("2026/11/7", readingLine(swap, lang)), t.wordingRow("2026/11/7", t.wordingUnknown)];
      for (const w of words) {
        expect(hasForbiddenPhrase(w), w).toBe(false);
        if (lang === "ja") for (const b of BANNED_JA) expect(w.includes(b), w).toBe(false);
        else expect(BANNED_EN.test(w), w).toBe(false);
      }
      for (const w of [t.wordingTitle, ...t.wordingLines, t.wordingNone]) expect(w.replaceAll("「1」", "").replaceAll('"1"', "").match(/[0-9０-９]/), w).toBeNull();
    });
  }
});
