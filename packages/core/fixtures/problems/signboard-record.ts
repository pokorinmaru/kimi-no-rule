// The signboard problem as a problem record (指示書 第5.1節 ProblemRecord, 第5.7節, 第11節 M1).
// The three sentences, their tokens and marks are written for this repository and stay within the
// problem text of fixtures/problems/signboard.ts. Token positions in the marks are indexes into
// the sentence's tokens; a mark on one token has token_start = token_end.
import type { ProblemRecord } from "../../src/schema/index.ts";
import { signboardCorrect } from "./signboard.ts";

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

export const signboardRecord: ProblemRecord = {
  schema_version: "1",
  world: signboardCorrect,
  consistency: "inconsistent",
  pair_id: null,
  source: "prepared",
  checks: { double_build_match: false, restate_match: false, misread_pass_rate: null, human_checked: false },
  expected_answer: { num: 8, den: 1 },
  statements: [
    {
      index: 0,
      text: "兄の金魚は6匹。",
      element_ids: ["q_ani"],
      is_question: false,
      speaker_holder_id: null,
      tokens: ["兄", "の", "金魚", "は", "6", "匹", "。"],
    },
    {
      index: 1,
      text: "これは、弟の金魚の数の3/4です。",
      element_ids: ["r_ratio"],
      is_question: false,
      speaker_holder_id: null,
      tokens: ["これ", "は", "、", "弟", "の", "金魚", "の", "数", "の", "3/4", "です", "。"],
    },
    {
      index: 2,
      text: "弟の金魚は何匹ですか。",
      element_ids: ["q_otouto"],
      is_question: true,
      speaker_holder_id: null,
      tokens: ["弟", "の", "金魚", "は", "何", "匹", "です", "か", "。"],
    },
  ],
  syntax_marks: [
    mark("holder_mention", 0, 0, "兄", "h_ani"),
    mark("unit_word", 0, 5, "匹", "k_kingyo"),
    mark("demonstrative", 1, 0, "これ", "q_ani"),
    mark("holder_mention", 1, 3, "弟", "h_otouto"),
    mark("relation_word", 1, 8, "の", "r_ratio"),
    mark("ratio_notation", 1, 9, "3/4", "r_ratio", ["lt1", "fraction"]),
    mark("holder_mention", 2, 0, "弟", "h_otouto"),
    mark("sentence_pattern", 2, 4, "何", null),
  ],
  companion_ids: [],
};
