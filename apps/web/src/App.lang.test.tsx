// @vitest-environment jsdom
// The English screen (HANDOFF §7 の4; 指示書 第11節 M8, 第1節 原則1・7・10・11): a language switch on the intro
// and parent screens, remembered on the device; every word of the screens in English except the problem as
// written, its holders and items, and the helplines' names. Written before the implementation.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FRACTION_BANK, readingsFor, type ProblemRecord } from "@kimi/core";
import { App } from "./App.tsx";
import { CheckMode } from "./check/CheckMode.tsx";
import { openStore, type FlowStore } from "./store/store.ts";
import { hasForbiddenPhrase, helplinesFor } from "./flow/text.ts";
import { plainText } from "./plain-text.ts";

const stores: FlowStore[] = [];
afterEach(async () => {
  cleanup();
  for (const s of stores.splice(0)) await s.close();
});

/** Japanese letters and the full-width marks Japanese text uses. */
const JAPANESE = /[\u3000-\u303f\u3040-\u30ff\u3400-\u9fff\uff01-\uff60]/;

/** The language switch names each language in its own words. */
const SWITCH_NAMES = ["日本語"];
/** The drawn mark for what is not known yet: a symbol of the drawing, the same in both languages (原則1). */
const DRAWN_MARKS = ["？"];

function allowedFrom(records: readonly ProblemRecord[]): string[] {
  const out: string[] = [...SWITCH_NAMES, ...DRAWN_MARKS, ...helplinesFor("en").map((h) => h.name)];
  for (const r of records) {
    for (const st of r.statements) out.push(st.text, ...st.tokens);
    out.push(...r.world.holders.map((h) => h.label), ...r.world.item_kinds.flatMap((k) => [k.noun, k.counter]));
    // The furigana over the problem's kanji are part of the problem as written (指示書 第8.4b節).
    out.push(...Object.values(readingsFor(r.world.problem_id)).flatMap((v) => v.split("|")));
  }
  return out.filter((x) => x !== "").sort((a, b) => b.length - a.length);
}

/** The page's text with the ruby readings taken out (pageWords lists them on their own). */
function bodyText(): string {
  const c = document.body.cloneNode(true) as Element;
  for (const rt of c.querySelectorAll("rt")) rt.remove();
  return c.textContent ?? "";
}

/** Every word on the page, visible or spoken (text, ruby readings and aria labels). */
function pageWords(): string {
  const labels = [...document.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label") ?? "");
  const rubies = [...document.querySelectorAll("rt")].map((e) => e.textContent ?? "");
  return [bodyText(), ...rubies, ...labels].join("\n");
}

function expectEnglishOnly(records: readonly ProblemRecord[] = FRACTION_BANK): void {
  const rest = allowedFrom(records).reduce((acc, x) => acc.replaceAll(x, " "), pageWords());
  const left = rest.match(new RegExp(`.{0,20}${JAPANESE.source}.{0,20}`, "u"));
  expect(left?.[0] ?? null).toBeNull();
}

describe("the language switch", () => {
  it("switches the intro to English, and the choice stays after the app is opened again", async () => {
    const name = "kimi-app-lang-1";
    render(<App storeName={name} api={null} parentHoldMs={0} />);
    await screen.findByTestId("btn-next");
    expect(plainText(screen.getByRole("heading", { level: 1 }))).toBe("後輩と問題を読もう");
    fireEvent.click(screen.getByTestId("lang-en"));
    expect(await screen.findByText("Start")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Read problems with the junior");
    expect(screen.getByTestId("lang-en").getAttribute("aria-pressed")).toBe("true");
    expectEnglishOnly();
    cleanup();
    render(<App storeName={name} api={null} parentHoldMs={0} />);
    expect(await screen.findByText("Start")).toBeTruthy();
    expect(screen.getByTestId("btn-stop").textContent).toBe("Stop");
  });

  it("goes through consent to the first problem in English, with the problem as written and a note", async () => {
    const store = openStore("kimi-app-lang-2");
    stores.push(store);
    await store.setLang("en");
    render(<App storeName="kimi-app-lang-2" api={null} parentHoldMs={0} />);
    fireEvent.click(await screen.findByTestId("btn-next"));
    expect(await screen.findByText("I agree")).toBeTruthy();
    expectEnglishOnly();
    fireEvent.click(screen.getByTestId("btn-consent-yes"));
    expect(await screen.findByText("The problem is written in Japanese.")).toBeTruthy();
    const sign = FRACTION_BANK.find((r) => r.world.problem_id === "p_signboard") as ProblemRecord;
    for (const s of sign.statements) expect(bodyText()).toContain(s.text);
    expectEnglishOnly([sign]);
    // The child's own first prediction comes first, in English (指示書 第7.1節 手順2).
    expect(screen.getByTestId("guess-question").textContent).toBe("Who has more, do you think?");
    fireEvent.click(screen.getByTestId("btn-guess-h_ani"));
    expectEnglishOnly([sign]);
    // The prediction about the junior's world, in English, before any sentence lights.
    expect(screen.getByTestId("predict-question").textContent).toBe("Does this world fit the problem?");
    fireEvent.click(screen.getByTestId("btn-predict-odd"));
    expectEnglishOnly([sign]);
    for (const t of [...document.querySelectorAll("button, p, h1, h2, li")].map((e) => e.textContent ?? "")) expect(hasForbiddenPhrase(t), t).toBe(false);
  });

  it("the hard screen in English keeps the four helplines in Japan, with an English line about them", async () => {
    const store = openStore("kimi-app-lang-3");
    stores.push(store);
    await store.setLang("en");
    render(<App storeName="kimi-app-lang-3" api={null} parentHoldMs={0} />);
    fireEvent.click(await screen.findByTestId("btn-hard"));
    const list = await screen.findByTestId("helplines");
    expect(list.querySelectorAll("li")).toHaveLength(4);
    for (const h of helplinesFor("ja")) expect(list.textContent).toContain(h.number);
    const page = document.body.textContent ?? "";
    expect(page).toContain("These are free phone lines in Japan.");
    expect(page).toContain("speak Japanese");
    expect(page).toContain("show this screen to a grown-up you trust");
    // Each line says in plain English what it is, next to its Japanese name.
    for (const h of helplinesFor("en")) {
      expect(h.about ?? "").not.toBe("");
      expect(list.textContent).toContain(`${h.name} (${h.about ?? ""})`);
    }
    for (const t of [...document.querySelectorAll("button, p, h1, h2, li")].map((e) => e.textContent ?? "")) expect(hasForbiddenPhrase(t), t).toBe(false);
    expectEnglishOnly();
  });

  it("the parent screen is in English and can switch back to Japanese", async () => {
    const store = openStore("kimi-app-lang-4");
    stores.push(store);
    await store.setLang("en");
    render(<App storeName="kimi-app-lang-4" api={null} parentHoldMs={0} />);
    fireEvent.pointerDown(await screen.findByTestId("btn-parent"));
    expect(await screen.findByText("Delete all records")).toBeTruthy();
    expectEnglishOnly();
    fireEvent.click(screen.getByTestId("lang-ja"));
    expect(await screen.findByText("記録をすべて消す")).toBeTruthy();
    expect((await store.getSettings()).lang).toBe("ja");
  });

  it("the AI-free check in English: the problem as written, a note, English words around it", async () => {
    const store = openStore("kimi-app-lang-5");
    stores.push(store);
    render(<CheckMode store={store} lang="en" onExit={() => {}} />);
    const el = await screen.findByTestId("check-problem");
    const r = FRACTION_BANK.find((x) => x.world.problem_id === el.getAttribute("data-problem-id")) as ProblemRecord;
    expect(screen.getByText("The problem is written in Japanese.")).toBeTruthy();
    expectEnglishOnly([r]);
    for (const d of String((r.expected_answer as { num: number }).num)) fireEvent.click(screen.getByTestId(`pad-${d}`));
    fireEvent.click(screen.getByTestId("pad-ok"));
    expect(await screen.findByText("Your answer is saved.")).toBeTruthy();
    expectEnglishOnly([r]);
    fireEvent.click(screen.getByTestId("btn-hard"));
    expect(await screen.findByTestId("helplines")).toBeTruthy();
    expectEnglishOnly([r]);
  });
});
