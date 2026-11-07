// @vitest-environment jsdom
// Reading support for children who find reading hard (指示書 第8.4b節 読みの配慮, 第1節): a 「読み上げ」 button reads
// the problem's sentences with the browser's speech synthesis, one by one, lighting the sentence being read, and
// a stop button; ruby readings over the kanji, with a 「ふりがな」 switch kept on the device. The problem text has
// no answer, and nothing else is read. Written before the implementation.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FRACTION_BANK, UI_READINGS, readingsFor, rubySegments, spokenText, type Lang } from "@kimi/core";
import { App } from "./App.tsx";
import { CheckMode } from "./check/CheckMode.tsx";
import { ui } from "./flow/text.ts";
import { openStore, type FlowStore } from "./store/store.ts";
import { FakeSpeaker } from "./voice/fake.ts";
import { plainText } from "./plain-text.ts";

const stores: FlowStore[] = [];
afterEach(async () => {
  cleanup();
  for (const s of stores.splice(0)) await s.close();
});

let n = 0;
async function ready(lang: Lang = "ja"): Promise<{ name: string; store: FlowStore }> {
  const name = `kimi-app-reading-${String(++n)}`;
  const st = openStore(name);
  stores.push(st);
  await st.setConsent(true);
  await st.setIntroSeen(true);
  await st.setLang(lang);
  return { name, store: st };
}

const signboard = FRACTION_BANK.find((r) => r.world.problem_id === "p_signboard");
if (signboard === undefined) throw new Error("the signboard problem is in the bank");
const reading = () => [...document.querySelectorAll('[data-reading="true"]')];
/** The text of an element without its ruby readings. */
function plain(el: Element): string {
  const c = el.cloneNode(true) as Element;
  for (const rt of c.querySelectorAll("rt")) rt.remove();
  return c.textContent ?? "";
}

describe("「読み上げ」 on the problem screen", () => {
  it("reads the sentences one by one in Japanese, a little slower, lighting the one being read, then the junior's line", async () => {
    const { name } = await ready();
    const sp = new FakeSpeaker();
    render(<App storeName={name} api={null} speaker={sp} />);
    // Past the child's own first prediction, on the screen with the junior's line.
    fireEvent.click(await screen.findByTestId("btn-guess-unknown"));
    const btn = await screen.findByTestId("btn-read-aloud");
    expect(plain(btn)).toBe("読み上げ");
    expect(btn.querySelector("rt")?.textContent).toBe("よ");
    fireEvent.click(btn);
    for (const s of signboard.statements) {
      const last = sp.spoken.at(-1);
      expect(last?.text).toBe(spokenText(s.text, readingsFor("p_signboard")));
      expect(last?.lang).toBe("ja-JP");
      expect(last?.rate).toBeLessThan(1);
      expect(last?.rate).toBeGreaterThanOrEqual(0.7);
      expect(reading().map((e) => e.getAttribute("data-statement"))).toEqual([String(s.index)]);
      act(() => sp.finish());
    }
    const line = screen.getByTestId("junior-line");
    if (line.textContent !== "…") {
      expect(sp.spoken.at(-1)?.text).toBe(plainText(line));
      expect(line.getAttribute("data-reading")).toBe("true");
      act(() => sp.finish());
    }
    expect(reading()).toEqual([]);
    expect(screen.getByTestId("btn-read-aloud")).toBeTruthy();
    // Only the problem's sentences and the junior's line were read: never the answer (8).
    for (const u of sp.spoken) expect(u.text).not.toContain("8");
  });

  it("stops at once with the stop button, and nothing stays lit", async () => {
    const { name } = await ready();
    const sp = new FakeSpeaker();
    render(<App storeName={name} api={null} speaker={sp} />);
    fireEvent.click(await screen.findByTestId("btn-read-aloud"));
    expect(reading().length).toBe(1);
    const stop = screen.getByTestId("btn-read-stop");
    expect(plain(stop)).toBe("止める");
    fireEvent.click(stop);
    expect(sp.cancels).toBeGreaterThan(0);
    expect(reading()).toEqual([]);
    expect(sp.spoken.length).toBe(1);
    // A late end of the stopped utterance reads nothing more.
    act(() => sp.finish());
    expect(sp.spoken.length).toBe(1);
  });

  it("is not offered when the browser cannot speak", async () => {
    const { name } = await ready();
    render(<App storeName={name} api={null} speaker={new FakeSpeaker(false)} />);
    fireEvent.click(await screen.findByTestId("btn-guess-unknown"));
    await screen.findByTestId("btn-predict-fits");
    expect(screen.queryByTestId("btn-read-aloud")).toBeNull();
  });

  it("on the English screen: the button in English, the problem in Japanese, the junior's line in English", async () => {
    const { name } = await ready("en");
    const sp = new FakeSpeaker();
    render(<App storeName={name} api={null} speaker={sp} />);
    // Past the child's own first prediction, on the screen with the junior's line.
    fireEvent.click(await screen.findByTestId("btn-guess-unknown"));
    const btn = await screen.findByTestId("btn-read-aloud");
    expect(btn.textContent).toBe("Read aloud");
    fireEvent.click(btn);
    expect(sp.spoken[0]?.lang).toBe("ja-JP");
    for (let i = 0; i < signboard.statements.length; i++) act(() => sp.finish());
    if (screen.getByTestId("junior-line").textContent !== "…") expect(sp.spoken.at(-1)?.lang).toBe("en-US");
  });
});

describe("ふりがな", () => {
  it("is on at first: ruby readings over the kanji of the sentences and the fixed lines", async () => {
    const { name } = await ready();
    render(<App storeName={name} api={null} speaker={new FakeSpeaker()} />);
    fireEvent.click(await screen.findByTestId("btn-guess-unknown"));
    await screen.findByTestId("btn-predict-fits");
    const rts = [...document.querySelectorAll('[data-statement] rt')].map((e) => e.textContent);
    expect(rts).toEqual(expect.arrayContaining(["あに", "きんぎょ", "ぴき", "おとうと", "なん", "びき"]));
    const toggle = screen.getByTestId("btn-furigana");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('[data-testid="predict-question"] ruby')).not.toBeNull();
    fireEvent.click(screen.getByTestId("btn-predict-fits"));
    expect(document.querySelector('[data-testid="looking-line"] rt')?.textContent).toBe("ふだ");
    // The words are still the problem's own (each word a button, the text unchanged without the readings).
    const first = document.querySelector('[data-statement="0"]');
    const plain = [...(first?.querySelectorAll("button") ?? [])].map((b) => [...b.childNodes].map((c) => (c.nodeName === "RUBY" ? (c.firstChild?.textContent ?? "") : (c.textContent ?? ""))).join(""));
    expect(plain.join("")).toBe(signboard.statements[0]?.text);
  });

  it("turns off with the switch, and the choice is kept on the device", async () => {
    const { name, store } = await ready();
    render(<App storeName={name} api={null} speaker={new FakeSpeaker()} />);
    fireEvent.click(await screen.findByTestId("btn-guess-unknown"));
    await screen.findByTestId("btn-predict-fits");
    fireEvent.click(screen.getByTestId("btn-furigana"));
    expect(document.querySelector("[data-statement] ruby")).toBeNull();
    expect(screen.getByTestId("btn-furigana").getAttribute("aria-pressed")).toBe("false");
    await waitFor(async () => expect(await store.getFurigana()).toBe(false));
    cleanup();
    render(<App storeName={name} api={null} speaker={new FakeSpeaker()} />);
    fireEvent.click(await screen.findByTestId("btn-guess-unknown"));
    await screen.findByTestId("btn-predict-fits");
    await waitFor(() => expect(screen.getByTestId("btn-furigana").getAttribute("aria-pressed")).toBe("false"));
    expect(document.querySelector("[data-statement] ruby")).toBeNull();
  });

  it("every kanji of the fixed lines that get ruby has a reading", () => {
    const t = ui("ja");
    for (const line of [t.problem.looking, t.problem.predict.question, t.problem.guess.label, t.problem.guess.question, t.problem.guess.unknown, t.problem.guess.card, t.problem.guess.optional, t.reading.aloud, t.reading.stop, t.reading.label]) {
      for (const seg of rubySegments(line, UI_READINGS)) if (seg.ruby === null) expect(/[一-鿿]/.test(seg.text), `${seg.text} in ${line}`).toBe(false);
    }
  });
});

describe("the AI-free check", () => {
  it("reads its problem aloud and shows the ruby too", async () => {
    const { store } = await ready();
    const sp = new FakeSpeaker();
    render(<CheckMode store={store} lang="ja" onExit={() => undefined} speaker={sp} furigana onFurigana={() => undefined} />);
    const list = await screen.findByTestId("check-problem");
    const id = list.getAttribute("data-problem-id") ?? "";
    const r = FRACTION_BANK.find((x) => x.world.problem_id === id);
    expect(list.querySelector("rt")).not.toBeNull();
    fireEvent.click(screen.getByTestId("btn-read-aloud"));
    expect(sp.spoken[0]?.text).toBe(spokenText(r?.statements[0]?.text ?? "", readingsFor(id)));
    expect(list.querySelector('[data-reading="true"]')).not.toBeNull();
    for (let i = 0; i < (r?.statements.length ?? 0); i++) act(() => sp.finish());
    expect(sp.spoken.length).toBe(r?.statements.length);
    const answer = String(r?.expected_answer?.num);
    for (const u of sp.spoken) expect(u.text).not.toContain(answer);
  });
});
