// M1 step (3): solve (指示書 第5.2節; ordering of minimal conflict sets from 第5.3節; criteria from 第11節 M1).
// Written before the implementation. Every world built here also passes schemas.worldScene and validateWorld.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { schemas, validateWorld, type WorldScene } from "../schema/index.ts";
import { add, cmp, div, mul, rat, sub, toSchema, type Rational } from "../rational/index.ts";
import { solve, withoutConstraints, type SolveResult } from "./index.ts";

type Quantity = WorldScene["quantities"][number];
type Relation = WorldScene["relations"][number];
type WorldEvent = WorldScene["events"][number];
type ItemKind = WorldScene["item_kinds"][number];
type Question = WorldScene["question"];

// ---------------------------------------------------------------------------------------------
// World builders
// ---------------------------------------------------------------------------------------------

const THING: ItemKind = { id: "k_thing", noun: "thing", counter: "", asset_key: null, countable: false };
const PERSON: ItemKind = { id: "k_person", noun: "person", counter: "", asset_key: null, countable: true };
const JUICE: ItemKind = { id: "k_juice", noun: "juice", counter: "L", asset_key: null, countable: false };

function q(
  id: string,
  value: Rational | null,
  opts: { holder?: string; kind?: string; at?: string | null } = {},
): Quantity {
  return {
    id,
    holder: opts.holder ?? `h_${id.slice(2)}`,
    item_kind: opts.kind ?? THING.id,
    at_event: opts.at ?? null,
    value: value === null ? null : toSchema(value),
  };
}

function rel(
  id: string,
  operator: Exclude<Relation["operator"], "total_of" | "other">,
  subject: string,
  reference: string,
  amount: Rational | null,
): Relation {
  return {
    id,
    operator,
    subject,
    reference,
    reference_list: null,
    amount: operator === "same_as" || amount === null ? null : toSchema(amount),
    other_description: null,
  };
}

function totalOf(id: string, subject: string, list: string[]): Relation {
  return { id, operator: "total_of", subject, reference: null, reference_list: list, amount: null, other_description: null };
}

function otherRel(id: string, subject: string, reference: string): Relation {
  return { id, operator: "other", subject, reference, reference_list: null, amount: null, other_description: "unrelated note" };
}

function ev(
  id: string,
  order: number,
  type: WorldEvent["type"],
  holder: string,
  amount: Rational | null,
  opts: { kind?: string; to?: string } = {},
): WorldEvent {
  return {
    id,
    order,
    type,
    holder,
    item_kind: opts.kind ?? THING.id,
    amount: amount === null ? null : toSchema(amount),
    to_holder: opts.to ?? null,
  };
}

/** Builds a world-scene and fails loudly if it does not pass the shape and meaning checks. */
function world(parts: {
  quantities: Quantity[];
  relations?: Relation[];
  events?: WorldEvent[];
  kinds?: ItemKind[];
  question?: Question;
}): WorldScene {
  const holderIds = new Set<string>();
  for (const x of parts.quantities) holderIds.add(x.holder);
  for (const e of parts.events ?? []) {
    holderIds.add(e.holder);
    if (e.to_holder !== null) holderIds.add(e.to_holder);
  }
  const target = parts.quantities.find((x) => x.value === null) ?? parts.quantities[0];
  if (target === undefined) throw new Error("a world needs at least one quantity");
  const raw = {
    schema_version: "3",
    problem_id: "p_test",
    problem_type: "other",
    problem_text: "",
    grade: 3,
    problem_lang: "ja",
    holders: [...holderIds].map((id) => ({ id, label: id.slice(2) })),
    item_kinds: parts.kinds ?? [THING],
    quantities: parts.quantities,
    relations: parts.relations ?? [],
    events: parts.events ?? [],
    question: parts.question ?? { target_type: "quantity", target_id: target.id },
    word_links: [],
  };
  const parsed = schemas.worldScene.parse(raw);
  const check = validateWorld(parsed);
  if (!check.ok) throw new Error(`invalid test world: ${JSON.stringify(check.errors)}`);
  return parsed;
}

// ---------------------------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------------------------

type Kind = SolveResult["kind"];
type ResultOf<K extends Kind> = Extract<SolveResult, { kind: K }>;

function expectKind<K extends Kind>(res: SolveResult, kind: K): ResultOf<K> {
  expect(res.kind).toBe(kind);
  return res as ResultOf<K>;
}

function solvedValues(w: WorldScene): Map<string, Rational> {
  return expectKind(solve(w), "unique").values;
}

/** Ids of the world's quantities, relations and events (the only keys these tests look at). */
function elementIds(w: WorldScene): Set<string> {
  return new Set([...w.quantities, ...w.relations, ...w.events].map((x) => x.id));
}

/** Everything withoutConstraints can take out: relations, quantities with a value, events. */
function constraintIds(w: WorldScene): string[] {
  return [
    ...w.relations.map((r) => r.id),
    ...w.quantities.filter((x) => x.value !== null).map((x) => x.id),
    ...w.events.map((e) => e.id),
  ];
}

function compareIdLists(a: readonly string[], b: readonly string[]): number {
  if (a.length !== b.length) return a.length - b.length;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as string;
    const y = b[i] as string;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

const sortedIds = (ids: readonly string[]): string[] => [...ids].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));

// ---------------------------------------------------------------------------------------------
// One equation per relation type (指示書 第5.2節「関係から作る式」)
// ---------------------------------------------------------------------------------------------

describe("relation equations", () => {
  it("more_by: s = r + a", () => {
    const w = world({ quantities: [q("q_a", rat(5)), q("q_b", null)], relations: [rel("r_1", "more_by", "q_b", "q_a", rat(3))] });
    expect(solvedValues(w).get("q_b")).toEqual(rat(8));
  });

  it("more_by solved backwards for the reference", () => {
    const w = world({ quantities: [q("q_a", null), q("q_b", rat(8))], relations: [rel("r_1", "more_by", "q_b", "q_a", rat(3))] });
    expect(solvedValues(w).get("q_a")).toEqual(rat(5));
  });

  it("less_by: s = r - a", () => {
    const w = world({ quantities: [q("q_a", rat(5)), q("q_b", null)], relations: [rel("r_1", "less_by", "q_b", "q_a", rat(3))] });
    expect(solvedValues(w).get("q_b")).toEqual(rat(2));
  });

  it("an unknown difference amount is solved under the relation id", () => {
    const w = world({
      quantities: [q("q_a", rat(5)), q("q_b", rat(2))],
      relations: [rel("r_1", "less_by", "q_b", "q_a", null)],
      question: { target_type: "relation_amount", target_id: "r_1" },
    });
    expect(solvedValues(w).get("r_1")).toEqual(rat(3));
  });

  it("times: s = a * r", () => {
    const w = world({ quantities: [q("q_a", rat(4)), q("q_b", null)], relations: [rel("r_1", "times", "q_b", "q_a", rat(3))] });
    expect(solvedValues(w).get("q_b")).toEqual(rat(12));
  });

  it("times with a reciprocal amount stands for division", () => {
    const w = world({ quantities: [q("q_a", rat(12)), q("q_b", null)], relations: [rel("r_1", "times", "q_b", "q_a", rat(1, 3))] });
    expect(solvedValues(w).get("q_b")).toEqual(rat(4));
  });

  it("times solved backwards for the reference", () => {
    const w = world({ quantities: [q("q_a", null), q("q_b", rat(12))], relations: [rel("r_1", "times", "q_b", "q_a", rat(3))] });
    expect(solvedValues(w).get("q_a")).toEqual(rat(4));
  });

  it("times with an unknown amount and both quantities known", () => {
    const w = world({
      quantities: [q("q_a", rat(4)), q("q_b", rat(12))],
      relations: [rel("r_1", "times", "q_b", "q_a", null)],
      question: { target_type: "relation_amount", target_id: "r_1" },
    });
    expect(solvedValues(w).get("r_1")).toEqual(rat(3));
  });

  it("fraction_of: s = a * r", () => {
    const w = world({ quantities: [q("q_a", rat(12)), q("q_b", null)], relations: [rel("r_1", "fraction_of", "q_b", "q_a", rat(2, 3))] });
    expect(solvedValues(w).get("q_b")).toEqual(rat(8));
  });

  it("fraction_of solved backwards gives a non-integer when it should", () => {
    const w = world({ quantities: [q("q_a", null), q("q_b", rat(5))], relations: [rel("r_1", "fraction_of", "q_b", "q_a", rat(2, 3))] });
    expect(solvedValues(w).get("q_a")).toEqual(rat(15, 2));
  });

  it("per: s = a * r (amount per one unit of the reference)", () => {
    const w = world({
      kinds: [THING, { ...THING, id: "k_box" }],
      quantities: [q("q_eggs", null), q("q_boxes", rat(4), { kind: "k_box" })],
      relations: [rel("r_1", "per", "q_eggs", "q_boxes", rat(6))],
    });
    expect(solvedValues(w).get("q_eggs")).toEqual(rat(24));
  });

  it("per as a speed: distance = speed * time, solved for time", () => {
    const w = world({
      kinds: [{ ...THING, id: "k_m" }, { ...THING, id: "k_min" }],
      quantities: [q("q_dist", rat(300), { kind: "k_m" }), q("q_time", null, { kind: "k_min" })],
      relations: [rel("r_speed", "per", "q_dist", "q_time", rat(60))],
    });
    expect(solvedValues(w).get("q_time")).toEqual(rat(5));
  });

  it("same_as: s = r", () => {
    const w = world({ quantities: [q("q_a", rat(7, 2)), q("q_b", null)], relations: [rel("r_1", "same_as", "q_b", "q_a", null)] });
    expect(solvedValues(w).get("q_b")).toEqual(rat(7, 2));
  });

  it("total_of: s = sum of reference_list, solved for the total", () => {
    const w = world({
      quantities: [q("q_all", null), q("q_a", rat(3)), q("q_b", rat(4)), q("q_c", rat(1, 2))],
      relations: [totalOf("r_sum", "q_all", ["q_a", "q_b", "q_c"])],
    });
    expect(solvedValues(w).get("q_all")).toEqual(rat(15, 2));
  });

  it("total_of solved for one part", () => {
    const w = world({
      quantities: [q("q_all", rat(10)), q("q_a", rat(3)), q("q_b", rat(4)), q("q_c", null)],
      relations: [totalOf("r_sum", "q_all", ["q_a", "q_b", "q_c"])],
      question: { target_type: "quantity", target_id: "q_c" },
    });
    expect(solvedValues(w).get("q_c")).toEqual(rat(3));
  });

  it("other makes no equation: it neither solves nor contradicts", () => {
    const alone = world({ quantities: [q("q_a", rat(5)), q("q_b", null)], relations: [otherRel("r_1", "q_b", "q_a")] });
    const res = expectKind(solve(alone), "underdetermined");
    expect(res.undetermined).toContain("q_b");

    const withValues = world({
      quantities: [q("q_a", rat(5)), q("q_b", rat(7)), q("q_c", null)],
      relations: [otherRel("r_1", "q_b", "q_a"), rel("r_2", "more_by", "q_c", "q_b", rat(1))],
    });
    expect(solvedValues(withValues).get("q_c")).toEqual(rat(8));
  });

  it("ratio a:b as a total_of plus two fraction_of the whole (2:3, first part 6)", () => {
    const w = world({
      quantities: [q("q_whole", null), q("q_p1", rat(6)), q("q_p2", null)],
      relations: [
        totalOf("r_whole", "q_whole", ["q_p1", "q_p2"]),
        rel("r_p1", "fraction_of", "q_p1", "q_whole", rat(2, 5)),
        rel("r_p2", "fraction_of", "q_p2", "q_whole", rat(3, 5)),
      ],
      question: { target_type: "quantity", target_id: "q_p2" },
    });
    const v = solvedValues(w);
    expect(v.get("q_whole")).toEqual(rat(15));
    expect(v.get("q_p2")).toEqual(rat(9));
  });

  it("chains several relations", () => {
    const w = world({
      quantities: [q("q_a", rat(6)), q("q_b", null), q("q_c", null)],
      relations: [rel("r_1", "times", "q_b", "q_a", rat(1, 2)), rel("r_2", "more_by", "q_c", "q_b", rat(4))],
      question: { target_type: "quantity", target_id: "q_c" },
    });
    const v = solvedValues(w);
    expect(v.get("q_b")).toEqual(rat(3));
    expect(v.get("q_c")).toEqual(rat(7));
  });
});

// ---------------------------------------------------------------------------------------------
// Time: one series per holder and item kind, events applied in `order` (指示書 第5.2節「時間」)
// ---------------------------------------------------------------------------------------------

describe("time series", () => {
  it("move: the giver goes down (fixture change-move)", () => {
    const w = world({
      quantities: [q("q_k0", rat(9), { holder: "h_k" }), q("q_k1", null, { holder: "h_k", at: "e_give" })],
      events: [ev("e_give", 1, "move", "h_k", rat(4), { to: "h_r" })],
    });
    expect(solvedValues(w).get("q_k1")).toEqual(rat(5));
  });

  it("gain, lose and move are applied in order, not in array order", () => {
    // A: 10 -> +5 (e_1) -> -3 (e_2) -> gives 4 to B (e_3). B starts at 2.
    const w = world({
      quantities: [
        q("q_a0", rat(10), { holder: "h_a" }),
        q("q_a2", null, { holder: "h_a", at: "e_2" }),
        q("q_a3", null, { holder: "h_a", at: "e_3" }),
        q("q_b0", rat(2), { holder: "h_b" }),
        q("q_b1", null, { holder: "h_b", at: "e_1" }),
        q("q_b3", null, { holder: "h_b", at: "e_3" }),
      ],
      events: [
        ev("e_3", 3, "move", "h_a", rat(4), { to: "h_b" }),
        ev("e_1", 1, "gain", "h_a", rat(5)),
        ev("e_2", 2, "lose", "h_a", rat(3)),
      ],
    });
    const v = solvedValues(w);
    expect(v.get("q_a2")).toEqual(rat(12));
    expect(v.get("q_a3")).toEqual(rat(8));
    expect(v.get("q_b1")).toEqual(rat(2));
    expect(v.get("q_b3")).toEqual(rat(6));
  });

  it("an unknown starting value is solved from a later one", () => {
    const w = world({
      quantities: [q("q_a0", null, { holder: "h_a" }), q("q_a1", rat(4), { holder: "h_a", at: "e_1" })],
      events: [ev("e_1", 1, "lose", "h_a", rat(3))],
    });
    expect(solvedValues(w).get("q_a0")).toEqual(rat(7));
  });

  it("an unknown event amount is solved under the event id", () => {
    const w = world({
      quantities: [q("q_a0", rat(10), { holder: "h_a" }), q("q_a1", rat(15), { holder: "h_a", at: "e_1" })],
      events: [ev("e_1", 1, "gain", "h_a", null)],
      question: { target_type: "event_amount", target_id: "e_1" },
    });
    expect(solvedValues(w).get("e_1")).toEqual(rat(5));
  });

  it("series are kept apart by item kind", () => {
    const w = world({
      kinds: [THING, { ...THING, id: "k_other" }],
      quantities: [
        q("q_t0", rat(3), { holder: "h_a" }),
        q("q_o0", rat(10), { holder: "h_a", kind: "k_other" }),
        q("q_o1", null, { holder: "h_a", kind: "k_other", at: "e_1" }),
      ],
      events: [ev("e_1", 1, "gain", "h_a", rat(2))],
      question: { target_type: "quantity", target_id: "q_o1" },
    });
    expect(solvedValues(w).get("q_o1")).toEqual(rat(10));
  });

  it("relations and events combine", () => {
    // B starts with 2 more than A; A starts at 5 and loses 1. How many does B have more than A after?
    const w = world({
      quantities: [
        q("q_a0", rat(5), { holder: "h_a" }),
        q("q_b0", null, { holder: "h_b" }),
        q("q_a1", null, { holder: "h_a", at: "e_1" }),
        q("q_b1", null, { holder: "h_b", at: "e_1" }),
      ],
      relations: [rel("r_1", "more_by", "q_b0", "q_a0", rat(2)), rel("r_2", "more_by", "q_b1", "q_a1", null)],
      events: [ev("e_1", 1, "lose", "h_a", rat(1))],
      question: { target_type: "relation_amount", target_id: "r_2" },
    });
    const v = solvedValues(w);
    expect(v.get("q_b1")).toEqual(rat(7));
    expect(v.get("r_2")).toEqual(rat(3));
  });
});

// ---------------------------------------------------------------------------------------------
// Nonlinear, underdetermined, impossible (指示書 第5.2節)
// ---------------------------------------------------------------------------------------------

describe("nonlinear", () => {
  it.each(["times", "fraction_of", "per"] as const)("%s with amount and reference both unknown is nonlinear", (op) => {
    const w = world({
      quantities: [q("q_s", rat(12)), q("q_r", null)],
      relations: [rel("r_m", op, "q_s", "q_r", null)],
      question: { target_type: "quantity", target_id: "q_r" },
    });
    expectKind(solve(w), "nonlinear");
  });

  it("becomes linear once a known value is substituted first", () => {
    // q_r is unknown in the world but fixed by another relation; then 12 = a * 6 is linear in a.
    const w = world({
      quantities: [q("q_s", rat(12)), q("q_r", null), q("q_c", rat(4))],
      relations: [rel("r_m", "times", "q_s", "q_r", null), rel("r_c", "more_by", "q_r", "q_c", rat(2))],
      question: { target_type: "relation_amount", target_id: "r_m" },
    });
    const v = solvedValues(w);
    expect(v.get("q_r")).toEqual(rat(6));
    expect(v.get("r_m")).toEqual(rat(2));
  });

  it("an unknown amount with a known reference stays linear", () => {
    const w = world({
      quantities: [q("q_s", null), q("q_r", rat(4)), q("q_t", rat(10))],
      relations: [rel("r_m", "times", "q_s", "q_r", null), rel("r_t", "more_by", "q_t", "q_s", rat(2))],
      question: { target_type: "relation_amount", target_id: "r_m" },
    });
    const v = solvedValues(w);
    expect(v.get("q_s")).toEqual(rat(8));
    expect(v.get("r_m")).toEqual(rat(2));
  });
});

describe("underdetermined", () => {
  it("names the quantities that are not fixed, and not the ones that are", () => {
    const w = world({
      quantities: [q("q_x", null), q("q_y", null), q("q_z", rat(5)), q("q_w", null)],
      relations: [rel("r_1", "more_by", "q_x", "q_y", rat(2)), rel("r_2", "more_by", "q_w", "q_z", rat(1))],
    });
    const res = expectKind(solve(w), "underdetermined");
    const ids = elementIds(w);
    expect(sortedIds(res.undetermined.filter((id) => ids.has(id)))).toEqual(["q_x", "q_y"]);
  });

  it("names an unknown relation amount", () => {
    const w = world({
      quantities: [q("q_a", rat(3)), q("q_b", null)],
      relations: [rel("r_1", "more_by", "q_b", "q_a", null)],
    });
    const res = expectKind(solve(w), "underdetermined");
    expect(res.undetermined).toEqual(expect.arrayContaining(["q_b", "r_1"]));
    expect(res.undetermined).not.toContain("q_a");
  });

  it("names an unknown event amount", () => {
    const w = world({
      quantities: [q("q_a0", rat(3), { holder: "h_a" }), q("q_a1", null, { holder: "h_a", at: "e_1" })],
      events: [ev("e_1", 1, "gain", "h_a", null)],
    });
    const res = expectKind(solve(w), "underdetermined");
    expect(res.undetermined).toEqual(expect.arrayContaining(["q_a1", "e_1"]));
  });

  it("a holder with no quantity at all does not by itself make the world underdetermined", () => {
    // The receiver of a move has no quantity in the world; the giver's question is still fixed.
    const w = world({
      quantities: [q("q_k0", rat(9), { holder: "h_k" }), q("q_k1", null, { holder: "h_k", at: "e_give" })],
      events: [ev("e_give", 1, "move", "h_k", rat(4), { to: "h_r" })],
    });
    expectKind(solve(w), "unique");
  });
});

describe("impossible marks", () => {
  it("negative value", () => {
    const w = world({ quantities: [q("q_a", rat(3)), q("q_b", null)], relations: [rel("r_1", "less_by", "q_b", "q_a", rat(5))] });
    const res = expectKind(solve(w), "unique");
    expect(res.values.get("q_b")).toEqual(rat(-2));
    expect(res.impossible).toContainEqual({ id: "q_b", reason: "negative" });
  });

  it("negative value after an event", () => {
    const w = world({
      quantities: [q("q_a0", rat(3), { holder: "h_a" }), q("q_a1", null, { holder: "h_a", at: "e_1" })],
      events: [ev("e_1", 1, "lose", "h_a", rat(5))],
    });
    const res = expectKind(solve(w), "unique");
    expect(res.values.get("q_a1")).toEqual(rat(-2));
    expect(res.impossible).toContainEqual({ id: "q_a1", reason: "negative" });
  });

  it("non-integer count of a countable kind (half of 3 people)", () => {
    const w = world({
      kinds: [PERSON],
      quantities: [q("q_all", rat(3), { kind: PERSON.id }), q("q_half", null, { kind: PERSON.id })],
      relations: [rel("r_1", "fraction_of", "q_half", "q_all", rat(1, 2))],
    });
    const res = expectKind(solve(w), "unique");
    expect(res.values.get("q_half")).toEqual(rat(3, 2));
    expect(res.impossible).toContainEqual({ id: "q_half", reason: "non_integer" });
  });

  it("non-integer amount of a non-countable kind (half of 3 L of juice) is not marked", () => {
    const w = world({
      kinds: [JUICE],
      quantities: [q("q_all", rat(3), { kind: JUICE.id }), q("q_half", null, { kind: JUICE.id })],
      relations: [rel("r_1", "fraction_of", "q_half", "q_all", rat(1, 2))],
    });
    const res = expectKind(solve(w), "unique");
    expect(res.values.get("q_half")).toEqual(rat(3, 2));
    expect(res.impossible).toEqual([]);
  });

  it("whole counts of a countable kind, related by a fractional amount, are not marked", () => {
    const w = world({
      kinds: [PERSON],
      quantities: [q("q_all", rat(8), { kind: PERSON.id }), q("q_part", null, { kind: PERSON.id })],
      relations: [rel("r_1", "fraction_of", "q_part", "q_all", rat(3, 4))],
    });
    const res = expectKind(solve(w), "unique");
    expect(res.values.get("q_part")).toEqual(rat(6));
    expect(res.impossible).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Contradiction: minimal sets, sorted by size then by the ascending id list (指示書 第5.2節, 第5.3節)
// ---------------------------------------------------------------------------------------------

describe("contradiction examples", () => {
  it("one minimal set made of two given values and a relation", () => {
    const w = world({
      quantities: [q("q_a", rat(5)), q("q_b", rat(8))],
      relations: [rel("r_1", "more_by", "q_b", "q_a", rat(2))],
    });
    expect(expectKind(solve(w), "contradiction").minimalSets).toEqual([["q_a", "q_b", "r_1"]]);
  });

  it("several minimal sets come out smallest first, then by id list", () => {
    // b = a + 2 and b = a + 4 clash with each other, and each clashes with a = 5, b = 8.
    const w = world({
      quantities: [q("q_a", rat(5)), q("q_b", rat(8))],
      relations: [rel("r_2", "more_by", "q_b", "q_a", rat(4)), rel("r_1", "more_by", "q_b", "q_a", rat(2))],
    });
    expect(expectKind(solve(w), "contradiction").minimalSets).toEqual([
      ["r_1", "r_2"],
      ["q_a", "q_b", "r_1"],
      ["q_a", "q_b", "r_2"],
    ]);
  });

  it("an event takes part in a minimal set", () => {
    const w = world({
      quantities: [q("q_k0", rat(9), { holder: "h_k" }), q("q_k1", rat(6), { holder: "h_k", at: "e_give" })],
      events: [ev("e_give", 1, "move", "h_k", rat(4), { to: "h_r" })],
    });
    const res = expectKind(solve(w), "contradiction");
    expect(res.minimalSets).toEqual([["e_give", "q_k0", "q_k1"]]);
    for (const id of res.minimalSets[0] ?? []) {
      expect(solve(withoutConstraints(w, [id])).kind).not.toBe("contradiction");
    }
  });

  it("withoutConstraints leaves the input world unchanged", () => {
    const w = world({
      quantities: [q("q_a", rat(5)), q("q_b", rat(8))],
      relations: [rel("r_1", "more_by", "q_b", "q_a", rat(2))],
    });
    const before = structuredClone(w);
    withoutConstraints(w, ["r_1", "q_a"]);
    expect(w).toEqual(before);
  });

  it("withoutConstraints takes out a relation and a given value", () => {
    const w = world({
      quantities: [q("q_a", rat(5)), q("q_b", rat(8))],
      relations: [rel("r_1", "more_by", "q_b", "q_a", rat(2))],
    });
    expect(solve(withoutConstraints(w, ["r_1"])).kind).toBe("unique");
    const freed = expectKind(solve(withoutConstraints(w, ["q_b"])), "unique");
    expect(freed.values.get("q_b")).toEqual(rat(7));
  });
});

// ---------------------------------------------------------------------------------------------
// Property tests: decide the answer first, then build a world around it (指示書 第11節 M1)
// ---------------------------------------------------------------------------------------------

const MAX_NODES = 5;
const posRat = fc
  .record({ n: fc.integer({ min: 1, max: 40 }), d: fc.integer({ min: 1, max: 6 }) })
  .map(({ n, d }) => rat(n, d));
const EDGE_KINDS = ["diff", "times", "fraction_of", "per", "same"] as const;
type EdgeKind = (typeof EDGE_KINDS)[number];

interface TreeSpec {
  size: number;
  raw: Rational[];
  parents: number[];
  kinds: EdgeKind[];
  childIsSubject: boolean[];
  hideQuantity: boolean[];
  hideAmount: boolean[];
  withSum: boolean;
}

const treeSpec: fc.Arbitrary<TreeSpec> = fc.record({
  size: fc.integer({ min: 2, max: MAX_NODES }),
  raw: fc.array(posRat, { minLength: MAX_NODES, maxLength: MAX_NODES }),
  parents: fc.array(fc.nat(), { minLength: MAX_NODES, maxLength: MAX_NODES }),
  kinds: fc.array(fc.constantFrom(...EDGE_KINDS), { minLength: MAX_NODES, maxLength: MAX_NODES }),
  childIsSubject: fc.array(fc.boolean(), { minLength: MAX_NODES, maxLength: MAX_NODES }),
  hideQuantity: fc.array(fc.boolean(), { minLength: MAX_NODES, maxLength: MAX_NODES }),
  hideAmount: fc.array(fc.boolean(), { minLength: MAX_NODES, maxLength: MAX_NODES }),
  withSum: fc.boolean(),
});

const at = <T,>(xs: readonly T[], i: number): T => {
  const x = xs[i];
  if (x === undefined) throw new Error(`index ${i} out of range`);
  return x;
};

interface Planted {
  world: WorldScene;
  /** Every unknown of the world with the value it was built from. */
  expected: Map<string, Rational>;
  /** The value of every quantity, given or not. */
  truth: Map<string, Rational>;
}

/**
 * A tree of quantities joined by relations whose amounts come from the planted values. Node 0 is
 * always given, so the world is fixed whenever every relation on a path to a given node has a known
 * amount; an amount is hidden only when both its ends are given.
 */
function plantTree(spec: TreeSpec, opts: { hide: boolean }): Planted {
  const n = spec.size;
  const values: Rational[] = [];
  const parentOf: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = i === 0 ? -1 : at(spec.parents, i) % i;
    parentOf.push(p);
    values.push(i > 0 && at(spec.kinds, i) === "same" ? at(values, p) : at(spec.raw, i));
  }
  const id = (i: number): string => `q_${i}`;

  const hidden = new Set<number>();
  if (opts.hide) {
    for (let i = 1; i < n; i++) if (at(spec.hideQuantity, i)) hidden.add(i);
    if (hidden.size === 0) hidden.add(n - 1);
  }

  const expected = new Map<string, Rational>();
  const truth = new Map<string, Rational>();
  const quantities: Quantity[] = [];
  for (let i = 0; i < n; i++) {
    const v = at(values, i);
    truth.set(id(i), v);
    if (hidden.has(i)) expected.set(id(i), v);
    quantities.push(q(id(i), hidden.has(i) ? null : v));
  }

  const relations: Relation[] = [];
  for (let i = 1; i < n; i++) {
    const p = at(parentOf, i);
    const [s, r] = at(spec.childIsSubject, i) ? [i, p] : [p, i];
    const vs = at(values, s);
    const vr = at(values, r);
    const kind = at(spec.kinds, i);
    const rid = `r_${i}`;
    let operator: Parameters<typeof rel>[1];
    let amount: Rational | null;
    if (kind === "same" || (kind === "diff" && cmp(vs, vr) === 0)) {
      operator = "same_as";
      amount = null;
    } else if (kind === "diff") {
      const more = cmp(vs, vr) > 0;
      operator = more ? "more_by" : "less_by";
      amount = more ? sub(vs, vr) : sub(vr, vs);
    } else {
      operator = kind;
      amount = div(vs, vr);
    }
    const hideThis = opts.hide && amount !== null && !hidden.has(s) && !hidden.has(r) && at(spec.hideAmount, i);
    if (hideThis && amount !== null) expected.set(rid, amount);
    relations.push(rel(rid, operator, id(s), id(r), hideThis ? null : amount));
  }

  if (spec.withSum) {
    const sum = values.reduce((acc, v) => add(acc, v), rat(0));
    truth.set("q_sum", sum);
    const sumHidden = opts.hide;
    if (sumHidden) expected.set("q_sum", sum);
    quantities.push(q("q_sum", sumHidden ? null : sum));
    relations.push(totalOf("r_sum", "q_sum", values.map((_, i) => id(i))));
  }

  const firstHidden = quantities.find((x) => x.value === null) ?? at(quantities, 0);
  const w = world({ quantities, relations, question: { target_type: "quantity", target_id: firstHidden.id } });
  return { world: w, expected, truth };
}

describe("property: the planted answer comes back", () => {
  it("relation trees with at least one unknown solve uniquely to the planted values", () => {
    fc.assert(
      fc.property(treeSpec, (spec) => {
        const { world: w, expected } = plantTree(spec, { hide: true });
        expect(expected.size).toBeGreaterThan(0);
        const res = expectKind(solve(w), "unique");
        for (const [id, v] of expected) expect(res.values.get(id)).toEqual(v);
        expect(res.impossible).toEqual([]);
      }),
      { numRuns: 200 },
    );
  });

  it("event series with at least one unknown solve uniquely to the planted values", () => {
    const seriesSpec = fc.record({
      points: fc.array(posRat, { minLength: 2, maxLength: MAX_NODES }),
      hidePoint: fc.array(fc.boolean(), { minLength: MAX_NODES, maxLength: MAX_NODES }),
      hideAmount: fc.array(fc.boolean(), { minLength: MAX_NODES, maxLength: MAX_NODES }),
      reverseArray: fc.boolean(),
    });
    fc.assert(
      fc.property(seriesSpec, ({ points, hidePoint, hideAmount, reverseArray }) => {
        const m = points.length - 1;
        const hidden = new Set<number>();
        for (let k = 0; k <= m; k++) if (at(hidePoint, k)) hidden.add(k);
        if (hidden.size === points.length) hidden.delete(0);
        const expected = new Map<string, Rational>();

        const events: WorldEvent[] = [];
        for (let k = 1; k <= m; k++) {
          const diff = sub(at(points, k), at(points, k - 1));
          const gain = cmp(diff, rat(0)) >= 0;
          const amount = gain ? diff : sub(rat(0), diff);
          const hideThis = !hidden.has(k) && !hidden.has(k - 1) && at(hideAmount, k);
          if (hideThis) expected.set(`e_${k}`, amount);
          events.push(ev(`e_${k}`, k, gain ? "gain" : "lose", "h_a", hideThis ? null : amount));
        }
        if (hidden.size === 0 && expected.size === 0) hidden.add(m);

        const quantities: Quantity[] = points.map((v, k) => {
          const qid = `q_t${k}`;
          if (hidden.has(k)) expected.set(qid, v);
          return q(qid, hidden.has(k) ? null : v, { holder: "h_a", at: k === 0 ? null : `e_${k}` });
        });
        const w = world({ quantities, events: reverseArray ? [...events].reverse() : events });
        const res = expectKind(solve(w), "unique");
        for (const [id, v] of expected) expect(res.values.get(id)).toEqual(v);
      }),
      { numRuns: 200 },
    );
  });
});

interface ConflictSpec {
  tree: TreeSpec;
  addRelation: boolean;
  changeValue: boolean;
  pick: [number, number, number];
}

describe("property: minimal conflict sets", () => {
  const conflictSpec: fc.Arbitrary<ConflictSpec> = fc.record({
    tree: treeSpec,
    addRelation: fc.boolean(),
    changeValue: fc.boolean(),
    pick: fc.tuple(fc.nat(), fc.nat(), fc.nat()),
  });

  /** A fully given, consistent tree plus a clashing relation and/or a wrong given value. */
  function plantConflict(spec: ConflictSpec): WorldScene {
    const { world: base, truth } = plantTree(spec.tree, { hide: false });
    const n = spec.tree.size;
    const addRelation = spec.addRelation || !spec.changeValue;
    const [pi, pj, pk] = spec.pick;
    const quantities = base.quantities.map((x) => ({ ...x }));
    const relations = [...base.relations];
    if (addRelation) {
      const i = pi % n;
      const j = (i + 1 + (pj % (n - 1))) % n;
      const vi = truth.get(`q_${i}`) as Rational;
      const vj = truth.get(`q_${j}`) as Rational;
      relations.push(rel("r_x", "times", `q_${i}`, `q_${j}`, mul(rat(2), div(vi, vj))));
    }
    if (spec.changeValue) {
      const k = pk % n;
      const target = at(quantities, k);
      target.value = toSchema(add(truth.get(target.id) as Rational, rat(1)));
    }
    return world({ quantities, relations, question: base.question });
  }

  it("removing any one member of any returned set clears the contradiction, and each set alone still clashes", () => {
    fc.assert(
      fc.property(conflictSpec, (spec) => {
        const w = plantConflict(spec);
        const res = expectKind(solve(w), "contradiction");
        expect(res.minimalSets.length).toBeGreaterThan(0);
        const all = constraintIds(w);
        for (const set of res.minimalSets) {
          expect(set.length).toBeGreaterThan(0);
          expect(new Set(set).size).toBe(set.length);
          for (const id of set) expect(all).toContain(id);
          for (const id of set) {
            expect(solve(withoutConstraints(w, [id])).kind).not.toBe("contradiction");
          }
          const rest = all.filter((id) => !set.includes(id));
          expect(solve(withoutConstraints(w, rest)).kind).toBe("contradiction");
        }
      }),
      { numRuns: 100 },
    );
  });

  it("each set is in ascending id order, and sets are ordered by size then id list", () => {
    fc.assert(
      fc.property(conflictSpec, (spec) => {
        const res = expectKind(solve(plantConflict(spec)), "contradiction");
        for (const set of res.minimalSets) expect(set).toEqual(sortedIds(set));
        for (let i = 1; i < res.minimalSets.length; i++) {
          expect(compareIdLists(at(res.minimalSets, i - 1), at(res.minimalSets, i))).toBeLessThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("the result is deterministic and does not depend on array order", () => {
    fc.assert(
      fc.property(conflictSpec, (spec) => {
        const w = plantConflict(spec);
        const first = solve(w);
        expect(solve(structuredClone(w))).toEqual(first);
        const shuffled: WorldScene = {
          ...w,
          quantities: [...w.quantities].reverse(),
          relations: [...w.relations].reverse(),
        };
        expect(solve(shuffled)).toEqual(first);
      }),
      { numRuns: 100 },
    );
  });

  it("a world with several minimal sets gives the same order every time", () => {
    const w = world({
      quantities: [q("q_a", rat(5)), q("q_b", rat(8)), q("q_c", rat(1))],
      relations: [
        rel("r_3", "more_by", "q_b", "q_c", rat(4)),
        rel("r_2", "more_by", "q_b", "q_a", rat(4)),
        rel("r_1", "more_by", "q_b", "q_a", rat(2)),
      ],
    });
    const runs = Array.from({ length: 5 }, () => expectKind(solve(w), "contradiction").minimalSets);
    expect(at(runs, 0).length).toBeGreaterThan(1);
    for (const r of runs) expect(r).toEqual(at(runs, 0));
    expect(at(runs, 0)).toEqual([
      ["r_1", "r_2"],
      ["q_a", "q_b", "r_1"],
      ["q_a", "q_b", "r_2"],
      ["q_b", "q_c", "r_3"],
      ["q_a", "q_c", "r_1", "r_3"],
      ["q_a", "q_c", "r_2", "r_3"],
    ]);
  });
});
