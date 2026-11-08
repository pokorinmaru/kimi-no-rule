// @vitest-environment jsdom
// A way to the places to talk that the child can always take (第1節: a cry for help comes before the math). The
// 「つらい」 button was taken off the bar (Q64); instead the top page has a quiet 「こまったときは」 that opens the
// hard screen, and the end screen after 「やめる」 shows where to talk (safety review, 2026-11-08).
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { App } from "./App.tsx";

afterEach(cleanup);

describe("the way to the places to talk", () => {
  it("is on the top page, quietly, and opens the hard screen with the helplines", async () => {
    render(<App storeName="kimi-helpline-home" api={null} />);
    await screen.findByTestId("screen-home");
    fireEvent.click(screen.getByTestId("btn-home-help"));
    expect(await screen.findByTestId("screen-hard")).toBeTruthy();
    expect(screen.getByTestId("helplines")).toBeTruthy();
  });

  it("is on the end screen after 「やめる」", async () => {
    render(<App storeName="kimi-helpline-ended" api={null} home={false} />);
    fireEvent.click(await screen.findByTestId("btn-stop"));
    expect(await screen.findByTestId("screen-ended")).toBeTruthy();
    expect(screen.getByTestId("helplines")).toBeTruthy();
  });
});
