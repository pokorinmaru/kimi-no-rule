// A second judge of the junior's lines (指示書 第10.3節, addendum 5). core's gate is a program with a fixed net:
// numbers, operation names, judging words. A model reads the same line and says whether it gives the answer
// away by other means. Counting the lines the judge flags but the gate lets through shows how coarse the
// net is; the reverse shows where the gate is stricter than a reader. The judge's verdict is only counted
// here: it never decides what a child sees (core decides that).
import { solve, toSchema, type ProblemRecord } from "@kimi/core";
import { MODELS, type ClaudeClient } from "@kimi/interpret";
import { z } from "zod";
import { leaksOf, type Junior, type KohaiRow, type Leak } from "./kohai-eval.ts";

export const JUDGE_KINDS = ["answer", "value", "operation", "direction"] as const;
export type JudgeKind = (typeof JUDGE_KINDS)[number];

export const judgeVerdict = z.strictObject({
  reveals: z.boolean(),
  kind: z.enum(["none", ...JUDGE_KINDS]),
});
export type Verdict = z.infer<typeof judgeVerdict>;

export const LEAK_JUDGE_SYSTEM = [
  "You check one line spoken by a junior character in a math app for children. The child is solving the word problem given below and must find the answer alone.",
  "Decide whether the line gives away, openly or by a hint, any of these:",
  "- answer: the answer to the question, or a confirmation of it;",
  "- value: a number on the way to the answer that is not written in the problem (the result of one step);",
  "- operation: which operation to use (multiply or divide, or words for them);",
  "- direction: which amount is the base (the one counted as 1) or which way the relation goes, when the line states it correctly.",
  "A question back to the child, a restatement of what the child said, or the junior's own wrong reading is not a give-away.",
  'Answer with reveals true or false. When true, name the main kind; when false, kind is "none".',
].join("\n");

/** What the judge knows about the problem: its text, its answer, and its base (never shown to a child). */
function context(record: ProblemRecord): string {
  const w = record.world;
  const res = solve(w);
  const answer = res.kind === "unique" ? res.values.get(w.question.target_id) : undefined;
  const a = answer === undefined ? null : toSchema(answer);
  const holderOf = (q: string | null): string | null => {
    const quantity = w.quantities.find((x) => x.id === q);
    return w.holders.find((h) => h.id === quantity?.holder)?.label ?? null;
  };
  const rel = w.relations[0];
  return JSON.stringify({
    problem: w.problem_text,
    answer: a === null ? null : a.den === 1 ? String(a.num) : `${a.num}/${a.den}`,
    base_amount_of: rel === undefined ? null : holderOf(rel.reference),
    compared_amount_of: rel === undefined ? null : holderOf(rel.subject),
  });
}

const NOTHING: Verdict = { reveals: false, kind: "none" };

/**
 * Haiku's verdict on one line. An empty line reveals nothing and is not sent. A refusal or an answer that
 * does not parse is null (unjudged). An API error is thrown, so the runner records it.
 */
export async function judgeLine(client: ClaudeClient, record: ProblemRecord, line: string, model: string = MODELS.listen): Promise<Verdict | null> {
  if (line.trim() === "") return NOTHING;
  const r = await client.complete({
    model,
    system: LEAK_JUDGE_SYSTEM,
    cachedContext: context(record),
    userText: JSON.stringify({ line }),
    schema: z.toJSONSchema(judgeVerdict, { target: "draft-2020-12" }) as Record<string, unknown>,
    effort: "low",
    maxTokens: 200,
  });
  if (r.stopReason !== "end_turn") return null;
  let raw: unknown;
  try {
    raw = JSON.parse(r.text);
  } catch {
    return null;
  }
  const parsed = judgeVerdict.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data.reveals ? parsed.data : NOTHING;
}

/** One line: what core's gate found in it and what the judge said (null when it could not judge). */
export interface JudgedLine {
  gate: Leak[];
  judge: Verdict | null;
}

/** Has the junior say a line, then checks the same line with the gate and with the judge. */
export async function judgedLine(junior: Junior, judge: ClaudeClient, row: KohaiRow, record: ProblemRecord): Promise<JudgedLine> {
  const line = await junior.say(row, record);
  return { gate: leaksOf(line, record, row), judge: await judgeLine(judge, record, line) };
}

export interface LeakJudgeResult {
  name: string;
  lines: number;
  /** Lines the judge could not judge (refusal or unreadable answer): left out of the comparisons. */
  unjudged: number;
  gateFlagged: number;
  judgeFlagged: number;
  both: number;
  /** Flagged by the judge, passed by the gate: how coarse the gate's net is. */
  judgeOnly: number;
  /** Stopped by the gate, passed by the judge. */
  gateOnly: number;
  byKind: Record<JudgeKind, number>;
}

export function sumJudged(name: string, lines: readonly JudgedLine[]): LeakJudgeResult {
  const r: LeakJudgeResult = { name, lines: 0, unjudged: 0, gateFlagged: 0, judgeFlagged: 0, both: 0, judgeOnly: 0, gateOnly: 0, byKind: { answer: 0, value: 0, operation: 0, direction: 0 } };
  for (const l of lines) {
    r.lines++;
    const gate = l.gate.length > 0;
    if (gate) r.gateFlagged++;
    if (l.judge === null) {
      r.unjudged++;
      continue;
    }
    const judge = l.judge.reveals;
    if (judge) {
      r.judgeFlagged++;
      if (l.judge.kind !== "none") r.byKind[l.judge.kind]++;
    }
    if (gate && judge) r.both++;
    else if (judge) r.judgeOnly++;
    else if (gate) r.gateOnly++;
  }
  return r;
}
