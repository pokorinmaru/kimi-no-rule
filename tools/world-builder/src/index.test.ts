// The problem-preparation entry (指示書 第6.6節): it runs the one build agent of packages/interpret over a
// list of problems, keeps the adopted records for a person to check, and writes the build record.
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { schemas } from "@kimi/core";
import type { BuildInput } from "@kimi/interpret";
import { FakeAgent, FakeClaude, json } from "../../../packages/interpret/src/fake.ts";
import { PACKAGE, parseInputs, prepareProblems, writePrepared } from "./index.ts";
import { signboardRecord } from "../../../packages/core/fixtures/problems/signboard-record.ts";

const input: BuildInput = {
  problemId: "p_try",
  problemText: "ためしの問題",
  lang: "ja",
  grade: 6,
  consistency: "inconsistent",
  source: "prepared",
};

const silentDeps = () => ({
  agent: new FakeAgent([{ stopReason: "end_turn", text: "done", toolCalls: [] }]),
  judge: new FakeClaude([json({})]),
  listen: new FakeClaude([json({})]),
});

describe("@kimi/world-builder", () => {
  it("exports its package name", () => {
    expect(PACKAGE).toBe("@kimi/world-builder");
  });

  it("reads a list of problems and rejects a malformed one", () => {
    expect(parseInputs(JSON.stringify([input]))).toEqual([input]);
    expect(() => parseInputs(JSON.stringify([{ ...input, grade: "six" }]))).toThrow();
    expect(() => parseInputs(JSON.stringify({ problemId: "x" }))).toThrow();
  });

  it("an agent that never hands in a world is rejected, and the record says why", async () => {
    const res = await prepareProblems(silentDeps(), [input]);
    expect(res.adopted).toEqual([]);
    expect(res.rejected).toEqual([{ problemId: "p_try", reason: "agent_failed" }]);
    expect(res.log).toContain("p_try");
    expect(res.log).toContain("agent_failed");
  });

  it("writes each adopted record unchecked by a person, and the build record", () => {
    const dir = mkdtempSync(join(tmpdir(), "kimi-wb-"));
    const record = { ...signboardRecord, checks: { ...signboardRecord.checks, human_checked: true } };
    writePrepared(dir, { adopted: [record], rejected: [{ problemId: "p_x", reason: "restate_mismatch" }], log: "### log\n" });
    expect(readdirSync(dir).sort()).toEqual(["build-log.md", "p_signboard.json"]);
    const written = schemas.problemRecord.parse(JSON.parse(readFileSync(join(dir, "p_signboard.json"), "utf8")));
    // A person looks at every prepared problem before it is used, whatever the record said.
    expect(written.checks.human_checked).toBe(false);
    const log = readFileSync(join(dir, "build-log.md"), "utf8");
    expect(log).toContain("p_x");
    expect(log).toContain("restate_mismatch");
  });
});

describe("the pair and the companion worlds (review fix, Q27)", () => {
  it("reads the wish for a pair and for companions in scenes", () => {
    const wish = { ...input, makePair: true, companionScenes: [{ id: "juice", text: "コップのジュース" }] };
    expect(parseInputs(JSON.stringify([wish]))).toEqual([wish]);
  });

  it("asks for no pair or companion when the problem itself was not adopted", async () => {
    const deps = silentDeps();
    const res = await prepareProblems(deps, [{ ...input, makePair: true, companionScenes: [{ id: "juice", text: "コップのジュース" }] }]);
    expect(res.rejected).toEqual([{ problemId: "p_try", reason: "agent_failed" }]);
    expect(deps.judge.requests).toHaveLength(0);
  });
});
