// The third problem of the child's route (Q63): a percent off, from the shape of the national survey's discount
// problem that few children solved, made one item so it rides the one-sentence steps (Q62). 「20%引き」 is read as
// 「代金は定価の4/5」 (the existing percent problems also write a percent and keep it as a fraction): five parts of the
// price, one part is the discount (200円), the paid price is four parts (800円). Read the other way round (the paid
// price taken as the whole), the shirt costs 1250円 after its discount. 1000円 keeps every number a whole number of 100円
// coins, so the stage can draw the money (Q63), and one part (200円) is never one coin: a coin's worth may be said
// before the child has said one part (500円 made one part 100円, the coin itself). The sentences are written for this repository.
import type { ProblemRecord, WorldScene } from "../../src/schema/index.ts";

type Mark = ProblemRecord["syntax_marks"][number];

const mark = (
  kind: Mark["kind"],
  statement_index: number,
  at: number,
  word: string,
  element_id: string | null,
  ratio_kind: Mark["ratio_kind"] = null,
): Mark => ({
  kind,
  statement_index,
  token_start: at,
  token_end: at,
  element_id,
  word,
  ratio_kind,
  l1_pattern_id: null,
  native_checked: null,
});

const SENTENCES: { tokens: string[]; ids: string[]; question: boolean }[] = [
  { tokens: ["シャツ", "の", "定価", "は", "1000", "円", "です", "。"], ids: ["q_list"], question: false },
  { tokens: ["セール", "で", "、", "代金", "は", "定価", "の", "20%", "引き", "です", "。"], ids: ["r_sale"], question: false },
  { tokens: ["代金", "は", "何", "円", "です", "か", "。"], ids: ["q_pay"], question: true },
];

const statements: ProblemRecord["statements"] = SENTENCES.map((s, index) => ({
  index,
  text: s.tokens.join(""),
  element_ids: s.ids,
  is_question: s.question,
  speaker_holder_id: null,
  tokens: s.tokens,
}));

const world: WorldScene = {
  schema_version: "3",
  problem_id: "p_sale",
  problem_type: "ratio",
  problem_text: statements.map((s) => s.text).join(""),
  grade: 5,
  problem_lang: "ja",
  holders: [
    { id: "h_list", label: "定価" },
    { id: "h_pay", label: "代金" },
  ],
  item_kinds: [{ id: "k_yen", noun: "お金", counter: "円", asset_key: null, countable: true }],
  quantities: [
    { id: "q_list", holder: "h_list", item_kind: "k_yen", at_event: null, value: { num: 1000, den: 1 } },
    { id: "q_pay", holder: "h_pay", item_kind: "k_yen", at_event: null, value: null },
  ],
  relations: [
    {
      id: "r_sale",
      operator: "fraction_of",
      subject: "q_pay",
      reference: "q_list",
      reference_list: null,
      amount: { num: 4, den: 5 },
      other_description: null,
    },
  ],
  events: [],
  question: { target_type: "quantity", target_id: "q_pay" },
  word_links: [
    { phrase: "定価", lang: "ja", element_id: "h_list" },
    { phrase: "代金", lang: "ja", element_id: "h_pay" },
    { phrase: "20%引き", lang: "ja", element_id: "r_sale" },
  ],
};

export const saleRecord: ProblemRecord = {
  schema_version: "1",
  world,
  consistency: "consistent",
  pair_id: null,
  source: "prepared",
  checks: { double_build_match: false, restate_match: false, misread_pass_rate: null, human_checked: false },
  expected_answer: { num: 800, den: 1 },
  statements,
  syntax_marks: [
    mark("holder_mention", 0, 2, "定価", "h_list"),
    mark("unit_word", 0, 5, "円", "k_yen"),
    mark("holder_mention", 1, 3, "代金", "h_pay"),
    mark("holder_mention", 1, 5, "定価", "h_list"),
    mark("relation_word", 1, 6, "の", "r_sale"),
    mark("ratio_notation", 1, 7, "20%", "r_sale", ["lt1", "percent"]),
    mark("relation_word", 1, 8, "引き", "r_sale"),
    mark("holder_mention", 2, 0, "代金", "h_pay"),
    mark("sentence_pattern", 2, 2, "何", null),
  ],
  companion_ids: [],
};
