// The judging problems of the research eval as ProblemRecords (addendum 5). The data is in
// evals/data/research/judge-problems.ts; this only builds the records, the same way the bank's records are
// built (holder, ratio, relation, unit and demonstrative marks on single tokens; one relation; one asked
// quantity). Used only to judge "recovered" in the research-judge section, never offered to a researcher.
import type { ProblemRecord, WorldScene } from "@kimi/core";
import { JUDGE_SPECS, type JudgeSpec, type JudgeTok } from "../../../evals/data/research/judge-problems.ts";

type Mark = ProblemRecord["syntax_marks"][number];

const KIND: Record<string, Mark["kind"]> = {
  holder: "holder_mention",
  ratio: "ratio_notation",
  relation: "relation_word",
  unit: "unit_word",
  demonstrative: "demonstrative",
};

const text = (t: JudgeTok): string => (typeof t === "string" ? t : t[0] === "ask" ? "何" : t[1]);

function markOf(t: JudgeTok, statement: number, token: number): Mark | null {
  if (typeof t === "string") return null;
  const base = { statement_index: statement, token_start: token, token_end: token, l1_pattern_id: null, native_checked: null };
  if (t[0] === "ask") return { ...base, kind: "sentence_pattern", element_id: null, word: "何", ratio_kind: null };
  const kind = KIND[t[0]];
  if (kind === undefined) throw new Error(`unknown mark ${t[0]}`);
  return { ...base, kind, element_id: t[2], word: t[1], ratio_kind: t[0] === "ratio" ? t[3] : null };
}

export function judgeRecord(s: JudgeSpec): ProblemRecord {
  const statements = s.sentences.map((x, index) => {
    const tokens = x.toks.map(text);
    return { index, text: tokens.join(""), element_ids: x.ids, is_question: x.question === true, speaker_holder_id: null, tokens };
  });
  const syntax_marks = s.sentences.flatMap((x, si) => x.toks.flatMap((t, i) => markOf(t, si, i) ?? []));
  const [kid, noun, counter] = s.kind;
  const world: WorldScene = {
    schema_version: "3",
    problem_id: s.id,
    problem_type: "ratio",
    problem_text: statements.map((x) => x.text).join(""),
    grade: 6,
    problem_lang: "ja",
    holders: s.holders.map(([id, label]) => ({ id, label })),
    item_kinds: [{ id: kid, noun, counter, asset_key: null, countable: true }],
    quantities: s.quantities.map(([id, holder, v]) => ({ id, holder, item_kind: kid, at_event: null, value: v === null ? null : { num: v, den: 1 } })),
    relations: [
      {
        id: s.relation.id,
        operator: s.relation.operator,
        subject: s.relation.subject,
        reference: s.relation.reference,
        reference_list: null,
        amount: { num: s.relation.num, den: s.relation.den },
        other_description: null,
      },
    ],
    events: [],
    question: { target_type: "quantity", target_id: s.asked },
    word_links: [],
  };
  return {
    schema_version: "1",
    world,
    consistency: s.consistency,
    pair_id: null,
    source: "prepared",
    checks: { double_build_match: false, restate_match: false, misread_pass_rate: null, human_checked: false },
    expected_answer: { num: s.answer, den: 1 },
    statements,
    syntax_marks,
    companion_ids: [],
  };
}

export const JUDGE_PROBLEMS: readonly ProblemRecord[] = JUDGE_SPECS.map(judgeRecord);
