// The words of the AI-free check (指示書 第7.3節; 第1節 原則1・3). No junior, no hint, no judging: after an
// answer the child hears only that it was kept, the same line whether it was right or not.
import type { Lang } from "@kimi/core";

export interface CheckText {
  entry: string;
  title: string;
  lead: string;
  progress: (i: number, n: number) => string;
  pad: string;
  kept: string;
  next: string;
  done: readonly string[];
  back: string;
  close: string;
}

export const CHECK_TEXT: CheckText = {
  entry: "AIなしで ためしてみる",
  title: "AIなしで ためす",
  lead: "後輩は出てきません。問題を読んで、聞かれている数を入れてね。",
  progress: (i: number, n: number): string => `${String(i)}問目（${String(n)}問のうち）`,
  pad: "聞かれている数は、いくつ？",
  kept: "こたえを、うけとりました。",
  next: "つぎへ",
  done: ["AIなしの問題は、ここまでです。", "おつかれさまでした。"] as readonly string[],
  back: "もどる",
  close: "とじる",
};

/** The same words in English (HANDOFF §7 の4). The problems stay as written, with the flow's one-line note. */
export const CHECK_TEXT_EN: CheckText = {
  entry: "Try without AI",
  title: "Trying without AI",
  lead: "The junior will not come. Read the problem and enter the number it asks for.",
  progress: (i, n) => `Problem ${String(i)} of ${String(n)}`,
  pad: "What number does the problem ask for?",
  kept: "Your answer is saved.",
  next: "Next",
  done: ["That's all of the problems without AI.", "That's all for now."],
  back: "Back",
  close: "Close",
};

export function checkText(lang: Lang): CheckText {
  return lang === "en" ? CHECK_TEXT_EN : CHECK_TEXT;
}
