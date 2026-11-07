// 指示書 第6.7節 手順5: the everyday scenes for the junior's reading. Opus chooses, from core's materials, the
// material and the numbers of two scenes (one where the reading breaks the common-sense sentence, one where it
// still keeps it) with a one-line reason for adults. Core checks the proposal (checkScenePair); when it does
// not pass, does not arrive in time, or the call fails, the program's own pair (pickScenes) is used. Opus is
// given the card's line, the reading as a rule, the kinds of the words the child tapped (never the words),
// the materials, and the values to keep away from. Nothing of the request or the reply is logged.
import { z } from "zod";
import {
  SCENE_MATERIALS,
  checkScenePair,
  choiceOf,
  pickScenes,
  readingCard,
  sceneProposal,
  type Hypothesis,
  type Lang,
  type Rational,
  type SceneChoice,
  type ScenePair,
} from "@kimi/core";
import { MODELS, withDeadline, type ClaudeClient } from "./client.ts";

/** The device shows the program's pair at once; a proposal that comes later than this is dropped. */
export const SCENES_TIMEOUT_MS = 20000;
/** The kinds of the problem words a child can tap (core's syntax marks), and "other" for an unmarked word. */
export const WORD_KINDS = ["holder_mention", "ratio_notation", "relation_word", "unit_word", "demonstrative", "sentence_pattern", "other"] as const;
export type WordKind = (typeof WORD_KINDS)[number];
const MAX_REASON_CHARS = 300;

export interface ScenesInput {
  rule: Hypothesis;
  lang: Lang;
  wordKinds: WordKind[];
  avoid: Rational[];
}

export interface ScenesResult {
  /** claude: the proposal passed core; program: core's own pair; none: the reading never breaks a scene. */
  source: "claude" | "program" | "none";
  pair: ScenePair | null;
  proposal: { breaks: SceneChoice; keeps: SceneChoice } | null;
  /** Claude's one line for adults (only with a passing proposal). */
  reason: string | null;
  rejected: "invalid" | "failed_check" | "timeout" | "error" | null;
}

export const SCENES_SYSTEM = [
  "You choose two everyday scenes that show where a reading of 'a fraction as a multiple' stops matching common sense.",
  "Each scene uses one material from the list, one of its frames, which end of the multiple is given (known: subject or reference), which sentence comes first, a given amount, a multiple num/den (both 1 to 10, not equal) and, for the cap frame only, a limit.",
  "In 'within', a multiple below 1 is said of the part (the juice is num/den of what the cup holds) and above 1 of the container; in 'cap', the red one is num/den of the blue one, and each holds up to the limit.",
  "breaks: read with the given reading, the common-sense sentence fails (the juice overflows), while read as the sentence says it holds. keeps: read with the given reading, the sentence still holds.",
  "Read as the sentence says, every amount must be a whole number in the material's steps (scale). No given number, limit or amount reached may equal a value in avoid.",
  "Prefer scenes a child pictures at once, small numbers, and the two scenes from different materials. reason_for_adult: one plain line for a parent, without judging the child.",
].join("\n");

const materialsContext = (): string =>
  JSON.stringify(
    SCENE_MATERIALS.map((m) => ({
      id: m.id,
      frames: m.frames,
      scale: m.scale,
      unit: m.unit.en,
      within: { container: m.within.container.en.amount, part: m.within.part.en.amount, common_sense: m.within.commonSense.en },
      cap: m.cap === null ? null : { a: m.cap.a.en.amount, b: m.cap.b.en.amount, limit: m.cap.limit.en, common_sense: m.cap.commonSense.en },
    })),
  );

const fallback = (rule: Hypothesis, avoid: readonly Rational[], rejected: ScenesResult["rejected"]): ScenesResult => {
  const pair = pickScenes(rule, avoid);
  return pair === null
    ? { source: "none", pair: null, proposal: null, reason: null, rejected }
    : { source: "program", pair, proposal: { breaks: choiceOf(pair.breaks), keeps: choiceOf(pair.keeps) }, reason: null, rejected };
};

export async function proposeScenes(input: ScenesInput, client: ClaudeClient, opts: { timeoutMs?: number } = {}): Promise<ScenesResult> {
  // A reading that never breaks a scene has nothing to show: no call.
  if (pickScenes(input.rule, input.avoid) === null) return { source: "none", pair: null, proposal: null, reason: null, rejected: null };
  try {
    const schema = z.toJSONSchema(sceneProposal, { target: "draft-2020-12" }) as Record<string, unknown>;
    const res = await withDeadline(opts.timeoutMs ?? SCENES_TIMEOUT_MS, (signal) =>
      client.complete({
        model: MODELS.build,
        system: SCENES_SYSTEM,
        cachedContext: materialsContext(),
        userText: JSON.stringify({
          card: readingCard(input.rule, undefined, input.lang, { forEdit: true }),
          rule: input.rule.clauses,
          word_kinds: input.wordKinds,
          avoid: input.avoid,
        }),
        schema,
        effort: "medium",
        maxTokens: 4000,
        signal,
      }),
    );
    if (res === "timeout") return fallback(input.rule, input.avoid, "timeout");
    if (res.stopReason !== "end_turn") return fallback(input.rule, input.avoid, "invalid");
    const parsed = sceneProposal.safeParse(JSON.parse(res.text));
    if (!parsed.success) return fallback(input.rule, input.avoid, "invalid");
    const pair = checkScenePair(input.rule, parsed.data, input.avoid);
    if (pair === null) return fallback(input.rule, input.avoid, "failed_check");
    const reason = parsed.data.reason_for_adult.trim();
    return {
      source: "claude",
      pair,
      proposal: { breaks: parsed.data.breaks, keeps: parsed.data.keeps },
      reason: reason === "" || reason.length > MAX_REASON_CHARS ? null : reason,
      rejected: null,
    };
  } catch {
    return fallback(input.rule, input.avoid, "error");
  }
}
