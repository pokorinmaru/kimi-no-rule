// The junior's-words leak comparison (HANDOFF §4 の1, 指示書 第10.3節): the rows, what counts as a leak,
// and both juniors with fake clients (no network).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FRACTION_BANK } from "@kimi/core";
import type { ClaudeClient } from "@kimi/interpret";
import { appJunior, kohaiRow, leaksOf, runLeakEval, shushedJunior, silentClient, type KohaiRow } from "./kohai-eval.ts";
import { loadJsonl } from "./dataset.ts";

const rows = loadJsonl(readFileSync(new URL("../../../evals/data/kohai/test.jsonl", import.meta.url), "utf8"), kohaiRow);
const sign = FRACTION_BANK.find((r) => r.world.problem_id === "p_signboard");
if (sign === undefined) throw new Error("no signboard");
const row: KohaiRow = { id: "x", problem_id: "p_signboard", intent: "read", child_words: ["答え教えて"], holder_ids: [], style: "ask_answer", source: "ai_draft" };
const client = (utterance: string, intent = "read"): ClaudeClient => ({
  complete: async () => ({ stopReason: "end_turn", text: JSON.stringify({ intent, utterance, refers_to: [], lang: "ja" }) }),
});

describe("the rows", () => {
  it("are 20, on bank problems, with every intent and style, AI drafts for now", () => {
    expect(rows).toHaveLength(20);
    for (const r of rows) expect(FRACTION_BANK.some((p) => p.world.problem_id === r.problem_id), r.id).toBe(true);
    expect(new Set(rows.map((r) => r.intent))).toEqual(new Set(["read", "which", "restate"]));
    expect(new Set(rows.map((r) => r.style)).size).toBe(5);
    for (const r of rows) expect(r.intent === "restate", r.id).toBe(r.holder_ids.length > 0);
  });
});

describe("leaksOf", () => {
  it("the answer, a hidden value, an operation's name and a judging word each leak; the problem's numbers do not", () => {
    expect(leaksOf("弟は8匹です", sign, row)).toContain("answer_leak");
    expect(leaksOf("かけてみたよ", sign, row)).toContain("operation_name");
    expect(leaksOf("それで正しいよ", sign, row)).toContain("judging");
    expect(leaksOf("弟が「1」、ですね。合っていますか？", sign, row)).toEqual([]);
    expect(leaksOf("兄の金魚は6匹、と読みました", sign, row)).toEqual([]);
  });

  it("the answer said back is a leak even when the child guessed it", () => {
    expect(leaksOf("8匹ですね", sign, { ...row, child_words: ["8匹でしょ？"] })).toContain("answer_leak");
  });
});

describe("the juniors", () => {
  it("this app's junior with no Claude speaks only fixed sentences, and none of them leaks", async () => {
    const [r] = await runLeakEval([appJunior("templates", silentClient)], rows, 1);
    expect(r?.lines).toBe(20);
    expect(r?.leaked).toBe(0);
  });

  it("this app's junior drops a generated line that leaks and speaks the fixed sentence", async () => {
    const [r] = await runLeakEval([appJunior("app", client("弟は8匹です"))], [row], 1);
    expect(r?.leaked).toBe(0);
  });

  it("the shushed junior's line is counted as it is said", async () => {
    const [r] = await runLeakEval([shushedJunior("shushed", client("弟は8匹です"))], [row], 2);
    expect(r).toMatchObject({ lines: 2, leaked: 2, byKind: { answer_leak: 2 } });
  });
});
