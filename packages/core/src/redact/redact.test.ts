// M1 step (8): redact (指示書 第9節 の記録の扱い、第11節 M1 の redact の基準).
// Written before the implementation. "Child text" here is the evidence of each op and the phrase of
// each phrase link in an interpretation, and the evidence of an explanation. Every utterance below
// is made up for the test.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { schemas, type AnyOp, type Explanation, type Interpretation } from "../schema/index.ts";
import { num, op } from "../apply/test-worlds.ts";
import { loadExamples } from "../schema/test-fixtures.ts";
import { hasChildText, redactExplanation, redactInterpretation } from "./index.ts";

const PROPERTY_RUNS = { numRuns: 200 };

/** One op of every kind. */
const SAMPLE_OPS: readonly AnyOp[] = [
  op.setQuantity("q_a", num(6)),
  op.setRelationAmount("r_1", num(3, 4)),
  op.setEventAmount("e_1", num(2)),
  op.setRelationOperator("r_1", "times"),
  op.swap("r_1"),
  op.setReference("r_1", "q_b"),
  op.addRelation("n_1", "total_of", "q_c", null, null, ["q_a", "q_b"]),
  op.addEvent("n_2", "move", "h_a", "k_acorn", num(4), "h_b"),
  op.setEventType("e_1", "lose"),
  op.setEventToHolder("e_1", "h_b"),
  op.setQuestionTarget("r_1", "relation_amount"),
  op.renameItemKind("k_acorn", "くり"),
  op.addHolder("n_3", "うさぎ"),
  op.addItemKind("n_4", "はこ"),
  op.addQuantity("n_5", "h_a", "k_acorn", null, num(5)),
  op.remove("q_c"),
  op.answer("q_b", num(9)),
  op.procedure("q_b", [{ quantity_id: "q_a" }, num(3, 4)], "multiply"),
  op.setUnitValue("q_a", num(2)),
  op.wordCue(0, [1, 2]),
];

const WORDS = ["3を足したよ", "4分の3にした", "あわせて", "ぜんぶで", "the bear gave four", "half of it"];

const withEvidence = (o: AnyOp, evidence: string): AnyOp => ({ ...o, evidence });

/** A made-up interpretation with words on every op and every phrase. */
function sampleInterpretation(): Interpretation {
  return schemas.interpretation.parse({
    schema_version: "6",
    utterance_lang: "ja",
    representable: "partial",
    ops: SAMPLE_OPS.map((o, i) => withEvidence(o, WORDS[i % WORDS.length] ?? "x")),
    unclear: ["q_c"],
    phrases: [
      { phrase: "4分の3", lang: "ja", element_id: "r_1" },
      { phrase: "おとうと", lang: "ja", element_id: "h_b" },
      { phrase: "more", lang: "en", element_id: "r_1" },
    ],
  });
}

function sampleExplanation(): Explanation {
  return schemas.explanation.parse({
    schema_version: "2",
    utterance_lang: "ja",
    kind: "expression",
    tokens: [
      { type: "number", number: { num: 6, den: 1 }, operator: null },
      { type: "operator", number: null, operator: "/" },
      { type: "number", number: { num: 3, den: 4 }, operator: null },
    ],
    answer: { num: 8, den: 1 },
    mentioned_elements: ["q_ani", "r_ratio"],
    evidence: "6を4分の3でわったよ",
  });
}

/** What redaction should give: the same object with only the child text emptied. */
function expectedInterpretation(x: Interpretation): Interpretation {
  return {
    ...x,
    ops: x.ops.map((o) => ({ ...o, evidence: "" })),
    phrases: x.phrases.map((p) => ({ ...p, phrase: "" })),
  };
}

const expectedExplanation = (x: Explanation): Explanation => ({ ...x, evidence: "" });

/** Every non-empty string in the child-text slots of the input. */
function childStrings(x: Interpretation): string[] {
  return [...x.ops.map((o) => o.evidence), ...x.phrases.map((p) => p.phrase)].filter((s) => s !== "");
}

/** Save and load as the device store would: JSON text and back. */
const stored = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe("redactInterpretation", () => {
  it("empties the evidence of every op and the phrase of every phrase link", () => {
    const r = redactInterpretation(sampleInterpretation());
    expect(r.ops).toHaveLength(SAMPLE_OPS.length);
    for (const o of r.ops) expect(o.evidence).toBe("");
    expect(r.phrases).toHaveLength(3);
    for (const p of r.phrases) expect(p.phrase).toBe("");
  });

  it("the saved record has none of the words and still passes the schema", () => {
    const x = sampleInterpretation();
    const saved = stored(redactInterpretation(x));
    const text = JSON.stringify(saved);
    for (const s of childStrings(x)) expect(text).not.toContain(JSON.stringify(s));
    expect(() => schemas.interpretation.parse(saved)).not.toThrow();
    expect(hasChildText(saved)).toBe(false);
  });

  it("keeps everything else: op kinds, ids, numbers, labels, languages and unclear", () => {
    const x = sampleInterpretation();
    const r = redactInterpretation(x);
    expect(r).toEqual(expectedInterpretation(x));
    expect(r.ops.map((o) => o.op)).toEqual(x.ops.map((o) => o.op));
    expect(r.phrases.map((p) => [p.lang, p.element_id])).toEqual(x.phrases.map((p) => [p.lang, p.element_id]));
  });

  it("does not change its input, and the copy shares no objects with it", () => {
    const x = sampleInterpretation();
    const before = structuredClone(x);
    const r = redactInterpretation(x);
    expect(x).toEqual(before);
    expect(r).not.toBe(x);
    r.ops.forEach((o, i) => {
      expect(o).not.toBe(x.ops[i]);
    });
    r.phrases.forEach((p, i) => {
      expect(p).not.toBe(x.phrases[i]);
    });
  });

  it("is the same when done twice", () => {
    const once = redactInterpretation(sampleInterpretation());
    expect(redactInterpretation(once)).toEqual(once);
  });

  it.each(loadExamples("interpretation", "valid"))("example $name: no child text remains, the rest is kept", ({ data }) => {
    const x = schemas.interpretation.parse(data);
    const r = redactInterpretation(x);
    expect(hasChildText(r)).toBe(false);
    expect(r).toEqual(expectedInterpretation(x));
  });
});

describe("redactExplanation", () => {
  it("empties the evidence and keeps the tokens, answer, kind and mentioned elements", () => {
    const x = sampleExplanation();
    const r = redactExplanation(x);
    expect(r.evidence).toBe("");
    expect(r).toEqual(expectedExplanation(x));
  });

  it("the saved record has none of the words and still passes the schema", () => {
    const x = sampleExplanation();
    const saved = stored(redactExplanation(x));
    expect(JSON.stringify(saved)).not.toContain(x.evidence);
    expect(() => schemas.explanation.parse(saved)).not.toThrow();
    expect(hasChildText(saved)).toBe(false);
  });

  it("does not change its input", () => {
    const x = sampleExplanation();
    const before = structuredClone(x);
    const r = redactExplanation(x);
    expect(x).toEqual(before);
    expect(r).not.toBe(x);
  });

  it.each(loadExamples("explanation", "valid"))("example $name: no child text remains, the rest is kept", ({ data }) => {
    const x = schemas.explanation.parse(data);
    const r = redactExplanation(x);
    expect(hasChildText(r)).toBe(false);
    expect(r).toEqual(expectedExplanation(x));
  });
});

describe("hasChildText", () => {
  it("sees words in an op's evidence, in a phrase, and in an explanation", () => {
    const empty = expectedInterpretation(sampleInterpretation());
    expect(hasChildText(sampleInterpretation())).toBe(true);
    const onlyPhrase: Interpretation = { ...empty, phrases: [{ phrase: "あわせて", lang: "ja", element_id: "r_1" }] };
    expect(hasChildText(onlyPhrase)).toBe(true);
    const onlyEvidence = schemas.interpretation.parse({ ...empty, ops: [withEvidence(op.swap("r_1"), "ぎゃくだよ")] });
    expect(hasChildText(onlyEvidence)).toBe(true);
    expect(hasChildText(sampleExplanation())).toBe(true);
  });

  it("is false for an interpretation and an explanation with no words", () => {
    expect(hasChildText(expectedInterpretation(sampleInterpretation()))).toBe(false);
    expect(hasChildText(expectedExplanation(sampleExplanation()))).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Property: whatever the child said, nothing of it survives redaction
// ---------------------------------------------------------------------------------------------

const wordsArb = fc.oneof(fc.string(), fc.string({ unit: "grapheme", minLength: 1 }), fc.constantFrom(...WORDS));
const langArb = fc.constantFrom("ja" as const, "en" as const);

const interpretationArb: fc.Arbitrary<Interpretation> = fc
  .record({
    utterance_lang: fc.constantFrom("ja" as const, "en" as const, "unknown" as const),
    representable: fc.constantFrom("full" as const, "partial" as const, "none" as const),
    ops: fc.array(fc.tuple(fc.constantFrom(...SAMPLE_OPS), wordsArb), { maxLength: 8 }),
    unclear: fc.array(fc.constantFrom("q_a", "q_b", "r_1", "e_1"), { maxLength: 3 }),
    phrases: fc.array(fc.record({ phrase: wordsArb, lang: langArb, element_id: fc.constantFrom("q_a", "r_1", "h_b") }), { maxLength: 4 }),
  })
  .map(({ ops, ...rest }) =>
    schemas.interpretation.parse({ schema_version: "6", ...rest, ops: ops.map(([o, words]) => withEvidence(o, words)) }),
  );

const ratArb = fc.record({ num: fc.integer({ min: -50, max: 50 }), den: fc.integer({ min: 1, max: 9 }) });
const tokenArb = fc.oneof(
  fc.record({ type: fc.constant("number" as const), number: ratArb, operator: fc.constant(null) }),
  fc.record({
    type: fc.constant("operator" as const),
    number: fc.constant(null),
    operator: fc.constantFrom("+" as const, "-" as const, "*" as const, "/" as const, "=" as const),
  }),
);

const explanationArb: fc.Arbitrary<Explanation> = fc.record({
  schema_version: fc.constant("2" as const),
  utterance_lang: fc.constantFrom("ja" as const, "en" as const, "unknown" as const),
  kind: fc.constantFrom("expression" as const, "reason" as const),
  tokens: fc.array(tokenArb, { maxLength: 6 }),
  answer: fc.option(ratArb, { nil: null }),
  mentioned_elements: fc.array(fc.constantFrom("q_a", "r_1", "e_1"), { maxLength: 3 }),
  evidence: wordsArb,
});

describe("redact: property over any interpretation and explanation", () => {
  it("hasChildText is true exactly when some evidence or phrase is not empty", () => {
    fc.assert(
      fc.property(interpretationArb, (x) => {
        expect(hasChildText(x)).toBe(childStrings(x).length > 0);
      }),
      PROPERTY_RUNS,
    );
  });

  it("after redaction no child text remains, also once saved, and nothing else changed", () => {
    fc.assert(
      fc.property(interpretationArb, (x) => {
        const before = structuredClone(x);
        const r = redactInterpretation(x);
        expect(hasChildText(r)).toBe(false);
        expect(hasChildText(stored(r))).toBe(false);
        expect(r).toEqual(expectedInterpretation(x));
        expect(x).toEqual(before);
      }),
      PROPERTY_RUNS,
    );
  });

  it("an explanation keeps no words after redaction, and the rest is kept", () => {
    fc.assert(
      fc.property(explanationArb, (x) => {
        const before = structuredClone(x);
        const r = redactExplanation(x);
        expect(hasChildText(x)).toBe(x.evidence !== "");
        expect(hasChildText(r)).toBe(false);
        expect(hasChildText(stored(r))).toBe(false);
        expect(r).toEqual(expectedExplanation(x));
        expect(x).toEqual(before);
      }),
      PROPERTY_RUNS,
    );
  });
});
