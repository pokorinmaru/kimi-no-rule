// Per-problem schemas (指示書 第5.1節): id fields of interpretation / explanation are narrowed to the
// problem's own ids plus the temporary ids n_1..n_5; at_event, new_id, statement_index and tokens
// are narrowed further.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { problemScopedSchemas, schemas } from "./index.ts";
import { at, loadExample } from "./test-fixtures.ts";

type World = ReturnType<typeof schemas.worldScene.parse>;
type Statements = ReturnType<typeof schemas.problemRecord.parse>["statements"];
interface Parser {
  safeParse: (d: unknown) => { success: boolean };
}

const record = (name: string) => schemas.problemRecord.parse(loadExample("problem-record", "valid", name));
const prepared = record("prepared-compare"); // compare world, 3 statements with 6 / 7 / 4 tokens
const compareWorld: World = schemas.worldScene.parse(prepared.world);
const compareStatements: Statements = prepared.statements;
const changeWorld: World = schemas.worldScene.parse(loadExample("world-scene", "valid", "change-move"));
const changeStatements: Statements = record("companion-change").statements;

function scoped(w: World, s: Statements): { interpretation: Parser; explanation: Parser } {
  const out = problemScopedSchemas(w, s) as { interpretation: Parser; explanation: Parser };
  return out;
}
const cmp = scoped(compareWorld, compareStatements);
const chg = scoped(changeWorld, changeStatements);

const R = (num: number, den = 1) => ({ num, den });
const interp = (ops: unknown[], extra: Record<string, unknown> = {}) => ({
  schema_version: "6",
  utterance_lang: "ja",
  representable: "full",
  ops,
  unclear: [],
  phrases: [],
  ...extra,
});
const expl = (mentioned: string[]) => ({
  schema_version: "2",
  utterance_lang: "ja",
  kind: "reason",
  tokens: [],
  answer: null,
  mentioned_elements: mentioned,
  evidence: "",
});
const ok = (p: Parser, d: unknown) => p.safeParse(d).success;

function idsOf(w: World): string[] {
  return [
    ...w.holders.map((x) => x.id),
    ...w.item_kinds.map((x) => x.id),
    ...w.quantities.map((x) => x.id),
    ...w.relations.map((x) => x.id),
    ...w.events.map((x) => x.id),
  ];
}
const TEMP = ["n_1", "n_2", "n_3", "n_4", "n_5"];
const cmpAllowed = [...idsOf(compareWorld), ...TEMP];

describe("problemScopedSchemas: a correct output for this problem passes", () => {
  it("interpretation using this problem's ids", () => {
    const d = interp(
      [
        { op: "set_quantity", target_id: "q_tanuki", number: R(10), evidence: "" },
        { op: "set_relation_reference", target_id: "r_more", reference: "q_tanuki", evidence: "" },
        { op: "add_holder", new_id: "n_1", label: "x", evidence: "" },
        { op: "add_quantity", new_id: "n_2", holder: "n_1", item_kind: "k_acorn", at_event: null, number: null, evidence: "" },
        { op: "state_procedure", target_id: "q_tanuki", operands: [{ quantity_id: "q_usagi" }, R(3)], operation: "add", evidence: "" },
        { op: "word_cue", statement_index: 1, tokens: [3, 5], evidence: "" },
      ],
      { unclear: ["q_usagi"], phrases: [{ phrase: "x", lang: "ja", element_id: "r_more" }] },
    );
    expect(ok(cmp.interpretation, d)).toBe(true);
  });

  it("explanation mentioning this problem's ids and temporary ids", () => {
    expect(ok(cmp.explanation, expl(["q_usagi", "r_more", "n_3"]))).toBe(true);
  });

  it("still enforces the base shape", () => {
    const d = interp([{ op: "set_quantity", target_id: "q_tanuki", number: R(10) }]);
    expect(ok(cmp.interpretation, d)).toBe(false);
  });
});

// One builder per narrowed id field; `own` is an id of the compare problem that fits the field.
const FIELDS: [string, string, (id: string) => unknown][] = [
  ["target_id", "q_tanuki", (id) => interp([{ op: "set_quantity", target_id: id, number: R(1), evidence: "" }])],
  ["subject", "q_usagi", (id) => interp([
    { op: "add_relation", new_id: "n_1", operator: "more_by", subject: id, reference: "q_tanuki", reference_list: null, number: R(1), evidence: "" }])],
  ["reference (add_relation)", "q_usagi", (id) => interp([
    { op: "add_relation", new_id: "n_1", operator: "more_by", subject: "q_tanuki", reference: id, reference_list: null, number: R(1), evidence: "" }])],
  ["reference (set_relation_reference)", "q_tanuki", (id) => interp([
    { op: "set_relation_reference", target_id: "r_more", reference: id, evidence: "" }])],
  ["reference_list", "q_usagi", (id) => interp([
    { op: "add_relation", new_id: "n_1", operator: "total_of", subject: "q_tanuki", reference: null, reference_list: ["q_usagi", id], number: null, evidence: "" }])],
  ["holder", "h_usagi", (id) => interp([
    { op: "add_quantity", new_id: "n_1", holder: id, item_kind: "k_acorn", at_event: null, number: null, evidence: "" }])],
  ["item_kind", "k_acorn", (id) => interp([
    { op: "add_event", new_id: "n_1", event_type: "gain", holder: "h_usagi", item_kind: id, number: null, to_holder: null, evidence: "" }])],
  ["to_holder (add_event)", "h_tanuki", (id) => interp([
    { op: "add_event", new_id: "n_1", event_type: "move", holder: "h_usagi", item_kind: "k_acorn", number: R(1), to_holder: id, evidence: "" }])],
  ["operands quantity_id", "q_usagi", (id) => interp([
    { op: "state_procedure", target_id: "q_tanuki", operands: [{ quantity_id: id }, R(2)], operation: "add", evidence: "" }])],
  ["unclear", "q_usagi", (id) => interp([], { representable: "none", unclear: [id] })],
  ["phrases element_id", "r_more", (id) => interp([], { representable: "none", phrases: [{ phrase: "x", lang: "ja", element_id: id }] })],
];

// Ids that must never get through for the compare problem.
const FOREIGN = ["q_kitsune_0", "h_risu", "e_give", "q_ghost", "n_0", "n_6", "n_10", "", "q_tanuki ", "Q_TANUKI"];

describe("problemScopedSchemas: interpretation id fields", () => {
  it.each(FIELDS)("%s accepts an id of this problem", (_f, own, build) => {
    expect(ok(cmp.interpretation, build(own))).toBe(true);
  });

  it.each(FIELDS)("%s accepts a temporary id n_1..n_5", (_f, _own, build) => {
    for (const t of TEMP) expect(ok(cmp.interpretation, build(t))).toBe(true);
  });

  for (const [field, , build] of FIELDS) {
    it.each(FOREIGN)(`${field} rejects %j`, (id) => {
      expect(ok(cmp.interpretation, build(id))).toBe(false);
    });
  }

  it("property: target_id passes exactly for this problem's ids and n_1..n_5", () => {
    const build = at(FIELDS, 0)[2];
    fc.assert(
      fc.property(fc.oneof(fc.constantFrom(...cmpAllowed, ...idsOf(changeWorld)), fc.string({ maxLength: 10 })), (id) => {
        expect(ok(cmp.interpretation, build(id))).toBe(cmpAllowed.includes(id));
      }),
    );
  });

  it("the same output is judged against the problem it is scoped to", () => {
    const d = interp([{ op: "set_quantity", target_id: "q_kitsune_0", number: R(1), evidence: "" }]);
    expect(ok(chg.interpretation, d)).toBe(true);
    expect(ok(cmp.interpretation, d)).toBe(false);
  });
});

describe("problemScopedSchemas: explanation mentioned_elements", () => {
  it.each(cmpAllowed)("accepts %s", (id) => {
    expect(ok(cmp.explanation, expl([id]))).toBe(true);
  });
  it.each(FOREIGN)("rejects %j", (id) => {
    expect(ok(cmp.explanation, expl(["q_usagi", id]))).toBe(false);
  });
});

describe("problemScopedSchemas: at_event", () => {
  const build = (at: string | null) =>
    interp([{ op: "add_quantity", new_id: "n_1", holder: "h_risu", item_kind: "k_chestnut", at_event: at, number: null, evidence: "" }]);
  it.each([["e_give"], [null], ["n_2"], ["n_5"]])("accepts %j", (at) => {
    expect(ok(chg.interpretation, build(at))).toBe(true);
  });
  it.each([["q_kitsune_0"], ["h_risu"], ["k_chestnut"], ["e_get"], ["n_6"], ["e_ghost"]])("rejects %j (not an event of this problem)", (at) => {
    expect(ok(chg.interpretation, build(at))).toBe(false);
  });
});

describe("problemScopedSchemas: new_id", () => {
  const build = (id: unknown) => interp([{ op: "add_holder", new_id: id, label: "x", evidence: "" }]);
  it.each(TEMP)("accepts %s", (id) => {
    expect(ok(cmp.interpretation, build(id))).toBe(true);
  });
  it.each(["h_new", "h_usagi", "n_0", "n_6", "n1", ""])("rejects %j", (id) => {
    expect(ok(cmp.interpretation, build(id))).toBe(false);
  });
});

describe("problemScopedSchemas: word_cue statement_index and tokens", () => {
  const cue = (statement_index: number, tokens: number[]) =>
    interp([{ op: "word_cue", statement_index, tokens, evidence: "" }]);
  const lengths = compareStatements.map((s) => s.tokens.length);

  it("fixture sanity: the compare record has 3 statements of 6, 7 and 4 tokens", () => {
    expect(lengths).toEqual([6, 7, 4]);
  });

  it.each([0, 1, 2])("accepts statement_index %i", (i) => {
    expect(ok(cmp.interpretation, cue(i, [0]))).toBe(true);
  });
  it.each([3, -1, 10])("rejects statement_index %i", (i) => {
    expect(ok(cmp.interpretation, cue(i, [0]))).toBe(false);
  });

  it("bounds tokens by the length of the chosen statement", () => {
    expect(ok(cmp.interpretation, cue(1, [6]))).toBe(true);
    expect(ok(cmp.interpretation, cue(2, [6]))).toBe(false);
    expect(ok(cmp.interpretation, cue(2, [3]))).toBe(true);
    expect(ok(cmp.interpretation, cue(2, [4]))).toBe(false);
    expect(ok(cmp.interpretation, cue(0, [-1]))).toBe(false);
  });

  it("property: a token index passes iff 0 <= t < tokens of that statement", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 }), fc.integer({ min: -3, max: 10 }), (i, t) => {
        const len = lengths[i] ?? 0;
        expect(ok(cmp.interpretation, cue(i, [0, t]))).toBe(t >= 0 && t < len);
      }),
    );
  });
});
