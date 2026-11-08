// The worker hosted on Cloudflare for the judges (the public judge build): the bundled stored problems equal the
// files the local worker reads, the bank is the same, and the settings come from the Cloudflare environment only.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUNDLE_PATH, storedBundle } from "./stored-bundle.ts";
import { workerBank } from "./stored.ts";
import { accessOf, bankOf } from "./cf.ts";

describe("the bundled stored problems", () => {
  it("equal content/problems (run `pnpm --filter @kimi/worker bundle:stored` after changing them)", () => {
    expect(JSON.parse(readFileSync(BUNDLE_PATH, "utf8"))).toEqual(storedBundle());
  });

  it("make the same bank as the local worker", () => {
    expect(bankOf().map((r) => r.world.problem_id)).toEqual(workerBank().map((r) => r.world.problem_id));
  });
});

describe("accessOf", () => {
  it("reads the page's origins, the worker's host names and the passcode from the environment", () => {
    const a = accessOf({ ALLOWED_ORIGINS: "https://a.pages.dev, https://b.example.com", WORKER_HOSTS: "w.example.workers.dev", JUDGE_PASSCODE: "zz-pass" });
    expect(a.origins).toEqual(["https://a.pages.dev", "https://b.example.com"]);
    expect(a.hosts).toEqual(["w.example.workers.dev"]);
    expect(a.passcode()).toBe("zz-pass");
  });

  it("is closed when nothing is set: no origin, no host, no passcode", () => {
    const a = accessOf({});
    expect(a.origins).toEqual([]);
    expect(a.hosts).toEqual([]);
    expect(a.passcode()).toBeNull();
  });
});
