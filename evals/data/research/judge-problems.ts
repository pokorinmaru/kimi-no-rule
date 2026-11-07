// Judging problems for the research eval (指示書 第10.2節, the judging set; addendum 5). Eight
// fraction-as-a-multiple problems written for this repository and kept apart from the bank the researcher
// picks from: they are used only to decide whether a confirmed reading behaves like the child's reading.
// Plain data, no imports: tools/evals/src/judge-problems.ts turns each into a ProblemRecord, and its test
// checks every one with core (validateWorld, validateStatements, solve, problemConditions).
// They vary what tells the common readings apart: which holder comes first, which number is known, which
// one is asked, a multiple below or above 1, a unit fraction, and the words around the multiple.

/** A token: plain text, or [text, mark kind, element id, ratio kinds]. */
export type JudgeTok =
  | string
  | ["holder" | "relation" | "unit" | "demonstrative", string, string]
  | ["ratio", string, string, ("lt1" | "gt1" | "fraction")[]]
  | ["ask"];

export interface JudgeSpec {
  id: string;
  consistency: "consistent" | "inconsistent";
  sentences: { toks: JudgeTok[]; ids: string[]; question?: true }[];
  holders: [string, string][];
  /** [item kind id, noun, counter] */
  kind: [string, string, string];
  /** [quantity id, holder id, known value or null] */
  quantities: [string, string, number | null][];
  /** subject = amount x reference */
  relation: { id: string; operator: "fraction_of" | "times"; subject: string; reference: string; num: number; den: number };
  asked: string;
  answer: number;
}

export const JUDGE_SPECS: JudgeSpec[] = [
  // The compared amount comes first and is asked; the base is known.
  {
    id: "p_judge_pencil",
    consistency: "consistent",
    sentences: [
      { toks: [["holder", "弟", "h_otouto"], "の", "えんぴつ", "は", "、", ["holder", "兄", "h_ani"], "の", "えんぴつ", ["relation", "の", "r_j"], ["ratio", "2/3", "r_j", ["lt1", "fraction"]], "です", "。"], ids: ["r_j"] },
      { toks: [["holder", "兄", "h_ani"], "の", "えんぴつ", "は", "12", ["unit", "本", "k_pencil"], "です", "。"], ids: ["q_ani"] },
      { toks: [["holder", "弟", "h_otouto"], "の", "えんぴつ", "は", ["ask"], ["unit", "本", "k_pencil"], "です", "か", "。"], ids: ["q_otouto"], question: true },
    ],
    holders: [["h_otouto", "弟"], ["h_ani", "兄"]],
    kind: ["k_pencil", "えんぴつ", "本"],
    quantities: [["q_otouto", "h_otouto", null], ["q_ani", "h_ani", 12]],
    relation: { id: "r_j", operator: "fraction_of", subject: "q_otouto", reference: "q_ani", num: 2, den: 3 },
    asked: "q_otouto",
    answer: 8,
  },
  // The compared amount comes first and is known; the base is asked.
  {
    id: "p_judge_ball",
    consistency: "inconsistent",
    sentences: [
      { toks: [["holder", "赤い玉", "h_aka"], "の", "数", "は", "、", ["holder", "白い玉", "h_shiro"], "の", "数", ["relation", "の", "r_j"], ["ratio", "3/4", "r_j", ["lt1", "fraction"]], "です", "。"], ids: ["r_j"] },
      { toks: [["holder", "赤い玉", "h_aka"], "は", "15", ["unit", "こ", "k_ball"], "です", "。"], ids: ["q_aka"] },
      { toks: [["holder", "白い玉", "h_shiro"], "は", ["ask"], ["unit", "こ", "k_ball"], "です", "か", "。"], ids: ["q_shiro"], question: true },
    ],
    holders: [["h_aka", "赤い玉"], ["h_shiro", "白い玉"]],
    kind: ["k_ball", "玉", "こ"],
    quantities: [["q_aka", "h_aka", 15], ["q_shiro", "h_shiro", null]],
    relation: { id: "r_j", operator: "fraction_of", subject: "q_aka", reference: "q_shiro", num: 3, den: 4 },
    asked: "q_shiro",
    answer: 20,
  },
  // A multiple above 1 with 倍; the base is known and comes first.
  {
    id: "p_judge_acorn",
    consistency: "consistent",
    sentences: [
      { toks: [["holder", "弟", "h_otouto"], "は", "どんぐり", "を", "9", ["unit", "こ", "k_acorn"], "拾い", "ました", "。"], ids: ["q_otouto"] },
      { toks: [["holder", "兄", "h_ani"], "は", "、", ["holder", "弟", "h_otouto"], ["relation", "の", "r_j"], ["ratio", "4/3", "r_j", ["gt1", "fraction"]], "倍", "拾い", "ました", "。"], ids: ["r_j"] },
      { toks: [["holder", "兄", "h_ani"], "は", "どんぐり", "を", ["ask"], ["unit", "こ", "k_acorn"], "拾い", "ました", "か", "。"], ids: ["q_ani"], question: true },
    ],
    holders: [["h_otouto", "弟"], ["h_ani", "兄"]],
    kind: ["k_acorn", "どんぐり", "こ"],
    quantities: [["q_otouto", "h_otouto", 9], ["q_ani", "h_ani", null]],
    relation: { id: "r_j", operator: "times", subject: "q_ani", reference: "q_otouto", num: 4, den: 3 },
    asked: "q_ani",
    answer: 12,
  },
  // A multiple above 1 pointed at with これ; the compared amount is known and the base is asked.
  {
    id: "p_judge_stamp",
    consistency: "inconsistent",
    sentences: [
      { toks: [["holder", "母", "h_haha"], "は", "切手", "を", "20", ["unit", "まい", "k_stamp"], "持って", "い", "ます", "。"], ids: ["q_haha"] },
      { toks: [["demonstrative", "これ", "q_haha"], "は", "、", ["holder", "父", "h_chichi"], "が", "持って", "いる", "数", ["relation", "の", "r_j"], ["ratio", "5/4", "r_j", ["gt1", "fraction"]], "倍", "です", "。"], ids: ["r_j"] },
      { toks: [["holder", "父", "h_chichi"], "は", "切手", "を", ["ask"], ["unit", "まい", "k_stamp"], "持って", "い", "ます", "か", "。"], ids: ["q_chichi"], question: true },
    ],
    holders: [["h_haha", "母"], ["h_chichi", "父"]],
    kind: ["k_stamp", "切手", "まい"],
    quantities: [["q_haha", "h_haha", 20], ["q_chichi", "h_chichi", null]],
    relation: { id: "r_j", operator: "times", subject: "q_haha", reference: "q_chichi", num: 5, den: 4 },
    asked: "q_chichi",
    answer: 16,
  },
  // をもとにすると: the base comes second and is asked.
  {
    id: "p_judge_motoni",
    consistency: "inconsistent",
    sentences: [
      { toks: [["holder", "金魚", "h_kingyo"], "の", "数", "は", "、", ["holder", "メダカ", "h_medaka"], "の", "数", ["relation", "を", "r_j"], "もとにすると", ["ratio", "2/5", "r_j", ["lt1", "fraction"]], "です", "。"], ids: ["r_j"] },
      { toks: [["holder", "金魚", "h_kingyo"], "は", "6", ["unit", "匹", "k_fish"], "です", "。"], ids: ["q_kingyo"] },
      { toks: [["holder", "メダカ", "h_medaka"], "は", ["ask"], ["unit", "匹", "k_fish"], "です", "か", "。"], ids: ["q_medaka"], question: true },
    ],
    holders: [["h_kingyo", "金魚"], ["h_medaka", "メダカ"]],
    kind: ["k_fish", "魚", "匹"],
    quantities: [["q_kingyo", "h_kingyo", 6], ["q_medaka", "h_medaka", null]],
    relation: { id: "r_j", operator: "fraction_of", subject: "q_kingyo", reference: "q_medaka", num: 2, den: 5 },
    asked: "q_medaka",
    answer: 15,
  },
  // に対して: the base is known and comes first.
  {
    id: "p_judge_taishite",
    consistency: "consistent",
    sentences: [
      { toks: [["holder", "男子", "h_danshi"], "は", "20", ["unit", "人", "k_child"], "い", "ます", "。"], ids: ["q_danshi"] },
      { toks: [["holder", "女子", "h_joshi"], "の", "人数", "は", "、", ["holder", "男子", "h_danshi"], "の", "人数", ["relation", "に対して", "r_j"], ["ratio", "3/5", "r_j", ["lt1", "fraction"]], "です", "。"], ids: ["r_j"] },
      { toks: [["holder", "女子", "h_joshi"], "は", ["ask"], ["unit", "人", "k_child"], "です", "か", "。"], ids: ["q_joshi"], question: true },
    ],
    holders: [["h_danshi", "男子"], ["h_joshi", "女子"]],
    kind: ["k_child", "子ども", "人"],
    quantities: [["q_danshi", "h_danshi", 20], ["q_joshi", "h_joshi", null]],
    relation: { id: "r_j", operator: "fraction_of", subject: "q_joshi", reference: "q_danshi", num: 3, den: 5 },
    asked: "q_joshi",
    answer: 12,
  },
  // A unit fraction; the compared amount comes first and is asked.
  {
    id: "p_judge_marble",
    consistency: "consistent",
    sentences: [
      { toks: [["holder", "妹", "h_imo"], "の", "おはじき", "は", "、", ["holder", "姉", "h_ane"], "の", "おはじき", ["relation", "の", "r_j"], ["ratio", "1/4", "r_j", ["lt1", "fraction"]], "です", "。"], ids: ["r_j"] },
      { toks: [["holder", "姉", "h_ane"], "の", "おはじき", "は", "24", ["unit", "こ", "k_marble"], "です", "。"], ids: ["q_ane"] },
      { toks: [["holder", "妹", "h_imo"], "の", "おはじき", "は", ["ask"], ["unit", "こ", "k_marble"], "です", "か", "。"], ids: ["q_imo"], question: true },
    ],
    holders: [["h_imo", "妹"], ["h_ane", "姉"]],
    kind: ["k_marble", "おはじき", "こ"],
    quantities: [["q_imo", "h_imo", null], ["q_ane", "h_ane", 24]],
    relation: { id: "r_j", operator: "fraction_of", subject: "q_imo", reference: "q_ane", num: 1, den: 4 },
    asked: "q_imo",
    answer: 6,
  },
  // A unit fraction; the compared amount comes first and is known, the base is asked.
  {
    id: "p_judge_card",
    consistency: "inconsistent",
    sentences: [
      { toks: [["holder", "黄色のカード", "h_kiiro"], "は", "、", ["holder", "緑のカード", "h_midori"], ["relation", "の", "r_j"], ["ratio", "1/5", "r_j", ["lt1", "fraction"]], "です", "。"], ids: ["r_j"] },
      { toks: [["holder", "黄色のカード", "h_kiiro"], "は", "4", ["unit", "まい", "k_card"], "です", "。"], ids: ["q_kiiro"] },
      { toks: [["holder", "緑のカード", "h_midori"], "は", ["ask"], ["unit", "まい", "k_card"], "です", "か", "。"], ids: ["q_midori"], question: true },
    ],
    holders: [["h_kiiro", "黄色のカード"], ["h_midori", "緑のカード"]],
    kind: ["k_card", "カード", "まい"],
    quantities: [["q_kiiro", "h_kiiro", 4], ["q_midori", "h_midori", null]],
    relation: { id: "r_j", operator: "fraction_of", subject: "q_kiiro", reference: "q_midori", num: 1, den: 5 },
    asked: "q_midori",
    answer: 20,
  },
];
