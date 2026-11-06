// Freezing the eval protocol (指示書 第10.1節, 第11節 M2): a lock of file hashes, a check of files
// against the lock, and a history check that the lock was written once and before any EVALS.md.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { checkFreezeHistory, checkLock, lockOf } from "./protocol.ts";

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const lines = (text: string) => text.split("\n").filter((l) => l !== "");

const FILES = [
  { path: "evals/interpret/test.jsonl", content: '{"id":"a"}\n' },
  { path: "EVALS-PROTOCOL.md", content: "# protocol\n" },
  { path: "evals/safety/test.jsonl", content: "日本語の行\n" },
];

describe("lockOf", () => {
  it("writes one line per file, sha256 of the UTF-8 content, two spaces, the path", () => {
    const out = lines(lockOf(FILES));
    expect(out).toHaveLength(3);
    for (const l of out) expect(l).toMatch(/^[0-9a-f]{64} {2}\S.*$/);
    expect(out).toContain(`${sha("日本語の行\n")}  evals/safety/test.jsonl`);
  });

  it("sorts by path, whatever the input order", () => {
    const paths = lines(lockOf(FILES)).map((l) => l.slice(66));
    expect(paths).toEqual(["EVALS-PROTOCOL.md", "evals/interpret/test.jsonl", "evals/safety/test.jsonl"]);
    fc.assert(
      fc.property(fc.shuffledSubarray(FILES, { minLength: 3, maxLength: 3 }), (shuffled) => {
        expect(lockOf(shuffled)).toBe(lockOf(FILES));
      }),
    );
  });

  it("changes when any content changes", () => {
    const changed = FILES.map((f, i) => (i === 0 ? { ...f, content: `${f.content} ` } : f));
    expect(lockOf(changed)).not.toBe(lockOf(FILES));
  });

  it("rejects the same path twice", () => {
    expect(() => lockOf([...FILES, FILES[0] as (typeof FILES)[number]])).toThrow();
  });
});

describe("checkLock", () => {
  const lock = lockOf(FILES);

  it("no mismatches when the files are as locked", () => {
    expect(checkLock(lock, FILES)).toEqual([]);
    expect(checkLock(lock, [...FILES].reverse())).toEqual([]);
  });

  it("reports a changed file", () => {
    const files = FILES.map((f) => (f.path === "EVALS-PROTOCOL.md" ? { ...f, content: "# protocol, tuned\n" } : f));
    expect(checkLock(lock, files)).toEqual([expect.objectContaining({ path: "EVALS-PROTOCOL.md", kind: "changed" })]);
  });

  it("reports a missing file (locked but not given)", () => {
    const files = FILES.filter((f) => f.path !== "evals/safety/test.jsonl");
    expect(checkLock(lock, files)).toEqual([expect.objectContaining({ path: "evals/safety/test.jsonl", kind: "missing" })]);
  });

  it("reports an extra file (given but not locked)", () => {
    const files = [...FILES, { path: "evals/interpret/more.jsonl", content: "" }];
    expect(checkLock(lock, files)).toEqual([expect.objectContaining({ path: "evals/interpret/more.jsonl", kind: "extra" })]);
  });

  it("reports every mismatch, sorted by path", () => {
    const files = [
      { path: "EVALS-PROTOCOL.md", content: "other\n" },
      { path: "evals/interpret/test.jsonl", content: '{"id":"a"}\n' },
      { path: "evals/zzz.jsonl", content: "" },
    ];
    expect(checkLock(lock, files).map((m) => [m.path, m.kind])).toEqual([
      ["EVALS-PROTOCOL.md", "changed"],
      ["evals/safety/test.jsonl", "missing"],
      ["evals/zzz.jsonl", "extra"],
    ]);
  });

  it("accepts a lock with a trailing newline or CRLF line ends", () => {
    expect(checkLock(lock.replace(/\n/g, "\r\n"), FILES)).toEqual([]);
    expect(checkLock(`${lock.trimEnd()}\n\n`, FILES)).toEqual([]);
  });

  it("throws on a lock line that is not in the lock format", () => {
    expect(() => checkLock("not a lock line\n", FILES)).toThrow();
  });
});

describe("checkFreezeHistory", () => {
  const LOCK = "evals/protocol.lock";
  const c = (hash: string, ...files: string[]) => ({ hash, files });

  it("no problems when the lock is in exactly one commit and EVALS.md comes later", () => {
    expect(checkFreezeHistory([c("a1", "README.md"), c("a2", LOCK, "EVALS-PROTOCOL.md"), c("a3", "tools/evals/src/report.ts"), c("a4", "EVALS.md"), c("a5", "EVALS.md")])).toEqual([]);
  });

  it("no problems when EVALS.md first appears in the lock commit itself", () => {
    expect(checkFreezeHistory([c("a1", "README.md"), c("a2", LOCK, "EVALS.md")])).toEqual([]);
  });

  it("a problem when the lock is touched in two commits, naming both", () => {
    const problems = checkFreezeHistory([c("a1", LOCK), c("a2", "x.ts"), c("a3", LOCK)]);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join("\n")).toContain("a1");
    expect(problems.join("\n")).toContain("a3");
  });

  it("a problem when EVALS.md appears before the lock commit", () => {
    const problems = checkFreezeHistory([c("a1", "EVALS.md"), c("a2", LOCK)]);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join("\n")).toContain("EVALS.md");
  });

  it("a problem when there is no lock commit at all", () => {
    expect(checkFreezeHistory([c("a1", "README.md")]).length).toBeGreaterThan(0);
  });

  it("only the exact lock path counts", () => {
    expect(checkFreezeHistory([c("a1", LOCK), c("a2", "evals/protocol.lock.bak", "old/evals/protocol.lock")])).toEqual([]);
  });
});
