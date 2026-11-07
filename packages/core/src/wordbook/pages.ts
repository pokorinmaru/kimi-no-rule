// The word book's pages (ことばの絵本, 指示書 第7.1節): one page per wording of a fraction used as a multiple. Each
// page is an everyday example with countable things, written for this repository. Its holders, things and
// numbers are kept apart from every problem the child may meet (a test checks them against the prepared bank
// and content/problems/**), so a page never hands over a problem's number or holder. Data only.

export const WORDBOOK_PAGE_IDS = ["no", "wo_moto", "ni_taishite", "wo_ichi", "bai"] as const;
export type WordbookPageId = (typeof WORDBOOK_PAGE_IDS)[number];

export interface WordbookNumbers {
  one: number;
  other: number;
  amount: { num: number; den: number };
}

export interface WordbookPageData {
  id: WordbookPageId;
  /** The wording the page is about, as the problems write it (ja) and in English. */
  words: { ja: string; en: string };
  /** The holder taken as 1 (the relation's reference) and the other holder, in both languages. */
  one: { ja: string; en: string };
  other: { ja: string; en: string };
  thing: { noun: string; counter: string };
  /** The value of the holder taken as 1, the other holder's value, and the multiple (other = amount of one). */
  /**
   * The page's numbers: the holder taken as 1, the other holder (other = amount of one), the multiple. The first set
   * that meets none of the problem's values is used, so a page always has numbers kept apart from the problem.
   */
  numbers: readonly WordbookNumbers[];
  operator: "fraction_of" | "times";
  /** The page's sentences, with {one}, {other} and {amount} for the numbers: the example, what is taken as 1, the counts. */
  lines: { ja: readonly string[]; en: readonly string[] };
}

export const WORDBOOK_PAGES: readonly WordbookPageData[] = [
  {
    id: "no",
    words: { ja: "の", en: "of" },
    one: { ja: "黒いふくろ", en: "black bag" },
    other: { ja: "白いふくろ", en: "white bag" },
    thing: { noun: "あめ", counter: "こ" },
    numbers: [{ one: 32, other: 28, amount: { num: 7, den: 8 } }, { one: 27, other: 21, amount: { num: 7, den: 9 } }, { one: 42, other: 35, amount: { num: 5, den: 6 } }],
    operator: "fraction_of",
    lines: {
      ja: [
        "白いふくろのあめは、黒いふくろのあめの{amount}です。",
        "「黒いふくろのあめの{amount}」は、黒いふくろのあめを「1」とみたときの{amount}です。",
        "黒いふくろは{one}こ、白いふくろは{other}こです。",
      ],
      en: [
        "The candy in the white bag is {amount} of the candy in the black bag.",
        '"{amount} of the candy in the black bag" means: the black bag\'s candy is taken as "1", and this is {amount} of it.',
        "The black bag has {one}. The white bag has {other}.",
      ],
    },
  },
  {
    id: "wo_moto",
    words: { ja: "をもとにすると", en: "based on" },
    one: { ja: "左のかご", en: "left basket" },
    other: { ja: "右のかご", en: "right basket" },
    thing: { noun: "ビー玉", counter: "こ" },
    numbers: [{ one: 27, other: 21, amount: { num: 7, den: 9 } }, { one: 32, other: 28, amount: { num: 7, den: 8 } }, { one: 35, other: 28, amount: { num: 4, den: 5 } }],
    operator: "fraction_of",
    lines: {
      ja: [
        "右のかごのビー玉は、左のかごのビー玉をもとにすると{amount}です。",
        "「左のかごのビー玉をもとにすると」は、左のかごのビー玉を「1」とみる、ということです。",
        "左のかごは{one}こ、右のかごは{other}こです。",
      ],
      en: [
        "Based on the marbles in the left basket, the marbles in the right basket are {amount}.",
        '"Based on the marbles in the left basket" means: the left basket\'s marbles are taken as "1".',
        "The left basket has {one}. The right basket has {other}.",
      ],
    },
  },
  {
    id: "ni_taishite",
    words: { ja: "に対して", en: "compared with" },
    one: { ja: "銀のかん", en: "silver tin" },
    other: { ja: "金のかん", en: "gold tin" },
    thing: { noun: "せんべい", counter: "まい" },
    numbers: [{ one: 42, other: 35, amount: { num: 5, den: 6 } }, { one: 27, other: 21, amount: { num: 7, den: 9 } }, { one: 32, other: 28, amount: { num: 7, den: 8 } }],
    operator: "fraction_of",
    lines: {
      ja: [
        "金のかんのせんべいは、銀のかんのせんべいに対して{amount}です。",
        "「銀のかんのせんべいに対して」は、銀のかんのせんべいを「1」とみる、ということです。",
        "銀のかんは{one}まい、金のかんは{other}まいです。",
      ],
      en: [
        "Compared with the rice crackers in the silver tin, the rice crackers in the gold tin are {amount}.",
        '"Compared with the rice crackers in the silver tin" means: the silver tin\'s rice crackers are taken as "1".',
        "The silver tin has {one}. The gold tin has {other}.",
      ],
    },
  },
  {
    id: "wo_ichi",
    words: { ja: "を1とみると", en: 'taken as "1"' },
    one: { ja: "上のたな", en: "top shelf" },
    other: { ja: "下のたな", en: "bottom shelf" },
    thing: { noun: "ビーズ", counter: "こ" },
    numbers: [{ one: 35, other: 28, amount: { num: 4, den: 5 } }, { one: 42, other: 35, amount: { num: 5, den: 6 } }, { one: 27, other: 21, amount: { num: 7, den: 9 } }],
    operator: "fraction_of",
    lines: {
      ja: [
        "上のたなのビーズを「1」とみると、下のたなのビーズは{amount}です。",
        "上のたなのビーズを「1」とみて、下のたなのビーズをくらべます。",
        "上のたなは{one}こ、下のたなは{other}こです。",
      ],
      en: [
        'When the beads on the top shelf are taken as "1", the beads on the bottom shelf are {amount}.',
        'The top shelf\'s beads are taken as "1", and the bottom shelf\'s beads are set beside them.',
        "The top shelf has {one}. The bottom shelf has {other}.",
      ],
    },
  },
  {
    id: "bai",
    words: { ja: "倍", en: "as many as" },
    one: { ja: "小さいつぼ", en: "small pot" },
    other: { ja: "大きいつぼ", en: "big pot" },
    thing: { noun: "どんぐり", counter: "こ" },
    numbers: [{ one: 28, other: 49, amount: { num: 7, den: 4 } }, { one: 21, other: 27, amount: { num: 9, den: 7 } }, { one: 42, other: 49, amount: { num: 7, den: 6 } }],
    operator: "times",
    lines: {
      ja: [
        "大きいつぼのどんぐりは、小さいつぼのどんぐりの{amount}倍です。",
        "「小さいつぼのどんぐりの{amount}倍」は、小さいつぼのどんぐりを「1」とみたときの{amount}です。",
        "小さいつぼは{one}こ、大きいつぼは{other}こです。",
      ],
      en: [
        "The acorns in the big pot are {amount} as many as the acorns in the small pot.",
        '"{amount} as many as the acorns in the small pot" means: the small pot\'s acorns are taken as "1", and this is {amount} of it.',
        "The small pot has {one}. The big pot has {other}.",
      ],
    },
  },
];

/**
 * The furigana of the pages' kanji (as the problems' readings, 指示書 第8.4b節), with the app's own readings under them.
 * Okurigana after a kanji is context (「白い」: しろ over 白).
 */
export const WORDBOOK_READINGS: Readonly<Record<string, string>> = {
  白い: "しろ",
  黒い: "くろ",
  左: "ひだり",
  右: "みぎ",
  ビー玉: "だま",
  金: "きん",
  銀: "ぎん",
  対して: "たい",
  上: "うえ",
  下: "した",
  小さい: "ちい",
  大きい: "おお",
  倍: "ばい",
};
