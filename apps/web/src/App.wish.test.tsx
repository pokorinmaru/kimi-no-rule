// @vitest-environment jsdom
// A wish to AI-kun (Q61): from the top page the child tells AI-kun what was hard or what they want; the words stay on
// this device for the parent; only Claude's rephrasing, checked by core, can be sent, and only when the parent sends
// it (copied, never the child's words). A cry for help is never kept as a wish: the screen shows where to talk.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "./App.tsx";
import { ui } from "./flow/text.ts";
import type { FlowApi, WishReply } from "./flow/api.ts";

afterEach(cleanup);
const t = ui("ja");
/** The text of an element without its furigana. */
const plain = (el: Element): string => {
  const c = el.cloneNode(true) as Element;
  c.querySelectorAll("rt").forEach((r) => r.remove());
  return c.textContent ?? "";
};

function apiWith(reply: WishReply | Error) {
  const wish = vi.fn(async (...args: [string, AbortSignal]): Promise<WishReply> => {
    void args;
    if (reply instanceof Error) throw reply;
    return reply;
  });
  const api: FlowApi = {
    kohai: () => Promise.reject(new Error("off")),
    research: () => Promise.reject(new Error("off")),
    safety: () => Promise.reject(new Error("off")),
    wish,
  };
  return { api, wish };
}

async function sendWish(storeName: string, api: FlowApi | null, words: string, name?: string) {
  render(<App storeName={storeName} api={api} parentHoldMs={0} />);
  await screen.findByTestId("screen-home");
  if (name !== undefined) fireEvent.change(screen.getByTestId("input-name"), { target: { value: name } });
  fireEvent.click(screen.getByTestId("btn-wish"));
  expect(await screen.findByTestId("screen-wish")).toBeTruthy();
  fireEvent.change(screen.getByTestId("input-wish"), { target: { value: words } });
  fireEvent.click(screen.getByTestId("btn-wish-send"));
}

async function openParent() {
  fireEvent.click(await screen.findByTestId("btn-wish-back"));
  fireEvent.pointerDown(await screen.findByTestId("btn-parent"));
  return screen.findByTestId("parent-wishes");
}

describe("a wish to AI-kun", () => {
  it("is offered on the top page, and sends nothing while the box is empty", async () => {
    const { api, wish } = apiWith({ kind: "no_request" });
    render(<App storeName="kimi-wish-empty" api={api} />);
    await screen.findByTestId("screen-home");
    fireEvent.click(screen.getByTestId("btn-wish"));
    await screen.findByTestId("screen-wish");
    expect((screen.getByTestId("btn-wish-send") as HTMLButtonElement).disabled).toBe(true);
    expect(wish).not.toHaveBeenCalled();
  });

  it("thanks the child, and the parent reads the child's words and the rephrased request", async () => {
    const { api } = apiWith({ kind: "wish", request: "魚の絵が半分なのが分かりにくい" });
    await sendWish("kimi-wish-ok", api, "なんで魚が半分なの");
    expect(await screen.findByTestId("wish-done")).toBeTruthy();
    const list = await openParent();
    await waitFor(() => expect(list.textContent).toContain("なんで魚が半分なの"));
    expect(list.textContent).toContain("魚の絵が半分なのが分かりにくい");
  });

  it("sends the child's name to the server as the story's placeholder, never as typed", async () => {
    const { api, wish } = apiWith({ kind: "no_request" });
    await sendWish("kimi-wish-name", api, "ゆいは魚がわからない", "ゆい");
    await screen.findByTestId("wish-done");
    const sent = wish.mock.calls[0]?.[0] ?? "";
    expect(sent).not.toContain("ゆい");
  });

  it("copies only the rephrased request when the parent sends it, and marks it sent", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { api } = apiWith({ kind: "wish", request: "AIくんの言葉が長くて読みにくい" });
    await sendWish("kimi-wish-copy", api, "AIくんの話がながい zz-own-words");
    await screen.findByTestId("wish-done");
    await openParent();
    fireEvent.click(await screen.findByTestId("btn-wish-copy"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = String((writeText.mock.calls[0] as unknown[] | undefined)?.[0] ?? "");
    expect(copied).toContain("AIくんの言葉が長くて読みにくい");
    expect(copied).not.toContain("zz-own-words");
    expect(await screen.findByTestId("wish-sent")).toBeTruthy();
  });

  it("without a server, or when nothing can be rephrased, keeps the words for the parent with no request to send", async () => {
    await sendWish("kimi-wish-offline", null, "もっとはやくして");
    await screen.findByTestId("wish-done");
    const list = await openParent();
    await waitFor(() => expect(list.textContent).toContain("もっとはやくして"));
    expect(list.textContent).toContain(t.parent.wishNoRequest);
    expect(screen.queryByTestId("btn-wish-copy")).toBeNull();
  });

  it("on distress shows where to talk first; the parent sees only a mark and the date, never the words, and nothing to send", async () => {
    const { api } = apiWith({ kind: "distress" });
    await sendWish("kimi-wish-hard", api, "zz-heavy-words");
    const help = await screen.findByTestId("wish-hard");
    expect(plain(help)).toContain(t.hard.talk);
    expect(plain(help)).toContain(t.helpline.title);
    const list = await openParent();
    await waitFor(() => expect(screen.getByTestId("wish-heavy").textContent).toContain(t.parent.wishHeavy));
    expect(list.textContent).not.toContain("zz-heavy-words");
    expect(screen.queryByTestId("btn-wish-copy")).toBeNull();
  });

  it("has 「つらい」 on the wish screen, which shows where to talk", async () => {
    render(<App storeName="kimi-wish-hardbtn" api={null} />);
    await screen.findByTestId("screen-home");
    fireEvent.click(screen.getByTestId("btn-wish"));
    fireEvent.click(await screen.findByTestId("btn-wish-hard"));
    expect(plain(await screen.findByTestId("wish-hard"))).toContain(t.hard.talk);
  });

  it("when the server cannot judge (no server, an error, unchecked), thanks the child and gently offers 「つらい」", async () => {
    for (const [name, reply] of [["kimi-wish-unchecked", { kind: "unchecked" } as WishReply], ["kimi-wish-error", new Error("503")]] as const) {
      const { api } = apiWith(reply);
      await sendWish(name, api, "もっとはやくして");
      await screen.findByTestId("wish-done");
      expect(plain(screen.getByTestId("wish-unchecked"))).toContain(t.wish.unchecked);
      expect(screen.getByTestId("btn-wish-hard")).toBeTruthy();
      cleanup();
    }
  });

  it("checks the request again on the device before keeping it (a request core refuses is not kept)", async () => {
    const { api } = apiWith({ kind: "wish", request: "たろうくんが分からないと言っていた" });
    await sendWish("kimi-wish-recheck", api, "zz-words");
    await screen.findByTestId("wish-done");
    const list = await openParent();
    await waitFor(() => expect(list.textContent).toContain("zz-words"));
    expect(list.textContent).not.toContain("たろうくん");
    expect(screen.queryByTestId("btn-wish-copy")).toBeNull();
  });

  it("without an api given (the real app), reaches the local server's /wish with the default client", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith("/wish")) return new Response(JSON.stringify({ kind: "wish", request: "AIくんの言葉が長くて読みにくい" }), { status: 200 });
      return new Response("{}", { status: 503 });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      render(<App storeName="kimi-wish-default-api" parentHoldMs={0} />);
      await screen.findByTestId("screen-home");
      fireEvent.click(screen.getByTestId("btn-wish"));
      fireEvent.change(await screen.findByTestId("input-wish"), { target: { value: "ながい" } });
      fireEvent.click(screen.getByTestId("btn-wish-send"));
      await screen.findByTestId("wish-done");
      expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith("/wish"))).toBe(true);
      expect(screen.queryByTestId("wish-unchecked")).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("tells the parent the words go to Claude once, and to read the request before copying it", () => {
    expect(t.parent.wishLines.join("")).toContain("Claude");
    expect(t.parent.wishLines.join("")).toContain("Anthropic");
    expect(t.parent.wishLines.join("")).toContain("読んで確かめて");
  });

  it("gives an example without a number in it", () => {
    expect(t.wish.hint).not.toMatch(/[0-9０-９一二三四五六七八九十半倍分]/);
  });

  it("the parent can delete a wish", async () => {
    await sendWish("kimi-wish-del", null, "zz-delete-me");
    await screen.findByTestId("wish-done");
    const list = await openParent();
    await waitFor(() => expect(list.textContent).toContain("zz-delete-me"));
    fireEvent.click(await screen.findByTestId("btn-wish-delete"));
    await waitFor(() => expect(screen.getByTestId("parent-wishes").textContent).not.toContain("zz-delete-me"));
  });
});
