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
  "後輩は、いろいろな読み方で問題を読みます。1問目で「1」の札をどこに置いたかを見て、その読み方で読んでみることもあります。うまく読めないこともあります。",
  "このアプリが記録をしまうのは、このタブレットの中だけです。",
  "「やめる」「わからない」「つらい」は、いつでもおせます。",
];

/** For the grown-up, before the child starts (HANDOFF §3 F9: consent). */
export const CONSENT_LINES: readonly string[] = [
  "保護者の方へ",
  "後輩の言葉と読み方の研究のために、問題、子どもが置いた「1」の札（この端末に残っている前の回の置き方も含みます）、子どもがタップした問題文の言葉を、Anthropic の Claude に送ります。",
  "子どもの名前や、声、自由に書いた言葉は送りません。送ったものは、Anthropic の方針に従って Anthropic 側に一定の期間残ることがあります。",
  "このアプリの記録はこの端末の中にだけしまい、保護者の画面からいつでも消せます。2問目からの後輩は、1問目の子どもの置き方から作った読み方で読むことがあります。",
  "「同意する」は、保護者の方が押してください。",
  "同意して始めますか？",
];

/**
 * Places a child can call (BLOCKED B2, checked on 2026-11-07 against each operator's own page):
 * - 24時間子供SOSダイヤル: 文部科学省 https://www.mext.go.jp/a_menu/shotou/seitoshidou/06112210.htm
 *   (24時間・年中無休・無料 per the 文部科学省 FAQ and こども家庭庁's list)
 * - チャイルドライン: https://childline.or.jp/tel/ (18歳まで、毎日16時〜21時、12/29〜1/3休み、無料)
 * - 子どもの人権110番: 法務省 https://www.moj.go.jp/JINKEN/jinken112.html (平日8時30分〜17時15分、最寄りの法務局)
 * - 児童相談所虐待対応ダイヤル 189: こども家庭庁 https://www.cfa.go.jp/policies/jidougyakutai/gyakutai-taiou-dial
 *   (近くの児童相談所、無料、一部のIP電話は不可。24時間・365日 per こども家庭庁's materials)
 * Check them again before each release: numbers and hours change.
 */
export const HELPLINES: readonly { name: string; number: string; when: string }[] = [
  { name: "24時間子供SOSダイヤル", number: "0120-0-78310", when: "いつでも（よるも、休みの日も）。電話代はかかりません。" },
  { name: "チャイルドライン（18さいまで）", number: "0120-99-7777", when: "毎日 午後4時〜午後9時（12月29日〜1月3日はお休み）。電話代はかかりません。" },
  { name: "子どもの人権110番", number: "0120-007-110", when: "月曜日〜金曜日 午前8時30分〜午後5時15分。電話代はかかりません。" },
  { name: "児童相談所 虐待対応ダイヤル", number: "189", when: "近くの児童相談所につながります。電話代はかかりません（一部のIP電話はつながりません）。" },
];

export const HELPLINE = {
  title: "相談できるところ",
  pending: "近くにいる大人に、「つらい」と言ってみてね。電話で話したいときは、ここにかけられます。",
  entries: HELPLINES,
} as const;

/** One helpline as the child reads it. */
export const helplineLine = (h: (typeof HELPLINES)[number]): string => `${h.name}：${h.number}  ${h.when}`;

export function hardLines(lang: Lang): string[] {
  const reply = render("distress.reply", lang, 0, {}).text;
  const talk = "家の人や先生など、信じられる大人に、いまのことを話してみてね。";
  return reply.includes("大人") ? [reply] : [reply, talk];
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
