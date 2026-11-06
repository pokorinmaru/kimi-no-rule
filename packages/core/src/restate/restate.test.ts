// M1 step (8): restate and its inverse (指示書 第6.6節 の restate、第11節 M1 の性質ベーステスト).
// Written before the implementation. The fixed order of the sentences is checked against an
// outline made here from the world, not from the implementation.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { validateWorld, type Rational, type WorldScene } from "../schema/index.ts";
import { rat } from "../rational/index.ts";
import { solve } from "../solve/index.ts";
import { num } from "../apply/test-worlds.ts";
import { at } from "../schema/test-fixtures.ts";
import { signboard, signboardAdditive, signboardCorrect, signboardProcedural } from "../../fixtures/problems/signboard.ts";
import { parseRestated, restate, type RestatedSentence } from "./index.ts";

const PROPERTY_RUNS = { numRuns: 120 };
const LANGS = ["ja", "en"] as const;
type Lang = (typeof LANGS)[number];

type Relation = WorldScene["relations"][number];
type WorldEvent = WorldScene["events"][number];
type Quantity = WorldScene["quantities"][number];
type Operator = Relation["operator"];
type Kind = RestatedSentence["kind"];

// ---------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------

/** Labels and nouns per language. None is a part of another, and none contains a digit. */
const WORDS = {
  ja: { a: "きつね", b: "くま", c: "ふくろう", noun: "どんぐり", counter: "個", box: "はこ", boxCounter: "つ" },
  en: { a: "fox", b: "bear", c: "owl", noun: "acorn", counter: "", box: "box", boxCounter: "" },
} as const;

function scene(lang: Lang, parts: Pick<WorldScene, "quantities" | "question"> & Partial<WorldScene>): WorldScene {
  const w = WORDS[lang];
  return {
    schema_version: "3",
    problem_id: "p_restate_test",
    problem_type: "other",
    problem_text: "",
    grade: 3,
    problem_lang: lang,
    holders: [
      { id: "h_a", label: w.a },
      { id: "h_b", label: w.b },
      { id: "h_c", label: w.c },
    ],
    item_kinds: [
      { id: "k_acorn", noun: w.noun, counter: w.counter, asset_key: null, countable: true },
      { id: "k_box", noun: w.box, counter: w.boxCounter, asset_key: null, countable: true },
    ],
    relations: [],
    events: [],
    word_links: [],
    ...parts,
  };
}

const qty = (id: string, holder: string, value: Rational | null, at_event: string | null = null, item_kind = "k_acorn"): Quantity => ({
  id,
  holder,
  item_kind,
  at_event,
  value,
});

const rel = (
  id: string,
  operator: Operator,
  subject: string,
  reference: string | null,
  amount: Rational | null,
  reference_list: string[] | null = null,
  other_description: string | null = null,
): Relation => ({ id, operator, subject, reference, reference_list, amount, other_description });

const ev = (
  id: string,
  order: number,
  type: WorldEvent["type"],
  holder: string,
  amount: Rational | null,
  to_holder: string | null = null,
): WorldEvent => ({ id, order, type, holder, item_kind: "k_acorn", amount, to_holder });

const askQuantity = (target_id: string): WorldScene["question"] => ({ target_type: "quantity", target_id });

/** A world with one relation; a and the box are given, b and c are not. The subject is asked unless told otherwise. */
function relationWorld(lang: Lang, r: Relation, asked = r.subject): WorldScene {
  return scene(lang, {
    quantities: [qty("q_a", "h_a", num(6)), qty("q_b", "h_b", null), qty("q_c", "h_c", null), qty("q_box", "h_a", num(3), null, "k_box")],
    relations: [r],
    question: askQuantity(asked),
  });
}

const OTHER_TEXT = { ja: "くまは、きつねよりすこし多い", en: "the bear has a few more than the fox" } as const;

/** One relation of each operator, between the same ends where the operator has two ends. */
function relationOf(lang: Lang, operator: Operator): Relation {
  switch (operator) {
    case "more_by":
      return rel("r_x", "more_by", "q_b", "q_a", num(3));
    case "less_by":
      return rel("r_x", "less_by", "q_b", "q_a", num(2));
    case "times":
      return rel("r_x", "times", "q_b", "q_a", num(3));
    case "fraction_of":
      return rel("r_x", "fraction_of", "q_b", "q_a", num(2, 3));
    case "per":
      return rel("r_x", "per", "q_b", "q_box", num(4));
    case "same_as":
      return rel("r_x", "same_as", "q_b", "q_a", null);
    case "total_of":
      return rel("r_x", "total_of", "q_c", null, null, ["q_a", "q_b"]);
    case "other":
      return rel("r_x", "other", "q_b", "q_a", null, null, OTHER_TEXT[lang]);
  }
}

/** One event of the given type by a; the count of a after it is asked. */
function eventWorld(lang: Lang, type: WorldEvent["type"]): WorldScene {
  return scene(lang, {
    quantities: [qty("q_a0", "h_a", num(8)), qty("q_b0", "h_b", num(1)), qty("q_a1", "h_a", null, "e_1")],
    events: [ev("e_1", 1, type, "h_a", num(3), type === "move" ? "h_b" : null)],
    question: askQuantity("q_a1"),
  });
}

/**
 * Two events, a count known right after the first, and a relation.
 * The quantities list b before a, and (unless asked otherwise) the events array lists the second event first.
 */
function orderedWorld(lang: Lang, eventsInArrayOrder: boolean): WorldScene {
  const e1 = ev("e_1", 1, "gain", "h_a", num(3));
  const e2 = ev("e_2", 2, "move", "h_a", num(4), "h_b");
  return scene(lang, {
    problem_type: "change",
    quantities: [
      qty("q_b0", "h_b", num(2)),
      qty("q_a0", "h_a", num(7)),
      qty("q_a1", "h_a", num(10), "e_1"),
      qty("q_a2", "h_a", null, "e_2"),
      qty("q_b2", "h_b", null, "e_2"),
    ],
    relations: [rel("r_1", "less_by", "q_b0", "q_a0", num(5))],
    events: eventsInArrayOrder ? [e1, e2] : [e2, e1],
    question: askQuantity("q_b2"),
  });
}

/** How much more b has than a is asked. */
function askedRelationWorld(lang: Lang): WorldScene {
  return scene(lang, {
    problem_type: "compare",
    quantities: [qty("q_a", "h_a", num(6)), qty("q_b", "h_b", num(9))],
    relations: [rel("r_1", "more_by", "q_b", "q_a", null)],
    question: { target_type: "relation_amount", target_id: "r_1" },
  });
}

/** How many a lost is asked; the counts before and after are known. */
function askedEventWorld(lang: Lang): WorldScene {
  return scene(lang, {
    problem_type: "change",
    quantities: [qty("q_a0", "h_a", num(8)), qty("q_a1", "h_a", num(5), "e_1")],
    events: [ev("e_1", 1, "lose", "h_a", null)],
    question: { target_type: "event_amount", target_id: "e_1" },
  });
}

// ---------------------------------------------------------------------------------------------
// Oracles and checks
// ---------------------------------------------------------------------------------------------

type Outline = [Kind, string][];

/** The fixed order: given counts, relations, events by order with the counts known after each, question. */
function outline(w: WorldScene): Outline {
  const out: Outline = [];
  for (const q of w.quantities) if (q.at_event === null && q.value !== null) out.push(["given", q.id]);
  for (const r of w.relations) out.push(["relation", r.id]);
  for (const e of [...w.events].sort((x, y) => x.order - y.order)) {
    out.push(["event", e.id]);
    for (const q of w.quantities) if (q.at_event === e.id && q.value !== null) out.push(["after_event", q.id]);
  }
  out.push(["question", w.question.target_id]);
  return out;
}

const outlineOf = (s: readonly RestatedSentence[]): Outline => s.map((x) => [x.kind, x.element_id]);

function allIds(w: WorldScene): string[] {
  return [w.holders, w.item_kinds, w.quantities, w.relations, w.events].flatMap((xs) => xs.map((x) => x.id));
}

/** Text has no ids, and numbers are written as integers or a/b (never n/1). */
function expectPlainText(w: WorldScene, sentences: readonly RestatedSentence[]): void {
  for (const s of sentences) {
    expect(s.text.trim().length).toBeGreaterThan(0);
    for (const id of allIds(w)) expect(s.text).not.toContain(id);
    expect(s.text).not.toMatch(/[A-Za-z]_[A-Za-z0-9]/);
    expect(s.text).not.toMatch(/\d\/1(?!\d)/);
  }
}

function one(sentences: readonly RestatedSentence[], kind: Kind, element_id: string): RestatedSentence {
  const found = sentences.filter((s) => s.kind === kind && s.element_id === element_id);
  expect(found).toHaveLength(1);
  return at(found, 0);
}

const textOf = (sentences: readonly RestatedSentence[]): string => sentences.map((s) => s.text).join("\n");

/**
 * The base given to parseRestated: ids, holders, kinds and times of the quantities are kept; everything
 * the sentences must carry is replaced by decoys.
 */
function decoyBase(w: WorldScene): WorldScene {
  const b = structuredClone(w);
  const first = at(b.quantities, 0).id;
  b.quantities = b.quantities.map((q) => ({ ...q, value: num(999) }));
  b.relations = [rel("r_decoy", "other", first, null, null, null, "decoy")];
  b.events = [
    { id: "e_decoy", order: 99, type: "gain", holder: at(b.holders, 0).id, item_kind: at(b.item_kinds, 0).id, amount: num(999), to_holder: null },
  ];
  b.question = { target_type: "quantity", target_id: first };
  b.word_links = [];
  return b;
}

const withoutLinks = (w: WorldScene): WorldScene => ({ ...w, word_links: [] });

function expectRoundTrip(w: WorldScene, lang: Lang): void {
  const back = parseRestated(restate(w, lang), decoyBase(w), lang);
  expect(withoutLinks(back)).toEqual(withoutLinks(w));
}

const JAPANESE = /[\u3040-\u30ff\u4e00-\u9fff]/;
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;

// ---------------------------------------------------------------------------------------------
// Signboard
// ---------------------------------------------------------------------------------------------

describe("restate: the signboard and its two readings", () => {
  it.each(Object.entries(signboard))("%s: given count, the relation, then the question", (_name, w) => {
    for (const lang of LANGS) {
      const s = restate(w, lang);
      expect(outlineOf(s)).toEqual([
        ["given", "q_ani"],
        ["relation", "r_ratio"],
        ["question", "q_otouto"],
      ]);
      expect(outlineOf(s)).toEqual(outline(w));
      expectPlainText(w, s);
    }
  });

  it("the given sentence names the older brother, the fish, its counter and 6", () => {
    const g = one(restate(signboardCorrect, "ja"), "given", "q_ani");
    for (const word of ["兄", "金魚", "匹", "6"]) expect(g.text).toContain(word);
  });

  it("the relation sentence names both brothers and writes the fraction as 3/4", () => {
    for (const w of [signboardCorrect, signboardProcedural]) {
      const r = one(restate(w, "ja"), "relation", "r_ratio");
      for (const word of ["兄", "弟", "3/4"]) expect(r.text).toContain(word);
    }
  });

  it("the additive reading writes 3 as a whole number, not as a fraction", () => {
    const r = one(restate(signboardAdditive, "ja"), "relation", "r_ratio");
    expect(r.text).toContain("3");
    expect(r.text).not.toContain("3/4");
  });

  it("the question sentence names the younger brother and the fish", () => {
    const q = one(restate(signboardCorrect, "ja"), "question", "q_otouto");
    expect(q.text).toContain("弟");
    expect(q.text).toContain("金魚");
  });

  it.each(LANGS)("[%s] the reversed direction shows in the relation sentence and only there", (lang) => {
    const correct = restate(signboardCorrect, lang);
    const procedural = restate(signboardProcedural, lang);
    const additive = restate(signboardAdditive, lang);
    const relationText = (s: readonly RestatedSentence[]): string => one(s, "relation", "r_ratio").text;
    expect(relationText(procedural)).not.toBe(relationText(correct));
    expect(relationText(additive)).not.toBe(relationText(correct));
    expect(relationText(additive)).not.toBe(relationText(procedural));
    for (const other of [procedural, additive]) {
      expect(one(other, "given", "q_ani").text).toBe(one(correct, "given", "q_ani").text);
      expect(one(other, "question", "q_otouto").text).toBe(one(correct, "question", "q_otouto").text);
    }
  });

  it("no sentence carries an answer that the world would solve to", () => {
    expect(textOf(restate(signboardCorrect, "ja"))).not.toContain("8");
    expect(textOf(restate(signboardProcedural, "ja"))).not.toContain("9/2");
    expect(textOf(restate(signboardAdditive, "ja"))).not.toContain("9");
  });

  it.each(Object.entries(signboard))("%s: parsing the sentences gives the same world back", (_name, w) => {
    for (const lang of LANGS) expectRoundTrip(w, lang);
  });
});

// ---------------------------------------------------------------------------------------------
// Each relation and each event as one sentence
// ---------------------------------------------------------------------------------------------

const OPERATORS: readonly Operator[] = ["more_by", "less_by", "times", "fraction_of", "per", "same_as", "total_of", "other"];
const TWO_ENDED: readonly Operator[] = ["more_by", "less_by", "times", "fraction_of", "per", "same_as"];

describe.each(LANGS)("restate [%s]: relations", (lang) => {
  it.each(OPERATORS)("%s becomes exactly one relation sentence, in the fixed order", (operator) => {
    const w = relationWorld(lang, relationOf(lang, operator));
    const s = restate(w, lang);
    expect(outlineOf(s)).toEqual(outline(w));
    expect(s.filter((x) => x.kind === "relation")).toHaveLength(1);
    one(s, "relation", "r_x");
    expectPlainText(w, s);
  });

  it.each(OPERATORS.filter((o) => o !== "other"))("%s: parsing gives the same world back", (operator) => {
    expectRoundTrip(relationWorld(lang, relationOf(lang, operator)), lang);
  });

  it("other: the sentence carries the description as it is", () => {
    const w = relationWorld(lang, relationOf(lang, "other"));
    expect(one(restate(w, lang), "relation", "r_x").text).toContain(OTHER_TEXT[lang]);
  });

  it("each relation sentence names the holders it relates", () => {
    const w = WORDS[lang];
    const ends: [Operator, string[]][] = [
      ["more_by", [w.a, w.b]],
      ["less_by", [w.a, w.b]],
      ["times", [w.a, w.b]],
      ["fraction_of", [w.a, w.b]],
      ["per", [w.a, w.b]],
      ["same_as", [w.a, w.b]],
      ["total_of", [w.a, w.b, w.c]],
    ];
    for (const [operator, labels] of ends) {
      const text = one(restate(relationWorld(lang, relationOf(lang, operator)), lang), "relation", "r_x").text;
      for (const label of labels) expect(text).toContain(label);
    }
  });

  it("amounts are written as integers and as a/b", () => {
    const text = (operator: Operator): string =>
      one(restate(relationWorld(lang, relationOf(lang, operator)), lang), "relation", "r_x").text;
    expect(text("more_by")).toContain("3");
    expect(text("less_by")).toContain("2");
    expect(text("fraction_of")).toContain("2/3");
    expect(text("per")).toContain("4");
  });

  it("operators between the same two ends with the same amount give different sentences", () => {
    const texts = TWO_ENDED.map((operator) => {
      const amount = operator === "same_as" ? null : num(3);
      return one(restate(relationWorld(lang, rel("r_x", operator, "q_b", "q_a", amount)), lang), "relation", "r_x").text;
    });
    expect(new Set(texts).size).toBe(TWO_ENDED.length);
  });

  it.each(TWO_ENDED)("%s: swapping subject and reference changes the sentence, and both parse back", (operator) => {
    const amount = operator === "same_as" ? null : num(3, 4);
    const forward = relationWorld(lang, rel("r_x", operator, "q_b", "q_a", amount), "q_b");
    const backward = relationWorld(lang, rel("r_x", operator, "q_a", "q_b", amount), "q_b");
    const textOfR = (w: WorldScene): string => one(restate(w, lang), "relation", "r_x").text;
    expect(textOfR(backward)).not.toBe(textOfR(forward));
    expectRoundTrip(forward, lang);
    expectRoundTrip(backward, lang);
  });
});

const EVENT_TYPES = ["gain", "lose", "move"] as const;

describe.each(LANGS)("restate [%s]: events", (lang) => {
  it.each(EVENT_TYPES)("%s becomes exactly one event sentence that names who and how many", (type) => {
    const w = eventWorld(lang, type);
    const s = restate(w, lang);
    expect(outlineOf(s)).toEqual([
      ["given", "q_a0"],
      ["given", "q_b0"],
      ["event", "e_1"],
      ["question", "q_a1"],
    ]);
    const e = one(s, "event", "e_1");
    expect(e.text).toContain(WORDS[lang].a);
    expect(e.text).toContain("3");
    if (type === "move") expect(e.text).toContain(WORDS[lang].b);
    expectPlainText(w, s);
  });

  it("gain, lose and move with the same holder and amount give different sentences", () => {
    const texts = EVENT_TYPES.map((type) => one(restate(eventWorld(lang, type), lang), "event", "e_1").text);
    expect(new Set(texts).size).toBe(EVENT_TYPES.length);
  });

  it.each(EVENT_TYPES)("%s: parsing gives the same world back", (type) => {
    expectRoundTrip(eventWorld(lang, type), lang);
  });

  it("events follow their order, and a count known after an event comes right after it", () => {
    const w = orderedWorld(lang, false);
    const s = restate(w, lang);
    expect(outlineOf(s)).toEqual([
      ["given", "q_b0"],
      ["given", "q_a0"],
      ["relation", "r_1"],
      ["event", "e_1"],
      ["after_event", "q_a1"],
      ["event", "e_2"],
      ["question", "q_b2"],
    ]);
    expect(one(s, "after_event", "q_a1").text).toContain("10");
    expectPlainText(w, s);
  });

  it("the world with events and a later known count parses back", () => {
    expectRoundTrip(orderedWorld(lang, true), lang);
  });
});

describe.each(LANGS)("restate [%s]: what is asked", (lang) => {
  it("an asked relation amount: no number in the relation sentence, the question points at the relation", () => {
    const w = askedRelationWorld(lang);
    const s = restate(w, lang);
    expect(outlineOf(s)).toEqual([
      ["given", "q_a"],
      ["given", "q_b"],
      ["relation", "r_1"],
      ["question", "r_1"],
    ]);
    expect(one(s, "relation", "r_1").text).not.toMatch(/\d/);
    expect(one(s, "question", "r_1").text).not.toMatch(/\d/);
    expectRoundTrip(w, lang);
  });

  it("an asked event amount: no number in the event sentence, the known count after it follows", () => {
    const w = askedEventWorld(lang);
    const s = restate(w, lang);
    expect(outlineOf(s)).toEqual([
      ["given", "q_a0"],
      ["event", "e_1"],
      ["after_event", "q_a1"],
      ["question", "e_1"],
    ]);
    expect(one(s, "event", "e_1").text).not.toMatch(/\d/);
    expectRoundTrip(w, lang);
  });

  it("a question about a count does not carry its answer", () => {
    // b: 2 at the start, 4 more from a at the second event -> 6.
    const s = restate(orderedWorld(lang, true), lang);
    expect(one(s, "question", "q_b2").text).not.toContain("6");
  });
});

describe("restate: languages", () => {
  it("the same world gives Japanese and English sentences with the same outline", () => {
    const w = orderedWorld("en", true);
    const ja = restate(w, "ja");
    const en = restate(w, "en");
    expect(outlineOf(ja)).toEqual(outlineOf(en));
    ja.forEach((s, i) => {
      expect(s.text).not.toBe(at(en, i).text);
    });
  });

  it("English sentences of a world with English words are plain English; Japanese ones are Japanese", () => {
    for (const s of restate(orderedWorld("en", true), "en")) expect(s.text).toMatch(PRINTABLE_ASCII);
    for (const s of restate(orderedWorld("ja", true), "ja")) expect(s.text).toMatch(JAPANESE);
  });
});

describe("restate: plain functions", () => {
  it("gives the same sentences each time and does not change the world", () => {
    const w = orderedWorld("ja", false);
    const before = structuredClone(w);
    const first = restate(w, "ja");
    expect(restate(w, "ja")).toEqual(first);
    expect(w).toEqual(before);
  });

  it("parseRestated does not change the sentences or the base", () => {
    const w = orderedWorld("ja", true);
    const s = restate(w, "ja");
    const base = decoyBase(w);
    const sBefore = structuredClone(s);
    const baseBefore = structuredClone(base);
    parseRestated(s, base, "ja");
    expect(s).toEqual(sBefore);
    expect(base).toEqual(baseBefore);
  });

  it("the base's problem facts are kept, and its values, relations, events and question are not used", () => {
    const w = askedRelationWorld("ja");
    const back = parseRestated(restate(w, "ja"), decoyBase(w), "ja");
    expect(back.problem_id).toBe(w.problem_id);
    expect(back.relations.map((r) => r.id)).toEqual(["r_1"]);
    expect(back.events).toEqual([]);
    expect(back.question).toEqual(w.question);
    expect(back.quantities.map((q) => q.value)).toEqual(w.quantities.map((q) => q.value));
  });
});

// ---------------------------------------------------------------------------------------------
// Property: worlds built from a decided answer go through restate and back unchanged
// ---------------------------------------------------------------------------------------------

type Link = "more_by" | "less_by" | "times" | "fraction_of";
type StepType = WorldEvent["type"];

interface Plan {
  lang: Lang;
  link: Link;
  a: number;
  d: number;
  k: number;
  den: number;
  numer: number;
  total: boolean;
  steps: { type: StepType; amount: number; known: boolean }[];
  askIndex: number;
}

const planArb: fc.Arbitrary<Plan> = fc.record({
  lang: fc.constantFrom(...LANGS),
  link: fc.constantFrom<Link>("more_by", "less_by", "times", "fraction_of"),
  a: fc.integer({ min: 1, max: 12 }),
  d: fc.integer({ min: 1, max: 9 }),
  k: fc.integer({ min: 2, max: 5 }),
  den: fc.integer({ min: 2, max: 5 }),
  numer: fc.integer({ min: 1, max: 4 }),
  total: fc.boolean(),
  steps: fc.array(
    fc.record({ type: fc.constantFrom<StepType>("gain", "lose", "move"), amount: fc.integer({ min: 1, max: 9 }), known: fc.boolean() }),
    { maxLength: 3 },
  ),
  askIndex: fc.nat(),
});

interface Built {
  world: WorldScene;
  /** Every quantity's decided value. */
  values: Map<string, number>;
}

/**
 * The values are decided first: a's count, then b from the link, the total, and each event applied
 * to the running counts (amounts are cut so that no count goes below zero). The world then states
 * a's count, the link, the events and some counts after events, and asks one of the rest.
 */
function build(p: Plan): Built {
  const values = new Map<string, number>();
  const quantities: Quantity[] = [];
  const relations: Relation[] = [];
  const events: WorldEvent[] = [];
  const unknown: string[] = [];

  let a = p.a;
  let b: number;
  const numer = Math.min(p.numer, p.den - 1);
  if (p.link === "more_by") {
    b = a + p.d;
    relations.push(rel("r_link", "more_by", "q_b0", "q_a0", num(p.d)));
  } else if (p.link === "less_by") {
    a = p.a + p.d;
    b = p.a;
    relations.push(rel("r_link", "less_by", "q_b0", "q_a0", num(p.d)));
  } else if (p.link === "times") {
    b = a * p.k;
    relations.push(rel("r_link", "times", "q_b0", "q_a0", num(p.k)));
  } else {
    a = p.a * p.den;
    b = p.a * numer;
    relations.push(rel("r_link", "fraction_of", "q_b0", "q_a0", num(numer, p.den)));
  }
  quantities.push(qty("q_a0", "h_a", num(a)), qty("q_b0", "h_b", null));
  values.set("q_a0", a).set("q_b0", b);
  unknown.push("q_b0");

  if (p.total) {
    quantities.push(qty("q_c0", "h_c", null));
    values.set("q_c0", a + b);
    unknown.push("q_c0");
    relations.push(rel("r_total", "total_of", "q_c0", null, null, ["q_a0", "q_b0"]));
  }

  const counts = { h_a: a, h_b: b };
  p.steps.forEach((step, i) => {
    const id = `e_${i + 1}`;
    const giver: "h_a" | "h_b" = step.type === "lose" ? "h_b" : "h_a";
    const room = counts[giver];
    const type: StepType = step.type !== "gain" && room === 0 ? "gain" : step.type;
    const amount = type === "gain" ? step.amount : Math.min(step.amount, room);
    counts[giver] += type === "gain" ? amount : -amount;
    if (type === "move") counts.h_b += amount;
    events.push(ev(id, i + 1, type, giver, num(amount), type === "move" ? "h_b" : null));
    const qid = `q_after_${i + 1}`;
    values.set(qid, counts[giver]);
    if (step.known) {
      quantities.push(qty(qid, giver, num(counts[giver]), id));
    } else {
      quantities.push(qty(qid, giver, null, id));
      unknown.push(qid);
    }
  });

  const asked = at(unknown, p.askIndex % unknown.length);
  const problem_type = events.length > 0 ? "change" : p.link === "more_by" || p.link === "less_by" ? "compare" : "ratio";
  const world = scene(p.lang, { problem_type, quantities, relations, events, question: askQuantity(asked) });
  return { world, values };
}

const decided = (b: Built): number => {
  const v = b.values.get(b.world.question.target_id);
  expect(v).toBeDefined();
  return v ?? -1;
};

describe("restate: property over worlds built from a decided answer", () => {
  it("the built world is valid and solves to the decided answer", () => {
    fc.assert(
      fc.property(planArb, (p) => {
        const built = build(p);
        expect(validateWorld(built.world)).toEqual({ ok: true });
        const res = solve(built.world);
        expect(res.kind).toBe("unique");
        if (res.kind === "unique") expect(res.values.get(built.world.question.target_id)).toEqual(rat(decided(built)));
      }),
      PROPERTY_RUNS,
    );
  });

  it("the sentences follow the fixed outline and carry no ids", () => {
    fc.assert(
      fc.property(planArb, (p) => {
        const { world } = build(p);
        const s = restate(world, p.lang);
        expect(outlineOf(s)).toEqual(outline(world));
        expectPlainText(world, s);
      }),
      PROPERTY_RUNS,
    );
  });

  it("parsing the sentences gives the same world back, in both languages", () => {
    fc.assert(
      fc.property(planArb, fc.constantFrom(...LANGS), (p, lang) => {
        expectRoundTrip(build(p).world, lang);
      }),
      PROPERTY_RUNS,
    );
  });

  it("the parsed world solves to the decided answer", () => {
    fc.assert(
      fc.property(planArb, (p) => {
        const built = build(p);
        const back = parseRestated(restate(built.world, p.lang), decoyBase(built.world), p.lang);
        const res = solve(back);
        expect(res.kind).toBe("unique");
        if (res.kind === "unique") expect(res.values.get(back.question.target_id)).toEqual(rat(decided(built)));
      }),
      PROPERTY_RUNS,
    );
  });
});
