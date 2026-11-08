// @vitest-environment jsdom
// The grown-up's research note and trend (指示書 第7.4節, 第6.7節 研究ノート・手順4; 第1節 原則1・10・11): on the
// grown-up's screen only, from the records already on the device. Each hypothesis in core's adult words,
// "a guess" or "the way of reading for now" (never a word that pins anything on the child), how many counted
// problems back it, a plain line that these are guesses from a few problems, and no answer of any problem.
// Nothing of it appears on a child's screen. Written before the implementation.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { COMMON_FRACTION_READINGS, CORRECT_READING_ID, FRACTION_BANK, OTHER, readingLine, runRule, sameReading, type Hypothesis, type Lang, type ResearchState } from "@kimi/core";
import { App } from "./App.tsx";
import { openStore, type FlowStore } from "./store/store.ts";
import { hasForbiddenPhrase, ui } from "./flow/text.ts";
import type { ProblemLog } from "./flow/machine.ts";

const stores: FlowStore[] = [];
afterEach(async () => {
  cleanup();
  for (const s of stores.splice(0)) await s.close();
});

const common = (id: string): Hypothesis => {
  const h = COMMON_FRACTION_READINGS.find((x) => x.id === id);
  if (h === undefined) throw new Error("no common reading " + id);
  return structuredClone(h);
};
const known = common("c_known_whole");
const correct = common(CORRECT_READING_ID);
const differing = FRACTION_BANK.filter((r) => !sameReading(runRule(known, r), runRule(correct, r), true)).slice(0, 3);

function stateOf(status: "hypothesis" | "confirmed"): ResearchState {
  return {
    pool: [
      { hypothesis: known, status, splitObservations: 2 },
      { hypothesis: correct, status: "hypothesis", splitObservations: 2 },
    ],
    weights: { [OTHER]: 0.05, c_known_whole: 0.85, [CORRECT_READING_ID]: 0.1 },
    readings: differing.map((record) => ({ record, childWorld: runRule(known, record), referencePlaced: true, afterFix: false, wordbookOpenedBefore: false })),
    unscored: 0,
    unexpressible: false,
  };
}

function attempt(outcome: ProblemLog["outcome"], fixes: number): ProblemLog {
  const r = differing[0];
  if (r === undefined) throw new Error("bank problem expected");
  return {
    problemId: r.world.problem_id,
    consistency: r.consistency,
    source: "mirror",
    readingId: "c_known_whole",
    reading: known,
    prediction: "odd",
    firstPlacement: null,
    ops: [],
    fixes,
    unitTries: 1,
    totalTries: 1,
    outcome,
  };
}

let n = 0;
/** A device that already holds research and two problems: the reading became the way of reading for now. */
async function seeded(lang: Lang): Promise<string> {
  const name = `kimi-parent-note-${lang}-${String(++n)}`;
  const s = openStore(name);
  await s.setLang(lang);
  await s.saveResearch(stateOf("hypothesis"));
  await s.saveResearch(stateOf("confirmed"));
  await s.addAttempt(attempt("solved", 2));
  await s.addAttempt(attempt("held", 1));
  await s.addAttempt(attempt("hard", 5));
  await s.close();
  return name;
}

async function openParent(name: string): Promise<void> {
  render(<App home={false} firstProblemId="p_signboard" storeName={name} api={null} parentHoldMs={0} />);
  fireEvent.pointerDown(await screen.findByTestId("btn-parent"));
}

describe("the research note on the grown-up's screen", () => {
  for (const lang of ["ja", "en"] as const) {
    it(`lists each hypothesis in core's words with its status and backing, and says these are guesses (${lang})`, async () => {
      const t = ui(lang).parent;
      await openParent(await seeded(lang));
      const note = await screen.findByTestId("research-note");
      expect(within(note).getByText(t.researchTitle)).toBeTruthy();
      for (const l of t.researchLines) expect(within(note).getByText(l)).toBeTruthy();
      const rows = await within(note).findAllByTestId("research-entry");
      expect(rows.map((r) => r.textContent)).toEqual([
        t.entry(readingLine(known, lang), t.status.confirmed, differing.length, differing.length),
        t.entry(readingLine(correct, lang), t.status.hypothesis, 0, differing.length),
      ]);
    });

    it(`shows the trend per day from the device's records, leaving out a problem ended by "it's hard" (${lang})`, async () => {
      const t = ui(lang).parent;
      await openParent(await seeded(lang));
      const trend = await screen.findByTestId("research-trend");
      expect(within(trend).getByText(t.trendTitle)).toBeTruthy();
      const day = await within(trend).findByTestId("trend-day");
      expect(day.textContent).toContain(t.trendRow("", 1, 1, 3).replace(/^[:：]\s*/, ""));
      expect(day.textContent).toContain(t.trendSettled(readingLine(known, lang)));
      expect(day.textContent).toMatch(/\d{4}\/\d{1,2}\/\d{1,2}/);
    });
  }

  it("says plainly when nothing is there yet", async () => {
    const t = ui("ja").parent;
    await openParent(`kimi-parent-note-empty-${String(++n)}`);
    const note = await screen.findByTestId("research-note");
    expect(within(note).getByText(t.researchNone)).toBeTruthy();
    expect(within(await screen.findByTestId("research-trend")).getByText(t.trendNone)).toBeTruthy();
  });
});

describe("the note's words", () => {
  const BANNED_JA = ["君", "きみ", "あなた", "まちがい", "間違", "正し", "正解", "つられ", "ずれ", "苦手", "確定", "その子のルール", "障害"];
  const BANNED_EN = /\b(?:you|your|wrong|mistakes?|correct(?:ly)?|incorrect|error|fooled|tricked|weak|poor|bad|disorder|confirmed)\b/i;
  for (const lang of ["ja", "en"] as const) {
    it(`pass the forbidden-phrase check and name no deficit (${lang})`, () => {
      const t = ui(lang).parent;
      const line = readingLine(known, lang);
      const words = [
        t.researchTitle,
        ...t.researchLines,
        t.researchNone,
        t.researchUnsettled,
        t.status.hypothesis,
        t.status.confirmed,
        t.entry(line, t.status.confirmed, 2, 3),
        t.trendTitle,
        t.trendNone,
        t.trendNote,
        t.trendRow("2026/11/7", 2, 1, 3),
        t.trendSettled(line),
        t.trendBack(line),
        t.trendDropped(line),
      ];
      for (const w of words) {
        expect(hasForbiddenPhrase(w), w).toBe(false);
        if (lang === "ja") for (const b of BANNED_JA) expect(w.includes(b), w).toBe(false);
        else expect(BANNED_EN.test(w), w).toBe(false);
      }
      // The fixed words hold no number but the 1 of the "1" card: no answer of a problem can be in them.
      for (const w of [t.researchTitle, ...t.researchLines, t.researchNone, t.researchUnsettled, t.trendTitle, t.trendNone, t.trendNote]) {
        expect(w.replaceAll("「1」", "").replaceAll('"1"', "").match(/[0-9０-９]/), w).toBeNull();
      }
    });
  }
});

describe("nothing of the note on a child's screen", () => {
  it("the intro, consent and problem screens show no research note or trend, and closing the grown-up's screen takes it away", async () => {
    const name = await seeded("ja");
    const t = ui("ja").parent;
    render(<App home={false} firstProblemId="p_signboard" storeName={name} api={null} parentHoldMs={0} />);
    const noNote = (): void => {
      expect(screen.queryByTestId("research-note")).toBeNull();
      expect(screen.queryByTestId("research-trend")).toBeNull();
      const text = document.body.textContent ?? "";
      for (const w of [t.researchTitle, t.trendTitle, t.status.confirmed, readingLine(known, "ja"), readingLine(correct, "ja")]) expect(text.includes(w), w).toBe(false);
    };
    await screen.findByTestId("btn-parent");
    noNote();
    fireEvent.pointerDown(screen.getByTestId("btn-parent"));
    await screen.findByTestId("research-note");
    fireEvent.click(screen.getByRole("button", { name: t.back }));
    noNote();
    fireEvent.click(await screen.findByTestId("btn-next"));
    noNote();
    fireEvent.click(await screen.findByTestId("btn-consent-yes"));
    await screen.findByRole("region", { name: ui("ja").problem.label }).catch(() => screen.findByRole("region", { name: ui("ja").problem.guess.label }));
    noNote();
  });
});
