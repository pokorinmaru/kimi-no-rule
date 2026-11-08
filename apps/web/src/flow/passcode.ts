/// <reference types="vite/client" />
// The judges' passcode in the public judge build (SETUP.md). Kept for this tab only (sessionStorage), sent to the worker
// in one header with every call, and checked first with POST /pass, which never reaches Claude. A local build never
// asks. Storage can be blocked: then the passcode is kept in memory for this page only.

/** The header the worker reads the passcode from (the worker's PASS_HEADER). */
export const PASS_HEADER = "x-kimi-pass";

const KEY = "kimi-judge-pass";
let inMemory: string | null = null;

/** Whether this build asks for the passcode (VITE_REQUIRE_PASSCODE=1 when built for the judges). */
export const REQUIRE_PASSCODE: boolean = (import.meta.env["VITE_REQUIRE_PASSCODE"] as string | undefined) === "1";

export function getPasscode(): string | null {
  try {
    return sessionStorage.getItem(KEY) ?? inMemory;
  } catch {
    return inMemory;
  }
}

export function setPasscode(pass: string | null): void {
  inMemory = pass;
  try {
    if (pass === null) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, pass);
  } catch {
    // storage blocked: memory only
  }
}

/** Asks the worker whether the passcode is right (204), without reaching Claude. */
export async function checkPasscode(base: string, pass: string, fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<boolean> {
  try {
    const res = await fetchImpl(`${base}/pass`, { method: "POST", headers: { "content-type": "application/json", [PASS_HEADER]: pass }, body: "{}" });
    return res.status === 204;
  } catch {
    return false;
  }
}
