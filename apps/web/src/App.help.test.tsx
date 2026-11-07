// @vitest-environment jsdom
// 指示書 第7.1節 手順4・5 and 第11節 M7 on the screen: 「わからない」 opens the junior's staged questions (the relation
// words lit and read aloud, "which is longer?" with two holder buttons, the word book offered), and the word book
// draws an everyday example as tapes with the "1" card on the holder its wording takes as 1. On every one of these
// screens: the three buttons, the AI mark, no answer and no operation, in both languages.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { hasOperationName, type Lang } from "@kimi/core";
import { App } from "./App.tsx";
import { hasForbiddenPhrase, ui } from "./flow/text.ts";
import { openStore, type FlowStore } from "./store/store.ts";
import { FakeSpeaker } from "./voice/fake.ts";

const stores: FlowStore[] = [];
afterEach(async () => {
  cleanup();
  for (const s of stores.splice(0)) await s.close();
});

let n = 0;
async function ready(lang: Lang = "ja"): Promise<string> {
  const name = `kimi-app-help-${String(++n)}`;
  const st = openStore(name);
  stores.push(st);
  await st.setConsent(true);
  await st.setIntroSeen(true);
  await st.setLang(lang);
  return name;
}

/** What every help and word book screen keeps: the three buttons, the AI mark, and nothing that gives the signboard away. */
function keepsTheRules(lang: Lang): void {
  const b = ui(lang).buttons;
  expect(screen.getByTestId("btn-stop").textContent).toBe(b.stop);
  expect(screen.getByTestId("btn-dont-know").textContent).toBe(b.dontKnow);
  expect(screen.getByTestId("btn-hard").textContent).toBe(b.hard);
  expect(screen.getAllByText("AI").length).toBeGreaterThan(0);
  const text = document.querySelector("main")?.textContent ?? "";
  // The signboard's answer (8) and one part (2) are never on these screens; nor an operation or a judging word.
  expect(text).not.toMatch(/8匹|8 匹|2匹/);
  expect(hasOperationName(text)).toBe(false);
  expect(hasForbiddenPhrase(text)).toBe(false);
  // The junior's line never names who is taken as 1 (弟) or the other holder.
  const line = screen.getByTestId("junior-line").textContent ?? "";
  expect(line).not.toMatch(/弟|兄/);
}

describe("the junior's staged questions on the screen", () => {
  it.each(["ja", "en"] as const)("「わからない」 → lit words read aloud → which is longer → the word book (%s)", async (lang) => {
    const name = await ready(lang);
    const sp = new FakeSpeaker();
    render(<App storeName={name} api={null} speaker={sp} />);
    fireEvent.click(await screen.findByTestId("btn-guess-unknown"));
    fireEvent.click(await screen.findByTestId("btn-predict-odd"));
    fireEvent.click(screen.getByTestId("btn-dont-know"));
    // (a) Only the relation words of the failing sentence are lit, all the same way.
    const help = await screen.findByTestId("screen-help");
    expect(help.getAttribute("data-stage")).toBe("read");
    const lit = [...document.querySelectorAll('[data-role="lit-word"]')].map((e) => e.textContent);
    expect(lit).toEqual(["の", "の", "の"]);
    keepsTheRules(lang);
    // Read aloud: the lit sentence, then the junior's line.
    fireEvent.click(screen.getByTestId("btn-read-aloud"));
    expect(sp.spoken.at(-1)?.lang).toBe("ja-JP");
    act(() => sp.finish());
    expect(sp.spoken.at(-1)?.lang).toBe(lang === "ja" ? "ja-JP" : "en-US");
    act(() => sp.finish());
    // (b) Which is longer: the two holders, recorded, nothing judged.
    fireEvent.click(screen.getByTestId("btn-help-read"));
    expect(screen.getByTestId("screen-help").getAttribute("data-stage")).toBe("order");
    const holders = [...screen.getByTestId("help-order").querySelectorAll("button")].map((e) => {
      const c = e.cloneNode(true) as Element;
      for (const rt of c.querySelectorAll("rt")) rt.remove();
      return c.textContent;
    });
    expect(holders.sort()).toEqual(["兄", "弟"]);
    keepsTheRules(lang);
    fireEvent.click(screen.getByTestId("btn-order-h_otouto"));
    // (c) The word book is offered.
    expect(screen.getByTestId("screen-help").getAttribute("data-stage")).toBe("offer");
    keepsTheRules(lang);
    fireEvent.click(screen.getByTestId("btn-open-book"));
    const book = await screen.findByTestId("screen-wordbook");
    expect(book.getAttribute("data-page")).toBe("no");
    expect(screen.getByTestId("wordbook-title").textContent).toContain(lang === "ja" ? "の" : "of");
    // Drawn with the tapes, the "1" card on the holder the wording takes as 1.
    const tapes = book.querySelectorAll('[data-role="tape"]');
    expect(tapes.length).toBe(2);
    expect(book.querySelector('[data-role="tape"][data-unit="true"]')?.getAttribute("data-holder")).toBe("h_one");
    keepsTheRules(lang);
    fireEvent.click(screen.getByTestId("btn-book-close"));
    expect(await screen.findByTestId("looking-line")).toBeTruthy();
  });

  // Safety review, 2026-11-07: the help screen had no furigana on the sentences, names or buttons.
  it("puts furigana on the sentences, the holders' names and the buttons when furigana is on", async () => {
    const name = await ready("ja");
    render(<App storeName={name} api={null} />);
    fireEvent.click(await screen.findByTestId("btn-guess-unknown"));
    fireEvent.click(await screen.findByTestId("btn-predict-odd"));
    fireEvent.click(screen.getByTestId("btn-dont-know"));
    const help = await screen.findByTestId("screen-help");
    const furi = screen.getByTestId("btn-furigana");
    if (furi.getAttribute("aria-pressed") !== "true") fireEvent.click(furi);
    expect(help.querySelector("li rt")).not.toBeNull();
    expect(screen.getByTestId("btn-help-read").querySelector("rt")).not.toBeNull();
    fireEvent.click(screen.getByTestId("btn-help-read"));
    expect(screen.getByTestId("btn-order-h_ani").querySelector("rt")).not.toBeNull();
  });

  // Run-through, 2026-11-08: the word book's 白 and 黒 had no furigana with it on; read aloud as written too.
  it("puts furigana on the word book's page and reads its kanji by their readings", async () => {
    const name = await ready("ja");
    const sp = new FakeSpeaker();
    render(<App storeName={name} api={null} speaker={sp} />);
    fireEvent.click(await screen.findByTestId("btn-guess-unknown"));
    fireEvent.click(await screen.findByTestId("btn-predict-odd"));
    fireEvent.click(screen.getByTestId("btn-dont-know"));
    await screen.findByTestId("screen-help");
    fireEvent.click(screen.getByTestId("btn-help-read"));
    fireEvent.click(screen.getByTestId("btn-order-h_otouto"));
    fireEvent.click(screen.getByTestId("btn-open-book"));
    const book = await screen.findByTestId("screen-wordbook");
    const lines = [...book.querySelectorAll('[data-testid="wordbook-line"]')];
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l.querySelector("rt"), l.textContent ?? "").not.toBeNull();
    fireEvent.click(screen.getByTestId("btn-read-aloud"));
    for (let i = 0; i < 10; i++) act(() => sp.finish());
    const said = sp.spoken.map((u) => u.text).join("");
    expect(said).toContain("しろい");
    expect(said).not.toMatch(/白|黒/);
  });

  it("the word book opens by itself after the first fix on the session's first wording", async () => {
    const name = await ready();
    render(<App storeName={name} api={null} speaker={new FakeSpeaker()} />);
    fireEvent.click(await screen.findByTestId("btn-guess-unknown"));
    fireEvent.click(await screen.findByTestId("btn-predict-odd"));
    const card = await screen.findByRole("button", { name: /「1」/ });
    await act(async () => {
      fireEvent.pointerDown(card, { clientX: 10, clientY: 10, pointerId: 1 });
    });
    await act(async () => {
      fireEvent.pointerUp(card.closest("svg") as Element, { clientX: 10, clientY: 10, pointerId: 1 });
    });
    const target = document.querySelector('[data-drop-target="h_ani"]');
    if (target === null) throw new Error("drop target expected");
    await act(async () => {
      fireEvent.click(target);
    });
    fireEvent.click(await screen.findByTestId("btn-confirm-yes"));
    expect(await screen.findByTestId("screen-wordbook")).toBeTruthy();
    keepsTheRules("ja");
  });
});
