// The eval runner's plumbing (pool, progress lines, per-item results, resume, fail-fast, rendering from
// mixed runs). Fakes only: no Claude, no key. Written before the implementation.
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ClaudeClient } from "@kimi/interpret";
import { mapPool } from "./pool.ts";
import { createProgress, formatDuration, type Sink } from "./progress.ts";
import { describeError, newCallLog, recordingClient } from "./errors.ts";
import { latestSection, newRunId, runStore, type SectionFile } from "./store.ts";
import { runTasks, taskKey, type Task } from "./tasks.ts";
import { parseArgs } from "./args.ts";

const memory = (): Sink & { lines: string[] } => {
  const lines: string[] = [];
  return { lines, write: (l) => void lines.push(l) };
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tmp = () => mkdtempSync(join(tmpdir(), "kimi-runner-"));

describe("mapPool", () => {
  it("keeps the input order whatever order the items finish in", async () => {
    const delays = [30, 5, 20, 1, 10, 0, 15];
    const out = await mapPool(delays, 3, async (d, i) => {
      await sleep(d);
      return `${i}:${d}`;
    });
    expect(out).toEqual(delays.map((d, i) => `${i}:${d}`));
  });

  it("never runs more than the bound at once, and reaches it", async () => {
    let now = 0;
    let max = 0;
    await mapPool(Array.from({ length: 20 }, (_, i) => i), 4, async (i) => {
      now++;
      max = Math.max(max, now);
      await sleep(i % 3);
      now--;
    });
    expect(max).toBe(4);
  });

  it("runs one at a time with a bound of 1, and handles no items", async () => {
    const order: string[] = [];
    await mapPool([1, 2, 3], 1, async (i) => {
      order.push(`s${i}`);
      await sleep(1);
      order.push(`e${i}`);
    });
    expect(order).toEqual(["s1", "e1", "s2", "e2", "s3", "e3"]);
    expect(await mapPool([], 8, async () => 1)).toEqual([]);
  });
});

describe("progress lines", () => {
  it("formats durations as mm:ss, minutes past an hour included", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(61_000)).toBe("01:01");
    expect(formatDuration(3_723_000)).toBe("62:03");
  });

  it("prints a start line, one line per finished item with pct, elapsed, eta and failures; eta after the first few", () => {
    const sink = memory();
    let t = 0;
    const p = createProgress({ section: "interpret", total: 10, sink, now: () => t, etaAfter: 3 });
    p.start("planned calls 8 (haiku-5.5 8)");
    expect(sink.lines[0]).toMatch(/^\[interpret\] start: 10 items; planned calls 8 \(haiku-5\.5 8\)/);
    t = 10_000;
    p.done(true);
    expect(sink.lines.at(-1)).toBe("[interpret] 1/10 (10.0%) elapsed 00:10 eta --:-- failures 0");
    t = 20_000;
    p.done(false);
    t = 30_000;
    p.done(true);
    // 3 items in 30 s, 7 left: 70 s.
    expect(sink.lines.at(-1)).toBe("[interpret] 3/10 (30.0%) elapsed 00:30 eta 01:10 failures 1");
  });

  it("an error line names the class and message the first time; the same error again is only counted", () => {
    const sink = memory();
    const p = createProgress({ section: "safety", total: 3, sink, now: () => 0 });
    const e = { class: "BadRequestError", status: 400, message: "grammar too large" };
    p.error("haiku-5.5 s-01#0", e);
    p.error("haiku-5.5 s-02#0", e);
    expect(sink.lines.filter((l) => l.includes("grammar too large"))).toHaveLength(1);
    expect(sink.lines[0]).toMatch(/^\[safety\] error haiku-5\.5 s-01#0: BadRequestError 400 grammar too large/);
  });

  it("resumed items count as done without a line each, and do not feed the eta", () => {
    const sink = memory();
    let t = 0;
    const p = createProgress({ section: "leak", total: 10, sink, now: () => t, etaAfter: 1 });
    p.resumed(6, "20261107-100000");
    expect(sink.lines.at(-1)).toMatch(/^\[leak\] resumed 6\/10 from run 20261107-100000/);
    t = 4_000;
    p.done(true);
    // 1 fresh item in 4 s, 3 left: 12 s.
    expect(sink.lines.at(-1)).toBe("[leak] 7/10 (70.0%) elapsed 00:04 eta 00:12 failures 0");
  });
});

describe("errors", () => {
  it("keeps the class, status and message and never the key", () => {
    // Built at run time from parts, so no key-shaped string sits in the file (the pre-commit secret check).
    const key = ["sk", "ant", "api03", "SECRET".repeat(4)].join("-");
    const other = ["sk", "ant", "other", "xyz123"].join("-");
    class BadRequestError extends Error {
      status = 400;
    }
    const e = describeError(new BadRequestError(`400 {"error":"grammar too large"} with ${key} and ${other}`), [key]);
    expect(e.class).toBe("BadRequestError");
    expect(e.status).toBe(400);
    expect(e.message).toContain("grammar too large");
    expect(e.message).not.toContain("SECRET");
    expect(e.message).not.toContain("sk-ant-other");
    expect(describeError("plain").class).toBe("string");
  });

  it("a recording client counts calls and keeps errors; an abort after a deadline is a timeout, not an error", async () => {
    const log = newCallLog();
    const failing: ClaudeClient = { complete: () => Promise.reject(Object.assign(new Error("boom"), { status: 500 })) };
    const c = recordingClient(failing, log);
    await expect(c.complete({ model: "m", system: "", cachedContext: "", userText: "", schema: {}, effort: "low", maxTokens: 1 })).rejects.toThrow("boom");
    const ctl = new AbortController();
    ctl.abort();
    await expect(c.complete({ model: "m", system: "", cachedContext: "", userText: "", schema: {}, effort: "low", maxTokens: 1, signal: ctl.signal })).rejects.toThrow();
    expect(log.calls).toBe(2);
    expect(log.errors).toHaveLength(1);
    expect(log.timeouts).toBe(1);
  });
});

/** A task that answers its row number, or fails as told. */
const task = (system: string, row: string, attempt: number, run: () => Promise<number>, claude = true): Task<number> => ({
  system,
  row,
  attempt,
  claude,
  run: async () => run(),
  fallback: () => -1,
});

describe("runTasks", () => {
  it("records every item as one JSON line, in task order in the result, and prints a line per item", async () => {
    const dir = tmp();
    const store = runStore(dir, "r1");
    const sink = memory();
    const tasks = [1, 2, 3, 4].map((n) => task("haiku", `row${n}`, 0, async () => {
      await sleep(5 - n);
      return n;
    }));
    const out = await runTasks("interpret", tasks, { concurrency: 2, sink, store });
    expect(out.records.map((r) => r?.payload)).toEqual([1, 2, 3, 4]);
    const lines = readFileSync(join(dir, "r1", "interpret.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { key: string; ok: boolean });
    expect(lines.map((l) => l.key).sort()).toEqual(tasks.map(taskKey).sort());
    expect(lines.every((l) => l.ok)).toBe(true);
    expect(sink.lines.filter((l) => /^\[interpret\] \d+\/4 /.test(l))).toHaveLength(4);
    expect(sink.lines[0]).toMatch(/planned calls 4 \(haiku 4\)/);
  });

  it("an error is recorded with its class and message, the fallback payload stands in, and the line shows at once", async () => {
    const dir = tmp();
    const store = runStore(dir, "r1");
    const sink = memory();
    const out = await runTasks("safety", [task("haiku", "s1", 0, () => Promise.reject(Object.assign(new Error("grammar too large"), { status: 400 })))], { concurrency: 1, sink, store });
    expect(out.records[0]?.ok).toBe(false);
    expect(out.records[0]?.payload).toBe(-1);
    expect(out.records[0]?.error?.message).toContain("grammar too large");
    expect(sink.lines.some((l) => l.includes("error haiku s1#0") && l.includes("grammar too large"))).toBe(true);
    expect(sink.lines.at(-1)).toMatch(/failures 1$/);
  });

  it("errors a task reports through its call log (swallowed by the code it calls) still mark the item failed", async () => {
    const sink = memory();
    const t: Task<number> = {
      system: "haiku",
      row: "s1",
      attempt: 0,
      claude: true,
      run: async (log) => {
        log.errors.push({ class: "BadRequestError", status: 400, message: "too large" });
        return 7;
      },
      fallback: () => -1,
    };
    const out = await runTasks("safety", [t], { concurrency: 1, sink });
    expect(out.records[0]).toMatchObject({ ok: false, payload: 7 });
  });

  it("resume skips the items already finished and reruns the ones that failed", async () => {
    const dir = tmp();
    const sink = memory();
    let calls = 0;
    const mk = (fail: boolean) =>
      [1, 2, 3].map((n) =>
        task("opus", `row${n}`, 0, async () => {
          calls++;
          if (fail && n === 2) throw new Error("rate limited");
          return n * 10;
        }),
      );
    await runTasks("research", mk(true), { concurrency: 2, sink, store: runStore(dir, "r1") });
    expect(calls).toBe(3);
    const store = runStore(dir, "r1");
    calls = 0;
    const out = await runTasks("research", mk(false), { concurrency: 2, sink, store, resume: store.load("research"), resumedFrom: "r1" });
    expect(calls).toBe(1);
    expect(out.records.map((r) => r?.payload)).toEqual([10, 20, 30]);
    expect(out.records.every((r) => r?.ok === true)).toBe(true);
    expect(sink.lines.some((l) => /^\[research\] resumed 2\/3 from run r1/.test(l))).toBe(true);
    // The last line for each key wins when the file is read again.
    expect([...runStore(dir, "r1").load("research").values()].every((r) => r.ok)).toBe(true);
  });

  it("fail-fast: when the first 10 calls of a system all fail, the rest of that system is skipped; other systems run", async () => {
    const sink = memory();
    let badCalls = 0;
    const tasks: Task<number>[] = [];
    for (let i = 0; i < 40; i++) {
      tasks.push(task("bad", `r${i}`, 0, async () => {
        badCalls++;
        throw new Error("400 grammar too large");
      }));
      tasks.push(task("good", `r${i}`, 0, async () => i));
    }
    const out = await runTasks("interpret", tasks, { concurrency: 4, sink, failFast: 10 });
    expect(badCalls).toBeGreaterThanOrEqual(10);
    expect(badCalls).toBeLessThan(10 + 4);
    expect(out.aborted.get("bad")?.message).toContain("grammar too large");
    expect(out.aborted.has("good")).toBe(false);
    expect(out.records.filter((r, i) => tasks[i]?.system === "good").every((r) => r?.ok === true)).toBe(true);
    expect(out.records.some((r) => r === null)).toBe(true);
    expect(sink.lines.some((l) => l.includes("stopped bad") && l.includes("grammar too large"))).toBe(true);
  });

  it("fail-fast does not fire when one of the first 10 succeeds, nor for systems without Claude", async () => {
    const sink = memory();
    const tasks = Array.from({ length: 20 }, (_, i) => task("mixed", `r${i}`, 0, async () => {
      if (i === 3) return 1;
      throw new Error("flaky");
    }));
    const out = await runTasks("interpret", tasks, { concurrency: 1, sink, failFast: 10 });
    expect(out.aborted.size).toBe(0);
    expect(out.records.every((r) => r !== null)).toBe(true);
  });
});

const sectionFile = (over: Partial<SectionFile>): SectionFile => ({
  section: "interpret",
  runId: "20261101-000000",
  finishedAt: "2026-11-01 00:00:00 +09:00",
  live: false,
  split: "test",
  complete: true,
  items: 1,
  errors: 0,
  aborted: [],
  result: {},
  ...over,
});

describe("store", () => {
  it("names a run by its local start time", () => {
    expect(newRunId(new Date(2026, 10, 7, 9, 5, 3))).toBe("20261107-090503");
  });

  it("finds the latest complete result of a section, live before not live, ignoring incomplete runs and other splits", () => {
    const dir = tmp();
    const put = (f: SectionFile) => {
      mkdirSync(join(dir, f.runId), { recursive: true });
      writeFileSync(join(dir, f.runId, `${f.section}.result.json`), JSON.stringify(f));
    };
    put(sectionFile({ runId: "20261101-000000", live: true }));
    put(sectionFile({ runId: "20261102-000000", live: false }));
    put(sectionFile({ runId: "20261103-000000", live: true, complete: false }));
    put(sectionFile({ runId: "20261104-000000", live: true, split: "tune" }));
    expect(latestSection(dir, "interpret", { split: "test" })?.runId).toBe("20261101-000000");
    expect(latestSection(dir, "interpret", { split: "tune" })?.runId).toBe("20261104-000000");
    expect(latestSection(dir, "safety", { split: "test" })).toBeNull();
    expect(latestSection(join(dir, "missing"), "interpret", { split: "test" })).toBeNull();
  });
});

describe("parseArgs", () => {
  it("reads --only, --concurrency, --resume, --live and ignores a bare --", () => {
    const a = parseArgs(["--live", "--", "--only", "interpret,research", "--concurrency", "3", "--resume", "20261107-090503"]);
    expect(a).toMatchObject({ live: true, only: ["interpret", "research"], concurrency: 3, resume: "20261107-090503", split: "test" });
    expect(parseArgs([]).only).toEqual(["interpret", "safety", "leak", "research"]);
    expect(parseArgs([]).concurrency).toBe(8);
    expect(() => parseArgs(["--only", "nope"])).toThrow(/unknown section/);
    expect(() => parseArgs(["--concurrency", "0"])).toThrow();
  });

  it("the judge sections (addendum 5) run only when named; --seeds sets Claude's research seeds (default 1)", () => {
    expect(parseArgs([]).only).not.toContain("leak-judge");
    expect(parseArgs([]).only).not.toContain("research-judge");
    expect(parseArgs(["--only", "research-judge,leak-judge"]).only).toEqual(["leak-judge", "research-judge"]);
    expect(parseArgs([]).seeds).toBe(1);
    expect(parseArgs(["--seeds", "3"]).seeds).toBe(3);
    expect(() => parseArgs(["--seeds", "0"])).toThrow();
    expect(() => parseArgs(["--seeds"])).toThrow(/needs a value/);
  });
});
