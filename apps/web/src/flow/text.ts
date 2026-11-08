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

/** One card of the intro: a short title and two or three plain lines. */
export interface IntroCard {
  title: string;
  lines: readonly string[];
}

/** Every word of the screens (the junior's lines are core's, not here). */
export interface UiText {
  lang: Lang;
  title: string;
  preparing: string;
  /** The language switch: its group name and each language in its own words. */
  langSwitch: { label: string; ja: string; en: string };
  /** Reading support (指示書 第8.4b節): the group's name, read aloud and its stop, and the furigana switch. */
  reading: { label: string; aloud: string; stop: string; furigana: string };
  buttons: { stop: string; dontKnow: string; hard: string };
  alwaysLabel: string;
  /**
   * The intro (原則10, 第9節 AIであることの明示): short cards for the child, then the same facts in fuller words for
   * the grown-up behind 「おうちの人へ」 on the same screen. `lines` is every line of both, for the checks.
   */
  intro: {
    label: string;
    cards: readonly IntroCard[];
    adultTitle: string;
    adultLines: readonly string[];
    lines: readonly string[];
    start: string;
  };
  /** The grown-up's consent; `child` tells the child this part is for a grown-up at home. */
  consent: { label: string; child: string; lines: readonly string[]; yes: string; no: string };
  problem: {
    label: string;
    sentences: string;
    world: string;
    /** On the English screen: the problem is shown as written, in Japanese. */
    note: string | null;
    next: string;
    /**
     * The child's own first prediction, before the junior's world (指示書 第7.1節 手順2): the screen's name, the
     * question, the "not yet" button, and two lines about the optional "1" card. Nothing here judges an answer.
     */
    guess: { label: string; question: string; unknown: string; card: string; optional: string };
    /** The child's prediction about the junior's world (指示書 第7.1節 手順4): the question and its three buttons. */
    predict: { label: string; question: string; fits: string; odd: string; unknown: string };
    looking: string;
    yes: string;
    no: string;
    nextProblem: string;
    unitPad: string;
    totalPad: string;
    /** The child's voice (指示書 第7.1節 手順5): the mic button, its stop, the waiting line, and why it is not offered. */
    voice: { talk: string; stop: string; listening: string; unsupported: string; denied: string; off: string };
    /** Teaching in typed words (Q60): the box's name, its hint and the send button. Sent the same way as the voice. */
    typed: { label: string; hint: string; send: string };
  };
  /** The top page (Q60): the app's lead, the child's name, and where to start from. */
  home: {
    label: string;
    lead: readonly string[];
    nameLabel: string;
    nameHint: string;
    nameBad: string;
    start: string;
    resume: string;
    restart: string;
  };
  /** The buttons at the top of the child's screens (Q60): the top page, and the open problem from its start. */
  nav: { home: string; restartProblem: string };
  pad: { clear: string; ok: string };
  research: { label: string; wait: string };
  /** The junior's rule card (指示書 第7.1節 後輩のルールカード): no word says right or wrong, nothing is put on the child. */
  ruleCard: {
    label: string;
    lines: readonly string[];
    slot: string;
    gallery: string;
    next: string;
    /** The everyday scenes (指示書 第6.7節 手順5): the heading, one line before them, and the drawing's name. */
    scenes: string;
    scenesNote: string;
    sceneDrawing: string;
  };
  finished: { label: string; lines: readonly string[]; end: string };
  stuck: { label: string; resume: string; hold: string };
  /** The junior's staged questions (指示書 第7.1節 手順4・5): no word names an answer, an operation or a judgement. */
  help: { label: string; read: string; orderLabel: string; open: string; later: string };
  /** ことばの絵本 (指示書 第7.1節): the screen's name, the "1" mark's words and the close button. */
  wordbook: { label: string; one: string; close: string };
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
    /**
     * The research note (指示書 第7.4節, 第6.7節 研究ノート): the app's current ideas in core's adult words, said
     * to be guesses from a few problems. "For now", never a word that settles or pins anything on the child.
     */
    researchTitle: string;
    researchLines: readonly string[];
    researchNone: string;
    researchUnsettled: string;
    status: { hypothesis: string; confirmed: string };
    entry: (line: string, status: string, backing: number, counted: number) => string;
    /** The trend per day, from the device's records only. */
    trendTitle: string;
    trendNone: string;
    trendNote: string;
    trendRow: (date: string, solved: number, held: number, fixes: number) => string;
    trendSettled: (line: string) => string;
    trendBack: (line: string) => string;
    trendDropped: (line: string) => string;
    /** A reading that does not lean on the wording (指示書 第6.7節 手順6, Q48): from the device's transfer records only. */
    wordingTitle: string;
    wordingLines: readonly string[];
    wordingNone: string;
    wordingRow: (date: string, line: string) => string;
    /** The junior's reading when core has no words for it. */
    wordingUnknown: string;
    deleteAsk: string;
    deleteWarn: string;
    deleteYes: string;
    deleteNo: string;
    deleted: string;
    back: string;
    /** The link to the adults' try route (指示書 第6.9節); on the grown-up's screen only. */
    tryLink: string;
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
    jagged: (label: string) => string;
    join: (parts: readonly string[]) => string;
    /** The stage picture above the tape: its name and its description of what is drawn (never a verdict). */
    stage: string;
    stageHolder: (label: string, noun: string, count: string) => string;
    stageUnknown: (label: string, noun: string) => string;
    stageEmpty: (label: string, noun: string) => string;
    stageDishes: (label: string, noun: string, dishes: number) => string;
    stageEach: (count: string) => string;
    /** A thing that is not whole: cut (with a cut edge) or ghost (the missing part a dashed outline). */
    stageCut: (noun: string, half: boolean, ghost: boolean) => string;
    /** A number of things as drawn: wholes and the last piece. */
    amount: (wholes: number, piece: { num: number; den: number } | null, counter: string) => string;
    /** An additive reading drawn as a one-to-one pairing: what is lined up, and the things without a partner. */
    stagePaired: (smaller: string, larger: string, noun: string) => string;
    /** A liquid poured into groups of cups, each group's amount, and a cup filled part way. */
    stagePoured: (label: string, noun: string, groups: number) => string;
    stageEachGroup: (amount: string) => string;
    stageMeasured: (label: string, noun: string, groups: number) => string;
    stageCupPart: (noun: string, half: boolean) => string;
    stageUnpaired: (label: string, noun: string, count: string) => string;
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

/** The intro with `lines` made from its cards and the grown-up's details (every disclosure in one list). */
function introText(i: Omit<UiText["intro"], "lines">): UiText["intro"] {
  return {
    ...i,
    lines: [
      ...i.cards.flatMap((c) => [c.title, ...c.lines]),
      i.adultTitle,
      ...i.adultLines,
    ],
  };
}

const JA: UiText = {
  lang: "ja",
  // The work's name (君のルールで世界を作る) is not shown to the child: it would attribute the reading to the
  // child (原則10, 指示書 第11節 M7).
  title: "AIくんと問題を読もう",
  preparing: "じゅんびしています…",
  langSwitch: { label: "ことば", ja: "日本語", en: "English" },
  reading: { label: "読むのを手伝う", aloud: "読み上げ", stop: "止める", furigana: "ふりがな" },
  buttons: { stop: "やめる", dontKnow: "わからない", hard: "つらい" },
  alwaysLabel: "いつでも使えるボタン",
  intro: introText({
    label: "はじめに",
    cards: [
      {
        title: "AIくんは AI です",
        lines: [
          "いっしょに問題を読む「AIくん」は、コンピューターの中の AI です。",
          "AIくんは人ではありません。心や気持ちもありません。",
        ],
      },
      {
        title: "AIくんの読み方",
        lines: [
          "AIくんは、いろいろな読み方で問題を読みます。まちがえることもあります。",
          "きみが「だれと くらべるか」で えらんだ 読み方で、つぎの問題を読むことも あります。",
        ],
      },
      {
        title: "記録と声",
        lines: [
          "記録は、このタブレットの中にだけしまいます。",
          "「話して教える」で話したことや、「文字で教える」に書いたことは、AI の Claude に送ります。タブレットにはのこりません。",
        ],
      },
      {
        title: "いつでも止められる",
        lines: ["「やめる」「わからない」「つらい」は、いつでもおせます。"],
      },
    ],
    adultTitle: "おうちの人へ（くわしく）",
    adultLines: [
      "AIくんは AI（Anthropic の Claude）で、人ではなく、心や気持ちもありません。",
      "2問目からのAIくんは、1問目で子どもが「だれとくらべるか」で選んだ人から作った読み方で、問題を読むことがあります。",
      "このアプリの記録は、この端末の中にだけしまいます。",
      "「話して教える」で話したことは、ブラウザの音声認識が文字にし、AIくんがわかるようにその文字を AI の Claude に送ります。話したことは、この端末には残しません。",
    ],
    start: "はじめる",
  }),
  consent: {
    label: "おうちの人の同意",
    child: "ここは、おうちの人が読むところです。おうちの人に見せてね。",
    lines: [
      "保護者の方へ",
      "AIくんの言葉と読み方の研究のために、問題と、子どもが「だれとくらべるか」で選んだ人（この端末に残っている前の回の選び方も含みます）を、Anthropic の Claude に送ります。",
      "子どもが「話して教える」で話したことは、ブラウザの音声認識が文字にし、その文字を Claude に送ります。送るのは、AIくんがその意味をわかるため、安全の確認（つらい気持ちの言葉がないかを見ること）のため、その回の読み方の研究のためです。Claude に送るのは文字だけで、声の録音は送りません。話したことの文字は、この端末には残しません。",
      "子どもが「文字で教える」に書いたことは、「話して教える」の文字と同じように Claude に送り、この端末には残しません。名前の欄に入れた名前は、画面に出すだけで、送りません。話したり書いたりした言葉の中にその名前があれば、送る前にお話の中の名前に置きかえます（入れた名前と同じ書き方の時だけです。ひらがなとカタカナは、どちらも置きかえます）。送ったものは、Anthropic の方針に従って Anthropic 側に一定の期間残ることがあります。",
      "このアプリの記録はこの端末の中にだけしまい、保護者の画面からいつでも消せます。2問目からのAIくんは、1問目で子どもが選んだ人から作った読み方で読むことがあります。",
      "「同意する」は、保護者の方が押してください。",
      "同意して始めますか？",
    ],
    yes: "同意する",
    no: "同意しない",
  },
  problem: {
    label: "問題",
    sentences: "問題の文",
    world: "AIくんが作った世界",
    note: null,
    next: "つぎへ",
    guess: { label: "じぶんのよそう", question: "どっちが多いと思う？", unknown: "まだわからない", card: "「1」にする人がいたら、その人のテープをタップしてね。", optional: "しなくても、だいじょうぶ。" },
    predict: { label: "AIくんの世界を見て", question: "この世界、問題とぴったり？ へん？", fits: "ぴったり", odd: "へん", unknown: "まだわからない" },
    looking: "「1」の札を、1とみる人のテープに動かして、AIくんに教えてね。",
    yes: "うん、そう",
    no: "ちがう",
    nextProblem: "つぎの問題へ",
    unitPad: "1区切りは、いくつ？",
    totalPad: "聞かれている数は、いくつ？",
    voice: {
      talk: "話して教える",
      stop: "話しおわった",
      listening: "聞いています…",
      unsupported: "このブラウザでは、声は使えません。札で教えてね。",
      denied: "マイクが使えないので、札で教えてね。",
      off: "いまは、声は使えません。札で教えてね。",
    },
    typed: { label: "文字で教える", hint: "AIくんに、ことばで教えてね", send: "教える" },
  },
  home: {
    label: "トップ",
    lead: ["AIくんは、問題を読みまちがえることがあります。", "AIくんが作った世界を見て、どこがへんか見つけて、教えてあげてね。"],
    nameLabel: "きみの名前（よびかた）",
    nameHint: "なまえ",
    nameBad: "ひらがな・カタカナ・漢字・ローマ字で、10文字まで。数字や記号は入れられません。",
    start: "はじめる",
    resume: "つづきから",
    restart: "さいしょから",
  },
  nav: { home: "トップへ", restartProblem: "この問題をさいしょから" },
  pad: { clear: "けす", ok: "これでいい" },
  research: { label: "じゅんび", wait: "AIくんが、つぎの問題をえらんでいます。" },
  ruleCard: {
    label: "AIくんのルールカード",
    lines: ["AIくんが、自分のカードを持ってきました。", "1とみる人を、えらびなおせます。"],
    slot: "1とみる人",
    gallery: "この回の問題",
    next: "つぎへ",
    scenes: "身近な場面で見てみる",
    scenesNote: "AIくんのカードの読み方で、身近な場面を読むと、こうなります。",
    sceneDrawing: "場面の絵",
  },
  finished: { label: "おわり", lines: ["きょうは、ここまでです。", "「おわる」をおすと、おわります。"], end: "おわる" },
  stuck: { label: "まっています", resume: "つづける", hold: "この問題は、あとで" },
  help: { label: "いっしょに読む", read: "読んだよ", orderLabel: "長いと思うほう", open: "絵本を見る", later: "あとで" },
  wordbook: { label: "ことばの絵本", one: "「1」とみるのは", close: "とじる" },
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
      "AIくんは AI（Anthropic の Claude）で、人ではありません。2問目からは、1問目で子どもが「だれとくらべるか」で選んだ人から作った読み方や、多くの子がする別の読み方で問題を読みます。AIくんは答えを知らされていません。",
    ],
    checksTitle: "AIなしで ためした記録",
    checksNone: "まだありません。",
    checkRow: (date, right, total) => `${date}：${String(total)}問中${String(right)}問 プログラムの答えと同じ数を入れました`,
    checksNote:
      "AIくんも図もなしで、問題の文と数の入力だけで解いた結果です。答えはプログラムが確かめています。「わからない」でとばした問題は、同じ数を入れた問題に数えません。",
    researchTitle: "研究ノート（アプリの今の考え）",
    researchLines: [
      "AIくんが問題を読むために、アプリが子どもの「1」の札の置き方から立てている、読み方についての今の考えです。",
      "数問から立てた仮の考えで、子どもを判定したものではありません。読み方は日によって変わります。",
      "ここは子どもの画面には出ません。子どもの画面では、どれもAIくんが問題を読む時の読み方として出るだけで、子どもから作ったとは伝えていません。問題の答えは、ここには出しません。",
    ],
    researchNone: "まだありません。問題を解くと、ここに出ます。",
    researchUnsettled: "今のところ、読み方は定まっていません。ここにあるどの考えとも合わない置き方が多いためです。",
    status: { hypothesis: "仮説", confirmed: "今のところの読み方" },
    entry: (line, status, backing, counted) => `『${line}』（${status}）：数えた${String(counted)}問のうち${String(backing)}問の「1」の置き方と合います`,
    trendTitle: "日ごとのようす",
    trendNone: "まだありません。",
    trendNote: "この端末に残っている記録だけから作っています。どこにも送りません。途中で終えた問題は数えていません。",
    trendRow: (date, solved, held, fixes) => `${date}：解いた問題 ${String(solved)}問、あとにした問題 ${String(held)}問、AIくんの世界を直した回数 ${String(fixes)}回`,
    trendSettled: (line) => `『${line}』が、今のところの読み方になりました`,
    trendBack: (line) => `『${line}』は、仮説にもどりました`,
    trendDropped: (line) => `『${line}』は、考えから外れました`,
    wordingTitle: "ことばに頼らない読み方",
    wordingLines: [
      "AIくんの世界を直したあとに、同じ関係を別の言い回し（「に対して」「をもとにすると」など）で書いた問題が出ることがあります。",
      "その問題で、直す前のAIくんの読み方にもどらずに最初の「1」を置き、最後まで解けた時だけ、ここに残します。言い回しの手がかりだけで直したのではないことの、ひとつの手がかりです。",
    ],
    wordingNone: "まだありません。",
    wordingUnknown: "前の読み方",
    wordingRow: (date, line) => `${date}：AIくんの『${line}』を直したあと、別の言い回しの問題でも、その読み方にもどらずに読みました`,
    deleteAsk: "記録をすべて消す",
    deleteWarn: "この端末の記録と同意を、すべて消します。元には戻せません。",
    deleteYes: "消す",
    deleteNo: "やめておく",
    deleted: "消しました。",
    back: "もどる",
    tryLink: "大人向けの試用と「中身を見る」（子どもの記録とは別です）",
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
    /** The drawn mark of a world that cannot happen, described as drawn (never a verdict on the sentences). */
    jagged: (label) => `${label}の テープの はしが ぎざぎざです`,
    join: (parts) => parts.join("。") + "。",
    stage: "せかいの え",
    stageHolder: (label, noun, count) => `${label}の ${noun}は ${count}`,
    stageUnknown: (label, noun) => `${label}の ${noun}は 「？」`,
    stageEmpty: (label, noun) => `${label}の ${noun}は えに かけません`,
    stageDishes: (label, noun, dishes) => `${label}の ${noun}は ${String(dishes)}まいの おさらに わけてあります`,
    stageEach: (count) => `おさら ひとつに ${count}`,
    stageCut: (noun, half, ghost) =>
      ghost ? (half ? `はんぶんだけの ${noun}が あります` : `かけた ${noun}が あります`) : half ? `はんぶんに きれた ${noun}が あります` : `きれた ${noun}が あります`,
    stagePaired: (smaller, larger, noun) => `${smaller}の ${noun}と ${larger}の ${noun}を、ひとつずつ ならべています`,
    stagePoured: (label, noun, groups) => `${label}の ${noun}を ${String(groups)}つに わけて、カップに いれています`,
    stageEachGroup: (amount) => `ひとつぶんは ${amount}`,
    stageMeasured: (label, noun, groups) => `${label}の ${noun}を ${String(groups)}つに わけています`,
    stageCupPart: (noun, half) => (half ? `${noun}が はんぶん はいった カップが あります` : `${noun}が とちゅうまで はいった カップが あります`),
    stageUnpaired: (label, noun, count) => `${label}の ${noun}のうち ${count}は、あいてが いません`,
    amount: (wholes, piece, counter) => {
      const p = piece === null ? "" : piece.num * 2 === piece.den ? "はんぶん" : `${String(piece.den)}ぶんの${String(piece.num)}`;
      if (wholes === 0) return p === "" ? `0${counter}` : p;
      return p === "" ? `${String(wholes)}${counter}` : `${String(wholes)}${counter}と ${p}`;
    },
  },
};

const EN: UiText = {
  lang: "en",
  title: "Read problems with AI-kun",
  preparing: "Getting ready…",
  langSwitch: { label: "Language", ja: "日本語", en: "English" },
  reading: { label: "Reading help", aloud: "Read aloud", stop: "Stop reading", furigana: "Furigana" },
  buttons: { stop: "Stop", dontKnow: "I don't know", hard: "I feel bad" },
  alwaysLabel: "Buttons you can use any time",
  intro: introText({
    label: "Welcome",
    cards: [
      {
        title: "AI-kun is an AI",
        lines: [
          'The "AI-kun" who reads the problems with you is an AI.',
          "AI-kun is not a person. It has no heart and no feelings.",
        ],
      },
      {
        title: "How AI-kun reads",
        lines: [
          "AI-kun reads problems in different ways. Sometimes it cannot read well.",
          'It may read the next problem the way you chose who is compared with whom.',
        ],
      },
      {
        title: "Records and your voice",
        lines: [
          "Records are kept only on this tablet.",
          'What you say with "Tell by talking" or type in "Tell by typing" is sent to Claude, an AI. It is not kept on this tablet.',
        ],
      },
      {
        title: "You can stop any time",
        lines: [
          'You can press "Stop", "I don\'t know" or "I feel bad" at any time.',
        ],
      },
    ],
    adultTitle: "For parents (details)",
    adultLines: [
      "AI-kun is an AI (Anthropic's Claude). It is not a person and has no heart or feelings.",
      'From the second problem, AI-kun may read with a way of reading made from whom the child chose to compare with on the first problem.',
      "This app keeps its records only on this device.",
      'What the child says with "Tell by talking" is turned into text by the browser’s speech recognition, and that text is sent to Claude, an AI, so AI-kun can understand it. What was said is not kept on this device.',
    ],
    start: "Start",
  }),
  consent: {
    label: "Consent from a parent or guardian",
    child: "This part is for a grown-up at home. Please show it to them.",
    lines: [
      "For parents and guardians",
      'For AI-kun\'s words and for research on ways of reading, this app sends the problem and whom the child chose to compare with (including earlier choices kept on this device) to Anthropic\'s Claude.',
      'What the child says with "Tell by talking" is turned into text by the browser\'s speech recognition, and that text is sent to Claude: so AI-kun can understand it, for the safety check (looking for words of distress), and for research on that session\'s way of reading. Only text is sent to Claude, not a recording of the voice. The text of what the child said is not kept on this device.',
      "What the child types in \"Tell by typing\" is sent to Claude in the same way as the text of \"Tell by talking\", and is not kept on this device. The name entered in the name box is only shown on the screen and is never sent. Where that name is in what the child says or types, it is replaced with the story's own name before sending (only when written the same way; hiragana and katakana are both replaced). What is sent may be kept by Anthropic for some time under Anthropic's policies.",
      "This app keeps its records only on this device, and you can delete them at any time from the parent screen. From the second problem, AI-kun may read with a way of reading made from whom the child chose on the first problem.",
      'Please have a parent or guardian press "I agree".',
      "Do you agree and start?",
    ],
    yes: "I agree",
    no: "I do not agree",
  },
  problem: {
    label: "Problem",
    sentences: "The problem's sentences",
    world: "The world AI-kun made",
    note: "The problem is written in Japanese.",
    next: "Next",
    guess: { label: "Your guess first", question: "Who has more, do you think?", unknown: "Not sure yet", card: "If someone is taken as 1, tap their tape.", optional: "It is fine to leave it." },
    predict: { label: "Look at AI-kun's world", question: "Does this world fit the problem?", fits: "It fits", odd: "Something's odd", unknown: "Not sure yet" },
    looking: 'Move the "1" card onto the tape of the person you take as 1, and show AI-kun.',
    yes: "Yes, that's it",
    no: "Not that",
    nextProblem: "Next problem",
    unitPad: "How much is each part?",
    totalPad: "What number does the problem ask for?",
    voice: {
      talk: "Tell by talking",
      stop: "Done talking",
      listening: "Listening…",
      unsupported: "Talking does not work in this browser. Show it with the card.",
      denied: "The microphone is not available. Show it with the card.",
      off: "Talking does not work right now. Show it with the card.",
    },
    typed: { label: "Tell by typing", hint: "Tell AI-kun in words", send: "Tell" },
  },
  home: {
    label: "Top",
    lead: ["AI-kun sometimes misreads a problem.", "Look at the world AI-kun made, find what is odd, and tell AI-kun."],
    nameLabel: "Your name",
    nameHint: "name",
    nameBad: "Letters only (kana, kanji or roman letters), up to 10. No numbers or marks.",
    start: "Start",
    resume: "Continue",
    restart: "Start over",
  },
  nav: { home: "Top", restartProblem: "This problem from the start" },
  pad: { clear: "Clear", ok: "Done" },
  research: { label: "Getting ready", wait: "AI-kun is choosing the next problem." },
  ruleCard: {
    label: "AI-kun's rule card",
    lines: ["AI-kun brought its reading card.", "Pick again who AI-kun takes as 1."],
    slot: "Who is taken as 1",
    gallery: "Problems from this time",
    next: "Next",
    scenes: "See it in everyday scenes",
    scenesNote: "Everyday scenes, read with AI-kun's card, look like this.",
    sceneDrawing: "Scene drawing",
  },
  finished: { label: "The end", lines: ["That's all for today.", 'Press "Finish" to finish.'], end: "Finish" },
  stuck: { label: "Waiting", resume: "Keep going", hold: "Save this problem for later" },
  help: { label: "Reading together", read: "I read it", orderLabel: "My guess: which is longer", open: "Open the picture book", later: "Not now" },
  wordbook: { label: "Picture book of words", one: 'Taken as "1":', close: "Close" },
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
      'AI-kun is an AI (Anthropic\'s Claude), not a person. From the second problem, it reads problems with a way of reading made from whom the child chose to compare with on the first problem, or with a way of reading many children use. AI-kun is not told the answers.',
    ],
    checksTitle: "Records of trying without AI",
    checksNone: "None yet.",
    checkRow: (date, right, total) => `${date}: ${String(right)} of ${String(total)} entered the same number as the program's answer`,
    checksNote:
      'These are results of solving with only the problem text and number entry, without AI-kun or pictures. The program checks the answers. A problem skipped with "I don\'t know" is not counted as the same number.',
    researchTitle: "Research note (what the app thinks for now)",
    researchLines: [
      "These are the app's current ideas about how the child reads, made from where the child placed the \"1\" card, so that AI-kun can read problems.",
      "They are guesses from a few problems, not an assessment of the child. Ways of reading change from day to day.",
      "None of this is on the child's screens. There, each one only appears as a way AI-kun reads a problem, and the child is not told it was made from the child. The answers of the problems are not shown here.",
    ],
    researchNone: "None yet. Ideas appear here after the child solves problems.",
    researchUnsettled: "For now, no way of reading stands out: most placements fit none of these ideas.",
    status: { hypothesis: "a guess", confirmed: "the way of reading for now" },
    entry: (line, status, backing, counted) => `"${line}" (${status}): fits where the "1" card was placed on ${String(backing)} of ${String(counted)} problems counted`,
    trendTitle: "Day by day",
    trendNone: "None yet.",
    trendNote: "Made only from the records kept on this device; nothing is sent anywhere. Problems ended partway are not counted.",
    trendRow: (date, solved, held, fixes) => `${date}: ${String(solved)} problems solved, ${String(held)} kept for later, AI-kun's world fixed ${String(fixes)} times`,
    trendSettled: (line) => `"${line}" became the way of reading for now`,
    trendBack: (line) => `"${line}" went back to being a guess`,
    trendDropped: (line) => `"${line}" is no longer considered`,
    wordingTitle: "Reading that does not lean on the wording",
    wordingLines: [
      "After AI-kun's world is fixed, a problem may come that says the same relation with another of the known Japanese phrasings for which amount is the base.",
      'Only when the "1" card first went where the sentence puts it there, without going back to AI-kun\'s earlier way of reading, and the problem was solved, is it kept here. It is one sign that the fix did not rest on the words alone.',
    ],
    wordingNone: "None yet.",
    wordingUnknown: "the earlier way of reading",
    wordingRow: (date, line) => `${date}: after AI-kun's "${line}" was fixed, a problem in another phrasing was read without going back to that way of reading`,
    deleteAsk: "Delete all records",
    deleteWarn: "This deletes every record and the consent on this device. It cannot be undone. The language choice stays.",
    deleteYes: "Delete",
    deleteNo: "Keep them",
    deleted: "Deleted.",
    back: "Back",
    tryLink: "Try it as an adult, with \"see inside\" (kept apart from the child's records)",
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
    jagged: (label) => `The end of the tape of ${label} is jagged`,
    join: (parts) => parts.join(". ") + ".",
    stage: "The world's picture",
    stageHolder: (label, noun, count) => `${label}: ${noun}, ${count}`,
    stageUnknown: (label, noun) => `${label}: ${noun}, "?"`,
    stageEmpty: (label, noun) => `${label}: ${noun} that cannot be drawn`,
    stageDishes: (label, noun, dishes) => `${label}'s ${noun} are shared onto ${String(dishes)} dishes`,
    stageEach: (count) => `${count} on each dish`,
    stageCut: (noun, half, ghost) =>
      ghost ? (half ? `There is half a ${noun}` : `There is part of a ${noun}`) : half ? `There is a ${noun} cut in half` : `There is a cut ${noun}`,
    stagePaired: (smaller, larger, noun) => `${smaller}'s ${noun} and ${larger}'s ${noun} are lined up one to one`,
    stagePoured: (label, noun, groups) => `${label}'s ${noun} is poured into cups in ${String(groups)} groups`,
    stageEachGroup: (amount) => `${amount} in each group`,
    stageMeasured: (label, noun, groups) => `${label}'s ${noun} is shared into ${String(groups)} groups`,
    stageCupPart: (noun, half) => (half ? `There is a cup half full of ${noun}` : `There is a cup part full of ${noun}`),
    stageUnpaired: (label, noun, count) => `${count} of ${label}'s ${noun} have no partner`,
    amount: (wholes, piece, counter) => {
      const p = piece === null ? "" : piece.num * 2 === piece.den ? "a half" : `${String(piece.num)}/${String(piece.den)}`;
      const w = `${String(wholes)} ${counter}`.trim();
      if (wholes === 0) return p === "" ? w : p;
      return p === "" ? w : `${w} and ${p}`;
    },
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
