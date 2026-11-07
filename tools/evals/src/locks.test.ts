// Every lock under evals/ still matches the files it freezes. CI also runs `pnpm check:protocol` (which adds
// the history checks); this test puts the content check in `pnpm test`, so the edit hooks and the Stop hook
// catch a frozen file changed by mistake before it is pushed (a card-rules edit to research/common.ts once
// slipped through to four failing CI runs).
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkLock, lockedPaths } from "./protocol.ts";

const root = new URL("../../../", import.meta.url);
const read = (p: string): string => readFileSync(new URL(p, root), "utf8");
const locks = readdirSync(new URL("evals/", root)).filter((f) => f.endsWith(".lock")).map((f) => `evals/${f}`);

describe("the frozen files", () => {
  it("there is at least the protocol's own lock", () => {
    expect(locks).toContain("evals/protocol.lock");
  });

  it.each(locks)("%s matches the files it freezes", (lock) => {
    const text = read(lock);
    const files = lockedPaths(text).map((path) => ({ path, content: read(path) }));
    expect(checkLock(text, files)).toEqual([]);
  });
});
