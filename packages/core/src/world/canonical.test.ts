// M2 (指示書 第6.6節 and the M2 line of 第11節): two independent builds of one problem must be compared
// without caring which ids each build chose. canonicalWorld renames ids by content; sameBuild and
// sameStructure decide on top of it. Written before the implementation.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { PREFIX, canonicalWorld, restate, sameBuild, sameStructure, solve, validateWorld, type ElementKind, type WorldScene } from "../index.ts";
import { PROVISIONAL } from "../../fixtures/problems/provisional.ts";
import { signboardAdditive, signboardCorrect, signboardProcedural } from "../../fixtures/problems/signboard.ts";

const RUNS = { numRuns: 60 };

/**
 * A world with an event, a quantity after the event and a move between holders, so that every kind of
 * reference (at_event, event holder, to_holder) is exercised. Test-only; the text is not used.
 */
const eventWorld: WorldScene = {
  schema_version: "3",
  problem_id: "p_canon_event",
  problem_type: "change",
  problem_text: "",
  grade: 3,
  problem_lang: "ja",
  holders: [
    { id: "h_b", label: "い" },
    { id: "h_a", label: "あ" },
  ],
  item_kinds: [{ id: "k_x", noun: "はじき", counter: "こ", asset_key: null, countable: true }],
  quantities: [
    { id: "q_b1", holder: "h_b", item_kind: "k_x", at_event: "e_move", value: null },
    { id: "q_a0", holder: "h_a", item_kind: "k_x", at_event: null, value: { num: 5, den: 1 } },
    { id: "q_b0", holder: "h_b", item_kind: "k_x", at_event: null, value: { num: 1, den: 1 } },
    { id: "q_a1", holder: "h_a", item_kind: "k_x", at_event: "e_move", value: null },
  ],
  relations: [],
  events: [{ id: "e_move", order: 1, type: "move", holder: "h_a", item_kind: "k_x", amount: { num: 2, den: 1 }, to_holder: "h_b" }],
  question: { target_type: "quantity", target_id: "q_b1" },
  word_links: [{ phrase: "い", lang: "ja", element_id: "h_b" }],
};

const WORLDS: { name: string; world: WorldScene }[] = [
  ...PROVISIONAL.map((p) => ({ name: p.record.world.problem_id, world: p.record.world })),
  { name: "signboard procedural", world: signboardProcedural },
  { name: "signboard additive", world: signboardAdditive },
  { name: "event world", world: eventWorld },
];

const KINDS: ElementKind[] = ["holder", "item_kind", "quantity", "relation", "event"];

function idsOf(w: WorldScene, kind: ElementKind): string[] {
  switch (kind) {
    case "holder":
      return w.holders.map((x) => x.id);
    case "item_kind":
      return w.item_kinds.map((x) => x.id);
    case "quantity":
      return w.quantities.map((x) => x.id);
    case "relation":
      return w.relations.map((x) => x.id);
    case "event":
      return w.events.map((x) => x.id);
  }
}

/** Rename every id of w through the map (ids not in the map are kept), references included. */
function renameIds(w: WorldScene, map: ReadonlyMap<string, string>): WorldScene {
  const m = (id: string): string => map.get(id) ?? id;
  const c = structuredClone(w);
  return {
    ...c,
    holders: c.holders.map((h) => ({ ...h, id: m(h.id) })),
    item_kinds: c.item_kinds.map((k) => ({ ...k, id: m(k.id) })),
    quantities: c.quantities.map((q) => ({ ...q, id: m(q.id), holder: m(q.holder), item_kind: m(q.item_kind), at_event: q.at_event === null ? null : m(q.at_event) })),
    relations: c.relations.map((r) => ({
      ...r,
      id: m(r.id),
      subject: m(r.subject),
      reference: r.reference === null ? null : m(r.reference),
      reference_list: r.reference_list === null ? null : r.reference_list.map(m),
    })),
    events: c.events.map((e) => ({ ...e, id: m(e.id), holder: m(e.holder), item_kind: m(e.item_kind), to_holder: e.to_holder === null ? null : m(e.to_holder) })),
    question: { ...c.question, target_id: m(c.question.target_id) },
    word_links: c.word_links.map((l) => ({ ...l, element_id: m(l.element_id) })),
  };
}

/** A bijection on the ids of w that keeps each prefix: a permutation of the positions plus a salt. */
function bijectionArb(w: WorldScene): fc.Arbitrary<Map<string, string>> {
  const perKind = KINDS.map((kind) => {
    const ids = idsOf(w, kind);
    const positions = ids.map((_, i) => i);
    return fc
      .shuffledSubarray(positions, { minLength: positions.length, maxLength: positions.length })
      .map((perm) => ids.map((id, i) => [id, perm[i] as number] as const));
  });
  return fc.tuple(fc.stringMatching(/^[a-z]{1,5}$/), fc.tuple(...perKind)).map(([salt, lists]) => {
    const map = new Map<string, string>();
    lists.forEach((list, k) => {
      const prefix = PREFIX[KINDS[k] as ElementKind];
      for (const [id, pos] of list) map.set(id, prefix + salt + String(pos));
    });
    return map;
  });
}

function fullShuffle<T>(xs: readonly T[]): fc.Arbitrary<T[]> {
  return fc.shuffledSubarray([...xs], { minLength: xs.length, maxLength: xs.length });
}

/** The same world with its element lists in another order (word_links kept as they are). */
function reorderedArb(w: WorldScene): fc.Arbitrary<WorldScene> {
  return fc
    .tuple(fullShuffle(w.holders), fullShuffle(w.item_kinds), fullShuffle(w.quantities), fullShuffle(w.relations), fullShuffle(w.events))
    .map(([holders, item_kinds, quantities, relations, events]) => structuredClone({ ...w, holders, item_kinds, quantities, relations, events }));
}

const sortedTexts = (w: WorldScene): string[] => restate(w, w.problem_lang).map((s) => s.text).sort();

function askedValue(w: WorldScene): string {
  const res = solve(w);
  if (res.kind !== "unique") return res.kind;
  const v = res.values.get(w.question.target_id);
  return v === undefined ? "none" : String(v.num) + "/" + String(v.den);
}

describe("canonicalWorld: concrete names", () => {
  it("names the signboard world by the order of its labels", () => {
    const c = canonicalWorld(signboardCorrect);
    // The older brother sorts first, so he gets h_1 and his count q_1.
    expect(c.holders).toEqual([
      { id: "h_1", label: "兄" },
      { id: "h_2", label: "弟" },
    ]);
    expect(c.item_kinds.map((k) => k.id)).toEqual(["k_1"]);
    expect(c.quantities.map((q) => [q.id, q.holder, q.item_kind, q.value])).toEqual([
      ["q_1", "h_1", "k_1", { num: 6, den: 1 }],
      ["q_2", "h_2", "k_1", null],
    ]);
    expect(c.relations).toHaveLength(1);
    expect(c.relations[0]).toMatchObject({ id: "r_1", operator: "fraction_of", subject: "q_1", reference: "q_2", amount: { num: 3, den: 4 } });
    expect(c.question).toEqual({ target_type: "quantity", target_id: "q_2" });
    expect(c.word_links.map((l) => l.element_id)).toEqual(["h_1", "h_2", "r_1"]);
  });

  it("names events and the quantities after them, and remaps holder, to_holder and at_event", () => {
    const c = canonicalWorld(eventWorld);
    expect(c.holders).toEqual([
      { id: "h_1", label: "あ" },
      { id: "h_2", label: "い" },
    ]);
    expect(c.events).toEqual([{ id: "e_1", order: 1, type: "move", holder: "h_1", item_kind: "k_1", amount: { num: 2, den: 1 }, to_holder: "h_2" }]);
    // Sorted by holder, item, then the event with no event first.
    expect(c.quantities.map((q) => [q.id, q.holder, q.at_event, q.value])).toEqual([
      ["q_1", "h_1", null, { num: 5, den: 1 }],
      ["q_2", "h_1", "e_1", null],
      ["q_3", "h_2", null, { num: 1, den: 1 }],
      ["q_4", "h_2", "e_1", null],
    ]);
    expect(c.question.target_id).toBe("q_4");
    expect(c.word_links).toEqual([{ phrase: "い", lang: "ja", element_id: "h_2" }]);
  });

  it("remaps the parts of a total", () => {
    const ratio = PROVISIONAL.find((p) => p.record.world.problem_id === "p_ratio_c")?.record.world as WorldScene;
    const c = canonicalWorld(ratio);
    const total = c.relations.find((r) => r.operator === "total_of");
    const ids = new Set(c.quantities.map((q) => q.id));
    expect(total?.reference_list?.length).toBe(2);
    for (const id of total?.reference_list ?? []) expect(ids.has(id)).toBe(true);
    expect(ids.has(total?.subject as string)).toBe(true);
  });
});

describe.each(WORLDS)("canonicalWorld on $name", ({ world }) => {
  it("keeps the world valid and the meaning: same restated sentences, same answer", () => {
    const c = canonicalWorld(world);
    expect(validateWorld(c)).toEqual({ ok: true });
    expect(sortedTexts(c)).toEqual(sortedTexts(world));
    expect(askedValue(c)).toBe(askedValue(world));
  });

  it("keeps the problem fields, the values and the amounts", () => {
    const c = canonicalWorld(world);
    expect([c.problem_id, c.problem_text, c.grade, c.problem_lang, c.problem_type, c.schema_version]).toEqual([
      world.problem_id,
      world.problem_text,
      world.grade,
      world.problem_lang,
      world.problem_type,
      world.schema_version,
    ]);
    const vals = (w: WorldScene): string[] => w.quantities.map((q) => JSON.stringify(q.value)).sort();
    const amounts = (w: WorldScene): string[] =>
      [...w.relations.map((r) => JSON.stringify(r.amount)), ...w.events.map((e) => JSON.stringify(e.amount))].sort();
    expect(vals(c)).toEqual(vals(world));
    expect(amounts(c)).toEqual(amounts(world));
    expect(c.holders.map((h) => h.label).sort()).toEqual(world.holders.map((h) => h.label).sort());
  });

  it("does not change its input", () => {
    const before = structuredClone(world);
    canonicalWorld(world);
    expect(world).toEqual(before);
  });

  it("is idempotent", () => {
    const once = canonicalWorld(world);
    expect(canonicalWorld(once)).toEqual(once);
  });

  it("property: renaming every id by any prefix-keeping bijection does not change the result", () => {
    const expected = canonicalWorld(world);
    fc.assert(
      fc.property(bijectionArb(world), (map) => {
        const renamed = renameIds(world, map);
        expect(validateWorld(renamed)).toEqual({ ok: true });
        expect(canonicalWorld(renamed)).toEqual(expected);
      }),
      RUNS,
    );
  });

  it("property: listing the elements in another order does not change the result", () => {
    const expected = canonicalWorld(world);
    fc.assert(
      fc.property(reorderedArb(world), (w) => {
        expect(canonicalWorld(w)).toEqual(expected);
      }),
      RUNS,
    );
  });
});

describe("sameBuild", () => {
  it("property: a provisional world and any renaming of it are the same build", () => {
    for (const { world } of WORLDS) {
      fc.assert(
        fc.property(bijectionArb(world), (map) => {
          expect(sameBuild(world, renameIds(world, map))).toBe(true);
          expect(sameBuild(renameIds(world, map), world)).toBe(true);
        }),
        { numRuns: 20 },
      );
    }
  });

  it("the signboard written with the inverse relation (younger = 4/3 of older) is not the same build", () => {
    // Both solve the younger brother to 8 and order the lengths the same way (sameWorld calls them
    // the same), so only the written relation tells them apart; such a build is sent back.
    const inverse = structuredClone(signboardCorrect);
    inverse.relations = inverse.relations.map((r) => ({ ...r, subject: "q_otouto", reference: "q_ani", amount: { num: 4, den: 3 } }));
    expect(sameBuild(signboardCorrect, inverse)).toBe(false);
    expect(sameBuild(inverse, signboardCorrect)).toBe(false);
    // Still false when the inverse build also chose other ids.
    const map = new Map([
      ["q_otouto", "q_y"],
      ["q_ani", "q_o"],
      ["h_ani", "h_o"],
      ["h_otouto", "h_y"],
      ["r_ratio", "r_z"],
    ]);
    expect(sameBuild(signboardCorrect, renameIds(inverse, map))).toBe(false);
  });

  it("a different holder label is not the same build", () => {
    const other = structuredClone(signboardCorrect);
    other.holders = other.holders.map((h) => (h.id === "h_otouto" ? { ...h, label: "妹" } : h));
    expect(sameBuild(signboardCorrect, other)).toBe(false);
  });

  it("a different item noun is not the same build", () => {
    const other = structuredClone(signboardCorrect);
    other.item_kinds = other.item_kinds.map((k) => ({ ...k, noun: "めだか" }));
    expect(sameBuild(signboardCorrect, other)).toBe(false);
  });

  it("the signboard with the direction of its relation reversed is not the same build", () => {
    expect(sameBuild(signboardCorrect, signboardProcedural)).toBe(false);
    expect(sameBuild(signboardCorrect, signboardAdditive)).toBe(false);
  });

  it("does not change its inputs", () => {
    const a = structuredClone(signboardCorrect);
    const b = structuredClone(signboardProcedural);
    sameBuild(a, b);
    expect(a).toEqual(signboardCorrect);
    expect(b).toEqual(signboardProcedural);
  });
});

describe("sameStructure", () => {
  const byId = new Map(PROVISIONAL.map((p) => [p.record.world.problem_id, p.record]));
  const pairs = PROVISIONAL.filter((p) => p.record.pair_id !== null).map((p) => [p.record.world.problem_id, p.record.pair_id as string] as const);

  it("the provisional problems come in pairs that point at each other", () => {
    expect(pairs.length).toBeGreaterThanOrEqual(10);
    for (const [a, b] of pairs) expect(byId.get(b)?.pair_id).toBe(a);
  });

  it.each(pairs)("%s and its pair %s have the same structure", (a, b) => {
    const wa = byId.get(a)?.world as WorldScene;
    const wb = byId.get(b)?.world as WorldScene;
    expect(sameStructure(wa, wb)).toBe(true);
  });

  it.each(WORLDS)("$name is not the same structure as itself or a renaming of itself", ({ world }) => {
    // Same structure means the scene or the numbers differ; the same build does not count.
    expect(sameStructure(world, world)).toBe(false);
    const map = new Map(idsOf(world, "quantity").map((id, i) => [id, "q_zz" + String(i)]));
    expect(sameStructure(world, renameIds(world, map))).toBe(false);
  });

  it("problems of another type or another set of relations do not have the same structure", () => {
    const w = (id: string): WorldScene => byId.get(id)?.world as WorldScene;
    // ratio against rate
    expect(sameStructure(w("p_percent_c"), w("p_rate_c"))).toBe(false);
    // both ratio, but one has a total and three quantities
    expect(sameStructure(w("p_percent_c"), w("p_ratio_c"))).toBe(false);
    // a multiple against a difference in the same scene
    expect(sameStructure(signboardCorrect, signboardAdditive)).toBe(false);
  });

  it("another kind of question is not the same structure", () => {
    const asked = structuredClone(signboardCorrect);
    asked.quantities = asked.quantities.map((q) => (q.id === "q_otouto" ? { ...q, value: { num: 8, den: 1 } } : q));
    asked.relations = asked.relations.map((r) => ({ ...r, amount: null }));
    asked.question = { target_type: "relation_amount", target_id: "r_ratio" };
    expect(sameStructure(signboardCorrect, asked)).toBe(false);
  });
});
