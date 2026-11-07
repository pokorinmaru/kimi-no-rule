// @vitest-environment jsdom
// The mic on the problem screen (指示書 第7.1節 手順5, 第11節 M6 with the browser's speech recognition): a big
// 「話して教える」 button on the looking and placed steps, the interim words live under the junior, and the
// card stays. Without the browser's API (Firefox) or with the microphone denied the button goes and a short
// line says to use the card. Written before the implementation.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TEMPLATES, type AnyOp, type Lang } from "@kimi/core";
import { App } from "./App.tsx";
import { openStore, type FlowStore } from "./store/store.ts";
import { FakeRecognizer } from "./voice/fake.ts";
import type { FlowApi } from "./flow/session.ts";
import { plainText } from "./plain-text.ts";

const SAID = "弟が1だよ、弟の金魚の3/4だから";
const toOtouto: AnyOp = { op: "set_relation_reference", target_id: "r_ratio", reference: "q_otouto", evidence: "" };

const stores: FlowStore[] = [];
afterEach(async () => {
  cleanup();
  for (const s of stores.splice(0)) await s.close();
});

let n = 0;
async function ready(lang: Lang = "ja"): Promise<string> {
  const name = `kimi-app-voice-${String(++n)}`;
  const st = openStore(name);
  stores.push(st);
  await st.setConsent(true);
  await st.setIntroSeen(true);
  await st.setLang(lang);
  return name;
}

function fakeApi(): { api: FlowApi; interpret: unknown[]; safety: string[] } {
  const interpret: unknown[] = [];
  const safety: string[] = [];
  return {
    interpret,
    safety,
    api: {
      kohai: () => Promise.reject(new Error("down")),
      research: () => Promise.reject(new Error("down")),
      safety: (t) => {
        safety.push(t);
        return Promise.resolve({ flag: "none" });
      },
      interpret: (b) => {
        interpret.push(b);
        return Promise.resolve({ status: "ok", ops: [toOtouto] });
      },
    },
  };
}

function speech(supported = true) {
  const made: FakeRecognizer[] = [];
  const langs: Lang[] = [];
  const factory = (lang: Lang) => {
    langs.push(lang);
    const r = new FakeRecognizer(lang, supported);
    made.push(r);
    return r;
  };
  return { factory, made, langs, last: () => made.at(-1) as FakeRecognizer };
}

describe("the mic on the problem screen", () => {
  it("offers 「話して教える」 after the prediction, shows the interim words, and the words heard place the card", async () => {
    const name = await ready();
    const { api, interpret, safety } = fakeApi();
    const sp = speech();
    render(<App storeName={name} api={api} speech={sp.factory} />);
    fireEvent.click(await screen.findByTestId("btn-guess-unknown"));
    fireEvent.click(await screen.findByTestId("btn-predict-fits"));
    const talk = await screen.findByTestId("btn-talk");
    expect(talk.textContent).toBe("話して教える");
    fireEvent.click(talk);
    const rec = sp.last();
    expect(rec.starts).toBe(1);
    expect(rec.lang).toBe("ja-JP");
    act(() => rec.onInterim?.("弟が"));
    expect((await screen.findByTestId("voice-interim")).textContent).toContain("弟が");
    act(() => rec.say(["弟が1"], SAID));
    await waitFor(() => expect(screen.getByTestId("btn-confirm-yes")).toBeTruthy());
    expect(plainText(screen.getByTestId("junior-line"))).toContain(SAID);
    expect(interpret).toEqual([{ problem_id: "p_signboard", transcript: SAID, lang: "ja" }]);
    expect(safety).toEqual([SAID]);
    // The interim words are gone once the words are final.
    expect(screen.queryByTestId("voice-interim")).toBeNull();
    // The card stays: the child can still move it.
    expect(document.querySelector('[data-role="reference_mark"]')).not.toBeNull();
  });

  it("shows the acknowledgement while the words are on their way", async () => {
    const name = await ready();
    const { api } = fakeApi();
    let release: () => void = () => undefined;
    api.interpret = () => new Promise((r) => (release = () => r({ status: "ok", ops: [toOtouto] })));
    const sp = speech();
    render(<App storeName={name} api={api} speech={sp.factory} />);
    fireEvent.click(await screen.findByTestId("btn-guess-unknown"));
    fireEvent.click(await screen.findByTestId("btn-predict-fits"));
    fireEvent.click(await screen.findByTestId("btn-talk"));
    act(() => sp.last().say([], SAID));
    await waitFor(() => expect(TEMPLATES["kohai.listening"].ja).toContain(plainText(screen.getByTestId("junior-line"))));
    expect(screen.queryByTestId("btn-talk")).toBeNull();
    await act(async () => {
      release();
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId("btn-confirm-yes")).toBeTruthy());
  });

  it("without the browser's speech recognition there is no mic, a short line, and the card works as before", async () => {
    const name = await ready();
    const { api } = fakeApi();
    render(<App storeName={name} api={api} speech={speech(false).factory} />);
    fireEvent.click(await screen.findByTestId("btn-guess-unknown"));
    fireEvent.click(await screen.findByTestId("btn-predict-fits"));
    expect((await screen.findByTestId("voice-note")).textContent).toBe("このブラウザでは、声は使えません。札で教えてね。");
    expect(screen.queryByTestId("btn-talk")).toBeNull();
    const card = await screen.findByRole("button", { name: /「1」/ });
    await act(async () => {
      fireEvent.pointerDown(card, { clientX: 10, clientY: 10, pointerId: 1 });
    });
    await act(async () => {
      fireEvent.pointerUp(card.closest("svg") as Element, { clientX: 10, clientY: 10, pointerId: 1 });
    });
    await act(async () => {
      fireEvent.click(document.querySelector('[data-drop-target="h_otouto"]') as Element);
    });
    expect(await screen.findByTestId("btn-confirm-yes")).toBeTruthy();
  });

  it("a denied microphone takes the mic away with a short line", async () => {
    const name = await ready();
    const { api } = fakeApi();
    const sp = speech();
    render(<App storeName={name} api={api} speech={sp.factory} />);
    fireEvent.click(await screen.findByTestId("btn-guess-unknown"));
    fireEvent.click(await screen.findByTestId("btn-predict-fits"));
    fireEvent.click(await screen.findByTestId("btn-talk"));
    act(() => sp.last().fail("denied"));
    expect((await screen.findByTestId("voice-note")).textContent).toBe("マイクが使えないので、札で教えてね。");
    expect(screen.queryByTestId("btn-talk")).toBeNull();
  });

  it("without a worker client there is no mic", async () => {
    const name = await ready();
    render(<App storeName={name} api={null} speech={speech().factory} />);
    fireEvent.click(await screen.findByTestId("btn-guess-unknown"));
    fireEvent.click(await screen.findByTestId("btn-predict-fits"));
    await screen.findByTestId("junior-line");
    expect(screen.queryByTestId("btn-talk")).toBeNull();
  });

  it("on the English screen listens in en-US with 'Tell by talking'", async () => {
    const name = await ready("en");
    const { api } = fakeApi();
    const sp = speech();
    render(<App storeName={name} api={api} speech={sp.factory} />);
    fireEvent.click(await screen.findByTestId("btn-guess-unknown"));
    fireEvent.click(await screen.findByTestId("btn-predict-fits"));
    const talk = await screen.findByTestId("btn-talk");
    expect(talk.textContent).toBe("Tell by talking");
    fireEvent.click(talk);
    expect(sp.last().lang).toBe("en-US");
    expect(sp.langs.every((l) => l === "en")).toBe(true);
  });
});
