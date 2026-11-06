// The signboard problem and two misreadings of it (指示書 第11節 M1, checked against 第5.2節).
// Structure: the older brother has 6, and that is 3/4 of what the younger brother has. How many does
// the younger brother have? The problem text below is written for this repository.
//
// - signboardCorrect:    older = 3/4 x younger                  -> younger = 8
// - signboardProcedural: younger = 3/4 x 6 (multiply what is given) -> younger = 9/2, not a whole fish
// - signboardAdditive:   the numerator 3 is read as a difference, older = younger - 3 -> younger = 9
//
// All three share ids so that they read as three readings of the same sentences.
import type { WorldScene } from "../../src/schema/index.ts";

const PROBLEM_TEXT =
  "お店の看板に、こう書いてあります。「兄の金魚は6匹。これは、弟の金魚の数の3/4です。」弟の金魚は何匹ですか。";

function base(relation: WorldScene["relations"][number]): WorldScene {
  return {
    schema_version: "3",
    problem_id: "p_signboard",
    problem_type: "ratio",
    problem_text: PROBLEM_TEXT,
    grade: 5,
    problem_lang: "ja",
    holders: [
      { id: "h_ani", label: "兄" },
      { id: "h_otouto", label: "弟" },
    ],
    item_kinds: [{ id: "k_kingyo", noun: "金魚", counter: "匹", asset_key: null, countable: true }],
    quantities: [
      { id: "q_ani", holder: "h_ani", item_kind: "k_kingyo", at_event: null, value: { num: 6, den: 1 } },
      { id: "q_otouto", holder: "h_otouto", item_kind: "k_kingyo", at_event: null, value: null },
    ],
    relations: [relation],
    events: [],
    question: { target_type: "quantity", target_id: "q_otouto" },
    word_links: [
      { phrase: "兄", lang: "ja", element_id: "h_ani" },
      { phrase: "弟", lang: "ja", element_id: "h_otouto" },
      { phrase: "3/4", lang: "ja", element_id: "r_ratio" },
    ],
  };
}

/** Older brother's count is 3/4 of the younger brother's. */
export const signboardCorrect: WorldScene = base({
  id: "r_ratio",
  operator: "fraction_of",
  subject: "q_ani",
  reference: "q_otouto",
  reference_list: null,
  amount: { num: 3, den: 4 },
  other_description: null,
});

/** "Multiply 6 by 3/4": the younger brother is 3/4 of the older brother. */
export const signboardProcedural: WorldScene = base({
  id: "r_ratio",
  operator: "fraction_of",
  subject: "q_otouto",
  reference: "q_ani",
  reference_list: null,
  amount: { num: 3, den: 4 },
  other_description: null,
});

/** The 3 of 3/4 read as a difference: the older brother has 3 fewer than the younger. */
export const signboardAdditive: WorldScene = base({
  id: "r_ratio",
  operator: "less_by",
  subject: "q_ani",
  reference: "q_otouto",
  reference_list: null,
  amount: { num: 3, den: 1 },
  other_description: null,
});

export const signboard = {
  correct: signboardCorrect,
  procedural: signboardProcedural,
  additive: signboardAdditive,
} as const;
