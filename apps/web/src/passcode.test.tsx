// @vitest-environment jsdom
// The public judge build: before anything else the page asks for the judges' passcode, checks it with the worker
// (POST /pass, which never reaches Claude), and sends it with every call. A local build never asks.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Root } from "./Root.tsx";
import { createHttpApi } from "./flow/api.ts";
import { PASS_HEADER, getPasscode, setPasscode } from "./flow/passcode.ts";

afterEach(() => {
  cleanup();
  setPasscode(null);
  vi.unstubAllGlobals();
});

function stubWorker(pass: string) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
      calls.push({ url: String(url), headers });
      if (headers[PASS_HEADER] !== pass) return new Response(JSON.stringify({ error: "passcode" }), { status: 401 });
      if (String(url).endsWith("/pass")) return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ flag: "none" }), { status: 200 });
    }),
  );
  return calls;
}

describe("the judges' passcode", () => {
  it("asks first, refuses a wrong one, and opens the app with the right one", async () => {
    stubWorker("zz-right");
    render(<Root requirePasscode />);
    expect(await screen.findByTestId("pass-gate")).toBeTruthy();
    expect(screen.queryByTestId("screen-home")).toBeNull();
    fireEvent.change(screen.getByTestId("input-pass"), { target: { value: "zz-wrong" } });
    fireEvent.click(screen.getByTestId("btn-pass"));
    expect(await screen.findByTestId("pass-bad")).toBeTruthy();
    expect(getPasscode()).toBeNull();
    fireEvent.change(screen.getByTestId("input-pass"), { target: { value: "zz-right" } });
    fireEvent.click(screen.getByTestId("btn-pass"));
    expect(await screen.findByTestId("screen-home")).toBeTruthy();
    expect(getPasscode()).toBe("zz-right");
  });

  it("does not ask again in the same tab once it was right", async () => {
    setPasscode("zz-right");
    render(<Root requirePasscode />);
    expect(await screen.findByTestId("screen-home")).toBeTruthy();
    expect(screen.queryByTestId("pass-gate")).toBeNull();
  });

  it("is never asked by a local build", async () => {
    render(<Root requirePasscode={false} api={null} />);
    expect(await screen.findByTestId("screen-home")).toBeTruthy();
    expect(screen.queryByTestId("pass-gate")).toBeNull();
  });

  it("sends the passcode with every call to the worker, and nothing when there is none", async () => {
    const calls = stubWorker("zz-right");
    const api = createHttpApi("https://worker.example.com");
    await api.safety("hi", new AbortController().signal).catch(() => undefined);
    expect(calls[0]?.headers[PASS_HEADER]).toBeUndefined();
    setPasscode("zz-right");
    await api.safety("hi", new AbortController().signal);
    await waitFor(() => expect(calls[1]?.headers[PASS_HEADER]).toBe("zz-right"));
  });
});
