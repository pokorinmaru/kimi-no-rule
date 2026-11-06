// M2 (指示書 第6.6節 step 5, record shape in 第5.1節): the sentences and syntax marks the world builder
// writes are checked against the world before use. Written before the implementation.
import { describe, expect, it } from "vitest";
import { validateStatements, type ProblemRecord, type WorldScene } from "../index.ts";
import { PROVISIONAL } from "../../fixtures/problems/provisional.ts";
import { signboardRecord } from "../../fixtures/problems/signboard-record.ts";

type Statement = ProblemRecord["statements"][number];
type Mark = ProblemRecord["syntax_marks"][number];

/**
 * The signboard record with its problem text cut down to exactly the sentences it lists, so that
 * every rule holds on it under any reading of how the sentences cover the text.
 */
function exact(): ProblemRecord {
  const r = structuredClone(signboardRecord);
  r.world.problem_text = r.statements.map((s) => s.text).join("");
  return r;
}

const check = (r: ProblemRecord) => validateStatements(r.world, r.statements, r.syntax_marks);

function expectFails(r: ProblemRecord): void {
  const res = check(r);
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.errors.length).toBeGreaterThan(0);
}

function withStatement(r: ProblemRecord, i: number, f: (s: Statement) => Statement): ProblemRecord {
  return { ...r, statements: r.statements.map((s, j) => (j === i ? f(structuredClone(s)) : s)) };
}

function withMark(r: ProblemRecord, i: number, f: (m: Mark) => Mark): ProblemRecord {
  return { ...r, syntax_marks: r.syntax_marks.map((m, j) => (j === i ? f(structuredClone(m)) : m)) };
}

/** A small change problem with a move, so that the coverage of events is checked. Test-only text. */
function eventRecord(): ProblemRecord {
  const sentences = [
    { text: "あはビー玉を5こ持っています。", ids: ["q_a0"] },
    { text: "いはビー玉を1こ持っています。", ids: ["q_b0"] },
    { text: "あはいに2こあげました。", ids: ["e_give"] },
    { text: "いのビー玉は何こになりましたか。", ids: ["q_b1"], question: true },
  ];
  const world: WorldScene = {
    schema_version: "3",
    problem_id: "p_stmt_event",
    problem_type: "change",
    problem_text: sentences.map((s) => s.text).join(""),
    grade: 3,
    problem_lang: "ja",
    holders: [
      { id: "h_a", label: "あ" },
      { id: "h_b", label: "い" },
    ],
    item_kinds: [{ id: "k_b", noun: "ビー玉", counter: "こ", asset_key: null, countable: true }],
    quantities: [
      { id: "q_a0", holder: "h_a", item_kind: "k_b", at_event: null, value: { num: 5, den: 1 } },
      { id: "q_b0", holder: "h_b", item_kind: "k_b", at_event: null, value: { num: 1, den: 1 } },
      { id: "q_b1", holder: "h_b", item_kind: "k_b", at_event: "e_give", value: null },
    ],
    relations: [],
    events: [{ id: "e_give", order: 1, type: "move", holder: "h_a", item_kind: "k_b", amount: { num: 2, den: 1 }, to_holder: "h_b" }],
    question: { target_type: "quantity", target_id: "q_b1" },
    word_links: [],
  };
  return {
    schema_version: "1",
    world,
    consistency: "consistent",
    pair_id: null,
    source: "prepared",
    checks: { double_build_match: false, restate_match: false, misread_pass_rate: null, human_checked: false },
    expected_answer: { num: 3, den: 1 },
    statements: sentences.map((s, index) => ({
      index,
      text: s.text,
      element_ids: s.ids,
      is_question: s.question === true,
      speaker_holder_id: null,
      tokens: [s.text],
    })),
    syntax_marks: [],
    companion_ids: [],
  };
}

describe("validateStatements: records that pass", () => {
  it("the signboard record as prepared passes", () => {
    // The prepared record lists the quoted sentences of the signboard; see the report on how the
    // sentences cover the problem text.
    expect(check(structuredClone(signboardRecord))).toEqual({ ok: true });
  });

  it("the signboard record with its text cut to its sentences passes", () => {
    expect(check(exact())).toEqual({ ok: true });
  });

  it.each(PROVISIONAL.map((p) => [p.record.world.problem_id, p.record] as const))("%s passes", (_id, r) => {
    expect(check(structuredClone(r))).toEqual({ ok: true });
  });

  it("a record with an event passes", () => {
    expect(check(eventRecord())).toEqual({ ok: true });
  });

  it("a speaker that is a holder of the world passes", () => {
    expect(check(withStatement(exact(), 0, (s) => ({ ...s, speaker_holder_id: "h_ani" })))).toEqual({ ok: true });
  });

  it("a mark over several tokens passes when its word is those tokens joined", () => {
    const r = exact();
    r.syntax_marks.push({ ...structuredClone(r.syntax_marks[0] as Mark), token_start: 0, token_end: 2, word: "兄の金魚", element_id: "q_ani" });
    expect(check(r)).toEqual({ ok: true });
  });

  it("does not change its inputs", () => {
    const r = exact();
    const before = structuredClone(r);
    check(r);
    check(withStatement(r, 0, (s) => ({ ...s, tokens: [] })));
    expect(r).toEqual(before);
  });
});

describe("validateStatements: the sentences and the problem text", () => {
  it("fails when the sentences come in another order than the text", () => {
    const r = exact();
    const [a, b] = [r.statements[0] as Statement, r.statements[1] as Statement];
    r.statements[0] = { ...a, text: b.text, tokens: b.tokens };
    r.statements[1] = { ...b, text: a.text, tokens: a.tokens };
    expectFails(r);
  });

  it("fails when a sentence says something the text does not", () => {
    expectFails(withStatement(exact(), 0, (s) => ({ ...s, text: "兄の金魚は7匹。", tokens: ["兄", "の", "金魚", "は", "7", "匹", "。"] })));
  });

  it("fails when a sentence of the text is missing", () => {
    const r = exact();
    r.statements = r.statements.filter((s) => s.index !== 1).map((s, index) => ({ ...s, index }));
    expectFails(r);
  });
});

describe("validateStatements: indexes", () => {
  it("fails when the indexes are not in order", () => {
    const r = exact();
    r.statements = r.statements.map((s, i) => ({ ...s, index: [0, 2, 1][i] as number }));
    expectFails(r);
  });

  it("fails when the indexes do not start at 0", () => {
    const r = exact();
    r.statements = r.statements.map((s) => ({ ...s, index: s.index + 1 }));
    expectFails(r);
  });

  it("fails when an index is repeated", () => {
    const r = exact();
    r.statements = r.statements.map((s, i) => ({ ...s, index: i === 2 ? 1 : s.index }));
    expectFails(r);
  });
});

describe("validateStatements: tokens", () => {
  it("fails when the tokens joined are not the sentence", () => {
    expectFails(withStatement(exact(), 0, (s) => ({ ...s, tokens: s.tokens.slice(0, -1) })));
  });

  it("fails when a sentence has no tokens", () => {
    // An empty sentence added at the end keeps the text whole, so only the empty tokens are wrong.
    const r = exact();
    r.statements.push({ index: r.statements.length, text: "", element_ids: [], is_question: false, speaker_holder_id: null, tokens: [] });
    expectFails(r);
  });
});

describe("validateStatements: elements", () => {
  it("fails when a sentence names an element the world does not have", () => {
    expectFails(withStatement(exact(), 0, (s) => ({ ...s, element_ids: [...s.element_ids, "q_nope"] })));
  });

  it("fails when no sentence is the question", () => {
    expectFails(withStatement(exact(), 2, (s) => ({ ...s, is_question: false })));
  });

  it("fails when two sentences are questions", () => {
    expectFails(withStatement(exact(), 0, (s) => ({ ...s, is_question: true })));
  });

  it("fails when the question sentence does not list what is asked", () => {
    expectFails(withStatement(exact(), 2, (s) => ({ ...s, element_ids: ["h_otouto"] })));
  });

  it("fails when a given quantity is in no sentence", () => {
    expectFails(withStatement(exact(), 0, (s) => ({ ...s, element_ids: [] })));
  });

  it("fails when a relation is in no sentence", () => {
    expectFails(withStatement(exact(), 1, (s) => ({ ...s, element_ids: [] })));
  });

  it("fails when an event is in no sentence", () => {
    expectFails(withStatement(eventRecord(), 2, (s) => ({ ...s, element_ids: [] })));
  });
});

describe("validateStatements: speakers", () => {
  it("fails when the speaker is not an id of the world", () => {
    expectFails(withStatement(exact(), 0, (s) => ({ ...s, speaker_holder_id: "h_nope" })));
  });

  it("fails when the speaker is an element that is not a holder", () => {
    expectFails(withStatement(exact(), 0, (s) => ({ ...s, speaker_holder_id: "q_ani" })));
  });
});

describe("validateStatements: syntax marks", () => {
  it("fails when a mark points past the last sentence", () => {
    expectFails(withMark(exact(), 0, (m) => ({ ...m, statement_index: 3 })));
  });

  it("fails when a mark points before the first sentence", () => {
    expectFails(withMark(exact(), 0, (m) => ({ ...m, statement_index: -1 })));
  });

  it("fails when a mark starts after it ends", () => {
    // statement 0 is [兄, の, 金魚, ...]: start 2, end 1.
    expectFails(withMark(exact(), 0, (m) => ({ ...m, token_start: 2, token_end: 1 })));
  });

  it("fails when a mark ends past the last token", () => {
    // statement 0 has 7 tokens.
    expectFails(withMark(exact(), 1, (m) => ({ ...m, token_start: 5, token_end: 7, word: "匹。" })));
  });

  it("fails when a mark's word is not the tokens it covers", () => {
    expectFails(withMark(exact(), 0, (m) => ({ ...m, word: "弟" })));
  });

  it("fails when a mark names an element the world does not have", () => {
    expectFails(withMark(exact(), 0, (m) => ({ ...m, element_id: "h_nope" })));
  });
});

describe("validateStatements: every problem at once", () => {
  it("reports each independent problem", () => {
    let r = withStatement(exact(), 0, (s) => ({ ...s, speaker_holder_id: "h_nope" }));
    r = withMark(r, 0, (m) => ({ ...m, element_id: "h_nope" }));
    const res = check(r);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe("validateStatements: where the numbers are (review fix, Q27)", () => {
  it("text left out of the sentences may frame them but holds no number", () => {
    // Leave out the sentence with 6 and hang its element on the next one.
    const r = exact();
    const [first, second, third] = r.statements as [Statement, Statement, Statement];
    r.statements = [
      { ...second, index: 0, element_ids: [...first.element_ids, ...second.element_ids] },
      { ...third, index: 1 },
    ];
    r.syntax_marks = [];
    expectFails(r);
  });

  it("an element with a given number sits on a sentence that has a number", () => {
    const r = exact();
    const moved = withStatement(
      withStatement(r, 1, (s) => ({ ...s, element_ids: s.element_ids.filter((id) => id !== "r_ratio") })),
      2,
      (s) => ({ ...s, element_ids: [...s.element_ids, "r_ratio"] }),
    );
    expectFails({ ...moved, syntax_marks: [] });
  });

  it("the signboard's frame has no number and passes", () => {
    expect(check(signboardRecord)).toEqual({ ok: true });
  });
});
