// @vitest-environment jsdom
// The child's own first prediction on the screen (指示書 第7.1節 手順2): the problem's sentences, plain outlines of one
// length with no segment and no junior's world, an optional "1" card, and one tap on who has more.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readingsFor, spokenText } from "@kimi/core";
import { ui } from "./flow/text.ts";
import { FakeSpeaker } from "./voice/fake.ts";
import { App } from "./App.tsx";
import { hasForbiddenPhrase } from "./flow/text.ts";

afterEach(cleanup);

describe("the child's first prediction on the screen", () => {
  it("shows outlines and the question first; the card toggles; one tap goes on to the junior's world", async () => {
    render(<App stepFlow={false} home={false} firstProblemId="p_signboard" storeName="kimi-app-guess" api={null} />);
    fireEvent.click(await screen.findByTestId("btn-next"));
    fireEvent.click(await screen.findByTestId("btn-consent-yes"));
    expect(await screen.findByTestId("screen-guess")).toBeTruthy();
    // No junior's world and no junior's line yet (the junior itself listens beside the question); the outlines carry no segment.
    expect(document.querySelector('[data-role="stage-holder"], [data-role="tape"], [data-role="world-card"]')).toBeNull();
    expect(document.querySelector('[data-role="junior-beside"] [data-role="kohai"]')).not.toBeNull();
    expect(screen.queryByTestId("junior-line")).toBeNull();
    expect(screen.queryByTestId("predict")).toBeNull();
    const tape = screen.getByTestId("guess-tape-h_ani");
    fireEvent.click(tape);
    expect(tape.getAttribute("aria-pressed")).toBe("true");
    expect(tape.querySelector('[data-role="reference_mark"]')).not.toBeNull();
    fireEvent.click(tape);
    expect(tape.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByTestId("guess-tape-h_otouto"));
    expect(hasForbiddenPhrase(document.body.textContent ?? "")).toBe(false);
    fireEvent.click(screen.getByTestId("btn-guess-h_ani"));
    expect(await screen.findByTestId("predict")).toBeTruthy();
    expect(screen.queryByTestId("screen-guess")).toBeNull();
  });

  // Safety review, 2026-11-07: a child who listens must hear what is asked and which button is whom.
  it("reads aloud the problem, then the card line, the question and each button's name", async () => {
    const sp = new FakeSpeaker();
    render(<App stepFlow={false} home={false} firstProblemId="p_signboard" storeName="kimi-app-guess-read" api={null} speaker={sp} />);
    fireEvent.click(await screen.findByTestId("btn-next"));
    fireEvent.click(await screen.findByTestId("btn-consent-yes"));
    await screen.findByTestId("screen-guess");
    fireEvent.click(screen.getByTestId("btn-read-aloud"));
    for (let i = 0; i < 30 && sp.spoken.length > 0; i++) {
      const before = sp.spoken.length;
      act(() => sp.finish());
      if (sp.spoken.length === before) break;
    }
    const said = sp.spoken.map((u) => u.text);
    const g = ui("ja").problem.guess;
    expect(said).toContain(g.question);
    expect(said).toContain(`${g.card} ${g.optional}`);
    expect(said).toContain(g.unknown);
    const r = readingsFor("p_signboard");
    for (const label of ["兄", "弟"]) expect(said).toContain(spokenText(label, r));
  });

  it("puts furigana on the holders' names when furigana is on", async () => {
    render(<App stepFlow={false} home={false} firstProblemId="p_signboard" storeName="kimi-app-guess-ruby" api={null} />);
    fireEvent.click(await screen.findByTestId("btn-next"));
    fireEvent.click(await screen.findByTestId("btn-consent-yes"));
    await screen.findByTestId("screen-guess");
    const furi = screen.queryByTestId("btn-furigana");
    if (furi !== null && furi.getAttribute("aria-pressed") !== "true") fireEvent.click(furi);
    expect(screen.getByTestId("btn-guess-h_ani").querySelector("rt")).not.toBeNull();
    expect(screen.getByTestId("guess-tapes").querySelector("span rt")).not.toBeNull();
  });
});
