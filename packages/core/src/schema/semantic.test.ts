// Meaning checks that zod cannot express (指示書 第5.1節: unique ids, id prefixes, references that
// exist, positive integer denominators, the fields each op needs, no relation of a thing to itself).
//
// Error codes this suite expects from validateWorld / validateOps:
//   duplicate_id, bad_prefix, missing_ref, bad_denominator, missing_field, self_relation
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { schemas, validateOps, validateWorld } from "./index.ts";
import { at, loadExample, loadExamples } from "./test-fixtures.ts";

type World = ReturnType<typeof schemas.worldScene.parse>;
type Ops = ReturnType<typeof schemas.interpretation.parse>["ops"];
interface Failure {
  ok: false;
  errors: { code: string; path: string }[];
}
type Result = { ok: true } | Failure;

const world = (name: string): World => schemas.worldScene.parse(loadExample("world-scene", "valid", name));
const compare = (): World => world("compare-more-by");
const change = (): World => world("change-move");
const combine = (): World => world("combine-total-of");

function ops(list: unknown[]): Ops {
  return schemas.interpretation.parse({
    schema_version: "6",
    utterance_lang: "ja",
    representable: "full",
    ops: list,
    unclear: [],
    phrases: [],
  }).ops;
}
const R = (num: number, den = 1) => ({ num, den });

function codes(r: Result): string[] {
  return r.ok ? [] : r.errors.map((e) => e.code);
}
function expectFail(r: Result, code?: string): void {
  expect(r.ok).toBe(false);
  if (r.ok) return;
  expect(r.errors.length).toBeGreaterThan(0);
  for (const e of r.errors) {
    expect(typeof e.code).toBe("string");
    expect(typeof e.path).toBe("string");
    expect(e.path.length).toBeGreaterThan(0);
  }
  if (code) expect(codes(r)).toContain(code);
}

/** Rename an id everywhere (whole JSON string tokens only), keeping every reference intact. */
function renameId(w: World, from: string, to: string): World {
  return JSON.parse(JSON.stringify(w).split(JSON.stringify(from)).join(JSON.stringify(to))) as World;
}

type Collection = "holders" | "item_kinds" | "quantities" | "relations" | "events";
const PREFIX: Record<Collection, string> = {
  holders: "h_",
  item_kinds: "k_",
  quantities: "q_",
  relations: "r_",
  events: "e_",
};
const COLLECTIONS = Object.keys(PREFIX) as Collection[];

function elements(w: World): { coll: Collection; index: number; id: string }[] {
  return COLLECTIONS.flatMap((coll) =>
    (w[coll] as { id: string }[]).map((el, index) => ({ coll, index, id: el.id })),
  );
}

const validWorlds = loadExamples("world-scene", "valid").map((e) => [e.name, e.data] as const);

describe("validateWorld: well-formed worlds pass", () => {
  it.each(validWorlds)("%s", (_name, data) => {
    expect(validateWorld(schemas.worldScene.parse(data))).toEqual({ ok: true });
  });
});

const worldArb = fc.constantFrom(...validWorlds.map(([, d]) => d));
const suffixArb = fc.stringMatching(/^[a-z0-9]{1,6}$/);

describe("validateWorld: ids are unique across the world", () => {
  it("property: copying any element (same id) is rejected", () => {
    fc.assert(
      fc.property(worldArb, fc.nat(), (data, pick) => {
        const w = schemas.worldScene.parse(data);
        const all = elements(w);
        const el = all[pick % all.length];
        if (!el) return;
        const list = w[el.coll] as unknown[];
        list.push(structuredClone(list[el.index]));
        expectFail(validateWorld(w), "duplicate_id");
      }),
    );
  });

  it("rejects the same id used by two different kinds of element", () => {
    const w = compare();
    w.word_links = [];
    w.holders.push({ id: "q_usagi", label: "x" });
    expectFail(validateWorld(w), "duplicate_id");
  });
});

describe("validateWorld: id prefixes follow the element kind", () => {
  it("property: renaming an element with a wrong prefix is rejected", () => {
    const wrongPrefixes = (coll: Collection): string[] => [
      ...Object.values(PREFIX).filter((p) => p !== PREFIX[coll]),
      "x_",
      "",
      "n_",
      "H_",
    ];
    fc.assert(
      fc.property(worldArb, fc.nat(), suffixArb, fc.nat(), (data, pick, suffix, p) => {
        const w0 = schemas.worldScene.parse(data);
        const all = elements(w0);
        const el = all[pick % all.length];
        if (!el) return;
        const wrong = wrongPrefixes(el.coll);
        const w = renameId(w0, el.id, `${wrong[p % wrong.length] ?? "x_"}zz${suffix}`);
        expectFail(validateWorld(w), "bad_prefix");
      }),
    );
  });

  it("property: renaming an element with the right prefix and a fresh name still passes", () => {
    fc.assert(
      fc.property(worldArb, fc.nat(), suffixArb, (data, pick, suffix) => {
        const w0 = schemas.worldScene.parse(data);
        const all = elements(w0);
        const el = all[pick % all.length];
        if (!el) return;
        expect(validateWorld(renameId(w0, el.id, `${PREFIX[el.coll]}zz${suffix}`))).toEqual({ ok: true });
      }),
    );
  });
});

describe("validateWorld: every reference points at an existing element", () => {
  const cases: [string, () => World][] = [
    ["quantity.holder", () => { const w = compare(); at(w.quantities, 0).holder = "h_ghost"; return w; }],
    ["quantity.item_kind", () => { const w = compare(); at(w.quantities, 0).item_kind = "k_ghost"; return w; }],
    ["quantity.at_event", () => { const w = change(); at(w.quantities, 1).at_event = "e_ghost"; return w; }],
    ["relation.subject", () => { const w = compare(); at(w.relations, 0).subject = "q_ghost"; return w; }],
    ["relation.reference", () => { const w = compare(); at(w.relations, 0).reference = "q_ghost"; return w; }],
    ["relation.reference_list", () => { const w = combine(); at(w.relations, 0).reference_list = ["q_red", "q_ghost"]; return w; }],
    ["event.holder", () => { const w = change(); at(w.events, 0).holder = "h_ghost"; return w; }],
    ["event.item_kind", () => { const w = change(); at(w.events, 0).item_kind = "k_ghost"; return w; }],
    ["event.to_holder", () => { const w = change(); at(w.events, 0).to_holder = "h_ghost"; return w; }],
    ["question.target_id", () => { const w = compare(); w.question.target_id = "q_ghost"; return w; }],
    ["word_links.element_id", () => { const w = compare(); at(w.word_links, 0).element_id = "r_ghost"; return w; }],
  ];
  it.each(cases)("rejects a dangling %s", (_field, make) => {
    expectFail(validateWorld(make()), "missing_ref");
  });
});

describe("validateWorld: denominators are positive integers", () => {
  type Slot = (w: World, r: { num: number; den: number }) => World | undefined;
  const slots: [string, Slot][] = [
    ["quantity value", (w, r) => { const q = w.quantities[0]; if (!q) return undefined; q.value = r; return w; }],
    ["relation amount", (w, r) => { const x = w.relations[0]; if (!x) return undefined; x.amount = r; return w; }],
    ["event amount", (w, r) => { const e = w.events[0]; if (!e) return undefined; e.amount = r; return w; }],
  ];

  it.each(slots)("property: %s with den <= 0 is rejected", (_s, put) => {
    fc.assert(
      fc.property(worldArb, fc.integer({ min: -99, max: 99 }), fc.integer({ min: -99, max: 0 }), (data, num, den) => {
        const w = put(schemas.worldScene.parse(data), R(num, den));
        if (!w) return;
        expectFail(validateWorld(w), "bad_denominator");
      }),
    );
  });

  it.each(slots)("property: %s with any positive integer den passes", (_s, put) => {
    fc.assert(
      fc.property(worldArb, fc.integer({ min: 0, max: 99 }), fc.integer({ min: 1, max: 99 }), (data, num, den) => {
        const w = put(schemas.worldScene.parse(data), R(num, den));
        if (!w) return;
        expect(validateWorld(w)).toEqual({ ok: true });
      }),
    );
  });

  it("rejects a non-integer denominator even if it slipped past the shape check", () => {
    const w = compare();
    at(w.relations, 0).amount = R(3, 1.5);
    expectFail(validateWorld(w), "bad_denominator");
  });
});

describe("validateWorld: a relation cannot compare a quantity with itself", () => {
  it("rejects subject equal to reference", () => {
    const w = compare();
    at(w.relations, 0).reference = at(w.relations, 0).subject;
    expectFail(validateWorld(w), "self_relation");
  });

  it("property: any relation turned onto itself is rejected", () => {
    fc.assert(
      fc.property(worldArb, fc.nat(), (data, pick) => {
        const w = schemas.worldScene.parse(data);
        const rel = w.relations[pick % Math.max(1, w.relations.length)];
        if (!rel || rel.reference === null) return;
        rel.reference = rel.subject;
        expectFail(validateWorld(w), "self_relation");
      }),
    );
  });
});

describe("validateOps: valid utterances pass", () => {
  const cases: [string, () => World, unknown[]][] = [
    ["set_quantity", compare, [{ op: "set_quantity", target_id: "q_tanuki", number: R(10), evidence: "" }]],
    ["relation edits", compare, [
      { op: "set_relation_amount", target_id: "r_more", number: R(4), evidence: "" },
      { op: "set_relation_operator", target_id: "r_more", operator: "less_by", evidence: "" },
      { op: "swap_relation_direction", target_id: "r_more", evidence: "" },
    ]],
    ["set_relation_reference to the current subject (acts as a swap)", compare, [
      { op: "set_relation_reference", target_id: "r_more", reference: "q_tanuki", evidence: "" },
    ]],
    ["new elements referenced later in the same utterance", change, [
      { op: "add_holder", new_id: "n_1", label: "x", evidence: "" },
      { op: "add_item_kind", new_id: "n_2", label: "y", evidence: "" },
      { op: "add_quantity", new_id: "n_3", holder: "n_1", item_kind: "n_2", at_event: null, number: null, evidence: "" },
      { op: "add_event", new_id: "n_4", event_type: "move", holder: "h_kitsune", item_kind: "k_chestnut", number: R(1), to_holder: "n_1", evidence: "" },
      { op: "add_quantity", new_id: "n_5", holder: "n_1", item_kind: "k_chestnut", at_event: "n_4", number: null, evidence: "" },
    ]],
    ["add_relation total_of with a reference list", combine, [
      { op: "add_relation", new_id: "n_1", operator: "total_of", subject: "q_all", reference: null, reference_list: ["q_red", "q_white"], number: null, evidence: "" },
    ]],
    ["add_relation more_by with a reference", compare, [
      { op: "add_relation", new_id: "n_1", operator: "more_by", subject: "q_usagi", reference: "q_tanuki", reference_list: null, number: R(2), evidence: "" },
    ]],
    ["add_event gain without a destination", change, [
      { op: "add_event", new_id: "n_1", event_type: "gain", holder: "h_risu", item_kind: "k_chestnut", number: null, to_holder: null, evidence: "" },
    ]],
    ["event, question and naming edits", change, [
      { op: "set_event_amount", target_id: "e_give", number: R(3), evidence: "" },
      { op: "set_event_type", target_id: "e_give", event_type: "move", evidence: "" },
      { op: "set_event_to_holder", target_id: "e_give", to_holder: "h_risu", evidence: "" },
      { op: "set_question_target", target_id: "q_kitsune_0", question_type: "quantity", evidence: "" },
      { op: "rename_item_kind", target_id: "k_chestnut", label: "z", evidence: "" },
    ]],
    ["state_procedure, state_answer, set_unit_value, word_cue", compare, [
      { op: "state_procedure", target_id: "q_tanuki", operands: [{ quantity_id: "q_usagi" }, R(3)], operation: "add", evidence: "" },
      { op: "state_answer", target_id: "q_tanuki", number: R(10), evidence: "" },
      { op: "set_unit_value", target_id: "r_more", number: R(1), evidence: "" },
      { op: "word_cue", statement_index: 0, tokens: [0], evidence: "" },
    ]],
    ["remove_element", compare, [{ op: "remove_element", target_id: "r_more", evidence: "" }]],
  ];
  it.each(cases)("%s", (_n, make, list) => {
    expect(validateOps(make(), ops(list))).toEqual({ ok: true });
  });
});

describe("validateOps: each op carries the fields it needs", () => {
  const cases: [string, () => World, unknown[]][] = [
    ["add_relation (not total_of) without a reference", compare, [
      { op: "add_relation", new_id: "n_1", operator: "more_by", subject: "q_usagi", reference: null, reference_list: null, number: R(2), evidence: "" },
    ]],
    ["add_relation total_of without a reference list", combine, [
      { op: "add_relation", new_id: "n_1", operator: "total_of", subject: "q_all", reference: null, reference_list: null, number: null, evidence: "" },
    ]],
    ["add_event move without a destination", change, [
      { op: "add_event", new_id: "n_1", event_type: "move", holder: "h_kitsune", item_kind: "k_chestnut", number: R(1), to_holder: null, evidence: "" },
    ]],
  ];
  it.each(cases)("rejects %s", (_n, make, list) => {
    expectFail(validateOps(make(), ops(list)), "missing_field");
  });

  it("rejects a destination on an event that is not a move", () => {
    const list = [{ op: "add_event", new_id: "n_1", event_type: "gain", holder: "h_risu", item_kind: "k_chestnut", number: null, to_holder: "h_kitsune", evidence: "" }];
    expectFail(validateOps(change(), ops(list)));
  });
});

describe("validateOps: references", () => {
  const cases: [string, () => World, unknown[]][] = [
    ["target_id", compare, [{ op: "set_quantity", target_id: "q_ghost", number: R(1), evidence: "" }]],
    ["reference", compare, [{ op: "set_relation_reference", target_id: "r_more", reference: "q_ghost", evidence: "" }]],
    ["reference_list", combine, [
      { op: "add_relation", new_id: "n_1", operator: "total_of", subject: "q_all", reference: null, reference_list: ["q_red", "q_ghost"], number: null, evidence: "" },
    ]],
    ["holder", change, [{ op: "add_quantity", new_id: "n_1", holder: "h_ghost", item_kind: "k_chestnut", at_event: null, number: null, evidence: "" }]],
    ["at_event", change, [{ op: "add_quantity", new_id: "n_1", holder: "h_risu", item_kind: "k_chestnut", at_event: "e_ghost", number: null, evidence: "" }]],
    ["to_holder", change, [{ op: "set_event_to_holder", target_id: "e_give", to_holder: "h_ghost", evidence: "" }]],
    ["operands quantity_id", compare, [
      { op: "state_procedure", target_id: "q_tanuki", operands: [{ quantity_id: "q_ghost" }, R(3)], operation: "add", evidence: "" },
    ]],
    ["a temporary id never introduced", change, [
      { op: "add_quantity", new_id: "n_2", holder: "n_1", item_kind: "k_chestnut", at_event: null, number: null, evidence: "" },
    ]],
    ["a temporary id used before the op that introduces it", change, [
      { op: "add_quantity", new_id: "n_2", holder: "n_1", item_kind: "k_chestnut", at_event: null, number: null, evidence: "" },
      { op: "add_holder", new_id: "n_1", label: "x", evidence: "" },
    ]],
  ];
  it.each(cases)("rejects a dangling %s", (_n, make, list) => {
    expectFail(validateOps(make(), ops(list)), "missing_ref");
  });

  it("property: set_quantity on any quantity of the world passes, on an unknown q_ id fails", () => {
    fc.assert(
      fc.property(worldArb, fc.nat(), suffixArb, (data, pick, suffix) => {
        const w = schemas.worldScene.parse(data);
        const q = w.quantities[pick % w.quantities.length];
        if (!q) return;
        const good = ops([{ op: "set_quantity", target_id: q.id, number: R(1), evidence: "" }]);
        expect(validateOps(w, good)).toEqual({ ok: true });
        const bad = ops([{ op: "set_quantity", target_id: `q_zz${suffix}`, number: R(1), evidence: "" }]);
        expectFail(validateOps(w, bad), "missing_ref");
      }),
    );
  });
});

describe("validateOps: ids, prefixes, denominators, self relations", () => {
  it("rejects the same temporary id introduced twice", () => {
    const list = [
      { op: "add_holder", new_id: "n_1", label: "x", evidence: "" },
      { op: "add_holder", new_id: "n_1", label: "y", evidence: "" },
    ];
    expectFail(validateOps(change(), ops(list)), "duplicate_id");
  });

  it("rejects a target whose prefix does not fit the op (set_quantity on a relation)", () => {
    const list = [{ op: "set_quantity", target_id: "r_more", number: R(1), evidence: "" }];
    expectFail(validateOps(compare(), ops(list)), "bad_prefix");
  });

  it("rejects set_unit_value aimed at something other than a relation", () => {
    const list = [{ op: "set_unit_value", target_id: "q_usagi", number: R(2), evidence: "" }];
    expectFail(validateOps(compare(), ops(list)), "bad_prefix");
  });

  it("property: a number with den <= 0 is rejected, den >= 1 accepted", () => {
    fc.assert(
      fc.property(fc.integer({ min: -99, max: 99 }), fc.integer({ min: -99, max: 99 }), (num, den) => {
        const r = validateOps(compare(), ops([{ op: "set_quantity", target_id: "q_tanuki", number: R(num, den), evidence: "" }]));
        if (den >= 1) expect(r).toEqual({ ok: true });
        else expectFail(r, "bad_denominator");
      }),
    );
  });

  it("rejects add_relation whose subject and reference are the same", () => {
    const list = [
      { op: "add_relation", new_id: "n_1", operator: "more_by", subject: "q_usagi", reference: "q_usagi", reference_list: null, number: R(1), evidence: "" },
    ];
    expectFail(validateOps(compare(), ops(list)), "self_relation");
  });
});

describe("the meaning check of an explanation (found in M1b)", () => {
  it("refuses a zero denominator and an element that does not exist", async () => {
    const { validateExplanation } = await import("./semantic.ts");
    const { signboardCorrect } = await import("../../fixtures/problems/signboard.ts");
    const ok = {
      schema_version: "2" as const,
      utterance_lang: "ja" as const,
      kind: "expression" as const,
      tokens: [{ type: "number" as const, number: { num: 6, den: 1 }, operator: null }],
      answer: { num: 8, den: 1 },
      mentioned_elements: ["q_ani"],
      evidence: "",
    };
    expect(validateExplanation(signboardCorrect, ok)).toEqual({ ok: true });
    expect(validateExplanation(signboardCorrect, { ...ok, answer: { num: 1, den: 0 } }).ok).toBe(false);
    expect(validateExplanation(signboardCorrect, { ...ok, tokens: [{ type: "number", number: { num: 1, den: 0 }, operator: null }] }).ok).toBe(false);
    expect(validateExplanation(signboardCorrect, { ...ok, mentioned_elements: ["q_nobody"] }).ok).toBe(false);
  });
});
