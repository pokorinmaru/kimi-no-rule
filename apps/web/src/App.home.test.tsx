// @vitest-environment jsdom
// The top page and the way back (Q60): the app opens on a top page where the child may type a name; the first problem
// is the festival story with that name in it; from any of the child's screens 「トップへ」 goes back to the top page,
// where 「さいしょから」 starts again from the first problem; 「この問題をさいしょから」 takes the open problem back to
// its first step. The name is shown only: it is kept on this device, and no request the session sends holds it.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FESTIVAL_PLACEHOLDER } from "@kimi/core";
import { App } from "./App.tsx";
import { ui } from "./flow/text.ts";

afterEach(cleanup);
const t = ui("ja");
/** The text of an element without its furigana. */
const plain = (el: Element): string => {
  const c = el.cloneNode(true) as Element;
  c.querySelectorAll("rt").forEach((r) => r.remove());
  return c.textContent ?? "";
};

async function toProblem(storeName: string, name: string | null, api: Parameters<typeof App>[0]["api"] = null) {
  render(<App storeName={storeName} api={api} />);
  expect(await screen.findByTestId("screen-home")).toBeTruthy();
  if (name !== null) fireEvent.change(screen.getByTestId("input-name"), { target: { value: name } });
  fireEvent.click(screen.getByTestId("btn-home-start"));
  fireEvent.click(await screen.findByTestId("btn-next"));
  fireEvent.click(await screen.findByTestId("btn-consent-yes"));
  return screen.findByTestId("screen-guess");
}

describe("the top page", () => {
  it("opens first, with the lead, the name box and one start button, and the grown-ups' door", async () => {
    render(<App storeName="kimi-home-open" api={null} />);
    const home = await screen.findByTestId("screen-home");
    for (const l of t.home.lead) expect(plain(home)).toContain(l);
    expect(screen.getByLabelText(t.home.nameLabel)).toBe(screen.getByTestId("input-name"));
    expect(screen.getByTestId("btn-home-start").textContent).toContain(t.home.start);
    expect(screen.queryByTestId("btn-home-resume")).toBeNull();
    expect(screen.getByTestId("btn-parent")).toBeTruthy();
    // The three buttons are on the top page too (原則7・8; code and safety review, 2026-11-08).
    for (const id of ["btn-stop", "btn-dont-know", "btn-hard"]) expect(screen.getByTestId(id)).toBeTruthy();
  });

  it("「つらい」 on the top page goes to the hard screen", async () => {
    render(<App storeName="kimi-home-hard" api={null} />);
    await screen.findByTestId("screen-home");
    fireEvent.click(screen.getByTestId("btn-hard"));
    expect(await screen.findByTestId("screen-hard")).toBeTruthy();
    expect(screen.queryByTestId("screen-home")).toBeNull();
  });

  it("deleting every record from the grown-up's screen takes the name off the screen too", async () => {
    render(<App storeName="kimi-home-delete" api={null} parentHoldMs={0} />);
    await screen.findByTestId("screen-home");
    fireEvent.change(screen.getByTestId("input-name"), { target: { value: "ゆい" } });
    fireEvent.pointerDown(screen.getByTestId("btn-parent"));
    fireEvent.click(await screen.findByRole("button", { name: t.parent.deleteAsk }));
    fireEvent.click(await screen.findByTestId("btn-delete-all"));
    await waitFor(() => expect(screen.queryByTestId("btn-delete-all")).toBeNull());
    fireEvent.click(await screen.findByTestId("btn-parent-back"));
    expect(((await screen.findByTestId("input-name")) as HTMLInputElement).value).toBe("");
  });

  it("starts with the festival story, the child's name in it and AIくん beside it", async () => {
    await toProblem("kimi-home-name", "ゆい");
    const text = document.body.textContent ?? "";
    expect(text).toContain("なつまつり");
    expect(text).toContain("ゆい");
    expect(text).toContain("AIくん");
    expect(text).not.toContain(FESTIVAL_PLACEHOLDER);
    expect(text).not.toContain("後輩");
    expect(text).not.toContain("先輩");
  });

  it("without a name, the story keeps its own child's name", async () => {
    await toProblem("kimi-home-noname", null);
    expect(plain(document.body)).toContain(`${FESTIVAL_PLACEHOLDER}は金魚を`);
  });

  it("refuses a name with a number and says why, and keeps none", async () => {
    render(<App storeName="kimi-home-bad" api={null} />);
    await screen.findByTestId("screen-home");
    fireEvent.change(screen.getByTestId("input-name"), { target: { value: "ゆい3" } });
    expect(screen.getByTestId("name-bad").textContent).toBe(t.home.nameBad);
    fireEvent.click(screen.getByTestId("btn-home-start"));
    fireEvent.click(await screen.findByTestId("btn-next"));
    fireEvent.click(await screen.findByTestId("btn-consent-yes"));
    await screen.findByTestId("screen-guess");
    expect(document.body.textContent).not.toContain("ゆい3");
  });

  it("「トップへ」 goes back to the top page; 「つづきから」 returns to the same step, 「さいしょから」 to the first problem's start", async () => {
    await toProblem("kimi-home-back", "ゆい");
    fireEvent.click(screen.getByTestId("btn-guess-unknown"));
    await screen.findByTestId("predict");
    fireEvent.click(screen.getByTestId("btn-home"));
    expect(await screen.findByTestId("screen-home")).toBeTruthy();
    expect((screen.getByTestId("input-name") as HTMLInputElement).value).toBe("ゆい");
    fireEvent.click(screen.getByTestId("btn-home-resume"));
    expect(await screen.findByTestId("predict")).toBeTruthy();
    fireEvent.click(screen.getByTestId("btn-home"));
    fireEvent.click(await screen.findByTestId("btn-home-restart"));
    // The intro and consent were given on this device: the first problem opens on its first step again.
    expect(await screen.findByTestId("screen-guess")).toBeTruthy();
    expect(document.body.textContent).toContain("なつまつり");
  });

  it("「この問題をさいしょから」 takes the open problem back to its first step", async () => {
    await toProblem("kimi-home-restart", null);
    fireEvent.click(screen.getByTestId("btn-guess-unknown"));
    await screen.findByTestId("predict");
    fireEvent.click(screen.getByTestId("btn-problem-restart"));
    await waitFor(() => expect(screen.queryByTestId("predict")).toBeNull());
    expect(screen.getByTestId("screen-guess")).toBeTruthy();
  });

  it("never puts the name in what it sends", async () => {
    const sent: string[] = [];
    const record = (x: unknown) => {
      sent.push(JSON.stringify(x));
      return new Promise<never>(() => undefined);
    };
    const api = { kohai: record, interpret: record, research: record, scenes: record, safety: record } as never;
    await toProblem("kimi-home-private", "ゆい", api);
    fireEvent.click(screen.getByTestId("btn-guess-unknown"));
    await screen.findByTestId("predict");
    await waitFor(() => expect(sent.length).toBeGreaterThan(0));
    for (const s of sent) expect(s).not.toContain("ゆい");
  });
});
