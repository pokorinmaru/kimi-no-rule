// M1 step (4): apply (指示書 第5.3節; fields per op from 第5.1節; limits per problem from 第5.7節;
// criteria from 第11節 M1). Written before the implementation.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { schemas, validateOps, validateWorld, type AnyOp, type WorldScene } from "../schema/index.ts";
import { rat } from "../rational/index.ts";
import { solve, withoutConstraints } from "../solve/index.ts";
import { apply, type ApplyInput, type ApplyResult } from "./index.ts";
import {
  differenceWorld,
  num,
  op,
  phrase,
  totalWorld,
  worldW,
  worldWithStoredAnswer,
  worldWithTakenId,
  worldWithoutLaterCount,
} from "./test-worlds.ts";

type Quantity = WorldScene["quantities"][number];
type Relation = WorldScene["relations"][number];
type WorldEvent = WorldScene["events"][number];

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/** apply on the main test world; anything not given takes its default. */
function run(input: Partial<ApplyInput> = {}): ApplyResult {
  return apply({ correct: worldW(), ops: [], ...input });
}

function quantity(w: WorldScene, id: string): Quantity {
  const x = w.quantities.find((q) => q.id === id);
  if (x === undefined) throw new Error(`no quantity ${id}`);
  return x;
}

function relation(w: WorldScene, id: string): Relation {
  const x = w.relations.find((r) => r.id === id);
  if (x === undefined) throw new Error(`no relation ${id}`);
  return x;
}

function event(w: WorldScene, id: string): WorldEvent {
  const x = w.events.find((e) => e.id === id);
  if (x === undefined) throw new Error(`no event ${id}`);
  return x;
}

const ids = (xs: readonly { id: string }[]): string[] => xs.map((x) => x.id);
const sorted = (xs: readonly string[]): string[] => [...xs].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));

function expectValidWorld(w: WorldScene): void {
  expect(() => schemas.worldScene.parse(w)).not.toThrow();
  expect(validateWorld(w)).toEqual({ ok: true });
}

// ---------------------------------------------------------------------------------------------
// Test worlds are sound
// ---------------------------------------------------------------------------------------------

describe("test worlds", () => {
  it.each([
    ["main", worldW()],
    ["stored answer", worldWithStoredAnswer()],
    ["no later count", worldWithoutLaterCount()],
    ["taken id", worldWithTakenId()],
    ["total", totalWorld()],
    ["difference", differenceWorld(4, 3)],
  ])("%s world passes the shape and meaning checks", (_name, w) => {
    expectValidWorld(w);
  });

  it("the main world solves to b = 8 and c after the event = 6", () => {
    const res = solve(worldW());
    expect(res.kind).toBe("unique");
    if (res.kind !== "unique") return;
    expect(res.values.get("q_b")).toEqual(rat(8));
    expect(res.values.get("q_c2")).toEqual(rat(6));
  });
});

// ---------------------------------------------------------------------------------------------
// The starting world of the child (指示書 第5.3節)
// ---------------------------------------------------------------------------------------------

describe("starting world", () => {
  it("keeps every holder and item kind", () => {
    const res = run();
    const w = worldW();
    expect(res.judgeWorld.holders).toEqual(w.holders);
    expect(res.judgeWorld.item_kinds).toEqual(w.item_kinds);
  });

  it("keeps every quantity, with values only for the given numbers", () => {
    const res = run();
    expect(ids(res.judgeWorld.quantities)).toEqual(["q_a", "q_b", "q_c", "q_c2", "q_d"]);
    expect(quantity(res.judgeWorld, "q_a").value).toEqual(num(5));
    expect(quantity(res.judgeWorld, "q_c").value).toEqual(num(2));
    expect(quantity(res.judgeWorld, "q_d").value).toEqual(num(1));
    expect(quantity(res.judgeWorld, "q_c2").value).toBeNull();
  });

  it("does not carry the value of the asked quantity, even when the correct world stores it", () => {
    const res = apply({ correct: worldWithStoredAnswer(), ops: [] });
    expect(quantity(res.judgeWorld, "q_b").value).toBeNull();
    expect(quantity(res.drawWorld, "q_b").value).toBeNull();
  });

  it("has no relation that the child did not touch", () => {
    expect(run().judgeWorld.relations).toEqual([]);
    expect(run().drawWorld.relations).toEqual([]);
  });

  it("keeps an untouched event only as a point in time, without its amount (Q13)", () => {
    const res = run();
    expect(res.judgeWorld.events).toEqual([{ ...event(worldW(), "e_1"), amount: null }]);
  });

  it("drops an untouched event when no quantity is counted at it", () => {
    const res = apply({ correct: worldWithoutLaterCount(), ops: [] });
    expect(res.judgeWorld.events).toEqual([]);
  });

  it("keeps the question as it is", () => {
    expect(run().judgeWorld.question).toEqual(worldW().question);
  });

  it("is a valid world even though word links name elements it does not keep", () => {
    const res = run();
    expectValidWorld(res.judgeWorld);
    expectValidWorld(res.drawWorld);
  });

  it("with nothing said, touches nothing and loses nothing", () => {
    const res = run();
    expect(res.touched).toEqual([]);
    expect(res.discarded).toEqual([]);
    expect(res.representable).toBe("full");
    expect(res.idMap).toEqual({});
    expect(res.removedByCascade).toEqual([]);
    expect(res.judge).toEqual({ released: [], unsatisfiable: [] });
    expect(res.draw).toEqual({ released: [], unsatisfiable: [], answerSetAside: [] });
    expect(res.answers).toEqual([]);
    expect(res.unitValues).toEqual([]);
    expect(res.wordCues).toEqual([]);
    expect(res.procedures).toEqual([]);
    expect(res.observedReferences).toEqual([]);
  });

  it("a relation named in phrases is carried over unchanged", () => {
    const res = run({ phrases: [phrase("r_1")] });
    expect(res.judgeWorld.relations).toEqual([relation(worldW(), "r_1")]);
    expect(res.touched).toEqual(["r_1"]);
  });

  it("an event named in phrases is carried over with its amount", () => {
    const res = run({ phrases: [phrase("e_1")] });
    expect(event(res.judgeWorld, "e_1")).toEqual(event(worldW(), "e_1"));
  });

  it("a relation becomes touched through the subject or reference of an op only if the op names it", () => {
    // set_quantity names q_c only; r_2 and r_4 mention q_c but are not touched.
    const res = run({ ops: [op.setQuantity("q_c", num(2))] });
    expect(res.judgeWorld.relations).toEqual([]);
    expect(res.touched).toEqual(["q_c"]);
  });

  it("touched is sorted and lists ids after renaming", () => {
    const res = run({
      ops: [op.addHolder("n_1", "x"), op.addQuantity("n_2", "n_1", "k_thing", null, num(3))],
      phrases: [phrase("r_2"), phrase("h_a")],
    });
    expect(res.touched).toEqual(sorted(res.touched));
    expect(res.touched).toEqual(expect.arrayContaining(["h_a", "h_new1", "q_new1", "r_2"]));
    // item_kind is not one of the touching fields (指示書 第5.3節).
    expect(res.touched).not.toContain("k_thing");
    expect(res.touched.some((id) => id.startsWith("n_"))).toBe(false);
  });

  it("representable is taken from the input when nothing is discarded", () => {
    expect(run({ representable: "none" }).representable).toBe("none");
    expect(run({ representable: "partial" }).representable).toBe("partial");
    expect(run({ representable: "full" }).representable).toBe("full");
  });
});

// ---------------------------------------------------------------------------------------------
// 指示書 第11節 M1: set_relation_reference, set_unit_value, word_cue
// ---------------------------------------------------------------------------------------------

describe("set_relation_reference (three cases)", () => {
  it("same reference: the world does not change and the reference is recorded as observed", () => {
    const res = run({ ops: [op.setReference("r_1", "q_a")] });
    const touchedOnly = run({ phrases: [phrase("r_1")], ops: [] });
    expect(relation(res.judgeWorld, "r_1")).toEqual(relation(worldW(), "r_1"));
    expect(res.judgeWorld).toEqual(touchedOnly.judgeWorld);
    expect(res.drawWorld).toEqual(touchedOnly.drawWorld);
    expect(res.observedReferences).toEqual([{ relation_id: "r_1", reference: "q_a" }]);
    expect(res.discarded).toEqual([]);
  });

  it("the current subject: same as swap_relation_direction", () => {
    const res = run({ ops: [op.setReference("r_1", "q_b")] });
    const swapped = run({ ops: [op.swap("r_1")] });
    expect(res.judgeWorld).toEqual(swapped.judgeWorld);
    expect(relation(res.judgeWorld, "r_1")).toEqual({ ...relation(worldW(), "r_1"), subject: "q_a", reference: "q_b" });
    expect(res.observedReferences).toEqual([]);
    expect(res.discarded).toEqual([]);
  });

  it("another quantity: only the reference is replaced, the subject stays (Q10)", () => {
    const res = run({ ops: [op.setReference("r_1", "q_c")] });
    expect(relation(res.judgeWorld, "r_1")).toEqual({ ...relation(worldW(), "r_1"), subject: "q_b", reference: "q_c" });
    expect(res.observedReferences).toEqual([]);
    expect(res.touched).toEqual(expect.arrayContaining(["q_c", "r_1"]));
  });

  it("an op that would relate a quantity to itself is discarded", () => {
    // A total has no single reference to swap with, so naming its subject would relate it to itself.
    const res = apply({ correct: totalWorld(), ops: [op.setReference("r_t", "q_t")] });
    expect(res.discarded.map((d) => d.index)).toEqual([0]);
    expect(res.representable).toBe("partial");
    expect(relation(res.judgeWorld, "r_t")).toEqual(relation(totalWorld(), "r_t"));
    expectValidWorld(res.judgeWorld);
  });

  it("an added relation whose subject is its reference is discarded", () => {
    const res = run({ ops: [op.addRelation("n_1", "more_by", "q_c", "q_c", num(1))] });
    expect(res.discarded.map((d) => d.index)).toEqual([0]);
    expect(res.representable).toBe("partial");
    expect(res.judgeWorld.relations).toEqual([]);
    expect(res.idMap).toEqual({});
  });

  it("no relation of the result is related to itself, whatever reference is named", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("r_1", "r_2", "r_4"),
        fc.constantFrom("q_a", "q_b", "q_c", "q_c2", "q_d"),
        (target, reference) => {
          const res = run({ ops: [op.setReference(target, reference)] });
          for (const r of res.judgeWorld.relations) {
            expect(r.reference).not.toBe(r.subject);
          }
          expectValidWorld(res.judgeWorld);
        },
      ),
    );
  });
});

describe("set_unit_value", () => {
  it("is drawn even when the value is not the right one, and leaves both worlds unchanged", () => {
    const res = run({ ops: [op.setUnitValue("r_1", num(99))] });
    const touchedOnly = run({ phrases: [phrase("r_1")] });
    expect(res.unitValues).toEqual([{ relation_id: "r_1", value: num(99), drawn: true }]);
    expect(res.judgeWorld).toEqual(touchedOnly.judgeWorld);
    expect(res.drawWorld).toEqual(touchedOnly.drawWorld);
  });

  it("the second time in a problem is still drawn", () => {
    const res = run({ ops: [op.setUnitValue("r_1", num(2))], priorUnitValueUtterances: 1 });
    expect(res.unitValues).toEqual([{ relation_id: "r_1", value: num(2), drawn: true }]);
  });

  it("the third time in a problem is recorded but not drawn", () => {
    const res = run({ ops: [op.setUnitValue("r_1", num(2))], priorUnitValueUtterances: 2 });
    expect(res.unitValues).toEqual([{ relation_id: "r_1", value: num(2), drawn: false }]);
  });

  it("does not count answers, and answers do not count it", () => {
    const res = run({ ops: [op.setUnitValue("r_1", num(2))], priorAnswerUtterances: 5, priorUnitValueUtterances: 0 });
    expect(res.unitValues[0]?.drawn).toBe(true);
  });
});

describe("word_cue", () => {
  it("is recorded and leaves both worlds unchanged", () => {
    const res = run({ ops: [op.wordCue(0, [1, 2])] });
    const nothing = run();
    expect(res.wordCues).toEqual([{ statement_index: 0, tokens: [1, 2] }]);
    expect(res.judgeWorld).toEqual(nothing.judgeWorld);
    expect(res.drawWorld).toEqual(nothing.drawWorld);
    expect(res.touched).toEqual([]);
  });

  it("several cues keep their order", () => {
    const res = run({ ops: [op.wordCue(1, [0]), op.wordCue(0, [3, 4])] });
    expect(res.wordCues).toEqual([
      { statement_index: 1, tokens: [0] },
      { statement_index: 0, tokens: [3, 4] },
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// Each op (指示書 第5.1節 table, 第5.3節)
// ---------------------------------------------------------------------------------------------

describe("ops that edit existing elements", () => {
  it("set_quantity sets the value of a quantity", () => {
    const res = run({ ops: [op.setQuantity("q_c", num(7))] });
    expect(quantity(res.judgeWorld, "q_c").value).toEqual(num(7));
    expect(quantity(res.drawWorld, "q_c").value).toEqual(num(7));
  });

  it("set_relation_amount carries the relation and sets its amount", () => {
    const res = run({ ops: [op.setRelationAmount("r_1", num(4))] });
    expect(relation(res.judgeWorld, "r_1")).toEqual({ ...relation(worldW(), "r_1"), amount: num(4) });
    expect(res.touched).toEqual(["r_1"]);
  });

  it("set_event_amount carries the event and sets its amount", () => {
    const res = run({ ops: [op.setEventAmount("e_1", num(1))] });
    expect(event(res.judgeWorld, "e_1")).toEqual({ ...event(worldW(), "e_1"), amount: num(1) });
  });

  it("set_relation_operator changes only the operator", () => {
    const res = run({ ops: [op.setRelationOperator("r_1", "less_by")] });
    expect(relation(res.judgeWorld, "r_1")).toEqual({ ...relation(worldW(), "r_1"), operator: "less_by" });
  });

  it("swap_relation_direction exchanges subject and reference and keeps amount and operator", () => {
    const res = run({ ops: [op.swap("r_2")] });
    expect(relation(res.judgeWorld, "r_2")).toEqual({
      ...relation(worldW(), "r_2"),
      subject: "q_a",
      reference: "q_c",
      operator: "less_by",
      amount: num(3),
    });
  });

  it("set_event_type changes the type of the event", () => {
    const res = run({ ops: [op.setEventType("e_1", "lose")] });
    expect(event(res.judgeWorld, "e_1")).toEqual({ ...event(worldW(), "e_1"), type: "lose" });
  });

  it("set_event_to_holder changes where a move goes", () => {
    const res = run({
      ops: [op.addEvent("n_1", "move", "h_a", "k_thing", num(2), "h_b"), op.setEventToHolder("n_1", "h_c")],
    });
    expect(event(res.judgeWorld, "e_new1")).toMatchObject({ type: "move", holder: "h_a", to_holder: "h_c" });
  });

  it("set_question_target changes the asked quantity", () => {
    const res = run({ ops: [op.setQuestionTarget("q_c", "quantity")] });
    expect(res.judgeWorld.question).toEqual({ target_type: "quantity", target_id: "q_c" });
  });

  it("set_question_target can ask for the amount of a relation", () => {
    const res = run({ ops: [op.setQuestionTarget("r_1", "relation_amount")] });
    expect(res.judgeWorld.question).toEqual({ target_type: "relation_amount", target_id: "r_1" });
    expect(ids(res.judgeWorld.relations)).toEqual(["r_1"]);
    expectValidWorld(res.judgeWorld);
  });

  it("rename_item_kind changes the name of the kind", () => {
    const res = run({ ops: [op.renameItemKind("k_thing", "box")] });
    const kind = res.judgeWorld.item_kinds.find((k) => k.id === "k_thing");
    expect(kind?.noun).toBe("box");
  });
});

describe("ops that add elements, and the ids they get", () => {
  it("add_holder adds a holder named h_new1", () => {
    const res = run({ ops: [op.addHolder("n_1", "x")] });
    expect(res.judgeWorld.holders).toContainEqual({ id: "h_new1", label: "x" });
    expect(res.idMap).toEqual({ n_1: "h_new1" });
  });

  it("add_item_kind adds an item kind named k_new1", () => {
    const res = run({ ops: [op.addItemKind("n_1", "box")] });
    expect(res.judgeWorld.item_kinds.find((k) => k.id === "k_new1")).toMatchObject({ noun: "box" });
    expect(res.idMap).toEqual({ n_1: "k_new1" });
    expectValidWorld(res.judgeWorld);
  });

  it("add_quantity adds a quantity named q_new1 with the value said", () => {
    const res = run({ ops: [op.addQuantity("n_1", "h_a", "k_thing", null, num(3))] });
    expect(quantity(res.judgeWorld, "q_new1")).toEqual({
      id: "q_new1",
      holder: "h_a",
      item_kind: "k_thing",
      at_event: null,
      value: num(3),
    });
  });

  it("add_quantity with no number adds a quantity without a value", () => {
    const res = run({ ops: [op.addQuantity("n_1", "h_a", "k_thing", "e_1", null)] });
    expect(quantity(res.judgeWorld, "q_new1")).toMatchObject({ at_event: "e_1", value: null });
  });

  it("add_relation adds a relation named r_new1", () => {
    const res = run({ ops: [op.addRelation("n_1", "less_by", "q_c", "q_a", num(3))] });
    expect(relation(res.judgeWorld, "r_new1")).toEqual({
      id: "r_new1",
      operator: "less_by",
      subject: "q_c",
      reference: "q_a",
      reference_list: null,
      amount: num(3),
      other_description: null,
    });
    expect(res.touched).toEqual(expect.arrayContaining(["q_a", "q_c"]));
  });

  it("add_relation of a total keeps its list", () => {
    const res = run({ ops: [op.addRelation("n_1", "total_of", "q_b", null, null, ["q_a", "q_c"])] });
    expect(relation(res.judgeWorld, "r_new1")).toMatchObject({ operator: "total_of", reference: null, reference_list: ["q_a", "q_c"] });
  });

  it("add_event adds an event named e_new1", () => {
    const res = run({ ops: [op.addEvent("n_1", "gain", "h_a", "k_thing", num(2))] });
    expect(event(res.judgeWorld, "e_new1")).toMatchObject({
      type: "gain",
      holder: "h_a",
      item_kind: "k_thing",
      amount: num(2),
      to_holder: null,
    });
    expectValidWorld(res.judgeWorld);
  });

  it("each kind counts from 1 on its own, and later ops of the same utterance use the temporary ids", () => {
    const res = run({
      ops: [
        op.addHolder("n_1", "x"),
        op.addItemKind("n_2", "box"),
        op.addQuantity("n_3", "n_1", "n_2", null, num(4)),
        op.addRelation("n_4", "more_by", "n_3", "q_a", num(1)),
        op.addEvent("n_5", "gain", "n_1", "n_2", num(2)),
      ],
    });
    expect(res.idMap).toEqual({ n_1: "h_new1", n_2: "k_new1", n_3: "q_new1", n_4: "r_new1", n_5: "e_new1" });
    expect(quantity(res.judgeWorld, "q_new1")).toMatchObject({ holder: "h_new1", item_kind: "k_new1" });
    expect(relation(res.judgeWorld, "r_new1")).toMatchObject({ subject: "q_new1", reference: "q_a" });
    expect(event(res.judgeWorld, "e_new1")).toMatchObject({ holder: "h_new1", item_kind: "k_new1" });
    expect(res.discarded).toEqual([]);
    expectValidWorld(res.judgeWorld);
  });

  it("two of the same kind get 1 and 2", () => {
    const res = run({ ops: [op.addHolder("n_1", "x"), op.addHolder("n_2", "y")] });
    expect(res.idMap).toEqual({ n_1: "h_new1", n_2: "h_new2" });
  });

  it("a number already used in the world is skipped", () => {
    const res = apply({ correct: worldWithTakenId(), ops: [op.addQuantity("n_1", "h_a", "k_thing", null, num(3))] });
    expect(res.idMap).toEqual({ n_1: "q_new2" });
    expect(quantity(res.judgeWorld, "q_new1").value).toEqual(num(7));
    expectValidWorld(res.judgeWorld);
  });

  it("an add op without a temporary id still adds an element, but is not in idMap", () => {
    const res = run({ ops: [op.addRelation(null, "less_by", "q_c", "q_a", num(3))] });
    expect(res.idMap).toEqual({});
    expect(res.judgeWorld.relations).toHaveLength(1);
    const added = res.judgeWorld.relations[0];
    expect(added?.id.startsWith("r_")).toBe(true);
    expect(added).toMatchObject({ subject: "q_c", reference: "q_a" });
    expectValidWorld(res.judgeWorld);
  });

  it("an id given without a temporary id does not collide with a later one", () => {
    const res = run({ ops: [op.addHolder(null, "x"), op.addHolder("n_1", "y")] });
    const added = res.judgeWorld.holders.filter((h) => !["h_a", "h_b", "h_c"].includes(h.id));
    expect(new Set(ids(added)).size).toBe(2);
    expectValidWorld(res.judgeWorld);
  });

  it("renaming follows the order of the ops, not the temporary numbers, and is the same every time", () => {
    const ops = [op.addHolder("n_2", "x"), op.addQuantity("n_1", "n_2", "k_thing", null, null)];
    expect(run({ ops }).idMap).toEqual({ n_2: "h_new1", n_1: "q_new1" });
    expect(run({ ops })).toEqual(run({ ops }));
  });
});

describe("remove_element and what goes with it", () => {
  it("a holder takes its quantities, its events and the relations on those quantities", () => {
    const res = run({ ops: [op.remove("h_c")], phrases: [phrase("r_2")] });
    expect(ids(res.judgeWorld.holders)).toEqual(["h_a", "h_b"]);
    expect(ids(res.judgeWorld.quantities)).toEqual(["q_a", "q_b", "q_d"]);
    expect(res.judgeWorld.events).toEqual([]);
    expect(res.judgeWorld.relations).toEqual([]);
    expect(res.removedByCascade).toEqual(["e_1", "q_c", "q_c2", "r_2"]);
    expectValidWorld(res.judgeWorld);
  });

  it("a holder also takes a move that goes to it", () => {
    const res = run({ ops: [op.addEvent("n_1", "move", "h_a", "k_thing", num(1), "h_c"), op.remove("h_c")] });
    expect(res.removedByCascade).toContain("e_new1");
    expect(res.judgeWorld.events.some((e) => e.to_holder === "h_c" || e.holder === "h_c")).toBe(false);
  });

  it("an item kind takes its quantities", () => {
    const res = run({ ops: [op.remove("k_other")] });
    expect(ids(res.judgeWorld.item_kinds)).toEqual(["k_thing"]);
    expect(res.removedByCascade).toEqual(["q_d"]);
    expectValidWorld(res.judgeWorld);
  });

  it("a quantity takes the relations that name it", () => {
    const res = run({ ops: [op.remove("q_a")], phrases: [phrase("r_1"), phrase("r_2"), phrase("r_4")] });
    expect(ids(res.judgeWorld.relations)).toEqual(["r_4"]);
    expect(res.removedByCascade).toEqual(["r_1", "r_2"]);
    expectValidWorld(res.judgeWorld);
  });

  it("a quantity in the list of a total takes the total", () => {
    const res = apply({ correct: totalWorld(), ops: [op.remove("q_x")], phrases: [phrase("r_t")] });
    expect(res.judgeWorld.relations).toEqual([]);
    expect(res.removedByCascade).toEqual(["r_t"]);
  });

  it("an event takes the quantities counted at it", () => {
    const res = run({ ops: [op.remove("e_1")] });
    expect(res.judgeWorld.events).toEqual([]);
    expect(ids(res.judgeWorld.quantities)).toEqual(["q_a", "q_b", "q_c", "q_d"]);
    expect(res.removedByCascade).toEqual(["q_c2"]);
    expectValidWorld(res.judgeWorld);
  });

  it("a relation goes alone", () => {
    const res = run({ ops: [op.remove("r_1")], phrases: [phrase("r_1")] });
    expect(res.judgeWorld.relations).toEqual([]);
    expect(res.removedByCascade).toEqual([]);
  });

  it("the asked quantity cannot be removed", () => {
    const res = run({ ops: [op.remove("q_b")] });
    expect(res.discarded.map((d) => d.index)).toEqual([0]);
    expect(res.representable).toBe("partial");
    expect(ids(res.judgeWorld.quantities)).toContain("q_b");
    expect(res.removedByCascade).toEqual([]);
  });

  it("a later op naming a removed element is discarded", () => {
    const res = run({ ops: [op.remove("q_c"), op.setQuantity("q_c", num(3))] });
    expect(res.discarded.map((d) => d.index)).toEqual([1]);
    expect(ids(res.judgeWorld.quantities)).not.toContain("q_c");
  });
});

describe("state_answer: drawn, never judged", () => {
  it("an answer for the asked quantity goes into the drawing world only", () => {
    const res = run({ ops: [op.answer("q_b", num(9))] });
    expect(quantity(res.drawWorld, "q_b").value).toEqual(num(9));
    expect(quantity(res.judgeWorld, "q_b").value).toBeNull();
    expect(res.answers).toEqual([{ target_id: "q_b", value: num(9), onQuestionTarget: true, drawn: true }]);
  });

  it("the second answer in a problem is still drawn", () => {
    const res = run({ ops: [op.answer("q_b", num(9))], priorAnswerUtterances: 1 });
    expect(res.answers[0]?.drawn).toBe(true);
    expect(quantity(res.drawWorld, "q_b").value).toEqual(num(9));
  });

  it("the third answer in a problem is recorded but not put in any world", () => {
    const res = run({ ops: [op.answer("q_b", num(9))], priorAnswerUtterances: 2 });
    expect(res.answers).toEqual([{ target_id: "q_b", value: num(9), onQuestionTarget: true, drawn: false }]);
    expect(quantity(res.drawWorld, "q_b").value).toBeNull();
    expect(res.drawWorld).toEqual(res.judgeWorld);
  });

  it("does not count set_unit_value utterances", () => {
    const res = run({ ops: [op.answer("q_b", num(9))], priorUnitValueUtterances: 5 });
    expect(res.answers[0]?.drawn).toBe(true);
  });

  it("an answer for something not asked is recorded and changes no world", () => {
    const res = run({ ops: [op.answer("q_c", num(4))] });
    expect(res.answers).toEqual([{ target_id: "q_c", value: num(4), onQuestionTarget: false, drawn: false }]);
    expect(quantity(res.drawWorld, "q_c").value).toEqual(num(2));
    expect(res.drawWorld).toEqual(res.judgeWorld);
  });

  it("an answer that clashes only with what the child touched is set aside in the drawing world", () => {
    // q_a and r_1 are touched, so q_a = 5, r_1: b = a + 3 and the answer 9 clash among touched things.
    const res = run({ ops: [op.answer("q_b", num(9))], phrases: [phrase("q_a"), phrase("r_1")] });
    expect(res.draw.answerSetAside).toEqual(["q_b"]);
    expect(res.draw.released).toEqual([]);
    expect(res.draw.unsatisfiable).toEqual([]);
    expect(quantity(res.drawWorld, "q_b").value).toEqual(num(9));
    expect(res.judge).toEqual({ released: [], unsatisfiable: [] });
  });

  it("an answer that clashes with an untouched given number releases that number in the drawing world", () => {
    const res = run({ ops: [op.answer("q_b", num(9))], phrases: [phrase("r_1")] });
    expect(res.draw.released).toEqual(["q_a"]);
    expect(res.draw.answerSetAside).toEqual([]);
    expect(res.judge).toEqual({ released: [], unsatisfiable: [] });
  });
});

describe("state_procedure", () => {
  it("puts the result on the target in the judging world only, and records it", () => {
    const res = run({ ops: [op.procedure("q_b", [{ quantity_id: "q_a" }, num(3)], "add")] });
    expect(quantity(res.judgeWorld, "q_b").value).toEqual(num(8));
    // The child did not say 8, so it is never drawn (指示書 第5.3節, Q12).
    expect(quantity(res.drawWorld, "q_b").value).toBeNull();
    expect(res.procedures).toEqual([{ target_id: "q_b", value: num(8), impossible: [] }]);
  });

  it("carries the correct relation between the holders of the operand and the target, unchanged", () => {
    const res = run({ ops: [op.procedure("q_b", [{ quantity_id: "q_a" }, num(3)], "add")] });
    expect(res.judgeWorld.relations).toEqual([relation(worldW(), "r_1")]);
    expect(res.touched).toContain("r_1");
    expect(res.judge).toEqual({ released: [], unsatisfiable: [] });
  });

  it("marks a negative result", () => {
    const res = run({ ops: [op.procedure("q_b", [{ quantity_id: "q_c" }, num(5)], "subtract")] });
    expect(res.procedures).toEqual([{ target_id: "q_b", value: num(-3), impossible: ["negative"] }]);
  });

  it("marks a result that is not whole for a countable kind", () => {
    const res = run({ ops: [op.procedure("q_b", [{ quantity_id: "q_a" }, num(2)], "divide")] });
    expect(res.procedures).toEqual([{ target_id: "q_b", value: num(5, 2), impossible: ["non_integer"] }]);
  });

  it("a part of a kind that is not countable is possible", () => {
    const res = run({ ops: [op.addQuantity("n_1", "h_b", "k_other", null, null), op.procedure("n_1", [num(1), num(2)], "divide")] });
    expect(res.procedures).toEqual([{ target_id: "q_new1", value: num(1, 2), impossible: [] }]);
  });

  it("multiplies two numbers said", () => {
    const res = run({ ops: [op.procedure("q_b", [num(3, 4), num(8)], "multiply")] });
    expect(res.procedures[0]?.value).toEqual(num(6));
  });
});

describe("ops that do not pass the meaning checks", () => {
  it("are discarded one by one, the rest are applied, and representable becomes partial", () => {
    const res = run({
      ops: [op.setQuantity("q_c", num(7)), op.setQuantity("q_zzz", num(1)), op.setRelationAmount("r_1", num(4))],
    });
    expect(res.discarded).toHaveLength(1);
    expect(res.discarded[0]?.index).toBe(1);
    expect(typeof res.discarded[0]?.reason).toBe("string");
    expect(res.discarded[0]?.reason.length).toBeGreaterThan(0);
    expect(res.representable).toBe("partial");
    expect(quantity(res.judgeWorld, "q_c").value).toEqual(num(7));
    expect(relation(res.judgeWorld, "r_1").amount).toEqual(num(4));
  });

  it("a bad denominator is discarded", () => {
    const res = run({ ops: [op.setQuantity("q_c", num(1, 0))] });
    expect(res.discarded.map((d) => d.index)).toEqual([0]);
    expect(quantity(res.judgeWorld, "q_c").value).toEqual(num(2));
  });

  it("an op of the wrong element kind is discarded", () => {
    const res = run({ ops: [op.setRelationAmount("q_a", num(1))] });
    expect(res.discarded.map((d) => d.index)).toEqual([0]);
  });

  it("a temporary id used before it is introduced is discarded", () => {
    const res = run({ ops: [op.setQuantity("n_1", num(1)), op.addQuantity("n_1", "h_a", "k_thing", null, null)] });
    expect(res.discarded.map((d) => d.index)).toEqual([0]);
    expect(res.idMap).toEqual({ n_1: "q_new1" });
  });

  it("an op naming an element that came from a discarded op is discarded too", () => {
    const res = run({
      ops: [op.addQuantity("n_1", "h_zzz", "k_thing", null, null), op.setQuantity("n_1", num(2)), op.setQuantity("q_c", num(3))],
    });
    expect(res.discarded.map((d) => d.index)).toEqual([0, 1]);
    expect(res.idMap).toEqual({});
    expect(quantity(res.judgeWorld, "q_c").value).toEqual(num(3));
  });

  it("an answer naming a different kind than the question is discarded", () => {
    const res = run({ ops: [op.answer("r_1", num(3))] });
    expect(res.discarded.map((d) => d.index)).toEqual([0]);
    expect(res.answers).toEqual([]);
  });

  it("discarding overrides a full or none input", () => {
    const bad = [op.setQuantity("q_zzz", num(1))];
    expect(run({ ops: bad, representable: "full" }).representable).toBe("partial");
    expect(run({ ops: bad, representable: "none" }).representable).toBe("partial");
  });
});

// ---------------------------------------------------------------------------------------------
// When the child world contradicts itself (指示書 第5.3節)
// ---------------------------------------------------------------------------------------------

describe("resolving a contradiction", () => {
  it("releases untouched given numbers, one at a time, until no contradiction is left", () => {
    // b = 10 is said; r_1 and r_2 are named. First clash {q_a, q_b, r_1}: only q_a is untouched.
    // Then {q_b, q_c, r_1, r_2}: only q_c is untouched.
    const res = run({ ops: [op.setQuantity("q_b", num(10))], phrases: [phrase("r_1"), phrase("r_2")] });
    expect(res.judge.released).toEqual(["q_a", "q_c"]);
    expect(res.judge.unsatisfiable).toEqual([]);
    expect(solve(withoutConstraints(res.judgeWorld, res.judge.released)).kind).not.toBe("contradiction");
  });

  it("the drawing world without answers resolves the same way", () => {
    const res = run({ ops: [op.setQuantity("q_b", num(10))], phrases: [phrase("r_1"), phrase("r_2")] });
    expect(res.draw).toEqual({ ...res.judge, answerSetAside: [] });
  });

  it("with two minimal sets, the first by size then id list is used first", () => {
    // Sets {q_a, q_b, r_1} and {q_b, q_c, r_4}: the first is resolved first, so q_a is released before q_c.
    const res = run({ ops: [op.setQuantity("q_b", num(10))], phrases: [phrase("r_1"), phrase("r_4")] });
    expect(res.judge.released).toEqual(["q_a", "q_c"]);
    expect(res.judge.unsatisfiable).toEqual([]);
  });

  it("the same input always releases the same constraints, whatever the order of phrases", () => {
    const a = run({ ops: [op.setQuantity("q_b", num(10))], phrases: [phrase("r_1"), phrase("r_4")] });
    const b = run({ ops: [op.setQuantity("q_b", num(10))], phrases: [phrase("r_4"), phrase("r_1")] });
    const c = run({ ops: [op.setQuantity("q_b", num(10))], phrases: [phrase("r_1"), phrase("r_4")] });
    expect(b.judge).toEqual(a.judge);
    expect(c).toEqual(a);
  });

  it("a clash only among touched things is not resolved and is recorded", () => {
    const res = run({ ops: [op.setQuantity("q_c", num(4))], phrases: [phrase("q_a"), phrase("r_2")] });
    expect(res.judge.released).toEqual([]);
    expect(res.judge.unsatisfiable).toEqual([["q_a", "q_c", "r_2"]]);
    expect(quantity(res.judgeWorld, "q_c").value).toEqual(num(4));
    expect(quantity(res.judgeWorld, "q_a").value).toEqual(num(5));
  });

  it("a clash among things the child added is recorded", () => {
    const res = run({
      ops: [
        op.addHolder("n_1", "x"),
        op.addHolder("n_2", "y"),
        op.addQuantity("n_3", "n_1", "k_thing", null, num(1)),
        op.addQuantity("n_4", "n_2", "k_thing", null, num(5)),
        op.addRelation("n_5", "more_by", "n_4", "n_3", num(1)),
      ],
    });
    // Elements the child added are touched, so nothing here can be released.
    expect(res.touched).toEqual(expect.arrayContaining(["q_new1", "q_new2", "r_new1"]));
    expect(res.judge.unsatisfiable).toEqual([["q_new1", "q_new2", "r_new1"]]);
    expect(res.judge.released).toEqual([]);
  });

  it("released and set aside ids are not in touched", () => {
    const res = run({ ops: [op.setQuantity("q_b", num(10))], phrases: [phrase("r_1"), phrase("r_2")] });
    for (const id of res.judge.released) {
      expect(res.touched).not.toContain(id);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------------------------

/** Ops on the main world: valid ones, invalid ones, and ones whose meaning depends on what came before. */
const POOL: AnyOp[] = [
  op.setQuantity("q_c", num(7)),
  op.setQuantity("q_zzz", num(1)),
  op.setQuantity("q_a", num(1, 0)),
  op.setRelationAmount("r_1", num(4)),
  op.setRelationOperator("r_2", "more_by"),
  op.swap("r_4"),
  op.setReference("r_1", "q_a"),
  op.setReference("r_1", "q_b"),
  op.setReference("r_1", "q_c"),
  op.setEventAmount("e_1", num(2)),
  op.setEventType("e_1", "lose"),
  op.addHolder("n_1", "x"),
  op.addQuantity("n_2", "n_1", "k_thing", null, num(3)),
  op.addRelation("n_3", "more_by", "q_c", "q_a", num(1)),
  op.addRelation(null, "same_as", "q_a", "q_c", null),
  op.addEvent("n_4", "gain", "h_a", "k_thing", null),
  op.remove("h_c"),
  op.remove("q_a"),
  op.remove("e_1"),
  op.remove("q_b"),
  op.remove("k_other"),
  op.answer("q_b", num(9)),
  op.answer("q_c", num(1)),
  op.setUnitValue("r_1", num(2)),
  op.wordCue(0, [0]),
  op.procedure("q_b", [{ quantity_id: "q_a" }, num(2)], "multiply"),
  op.setQuestionTarget("q_c", "quantity"),
  op.renameItemKind("k_thing", "y"),
];

const PHRASE_IDS = ["h_a", "h_b", "q_a", "q_c", "r_1", "r_2", "r_4", "e_1", "k_thing"];

const inputArb = fc.record({
  ops: fc.array(fc.constantFrom(...POOL), { maxLength: 6 }),
  phraseIds: fc.subarray(PHRASE_IDS),
  priorAnswerUtterances: fc.nat({ max: 3 }),
  priorUnitValueUtterances: fc.nat({ max: 3 }),
});

type Generated = { ops: AnyOp[]; phraseIds: string[]; priorAnswerUtterances: number; priorUnitValueUtterances: number };

function inputOf(g: Generated, correct: WorldScene = worldW()): ApplyInput {
  return {
    correct,
    ops: g.ops,
    phrases: g.phraseIds.map(phrase),
    priorAnswerUtterances: g.priorAnswerUtterances,
    priorUnitValueUtterances: g.priorUnitValueUtterances,
  };
}

const PROPERTY_RUNS = { numRuns: 60 };

describe("properties", () => {
  it("never changes its input", () => {
    fc.assert(
      fc.property(inputArb, (g) => {
        const input = inputOf(g);
        const before = structuredClone(input);
        apply(input);
        expect(input).toEqual(before);
      }),
      PROPERTY_RUNS,
    );
  });

  it("gives the same result for the same input", () => {
    fc.assert(
      fc.property(inputArb, (g) => {
        expect(apply(inputOf(g))).toEqual(apply(inputOf(structuredClone(g))));
      }),
      PROPERTY_RUNS,
    );
  });

  it("both worlds pass the shape and meaning checks", () => {
    fc.assert(
      fc.property(inputArb, (g) => {
        const res = apply(inputOf(g));
        expectValidWorld(res.judgeWorld);
        expectValidWorld(res.drawWorld);
      }),
      PROPERTY_RUNS,
    );
  });

  it("lists are sorted and representable is partial exactly when something was discarded", () => {
    fc.assert(
      fc.property(inputArb, (g) => {
        const res = apply(inputOf(g));
        expect(res.touched).toEqual(sorted([...new Set(res.touched)]));
        expect(res.removedByCascade).toEqual(sorted(res.removedByCascade));
        expect(res.representable).toBe(res.discarded.length > 0 ? "partial" : "full");
        expect(res.discarded.map((d) => d.index)).toEqual([...res.discarded.map((d) => d.index)].sort((x, y) => x - y));
      }),
      PROPERTY_RUNS,
    );
  });

  it("only the kept ops pass the meaning checks against the problem world", () => {
    fc.assert(
      fc.property(inputArb, (g) => {
        const res = apply(inputOf(g));
        const dropped = new Set(res.discarded.map((d) => d.index));
        // An op that fails on the problem world by itself (no temporary ids involved) is always discarded.
        g.ops.forEach((o, i) => {
          const usesTemp = JSON.stringify(o).includes('"n_');
          if (!usesTemp && !validateOps(worldW(), [o]).ok) {
            expect(dropped.has(i)).toBe(true);
          }
        });
      }),
      PROPERTY_RUNS,
    );
  });

  it("an answer never reaches the judging world", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50 }), fc.nat({ max: 1 }), (v, prior) => {
        const res = run({ ops: [op.answer("q_b", num(v))], priorAnswerUtterances: prior });
        expect(quantity(res.judgeWorld, "q_b").value).toBeNull();
        expect(quantity(res.drawWorld, "q_b").value).toEqual(num(v));
      }),
    );
  });

  it("set_unit_value and word_cue never change either world", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -20, max: 20 }),
        fc.integer({ min: 1, max: 9 }),
        fc.array(fc.nat({ max: 9 }), { maxLength: 4 }),
        (n, d, tokens) => {
          const res = run({ ops: [op.setUnitValue("r_1", num(n, d)), op.wordCue(0, tokens)] });
          const touchedOnly = run({ phrases: [phrase("r_1")] });
          expect(res.judgeWorld).toEqual(touchedOnly.judgeWorld);
          expect(res.drawWorld).toEqual(touchedOnly.drawWorld);
        },
      ),
    );
  });

  it("restating the relation of the correct world gives the correct answer", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 30 }), fc.integer({ min: 1, max: 30 }), (a, d) => {
        const correct = differenceWorld(a, d);
        const res = apply({ correct, ops: [op.setReference("r_1", "q_a"), op.setRelationAmount("r_1", num(d))] });
        const solved = solve(res.judgeWorld);
        expect(solved.kind).toBe("unique");
        if (solved.kind !== "unique") return;
        expect(solved.values.get("q_b")).toEqual(rat(a + d));
      }),
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Found in review: what is asked, discarded ops, and time points (指示書 第5.3節, Q13, Q15)
// ---------------------------------------------------------------------------------------------

describe("what is asked stays as a place to ask about", () => {
  it("an asked relation amount the child did not touch is kept without its amount, and other ops apply", () => {
    const correct = worldW();
    correct.question = { target_type: "relation_amount", target_id: "r_4" };
    const res = apply({ correct, ops: [op.setQuantity("q_a", num(4))] });
    expect(res.discarded).toEqual([]);
    expect(relation(res.judgeWorld, "r_4").amount).toBeNull();
    expect(relation(res.drawWorld, "r_4").amount).toBeNull();
    expect(res.judgeWorld.relations.map((r) => r.id)).toEqual(["r_4"]);
    expectValidWorld(res.judgeWorld);
  });

  it("an asked event amount the child did not touch is kept without its amount, and other ops apply", () => {
    const correct = worldWithoutLaterCount();
    correct.question = { target_type: "event_amount", target_id: "e_1" };
    const res = apply({ correct, ops: [op.setQuantity("q_a", num(4))] });
    expect(res.discarded).toEqual([]);
    expect(event(res.judgeWorld, "e_1").amount).toBeNull();
    expectValidWorld(res.judgeWorld);
  });
});

describe("a discarded op touches nothing", () => {
  it("an op with a zero denominator neither brings its relation in nor counts as touched", () => {
    const res = run({ ops: [op.setRelationAmount("r_1", num(1, 0))] });
    expect(res.discarded.map((d) => d.index)).toEqual([0]);
    expect(res.judgeWorld.relations).toEqual([]);
    expect(res.touched).not.toContain("r_1");
  });
});

describe("a quantity added at an untouched event", () => {
  it("keeps the event only as a time point, without its amount", () => {
    const res = apply({
      correct: worldWithoutLaterCount(),
      ops: [op.addQuantity("n_1", "h_c", "k_thing", "e_1", null)],
    });
    expect(res.discarded).toEqual([]);
    expect(event(res.judgeWorld, "e_1").amount).toBeNull();
    expect(res.touched).not.toContain("e_1");
    expectValidWorld(res.judgeWorld);
  });
});
