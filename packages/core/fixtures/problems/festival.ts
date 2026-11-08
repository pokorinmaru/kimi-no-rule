// The first problem of the child's route (Q60): a story the child can picture, at a summer festival's goldfish
// scooping, with the child and AIくん as the two holders. The child's holder carries a placeholder name: the screen
// shows the child's own name in its place (apps/web, display only), so the child's name never reaches core, the
// worker or Claude. Same structure as the signboard: the child's 6 is 3/4 of what AIくん scooped (answer 8); read as
// 6 x 3/4, AIくん scoops 4 and a half goldfish. The sentences are written for this repository.
import type { ProblemRecord, WorldScene } from "../../src/schema/index.ts";

/** The child's holder in the problem until the screen puts the child's own name there. */
export const FESTIVAL_PLACEHOLDER = "そら";

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
  {
    tokens: ["なつまつり", "の", "金魚", "すくい", "で", "、", FESTIVAL_PLACEHOLDER, "は", "金魚", "を", "6", "匹", "すくい", "ました", "。"],
    ids: ["q_me"],
    question: false,
  },
  {
    tokens: ["これ", "は", "、", "AIくん", "が", "すくった", "金魚", "の", "数", "の", "3/4", "です", "。"],
    ids: ["r_ratio"],
    question: false,
  },
  {
    tokens: ["AIくん", "は", "、", "金魚", "を", "何", "匹", "すくい", "ました", "か", "。"],
    ids: ["q_ai"],
    question: true,
  },
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
  problem_id: "p_festival",
  problem_type: "ratio",
  problem_text: statements.map((s) => s.text).join(""),
  grade: 6,
  problem_lang: "ja",
  holders: [
    { id: "h_me", label: FESTIVAL_PLACEHOLDER },
    { id: "h_ai", label: "AIくん" },
  ],
  item_kinds: [{ id: "k_kingyo", noun: "金魚", counter: "匹", asset_key: null, countable: true }],
  quantities: [
    { id: "q_me", holder: "h_me", item_kind: "k_kingyo", at_event: null, value: { num: 6, den: 1 } },
    { id: "q_ai", holder: "h_ai", item_kind: "k_kingyo", at_event: null, value: null },
  ],
  relations: [
    {
      id: "r_ratio",
      operator: "fraction_of",
      subject: "q_me",
      reference: "q_ai",
      reference_list: null,
      amount: { num: 3, den: 4 },
      other_description: null,
    },
  ],
  events: [],
  question: { target_type: "quantity", target_id: "q_ai" },
  word_links: [
    { phrase: FESTIVAL_PLACEHOLDER, lang: "ja", element_id: "h_me" },
    { phrase: "AIくん", lang: "ja", element_id: "h_ai" },
    { phrase: "3/4", lang: "ja", element_id: "r_ratio" },
  ],
};

export const festivalRecord: ProblemRecord = {
  schema_version: "1",
  world,
  consistency: "inconsistent",
  pair_id: null,
  source: "prepared",
  checks: { double_build_match: false, restate_match: false, misread_pass_rate: null, human_checked: false },
  expected_answer: { num: 8, den: 1 },
  statements,
  syntax_marks: [
    mark("holder_mention", 0, 6, FESTIVAL_PLACEHOLDER, "h_me"),
    mark("unit_word", 0, 11, "匹", "k_kingyo"),
    mark("demonstrative", 1, 0, "これ", "q_me"),
    mark("holder_mention", 1, 3, "AIくん", "h_ai"),
    mark("relation_word", 1, 9, "の", "r_ratio"),
    mark("ratio_notation", 1, 10, "3/4", "r_ratio", ["lt1", "fraction"]),
    mark("holder_mention", 2, 0, "AIくん", "h_ai"),
    mark("sentence_pattern", 2, 5, "何", null),
  ],
  companion_ids: [],
};
