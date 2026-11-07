// The junior character's pose (assets/spec.ts CHARACTER_PARTS: kohai_read, kohai_look, kohai_listen): what the
// junior is doing now, decided from the flow state (the screen, the step, the line's intent, whether the child is
// talking), never from its words. No pose is a feeling: the junior has none (第9節).
import type { KohaiIntent } from "./machine.ts";
import type { ProblemStep } from "./view.ts";

export const KOHAI_POSES = ["read", "look", "listen"] as const;
export type KohaiPose = (typeof KOHAI_POSES)[number];

export interface PoseInput {
  screen: string;
  step: ProblemStep | null;
  intent: KohaiIntent | null;
  /** The child is talking, or the junior waits on the words heard. */
  listening: boolean;
}

export function kohaiPose(x: PoseInput): KohaiPose {
  if (x.listening || x.intent === "restate") return "listen";
  if (x.intent === "read") return "read";
  if (x.intent === "which") return "look";
  if (x.screen === "help") return "look";
  if (x.screen === "problem") return x.step === "reading" || x.step === "looking" ? "read" : "look";
  return "read";
}
