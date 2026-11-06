// The words of the flow that are not the junior's (指示書 第1節 原則7・10・11, 第9節; HANDOFF §3 F8).
// Kept short and in words a child knows. The junior's words come from core's templates (or a generated
// line that passed the gates); nothing here names an answer, an operation or a judgement.
import { render, type Lang } from "@kimi/core";

/** Words that must never reach a child's screen (原則10・11). Checked on every screen in the tests. */
export const FORBIDDEN_CHILD_PHRASES: readonly string[] = [
  "君のルール",
  "きみのルール",
  "君の読み方をまねした",
  "きみの読み方をまねした",
  "きみのよみかたをまねした",
  "間違",
  "まちがい",
  "正解",
  "せいかい",
  "キーワードにつられ",
];

export const BUTTONS = { stop: "やめる", dontKnow: "わからない", hard: "つらい" } as const;

/** The always-visible mark next to the junior. */
export const AI_MARK = "AI";

/** Shown once, before the first problem ever (原則10, 第9節 AIであることの明示). */
export const INTRO_LINES: readonly string[] = [
  "これからいっしょに問題を読む「後輩」は、AIです。",
  "後輩は人ではありません。心や気持ちもありません。",
  "後輩は、いろいろな読み方で問題を読みます。うまく読めないこともあります。",
  "きみの記録は、このタブレットの中にだけ残ります。",
  "「やめる」「わからない」「つらい」は、いつでもおせます。",
];

/** For the grown-up, before the child starts (HANDOFF §3 F9: consent). */
export const CONSENT_LINES: readonly string[] = [
  "保護者の方へ",
  "後輩の言葉と読み方の研究のために、問題、子どもが置いた「1」の札、子どもがタップした問題文の言葉を、Anthropic の Claude に送ります。",
  "子どもの名前や、声、自由に書いた言葉は送りません。記録はこの端末の中だけに残り、保護者の画面からいつでも消せます。",
  "同意して始めますか？",
];

/** The helpline list waits for a person's check (BLOCKED B2): the slot says so and never shows a number. */
export const HELPLINE = {
  title: "相談できるところ",
  pending: "相談できるところの一覧は、いま大人がたしかめているところです。たしかめ終わったら、ここに出ます。",
} as const;

export function hardLines(lang: Lang): string[] {
  return [render("distress.reply", lang, 0, {}).text, "家の人や先生など、信じられる大人に、いまのことを話してみてね。"];
}

export function restLines(lang: Lang): string[] {
  return ["ここで、ひと休みしよう。", render("distress.reply", lang, 1, {}).text];
}

export const STUCK = {
  resume: "つづける",
  hold: "この問題は、あとで",
} as const;

export const FINISHED_LINES: readonly string[] = ["きょうは、ここまでです。", "「やめる」をおすと、おわります。"];

export const RESEARCH_WAIT_LINE = "後輩が、つぎの問題をえらんでいます。";
