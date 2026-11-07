// M1b: the child's words (and fingers, and tapped words) as ops on the correct world (指示書 第6.1節).
// Claude writes ops only; core checks their shape and meaning before anything is used.
import { z } from "zod";
import {
  problemScopedSchemas,
  validateOps,
  type AnyOp,
  type Explanation,
  type Interpretation,
  type ProblemRecord,
  validateExplanation,
} from "@kimi/core";
import { MODELS, withDeadline, type ClaudeClient } from "./client.ts";

export interface InterpretInput {
  record: ProblemRecord;
  transcript: string | null;
  fingerOps: AnyOp[];
  wordCues: { statement_index: number; tokens: number[] }[];
  lang: "ja" | "en";
}

export type InterpretResult =
  | { status: "ok"; interpretation: Interpretation; claudeUsed: boolean }
  | { status: "ask_back"; reason: "refusal" | "max_tokens" | "invalid" | "timeout"; claudeUsed: boolean }
  | { status: "error" };

export const INTERPRET_TIMEOUT_MS = 3500;

/** Instructions in our own words (the brief's policy, 指示書 第6.5節, is the reference). */
export const INTERPRET_SYSTEM = [
  "You turn what a child said about a word problem into edit operations on the given world.",
  "Only write operations for what the child actually said or showed with their fingers; put elements the child did not mention in unclear.",
  "Never compute an answer and never correct the child: a wrong reading becomes wrong operations, as it was said.",
  "When the child states a relation (who is the base, which is more, a multiple or a difference), express it as relation operations.",
  "When the child says a procedure (multiply this by that), use state_procedure with its operands and operation, and do not guess who the base is.",
  "When the child says a value for what is asked, use state_answer on the asked element.",
  "Every operation the fingers made must appear unchanged in your operations.",
  "Copy the child's own words into evidence. Words in any language map to the same operations; record them in phrases.",
].join("\n");

function contextOf(record: ProblemRecord): string {
  return JSON.stringify({ world: record.world, statements: record.statements.map((s) => ({ index: s.index, text: s.text, tokens: s.tokens, element_ids: s.element_ids })) });
}

function userTextOf(input: InterpretInput): string {
  return JSON.stringify({ transcript: input.transcript, finger_ops: input.fingerOps, word_cues: input.wordCues, lang: input.lang });
}

/** JSON with keys in sorted order, so two ops compare by content and not by the order of their keys. */
function canonical(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canonical).join(",")}]`;
  if (x !== null && typeof x === "object") {
    return `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${canonical((x as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(x);
}

const sameOp = (a: AnyOp, b: AnyOp): boolean => canonical({ ...a, evidence: "" }) === canonical({ ...b, evidence: "" });

/**
 * Called once when a problem starts, so the structured-output grammar is compiled and the stable part
 * cached before the child speaks (指示書 第6.1節). The reply is not used.
 */
export async function warmInterpret(record: ProblemRecord, client: ClaudeClient): Promise<void> {
  try {
    await interpret({ record, transcript: "", fingerOps: [], wordCues: [], lang: record.world.problem_lang }, client);
  } catch {
    // warming is best effort
  }
}

/** Ops built from the fingers and tapped words alone, for when Claude does not answer in time. */
function fingersOnly(input: InterpretInput): Interpretation {
  const cues: AnyOp[] = input.wordCues.map((c) => ({ op: "word_cue", statement_index: c.statement_index, tokens: c.tokens, evidence: "" }));
  return {
    schema_version: "6",
    utterance_lang: input.lang,
    representable: "full",
    ops: [...input.fingerOps, ...cues] as Interpretation["ops"],
    unclear: [],
    phrases: [],
  };
}

type Parsed<T> = { ok: true; value: T } | { ok: false };

/**
 * Calls Claude, checks the reply with the per-problem schema and `check`, and retries once on a failed
 * check; the whole run, retry included, stops at the deadline.
 */
async function callChecked<T>(
  client: ClaudeClient,
  model: string,
  system: string,
  cachedContext: string,
  userText: string,
  schema: z.ZodType<T>,
  check: (value: T) => boolean,
  timeoutMs: number,
): Promise<{ kind: "ok"; value: T } | { kind: "refusal" | "max_tokens" | "invalid" | "timeout" }> {
  // The per-problem schema is too large for the API's structured-output grammar ("compiled grammar is too
  // large", found in the live eval): ask for the result as JSON text in one string field, give the schema
  // in the cached context, and check the reply with the same per-problem zod schema as before (Q41).
  const fullSchema = z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<string, unknown>;
  const jsonSchema: Record<string, unknown> = RESULT_WRAPPER;
  const context = `${cachedContext}

${RESULT_INSTRUCTION}
${JSON.stringify(fullSchema)}`;
  const started = Date.now();
  for (let attempt = 0; attempt < 2; attempt++) {
    const left = timeoutMs - (Date.now() - started);
    if (left <= 0) return { kind: "timeout" };
    const res = await withDeadline(left, (signal) =>
      client.complete({ model, system, cachedContext: context, userText, schema: jsonSchema, effort: "low", maxTokens: 2000, signal }),
    );
    if (res === "timeout") return { kind: "timeout" };
    if (res.stopReason === "refusal") return { kind: "refusal" };
    if (res.stopReason === "max_tokens") return { kind: "max_tokens" };
    const parsed = parseJson(res.text, schema);
    if (parsed.ok && check(parsed.value)) return { kind: "ok", value: parsed.value };
  }
  return { kind: "invalid" };
}

/** The one field structured output is asked for; the result itself is JSON text inside it. */
export const RESULT_WRAPPER: Record<string, unknown> = {
  type: "object",
  properties: { result_json: { type: "string", description: "The result as JSON text, following the JSON Schema given in the context." } },
  required: ["result_json"],
  additionalProperties: false,
};
const RESULT_INSTRUCTION = "Write your result as JSON text in result_json. The JSON must follow this JSON Schema:";

function parseJson<T>(text: string, schema: z.ZodType<T>): Parsed<T> {
  try {
    const outer: unknown = JSON.parse(text);
    // The reply wraps the result as text; a reply that is the result itself is taken as it is.
    const inner =
      outer !== null && typeof outer === "object" && typeof (outer as { result_json?: unknown }).result_json === "string"
        ? JSON.parse((outer as { result_json: string }).result_json)
        : outer;
    const r = schema.safeParse(inner);
    return r.success ? { ok: true, value: r.data } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/** `model` is for the eval only (指示書 第10.1節 compares models); the app always listens with Haiku. */
export async function interpret(input: InterpretInput, client: ClaudeClient, opts: { timeoutMs?: number; model?: string } = {}): Promise<InterpretResult> {
  try {
    const world = input.record.world;
    const scoped = problemScopedSchemas(world, input.record.statements);
    const result = await callChecked(
      client,
      opts.model ?? MODELS.listen,
      INTERPRET_SYSTEM,
      contextOf(input.record),
      userTextOf(input),
      scoped.interpretation as unknown as z.ZodType<Interpretation>,
      (x) => validateOps(world, x.ops as AnyOp[]).ok && input.fingerOps.every((f) => (x.ops as AnyOp[]).some((o) => sameOp(o, f))),
      opts.timeoutMs ?? INTERPRET_TIMEOUT_MS,
    );
    if (result.kind === "ok") return { status: "ok", interpretation: result.value, claudeUsed: true };
    if (result.kind === "timeout" && input.fingerOps.length > 0) {
      return { status: "ok", interpretation: fingersOnly(input), claudeUsed: false };
    }
    return { status: "ask_back", reason: result.kind, claudeUsed: result.kind !== "timeout" };
  } catch {
    return { status: "error" };
  }
}

/** The expression and reason of the child (指示書 第6.3節); the program judges it, never Claude. */
export async function explain(
  input: InterpretInput,
  client: ClaudeClient,
  opts: { timeoutMs?: number } = {},
): Promise<{ status: "ok"; explanation: Explanation } | { status: "ask_back"; reason: string } | { status: "error" }> {
  try {
    const scoped = problemScopedSchemas(input.record.world, input.record.statements);
    const result = await callChecked(
      client,
      MODELS.listen,
      EXPLAIN_SYSTEM,
      contextOf(input.record),
      userTextOf(input),
      scoped.explanation as unknown as z.ZodType<Explanation>,
      (x) => validateExplanation(input.record.world, x).ok,
      opts.timeoutMs ?? INTERPRET_TIMEOUT_MS,
    );
    if (result.kind === "ok") return { status: "ok", explanation: result.value };
    return { status: "ask_back", reason: result.kind };
  } catch {
    return { status: "error" };
  }
}

export const EXPLAIN_SYSTEM = [
  "You write down the expression or the reason a child said about a word problem, as tokens and mentioned elements.",
  "Never compute or check the result and never correct the child. Copy the child's words into evidence.",
].join("\n");
