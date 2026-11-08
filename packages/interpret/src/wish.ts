// A child's wish to AI-kun (Q61). The child's words stay on the device; what may reach the developer is
// Claude's rephrasing of them as one short request about the app, and only after core's wishGate lets it
// through and a parent chooses to send it. Safety comes first: a cry for help is never made into a request.
// One call both judges distress, with the app's context (the shared safety check leans to distress when unsure,
// and took "too long to read" for distress), and rephrases. The device's distress words are a floor it cannot lower.
import { z } from "zod";
import { wishGate } from "@kimi/core";
import { MODELS, withDeadline, type ClaudeClient } from "./client.ts";
import { hasDistressWord } from "./safety.ts";

export type WishResult =
  | { kind: "wish"; request: string }
  /** The words were heavy: the screen shows where to talk first, and the words never become a request. */
  | { kind: "distress" }
  /** Claude could not be asked: no request is made, and nothing says the words were safe. */
  | { kind: "unchecked" }
  /** Not about the app, or nothing core lets through: the words stay on the device for the parent only. */
  | { kind: "no_request" };

export const WISH_TIMEOUT_MS = 6000;

export const WISH_SYSTEM = [
  "A child doing arithmetic in a learning app told the app's character (AI-kun) something they want, or something that was hard.",
  "First decide whether the words show distress: the child is hurt, afraid, very sad, lonely, bullied, wants to disappear, or asks for help. When that is unsure, choose distress.",
  "A complaint or question about the app is not distress, even when it is blunt: for example 'why is the fish cut in half, it's gross', 'the story is too long, I can't read to the end', 'this app is boring', 'what does the 1 card do?'. These are wishes.",
  "If it is not distress and it is about the app, rewrite it as one short request to the app's developer, written plainly for an adult (in Japanese with kanji, or in English if the child wrote English), at most 60 characters.",
  "Do not add anything the child did not say: no screen, problem, picture or feature they did not name. If they did not say which part, say so generally.",
  "Remove names, schools, classes, places, numbers that could reach a person, and anything about the child's family or life outside the app.",
  "If the child asks for answers or for easier problems, never ask for answers: write where the child got stuck instead, in the child's own terms.",
  "Never write how the child read, thought or misunderstood something; write only which part of the app was hard or wanted.",
  "If the words are not about the app at all, answer kind not_about_app with an empty request. For distress, answer kind distress with an empty request.",
].join("\n");

const reply = z.object({ kind: z.enum(["wish", "not_about_app", "distress"]), request: z.string() });

/**
 * The model that reads a wish. Sonnet, not the listening model: on ten sample wishes against the real API
 * (2026-11-08) Haiku asked the developer for answers and made a dinner wish into a request; Sonnet did neither.
 */
export const WISH_MODEL: string = MODELS.kohai;

export async function rephraseWish(text: string, client: ClaudeClient, opts: { timeoutMs?: number; model?: string } = {}): Promise<WishResult> {
  // The device's words come first and cannot be lowered by Claude.
  if (hasDistressWord(text)) return { kind: "distress" };
  const schema = z.toJSONSchema(reply, { target: "draft-2020-12" }) as Record<string, unknown>;
  try {
    const res = await withDeadline(opts.timeoutMs ?? WISH_TIMEOUT_MS, (signal) =>
      client.complete({ model: opts.model ?? WISH_MODEL, system: WISH_SYSTEM, cachedContext: "", userText: text, schema, effort: "low", maxTokens: 300, signal }),
    );
    if (res === "timeout") return { kind: "unchecked" };
    // Claude declining to answer often means the words are heavy: the safe side, as in the safety check (Q24).
    if (res.stopReason === "refusal") return { kind: "distress" };
    if (res.stopReason !== "end_turn") return { kind: "unchecked" };
    const parsed = reply.safeParse(JSON.parse(res.text));
    if (!parsed.success) return { kind: "unchecked" };
    if (parsed.data.kind === "distress") return { kind: "distress" };
    if (parsed.data.kind !== "wish") return { kind: "no_request" };
    const request = parsed.data.request.normalize("NFKC").trim();
    // The device's distress words are a floor on what is sent on, too.
    if (hasDistressWord(request)) return { kind: "distress" };
    // Claude's words are used only when core lets them through (CLAUDE.md 守ること4).
    return wishGate(request).ok ? { kind: "wish", request } : { kind: "no_request" };
  } catch {
    return { kind: "unchecked" };
  }
}
