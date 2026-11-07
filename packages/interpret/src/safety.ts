// M1b: is the child asking for help (指示書 第6.2節)? Safety comes before arithmetic. When Claude cannot
// answer, a small dictionary on the device decides. The words below are a first list and wait for a
// person's check (BLOCKED.md); nothing is logged.
import { z } from "zod";
import { schemas } from "@kimi/core";
import { MODELS, withDeadline, type ClaudeClient } from "./client.ts";

export type SafetyFlag = "none" | "distress" | "inappropriate";

/**
 * Claude's judgement, or the dictionary's when Claude did not answer. The dictionary can only say
 * distress or unchecked: it misses most oblique and other-language requests for help, so a miss there
 * is never taken as none (Q26). On unchecked the screen does not answer what was said; it offers the
 * stop / don't know / it's hard buttons gently and lets the child choose.
 */
export type SafetyResult = { flag: SafetyFlag; source: "claude" } | { flag: "distress" | "unchecked"; source: "dictionary" };

export const DISTRESS_WORDS: { ja: string[]; en: string[] } = {
  // Written in hiragana where a word has a kana form: the text is folded to hiragana before matching.
  ja: [
    "しにたい", "死にたい", "しんじゃいたい", "死んじゃいたい", "きえたい", "消えたい", "いなくなりたい", "いきていたくない", "生きていたくない",
    "たすけて", "助けて", "つらい", "辛い", "くるしい", "苦しい", "こわい", "怖い", "恐い", "かなしい", "悲しい", "さみしい", "寂しい", "ひとりぼっち",
    "いじめ", "苛め", "虐め", "なぐられ", "殴られ", "たたかれ", "叩かれ", "けられ", "蹴られ", "ぶたれ", "さわられ", "触られ", "むしされ", "無視され",
    "いたい", "痛い", "なきたい", "泣きたい", "もういやだ", "ひみつにしろ", "だれにもいうな", "ごはんもらえない", "しね", "死ね", "ころす", "殺",
  ],
  en: [
    "want to die", "wanna die", "kill myself", "suicide", "hurt myself", "help me", "scared", "afraid", "bullied", "hurts me", "it hurts",
    "hit me", "sad", "lonely", "hate myself", "nobody likes me", "touched me", "keep it secret", "kill",
  ],
};

export const SAFETY_TIMEOUT_MS = 1500;
/**
 * The second try waits longer: the first request with a new output schema can take about 3 s while the
 * schema is prepared, and an aborted first try still leaves it prepared for the second.
 */
export const SAFETY_RETRY_TIMEOUT_MS = 4000;

export const SAFETY_SYSTEM = [
  "You read one thing a child said while doing arithmetic and decide only whether it shows distress (the child is hurt, afraid, sad or asks for help) or is inappropriate.",
  "When unsure whether it is distress, choose distress.",
].join("\n");

/** Width, case and script folded away, so 辛い, ツライ and ｔｓｕｒａｉ-like spellings meet the same words. */
function fold(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

function byDictionary(transcript: string): SafetyFlag {
  const t = fold(transcript);
  return [...DISTRESS_WORDS.ja, ...DISTRESS_WORDS.en].some((w) => t.includes(fold(w))) ? "distress" : "none";
}

export async function checkSafety(
  transcript: string,
  client: ClaudeClient,
  opts: { timeoutMs?: number } = {},
): Promise<SafetyResult> {
  const schema = z.toJSONSchema(schemas.safety, { target: "draft-2020-12" }) as Record<string, unknown>;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await withDeadline(opts.timeoutMs ?? (attempt === 0 ? SAFETY_TIMEOUT_MS : SAFETY_RETRY_TIMEOUT_MS), (signal) =>
        client.complete({ model: MODELS.listen, system: SAFETY_SYSTEM, cachedContext: "", userText: transcript, schema, effort: "low", maxTokens: 200, signal }),
      );
      // Claude declining to judge often means the words are heavy: treat it as distress (Q24, safe side).
      if (res !== "timeout" && res.stopReason === "refusal") return { flag: "distress", source: "claude" };
      if (res === "timeout" || res.stopReason !== "end_turn") continue;
      const parsed = schemas.safety.safeParse(JSON.parse(res.text));
      if (!parsed.success) continue;
      // The dictionary is a floor: a word in it is distress even when Claude says none.
      const flag = byDictionary(transcript) === "distress" ? "distress" : parsed.data.safety_flag;
      return { flag, source: "claude" };
    } catch {
      // try again, then fall back to the dictionary
    }
  }
  return { flag: byDictionary(transcript) === "distress" ? "distress" : "unchecked", source: "dictionary" };
}
