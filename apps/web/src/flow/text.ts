// The words of the flow that are not the junior's (指示書 第1節 原則7・10・11, 第9節; HANDOFF §3 F8), in
// Japanese and in English (HANDOFF §7 の4). Kept short and in words a child knows. The junior's words come
// from core's templates (or a generated line that passed the gates); nothing here names an answer, an
// operation or a judgement. The problems stay as written (the bank is Japanese): the English screen shows
// them with a one-line note.
import { render, type Lang } from "@kimi/core";

/**
 * Words that must never reach a child's screen (原則10・11), in Japanese and in English. Checked on every
 * screen in the tests and on every generated line, after normalizeForPhrases (hasForbiddenPhrase).
 */
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
  "your rule",
  "copied your reading",
  "copied how you read",
  "your way of reading",
  "wrong",
  "correct",
  "mistake",
  "right answer",
  "fooled by",
  "tricked by",
  "your way",
  "your reading",
  "you read",
  "like you",
  "same as you",
  "your idea",
  "copied",
  "learned from you",
  "you taught me",
  "that's right",
  "you're right",
  "exactly",
  "good job",
  "great",
  "nice",
  "well done",
  "perfect",
  "awesome",
  "amazing",
  "smart",
  "thank",
  "keyword",
];

/**
 * A text as the phrases are matched: NFKC (full-width letters become plain ones), zero-width characters
 * removed, curly apostrophes made straight, every run of spaces and hyphens one space, lower case. So
 * full-width "WRONG", "wr" + U+200B + "ong", "your-rule" and "That" + U+2019 + "s right" are found too.
 */
export function normalizeForPhrases(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[\u2018\u2019\u02bc\uff07`]/g, "'")
    .replace(/[\s\-\u2010-\u2015\u2212]+/g, " ")
    .toLowerCase();
}

const FORBIDDEN_NORMALIZED = FORBIDDEN_CHILD_PHRASES.map(normalizeForPhrases);

/** Whether a text holds a forbidden phrase, after normalizeForPhrases. A question ending ", right?" is not judging. */
export function hasForbiddenPhrase(text: string): boolean {
  const t = normalizeForPhrases(text);
  return FORBIDDEN_NORMALIZED.some((w) => t.includes(w));
}

export interface Helpline {
  name: string;
  /** On the English screen: what the line is, in plain English, next to its Japanese name. */
  about?: string;
  number: string;
  when: string;
}

export interface HelplineText {
  title: string;
  pending: string;
  /** On the English screen: what these lines are (they serve children in Japan). */
  note: string | null;
  entries: readonly Helpline[];
}

/** Every word of the screens (the junior's lines are core's, not here). */
export interface UiText {
  lang: Lang;
  title: string;
  preparing: string;
  /** The language switch: its group name and each language in its own words. */
  langSwitch: { label: string; ja: string; en: string };
  buttons: { stop: string; dontKnow: string; hard: string };
  alwaysLabel: string;
  intro: { label: string; lines: readonly string[]; start: string };
  consent: { label: string; lines: readonly string[]; yes: string; no: string };
  problem: {
    label: string;
    sentences: string;
    world: string;
    /** On the English screen: the problem is shown as written, in Japanese. */
    note: string | null;
    next: string;
    /** The child's prediction about the junior's world (指示書 第7.1節 手順4): the question and its three buttons. */
    predict: { label: string; question: string; fits: string; odd: string; unknown: string };
    looking: string;
    yes: string;
    no: string;
    nextProblem: string;
    unitPad: string;
    totalPad: string;
  };
  pad: { clear: string; ok: string };
  research: { label: string; wait: string };
  finished: { label: string; lines: readonly string[]; end: string };
  stuck: { label: string; resume: string; hold: string };
  hard: { label: string; talk: string; close: string };
  rest: { label: string; first: string };
  helpline: HelplineText;
  ended: { label: string; line: string };
  parentDoor: string;
  parent: {
    label: string;
    lines: readonly string[];
    checksTitle: string;
    checksNone: string;
    checkRow: (date: string, right: number, total: number) => string;
    checksNote: string;
    deleteAsk: string;
    deleteWarn: string;
    deleteYes: string;
    deleteNo: string;
    deleted: string;
    back: string;
  };
  draw: {
    sentences: string;
    glow: string;
    world: string;
    tape: (label: string) => string;
    cardAria: string;
    cut: (n: number) => string;
    each: (value: string) => string;
    unknown: string;
    cardHere: string;
    fails: (sentence: string) => string;
    odd: string;
    join: (parts: readonly string[]) => string;
  };
}

/**
 * Places a child can call (BLOCKED B2, checked on 2026-11-07 against each operator's own page):
 * - 24時間子供SOSダイヤル: 文部科学省 https://www.mext.go.jp/a_menu/shotou/seitoshidou/06112210.htm
 *   (24時間・年中無休・無料 per the 文部科学省 FAQ and こども家庭庁's list)
 * - チャイルドライン: https://childline.or.jp/tel/ (18歳まで、毎日16時〜21時、12/29〜1/3休み、無料)
 * - 子どもの人権110番: 法務省 https://www.moj.go.jp/JINKEN/jinken112.html (平日8時30分〜17時15分、最寄りの法務局)
 * - 児童相談所虐待対応ダイヤル 189: こども家庭庁 https://www.cfa.go.jp/policies/jidougyakutai/gyakutai-taiou-dial
 *   (近くの児童相談所、無料、一部のIP電話は不可。24時間・365日 per こども家庭庁's materials)
 * Check them again before each release: numbers and hours change. The English screen lists the same four
 * (they serve children in Japan) with their names as they are, a plain-English description next to each name and the hours in English; no other line is added.
 */
export const HELPLINES: readonly Helpline[] = [
  { name: "24時間子供SOSダイヤル", number: "0120-0-78310", when: "いつでも（よるも、休みの日も）。電話代はかかりません。" },
  { name: "チャイルドライン（18さいまで）", number: "0120-99-7777", when: "毎日 午後4時〜午後9時（12月29日〜1月3日はお休み）。電話代はかかりません。" },
  { name: "子どもの人権110番", number: "0120-007-110", when: "月曜日〜金曜日 午前8時30分〜午後5時15分。電話代はかかりません。" },
  { name: "児童相談所 虐待対応ダイヤル", number: "189", when: "近くの児童相談所につながります。電話代はかかりません（一部のIP電話はつながりません）。" },
];

const HELPLINES_EN: readonly Helpline[] = [
  { name: "24時間子供SOSダイヤル", about: "a 24-hour SOS line for children", number: "0120-0-78310", when: "Any time, at night and on holidays too. The call is free." },
  { name: "チャイルドライン（18さいまで）", about: "Childline, for children up to 18", number: "0120-99-7777", when: "Every day, 4 pm to 9 pm (closed December 29 to January 3). For children up to 18. The call is free." },
  { name: "子どもの人権110番", about: "a children's human rights line (weekdays)", number: "0120-007-110", when: "Monday to Friday, 8:30 am to 5:15 pm. The call is free." },
  { name: "児童相談所 虐待対応ダイヤル", about: "189: if someone at home is hurting you, it connects you to the nearby child guidance center", number: "189", when: "Connects you to a nearby child guidance center. The call is free (some IP phones cannot connect)." },
];

export function helplinesFor(lang: Lang): readonly Helpline[] {
  return lang === "en" ? HELPLINES_EN : HELPLINES;
}

const JA: UiText = {
  lang: "ja",
  // The work's name (君のルールで世界を作る) is not shown to the child: it would attribute the reading to the
  // child (原則10, 指示書 第11節 M7).
  title: "後輩と問題を読もう",
  preparing: "じゅんびしています…",
  langSwitch: { label: "ことば", ja: "日本語", en: "English" },
  buttons: { stop: "やめる", dontKnow: "わからない", hard: "つらい" },
  alwaysLabel: "いつでも使えるボタン",
  intro: {
    label: "はじめに",
    lines: [
      "これからいっしょに問題を読む「後輩」は、AIです。",
      "後輩は人ではありません。心や気持ちもありません。",
      "後輩は、いろいろな読み方で問題を読みます。1問目で「1」の札をどこに置いたかを見て、その読み方で読んでみることもあります。うまく読めないこともあります。",
      "このアプリが記録をしまうのは、このタブレットの中だけです。",
      "「やめる」「わからない」「つらい」は、いつでもおせます。",
    ],
    start: "はじめる",
  },
  consent: {
    label: "おうちの人の同意",
    lines: [
      "保護者の方へ",
      "後輩の言葉と読み方の研究のために、問題、子どもが置いた「1」の札（この端末に残っている前の回の置き方も含みます）、子どもがタップした問題文の言葉を、Anthropic の Claude に送ります。",
      "子どもの名前や、声、自由に書いた言葉は送りません。送ったものは、Anthropic の方針に従って Anthropic 側に一定の期間残ることがあります。",
      "このアプリの記録はこの端末の中にだけしまい、保護者の画面からいつでも消せます。2問目からの後輩は、1問目の子どもの置き方から作った読み方で読むことがあります。",
      "「同意する」は、保護者の方が押してください。",
      "同意して始めますか？",
    ],
    yes: "同意する",
    no: "同意しない",
  },
  problem: {
    label: "問題",
    sentences: "問題の文",
    world: "後輩が作った世界",
    note: null,
    next: "つぎへ",
    predict: { label: "後輩の世界を見て", question: "この世界、問題とぴったり？ へん？", fits: "ぴったり", odd: "へん", unknown: "まだわからない" },
    looking: "「1」の札を、1とみる人のテープに動かして、後輩に教えてね。",
    yes: "うん、そう",
    no: "ちがう",
    nextProblem: "つぎの問題へ",
    unitPad: "1区切りは、いくつ？",
    totalPad: "聞かれている数は、いくつ？",
  },
  pad: { clear: "けす", ok: "これでいい" },
  research: { label: "じゅんび", wait: "後輩が、つぎの問題をえらんでいます。" },
  finished: { label: "おわり", lines: ["きょうは、ここまでです。", "「やめる」をおすと、おわります。"], end: "おわる" },
  stuck: { label: "まっています", resume: "つづける", hold: "この問題は、あとで" },
  hard: { label: "つらいとき", talk: "家の人や先生など、信じられる大人に、いまのことを話してみてね。", close: "とじる" },
  rest: { label: "ひとやすみ", first: "ここで、ひと休みしよう。" },
  helpline: {
    title: "相談できるところ",
    pending: "近くにいる大人に、「つらい」と言ってみてね。電話で話したいときは、ここにかけられます。",
    note: null,
    entries: HELPLINES,
  },
  ended: { label: "おわり", line: "おつかれさまでした。" },
  parentDoor: "おうちの人へ（2びょう おしつづける）",
  parent: {
    label: "おうちの人へ",
    lines: [
      "このアプリの記録は、この端末の中にだけ保存されます。子どもの言葉の本文は保存しません。",
      "後輩は AI（Anthropic の Claude）で、人ではありません。2問目からは、1問目の子どもの「1」の札の置き方から作った読み方や、多くの子がする別の読み方で問題を読みます。後輩は答えを知らされていません。",
    ],
    checksTitle: "AIなしで ためした記録",
    checksNone: "まだありません。",
    checkRow: (date, right, total) => `${date}：${String(total)}問中${String(right)}問 プログラムの答えと同じ数を入れました`,
    checksNote:
      "後輩も図もなしで、問題の文と数の入力だけで解いた結果です。答えはプログラムが確かめています。「わからない」でとばした問題は、同じ数を入れた問題に数えません。",
    deleteAsk: "記録をすべて消す",
    deleteWarn: "この端末の記録と同意を、すべて消します。元には戻せません。",
    deleteYes: "消す",
    deleteNo: "やめておく",
    deleted: "消しました。",
    back: "もどる",
  },
  draw: {
    sentences: "もんだいの 文",
    glow: "（この世界と 合わない 文です）",
    world: "せかいの テープ",
    tape: (label) => `${label}の テープ`,
    cardAria: "「1」の ふだ。やじるしキーで テープを えらび、Enterで おきます",
    cut: (n) => `${String(n)}つに くぎられています`,
    each: (v) => `ひと区切りは ${v}`,
    unknown: "「？」",
    cardHere: "「1」の ふだが あります",
    fails: (s) => `「${s}」は、この世界と 合わない 文です`,
    odd: "この世界には、問題の 文と 合わない ところが あります",
    join: (parts) => parts.join("。") + "。",
  },
};

const EN: UiText = {
  lang: "en",
  title: "Read problems with the junior",
  preparing: "Getting ready…",
  langSwitch: { label: "Language", ja: "日本語", en: "English" },
  buttons: { stop: "Stop", dontKnow: "I don't know", hard: "I feel bad" },
  alwaysLabel: "Buttons you can use any time",
  intro: {
    label: "Welcome",
    lines: [
      'The "junior" who reads the problems with you is an AI.',
      "The junior is not a person. It has no heart and no feelings.",
      'The junior reads problems in different ways. It may look at where you put the "1" card on the first problem and try reading that way. Sometimes it cannot read well.',
      "This app keeps its records only on this tablet.",
      'You can press "Stop", "I don\'t know" or "I feel bad" at any time.',
    ],
    start: "Start",
  },
  consent: {
    label: "Consent from a parent or guardian",
    lines: [
      "For parents and guardians",
      'For the junior\'s words and for research on ways of reading, this app sends the problem, where the child put the "1" card (including earlier placements kept on this device) and the words of the problem the child tapped to Anthropic\'s Claude.',
      "It does not send the child's name, voice or anything the child wrote freely. What is sent may be kept by Anthropic for some time under Anthropic's policies.",
      "This app keeps its records only on this device, and you can delete them at any time from the parent screen. From the second problem, the junior may read with a way of reading made from how the child placed the card on the first problem.",
      'Please have a parent or guardian press "I agree".',
      "Do you agree and start?",
    ],
    yes: "I agree",
    no: "I do not agree",
  },
  problem: {
    label: "Problem",
    sentences: "The problem's sentences",
    world: "The world the junior made",
    note: "The problem is written in Japanese.",
    next: "Next",
    predict: { label: "Look at the junior's world", question: "Does this world fit the problem?", fits: "It fits", odd: "Something's odd", unknown: "Not sure yet" },
    looking: 'Move the "1" card onto the tape of the person you take as 1, and show the junior.',
    yes: "Yes, that's it",
    no: "Not that",
    nextProblem: "Next problem",
    unitPad: "How much is each part?",
    totalPad: "What number does the problem ask for?",
  },
  pad: { clear: "Clear", ok: "Done" },
  research: { label: "Getting ready", wait: "The junior is choosing the next problem." },
  finished: { label: "The end", lines: ["That's all for today.", 'Press "Stop" to finish.'], end: "Finish" },
  stuck: { label: "Waiting", resume: "Keep going", hold: "Save this problem for later" },
  hard: { label: "When you feel bad", talk: "Try telling a grown-up you trust, like someone at home or a teacher, about how you feel now.", close: "Close" },
  rest: { label: "Rest", first: "Let's take a break here." },
  helpline: {
    title: "Places you can talk to",
    pending: 'Try telling a grown-up near you, "I feel bad." If you want to talk on the phone, you can call these.',
    note: "These are free phone lines in Japan. The people on these lines speak Japanese. If that is hard, show this screen to a grown-up you trust.",
    entries: HELPLINES_EN,
  },
  ended: { label: "The end", line: "That's all for now." },
  parentDoor: "For parents (press and hold for 2 seconds)",
  parent: {
    label: "For parents and guardians",
    lines: [
      "This app keeps its records only on this device. It does not keep the text of the child's words.",
      'The junior is an AI (Anthropic\'s Claude), not a person. From the second problem, it reads problems with a way of reading made from how the child placed the "1" card on the first problem, or with a way of reading many children use. The junior is not told the answers.',
    ],
    checksTitle: "Records of trying without AI",
    checksNone: "None yet.",
    checkRow: (date, right, total) => `${date}: ${String(right)} of ${String(total)} entered the same number as the program's answer`,
    checksNote:
      'These are results of solving with only the problem text and number entry, without the junior or pictures. The program checks the answers. A problem skipped with "I don\'t know" is not counted as the same number.',
    deleteAsk: "Delete all records",
    deleteWarn: "This deletes every record and the consent on this device. It cannot be undone. The language choice stays.",
    deleteYes: "Delete",
    deleteNo: "Keep them",
    deleted: "Deleted.",
    back: "Back",
  },
  draw: {
    sentences: "The problem's sentences",
    glow: " (this sentence does not fit this world)",
    world: "The world's tapes",
    tape: (label) => `${label}'s tape`,
    cardAria: 'The "1" card. Choose a tape with the arrow keys and press Enter to put it there.',
    cut: (n) => `split into ${String(n)} parts`,
    each: (v) => `each part is ${v}`,
    unknown: '"?"',
    cardHere: 'the "1" card is here',
    fails: (s) => `"${s}" does not fit this world`,
    odd: "Some parts of this world do not fit the problem's sentences",
    join: (parts) => parts.join(". ") + ".",
  },
};

export const UI: Record<Lang, UiText> = { ja: JA, en: EN };

export function ui(lang: Lang): UiText {
  return UI[lang];
}

// The Japanese words under their earlier names (the screens and tests that do not take a language).
export const BUTTONS = JA.buttons;
/** The always-visible mark next to the junior. */
export const AI_MARK = "AI";
/** Shown once, before the first problem ever (原則10, 第9節 AIであることの明示). */
export const INTRO_LINES: readonly string[] = JA.intro.lines;
/** For the grown-up, before the child starts (HANDOFF §3 F9: consent). */
export const CONSENT_LINES: readonly string[] = JA.consent.lines;
export const HELPLINE: HelplineText = JA.helpline;
export const STUCK = { resume: JA.stuck.resume, hold: JA.stuck.hold } as const;
export const FINISHED_LINES: readonly string[] = JA.finished.lines;
export const RESEARCH_WAIT_LINE = JA.research.wait;

/** One helpline as the child reads it. */
export const helplineLine = (h: Helpline, lang: Lang = "ja"): string => (lang === "en" ? `${h.name}${h.about === undefined ? "" : ` (${h.about})`}: ${h.number}  ${h.when}` : `${h.name}：${h.number}  ${h.when}`);

export function hardLines(lang: Lang): string[] {
  const reply = render("distress.reply", lang, 0, {}).text;
  const trusted = lang === "en" ? "grown-up" : "大人";
  return reply.includes(trusted) ? [reply] : [reply, UI[lang].hard.talk];
}

export function restLines(lang: Lang): string[] {
  return [UI[lang].rest.first, render("distress.reply", lang, 1, {}).text];
}
