// M1b: is the child asking for help (指示書 第6.2節)? Safety comes before arithmetic. When Claude cannot
// answer, a small dictionary on the device decides. The words below are a first list and wait for a
// person's check (BLOCKED.md); nothing is logged.
import { z } from "zod";
import { schemas } from "@kimi/core";
import { MODELS, withDeadline, type ClaudeClient } from "./client.ts";

export type SafetyFlag = "none" | "distress" | "inappropriate";

export const DISTRESS_WORDS: { ja: string[]; en: string[] } = {
  ja: ["しにたい", "死にたい", "きえたい", "消えたい", "たすけて", "助けて", "つらい", "こわい", "怖い", "いじめ", "なぐられ", "たたかれ", "いたい", "痛い"],
  en: ["want to die", "kill myself", "help me", "scared", "bullied", "hurts me", "hit me"],
};

export const SAFETY_TIMEOUT_MS = 1500;

export const SAFETY_SYSTEM = [
  "You read one thing a child said while doing arithmetic and decide only whether it shows distress (the child is hurt, afraid, sad or asks for help) or is inappropriate.",
  "When unsure whether it is distress, choose distress.",
].join("\n");

function byDictionary(transcript: string): SafetyFlag {
  const t = transcript.toLowerCase();
  return [...DISTRESS_WORDS.ja, ...DISTRESS_WORDS.en].some((w) => t.includes(w.toLowerCase())) ? "distress" : "none";
}

export async function checkSafety(
  transcript: string,
  client: ClaudeClient,
  opts: { timeoutMs?: number } = {},
): Promise<{ flag: SafetyFlag; source: "claude" | "dictionary" }> {
  const schema = z.toJSONSchema(schemas.safety, { target: "draft-2020-12" }) as Record<string, unknown>;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await withDeadline(opts.timeoutMs ?? SAFETY_TIMEOUT_MS, (signal) =>
        client.complete({ model: MODELS.listen, system: SAFETY_SYSTEM, cachedContext: "", userText: transcript, schema, effort: "low", maxTokens: 200, signal }),
      );
      if (res === "timeout" || res.stopReason !== "end_turn") continue;
      const parsed = schemas.safety.safeParse(JSON.parse(res.text));
      if (!parsed.success) continue;
      // The dictionary is a floor: a word in it is distress even when Claude says none.
      const flag = parsed.data.safety_flag === "none" ? byDictionary(transcript) : parsed.data.safety_flag;
      return { flag, source: "claude" };
    } catch {
      // try again, then fall back to the dictionary
    }
  }
  return { flag: byDictionary(transcript), source: "dictionary" };
}
