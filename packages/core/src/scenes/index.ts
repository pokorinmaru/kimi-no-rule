// Everyday scenes for the junior's reading (指示書 第6.7節 手順5, 第8.5節). A scene is a fraction-as-a-multiple
// world made from a material (scenes/materials.ts) with a common-sense sentence that core judges as a
// comparison of sizes: the part fits in what holds it, or neither of two amounts passes a limit. For a
// reading, one scene breaks the sentence under that reading and one still keeps it, while the sentence's own
// reading keeps both. The worlds are run only through runRule, and every number the scene shows or reaches
// stays away from the values given to avoid (the answers and the values on the way of the problems the
// child meets). Pure functions only.
import { z } from "zod";
import { numbersIn } from "../gates/index.ts";
import type { Lang } from "../i18n/index.ts";
import { cmp, div, fromSchema, mul, rat, toSchema, type Rational as Exact } from "../rational/index.ts";
import { runRule, type Hypothesis } from "../rules/run.ts";
import type { Rational } from "../schema/common.ts";
import type { ProblemRecord } from "../schema/problem-record.ts";
import { validateWorld } from "../schema/semantic.ts";
import type { WorldScene } from "../schema/world-scene.ts";
import { solve } from "../solve/index.ts";
import { sameWorld } from "../world/same-world.ts";
import { SCENE_MATERIALS, SCENE_MATERIAL_IDS, type SceneFrame, type SceneMaterial, type SceneMaterialId, type SceneSide } from "./materials.ts";
import { dedupe, hiddenValues, meets, sceneMarks, worldValues } from "./values.ts";

export { SCENE_MATERIALS, SCENE_MATERIAL_IDS, type SceneFrame, type SceneMaterial, type SceneMaterialId } from "./materials.ts";

/** Which scene: the material, its frame, which end of the multiple has its number, and which sentence comes first. */
export interface SceneSpec {
  material: SceneMaterialId;
  frame: SceneFrame;
  /** The end of the multiple whose amount the scene gives: the sentence's subject, or what it is a part of. */
  known: "subject" | "reference";
  order: "relation_first" | "known_first";
}

/** The scene's numbers: the given amount, the multiple num/den, and the limit (cap frame only). */
export interface SceneNumbers {
  known: number;
  num: number;
  den: number;
  limit: number | null;
}

export interface Scene {
  key: string;
  spec: SceneSpec;
  numbers: SceneNumbers;
  /** The scene as a problem record, so the readings run on it like on any problem. */
  record: ProblemRecord;
  /** The scene's sentences (the multiple, the given amount, and the limit), in both languages. */
  lines: Record<Lang, string[]>;
  /** The common-sense sentence, lit where it does not hold. */
  commonSense: Record<Lang, string>;
  /** Each holder's tape label. */
  labels: Record<Lang, Record<string, string>>;
  limitLabel: Record<Lang, string> | null;
  /** The numbers the sentences write. */
  numbersShown: Rational[];
  /** Every value the scene reaches under the sentence's reading and the reading it was built for (one part included). */
  values: Rational[];
}

export interface SceneTape {
  quantityId: string;
  holderId: string;
  /** The tape's length against the longest thing drawn (0..1]. */
  length: number;
  /** The tape in equal parts (指示書 第8.5節: the 1 in den parts, the other in num parts), or null without a multiple. */
  segments: number | null;
}

/** The drawn shape of a scene under a reading: tapes, the limit's place, and the length order (short to long). */
export interface SceneShape {
  tapes: SceneTape[];
  limit: number | null;
  order: string[];
}

export interface SceneView {
  world: WorldScene;
  holds: boolean;
  shape: SceneShape;
  sameAsCorrect: boolean;
}

export interface CheckedScene {
  scene: Scene;
  underRule: SceneView;
  underCorrect: SceneView;
}

export type SceneRefusal = "unknown_material" | "no_such_frame" | "bad_numbers" | "not_a_world" | "correct_breaks" | "impossible" | "avoided_number";
export type SceneCheck = ({ ok: true } & CheckedScene) | { ok: false; reason: SceneRefusal };

export interface ScenePair {
  breaks: CheckedScene;
  keeps: CheckedScene;
}

// ---------------------------------------------------------------------------------------------
// Building a scene
// ---------------------------------------------------------------------------------------------

type Mark = ProblemRecord["syntax_marks"][number];
type Tok = string | { t: string; k: Mark["kind"]; id: string; rk?: ("lt1" | "gt1" | "fraction")[] };

const REL = "r_m";
const fill = (s: string, n: number, u: string): string => s.replace("{n}", String(n)).replace("{u}", u);
const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

interface Layout {
  m: SceneMaterial;
  subject: SceneSide;
  reference: SceneSide;
  sides: [SceneSide, SceneSide];
  commonSense: { ja: string; en: string };
}

function layoutOf(spec: SceneSpec, numbers: SceneNumbers): Layout | SceneRefusal {
  const m = SCENE_MATERIALS.find((x) => x.id === spec.material);
  if (m === undefined) return "unknown_material";
  if (!m.frames.includes(spec.frame)) return "no_such_frame";
  if (spec.frame === "within") {
    const { container, part } = m.within;
    // The part is a part of what holds it (below 1), or what holds it is a multiple of the part (above 1).
    const below = numbers.num < numbers.den;
    return {
      m,
      subject: below ? part : container,
      reference: below ? container : part,
      sides: [container, part],
      commonSense: m.within.commonSense,
    };
  }
  const cap = m.cap;
  if (cap === null) return "no_such_frame";
  return { m, subject: cap.a, reference: cap.b, sides: [cap.a, cap.b], commonSense: cap.commonSense };
}

const hid = (s: SceneSide): string => `h_${s.id}`;
const qid = (s: SceneSide): string => `q_${s.id}`;

function numbersOk(spec: SceneSpec, n: SceneNumbers, scale: number): boolean {
  const ints = [n.known, n.num, n.den].every((x) => Number.isSafeInteger(x)) && (n.limit === null || Number.isSafeInteger(n.limit));
  if (!ints || n.known <= 0 || n.num <= 0 || n.den <= 1 || n.num === n.den || n.num > 10 || n.den > 10 || gcd(n.num, n.den) !== 1) return false;
  if (n.known % scale !== 0 || n.known > 1000 * scale) return false;
  if (spec.frame === "cap") return n.limit !== null && n.limit > 0 && n.limit % scale === 0 && n.limit <= 1000 * scale;
  return n.limit === null;
}

function build(spec: SceneSpec, numbers: SceneNumbers, l: Layout): Omit<Scene, "values"> {
  const { m, subject, reference } = l;
  const knownSide = spec.known === "subject" ? subject : reference;
  const frac = `${String(numbers.num)}/${String(numbers.den)}`;
  const kind = `k_${m.id}`;
  const H = (s: SceneSide): Tok => ({ t: s.holder, k: "holder_mention", id: hid(s) });
  const amount = (s: SceneSide): Tok[] => (s.after === "" ? [H(s)] : [H(s), s.after]);
  const relationToks: Tok[] = [
    ...amount(subject),
    "は",
    "、",
    ...amount(reference),
    { t: "の", k: "relation_word", id: REL },
    { t: frac, k: "ratio_notation", id: REL, rk: [numbers.num < numbers.den ? "lt1" : "gt1", "fraction"] },
    "です",
    "。",
  ];
  const knownToks: Tok[] = [H(knownSide), knownSide.known[0], String(numbers.known), { t: m.unit.ja, k: "unit_word", id: kind }, knownSide.known[1], "。"];
  const sentences: { toks: Tok[]; ids: string[] }[] = [
    { toks: relationToks, ids: [REL] },
    { toks: knownToks, ids: [qid(knownSide)] },
  ];
  if (spec.order === "known_first") sentences.reverse();
  const statements = sentences.map((x, index) => {
    const tokens = x.toks.map((t) => (typeof t === "string" ? t : t.t));
    return { index, text: tokens.join(""), element_ids: x.ids, is_question: false, speaker_holder_id: null, tokens };
  });
  const syntax_marks: Mark[] = sentences.flatMap((x, si) =>
    x.toks.flatMap((t, i): Mark[] =>
      typeof t === "string"
        ? []
        : [{ kind: t.k, statement_index: si, token_start: i, token_end: i, element_id: t.id, word: t.t, ratio_kind: t.rk ?? null, l1_pattern_id: null, native_checked: null }],
    ),
  );
  const asked = knownSide === subject ? reference : subject;
  const world: WorldScene = {
    schema_version: "3",
    problem_id: `p_scene_${m.id}`,
    problem_type: "ratio",
    problem_text: statements.map((s) => s.text).join(""),
    grade: 6,
    problem_lang: "ja",
    holders: l.sides.map((s) => ({ id: hid(s), label: s.label.ja })),
    item_kinds: [{ id: kind, noun: m.noun, counter: m.unit.ja, asset_key: null, countable: m.countable }],
    quantities: l.sides.map((s) => ({
      id: qid(s),
      holder: hid(s),
      item_kind: kind,
      at_event: null,
      value: s === knownSide ? { num: numbers.known, den: 1 } : null,
    })),
    relations: [
      {
        id: REL,
        operator: numbers.num < numbers.den ? "fraction_of" : "times",
        subject: qid(subject),
        reference: qid(reference),
        reference_list: null,
        amount: { num: numbers.num, den: numbers.den },
        other_description: null,
      },
    ],
    events: [],
    question: { target_type: "quantity", target_id: qid(asked) },
    word_links: [],
  };
  const record: ProblemRecord = {
    schema_version: "1",
    world,
    consistency: "consistent",
    pair_id: null,
    source: "prepared",
    checks: { double_build_match: false, restate_match: false, misread_pass_rate: null, human_checked: false },
    expected_answer: null,
    statements,
    syntax_marks,
    companion_ids: [],
  };
  const enRelation = `${capitalize(subject.en.amount)} is ${frac} of ${reference.en.amount}.`;
  const enKnown = fill(knownSide.en.known, numbers.known, m.unit.en);
  const en = spec.order === "known_first" ? [enKnown, enRelation] : [enRelation, enKnown];
  const ja = statements.map((s) => s.text);
  const cap = spec.frame === "cap" ? m.cap : null;
  if (cap !== null && numbers.limit !== null) {
    ja.push(fill(cap.limit.ja, numbers.limit, m.unit.ja));
    en.push(fill(cap.limit.en, numbers.limit, m.unit.en));
  }
  const shown: Exact[] = [rat(numbers.known), rat(numbers.num, numbers.den), ...(numbers.limit === null ? [] : [rat(numbers.limit)])];
  return {
    key: `${m.id}:${spec.frame}:${spec.known}:${spec.order}:${String(numbers.known)}:${frac}:${String(numbers.limit)}`,
    spec: { ...spec },
    numbers: { ...numbers },
    record,
    lines: { ja, en },
    commonSense: { ja: l.commonSense.ja, en: l.commonSense.en },
    labels: {
      ja: Object.fromEntries(l.sides.map((s) => [hid(s), s.label.ja])),
      en: Object.fromEntries(l.sides.map((s) => [hid(s), s.label.en])),
    },
    limitLabel: cap === null ? null : { ...cap.limitLabel },
    numbersShown: dedupe(shown),
  };
}

// ---------------------------------------------------------------------------------------------
// Judging and drawing
// ---------------------------------------------------------------------------------------------

function valuesOf(w: WorldScene): Map<string, Exact> {
  const res = solve(w);
  return res.kind === "unique" ? res.values : new Map();
}

/** The common-sense sentence in a world: the part fits in what holds it, or nothing passes the limit. */
function holdsIn(scene: Pick<Scene, "spec" | "numbers">, w: WorldScene, values: Map<string, Exact>): boolean {
  if (scene.spec.frame === "cap") {
    const limit = scene.numbers.limit;
    return limit !== null && w.quantities.every((q) => {
      const v = values.get(q.id);
      return v !== undefined && cmp(v, rat(limit)) <= 0;
    });
  }
  const m = SCENE_MATERIALS.find((x) => x.id === scene.spec.material);
  if (m === undefined) return false;
  const part = values.get(qid(m.within.part));
  const container = values.get(qid(m.within.container));
  return part !== undefined && container !== undefined && cmp(part, container) <= 0;
}

function shapeOf(w: WorldScene, values: Map<string, Exact>, limit: number | null): SceneShape {
  const num = (v: Exact | undefined): number => (v === undefined ? 0 : Math.max(0, Number(v.num) / Number(v.den)));
  const longest = Math.max(...w.quantities.map((q) => num(values.get(q.id))), limit ?? 0, Number.MIN_VALUE);
  const rel = w.relations.find((r) => (r.operator === "fraction_of" || r.operator === "times") && r.amount !== null);
  const amount = rel?.amount ? fromSchema(rel.amount) : undefined;
  const parts = amount !== undefined && amount.num <= 10n && amount.den <= 10n ? amount : undefined;
  const tapes: SceneTape[] = w.quantities.map((q) => ({
    quantityId: q.id,
    holderId: q.holder,
    length: num(values.get(q.id)) / longest,
    segments: parts === undefined || rel === undefined ? null : q.id === rel.reference ? Number(parts.den) : q.id === rel.subject ? Number(parts.num) : null,
  }));
  const order = [...tapes].sort((a, b) => a.length - b.length).map((t) => t.quantityId);
  return { tapes, limit: limit === null ? null : limit / longest, order };
}

/** The scene under a reading: core runs the reading on the scene's record, then judges and shapes it. */
export function viewScene(rule: Hypothesis, scene: Pick<Scene, "spec" | "numbers" | "record">): SceneView {
  const world = runRule(rule, scene.record);
  const values = valuesOf(world);
  return {
    world,
    holds: holdsIn(scene, world, values),
    shape: shapeOf(world, values, scene.numbers.limit),
    sameAsCorrect: sameWorld(world, scene.record.world),
  };
}

/** The sentence's own world has whole amounts in the material's steps (a child pictures 6 dL, not 3/4 dL). */
const whole = (values: Map<string, Exact>, scale: number): boolean =>
  amounts(values).every((v) => v.den === 1n && v.num % BigInt(scale) === 0n);

/** The solved amounts of the quantities (solve also gives the multiples' values). */
function amounts(values: Map<string, Exact>): Exact[] {
  return [...values].flatMap(([id, v]) => (id.startsWith("q_") ? [v] : []));
}

const negative = (values: Map<string, Exact>): boolean => [...values.values()].some((v) => cmp(v, rat(0)) <= 0);

/**
 * A scene for a reading, checked by core: the world is valid and solves to one value each, the sentence's
 * own reading keeps the common-sense sentence, and nothing shown or reached meets a value to avoid.
 */
export function checkScene(rule: Hypothesis, spec: SceneSpec, numbers: SceneNumbers, avoid: readonly Rational[] = []): SceneCheck {
  const l = layoutOf(spec, numbers);
  if (typeof l === "string") return { ok: false, reason: l };
  if (!numbersOk(spec, numbers, l.m.scale)) return { ok: false, reason: "bad_numbers" };
  const built = build(spec, numbers, l);
  const correct = built.record.world;
  if (!validateWorld(correct).ok) return { ok: false, reason: "not_a_world" };
  const res = solve(correct);
  if (res.kind !== "unique" || res.impossible.length > 0 || !whole(res.values, l.m.scale)) return { ok: false, reason: "not_a_world" };
  const underCorrect = viewScene({ id: "c_correct", origin: "math", clauses: [{ when: { pred: "true", args: [] }, then: { action: "no_change" } }], word_cues: [], note_for_adult: "" }, built);
  if (!underCorrect.holds) return { ok: false, reason: "correct_breaks" };
  const underRule = viewScene(rule, built);
  const ruleValues = valuesOf(underRule.world);
  if (!validateWorld(underRule.world).ok || ruleValues.size === 0 || negative(ruleValues)) return { ok: false, reason: "impossible" };
  const values = dedupe([...worldValues(correct), ...worldValues(underRule.world)]);
  if (meets([...built.numbersShown, ...values], avoid)) return { ok: false, reason: "avoided_number" };
  // Every number the sentences write is one of the scene's own.
  for (const lang of ["ja", "en"] as const) {
    if (numbersIn([...built.lines[lang], built.commonSense[lang]].join(" ")).some((n) => !meets([n], built.numbersShown))) return { ok: false, reason: "bad_numbers" };
  }
  const scene = freeze({ ...built, values });
  sceneMarks.add(scene);
  return { ok: true, scene, underRule, underCorrect };
}

function freeze<T>(x: T): T {
  if (x !== null && typeof x === "object" && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x)) freeze(v);
  }
  return x;
}

// ---------------------------------------------------------------------------------------------
// The program's search, and a proposal checked by core
// ---------------------------------------------------------------------------------------------

/**
 * The multiples tried, in a fixed order: below 1 before above 1, quarters, thirds and fifths before halves
 * and sixths, sevenths to ninths last, the larger numerator first (3/4 before 1/4). Every one draws in parts (both at most 10).
 */
const DEN_ORDER = [4, 3, 5, 2, 6, 8, 7, 9];
const FRACTIONS: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (const below of [true, false])
    for (const den of DEN_ORDER)
      for (let num = 9; num >= 1; num--) if (num !== den && num < den === below && gcd(num, den) === 1) out.push([num, den]);
  return out;
})();
const KNOWN_STEPS = 16;
const LIMIT_STEPS = 6;

function specsOf(materials: readonly SceneMaterial[]): SceneSpec[] {
  const out: SceneSpec[] = [];
  for (const m of materials)
    for (const frame of m.frames)
      for (const known of ["reference", "subject"] as const) for (const order of ["relation_first", "known_first"] as const) out.push({ material: m.id, frame, known, order });
  return out;
}

type Want = "breaks" | "keeps" | "keeps_changed";

function meetsWant(c: CheckedScene, want: Want): boolean {
  if (want === "breaks") return !c.underRule.holds;
  if (want === "keeps") return c.underRule.holds;
  return c.underRule.holds && !c.underRule.sameAsCorrect;
}

/** The values of a solved world and the size of one part of its multiple, from values already solved. */
function withParts(w: WorldScene, values: Map<string, Exact>): Exact[] {
  const out = [...values.values()];
  for (const r of w.relations) {
    if ((r.operator !== "fraction_of" && r.operator !== "times") || r.amount === null || r.reference === null) continue;
    const ref = values.get(r.reference);
    const a = fromSchema(r.amount);
    if (ref !== undefined) out.push(div(ref, rat(a.den)), mul(ref, rat(a.num)));
  }
  return out;
}

interface Probe {
  record: ProblemRecord;
  correct: Map<string, Exact>;
  ruleWorld: WorldScene;
  rule: Map<string, Exact>;
  /** The scene's numbers but the limit, and every value reached under both readings. */
  touched: Rational[];
}

/** The scene's worlds under both readings, without the sentences' checks (the search's fast path). */
function probe(rule: Hypothesis, spec: SceneSpec, numbers: SceneNumbers): Probe | null {
  const l = layoutOf(spec, numbers);
  if (typeof l === "string" || !numbersOk(spec, numbers, l.m.scale)) return null;
  const built = build(spec, numbers, l);
  const res = solve(built.record.world);
  if (res.kind !== "unique" || res.impossible.length > 0 || !whole(res.values, l.m.scale)) return null;
  const ruleWorld = runRule(rule, built.record);
  const ruleValues = valuesOf(ruleWorld);
  if (ruleValues.size === 0 || negative(ruleValues)) return null;
  const touched = dedupe([rat(numbers.known), rat(numbers.num, numbers.den), ...withParts(built.record.world, res.values), ...withParts(ruleWorld, ruleValues)]);
  return { record: built.record, correct: res.values, ruleWorld, rule: ruleValues, touched };
}

const most = (values: Map<string, Exact>): number => Math.max(...amounts(values).map((v) => Number(v.num) / Number(v.den)));

/** The first scene, in a fixed order, that meets what is wanted (deterministic: same rule and values, same scene). */
function search(rule: Hypothesis, avoid: readonly Rational[], want: Want, materials: readonly SceneMaterial[]): CheckedScene | null {
  const specs = specsOf(materials);
  const full = (spec: SceneSpec, numbers: SceneNumbers): CheckedScene | null => {
    const c = checkScene(rule, spec, numbers, avoid);
    return c.ok && meetsWant(c, want) ? { scene: c.scene, underRule: c.underRule, underCorrect: c.underCorrect } : null;
  };
  for (const [num, den] of FRACTIONS) {
    for (let step = 1; step <= KNOWN_STEPS; step++) {
      for (const spec of specs) {
        const m = materials.find((x) => x.id === spec.material) as SceneMaterial;
        const known = step * m.scale;
        const p = probe(rule, spec, { known, num, den, limit: spec.frame === "cap" ? m.scale : null });
        if (p === null || meets(p.touched, avoid)) continue;
        const sameAsCorrect = (): boolean => sameWorld(p.ruleWorld, p.record.world);
        if (spec.frame === "within") {
          const s = { spec, numbers: { known, num, den, limit: null } };
          if (!holdsIn(s, p.record.world, p.correct)) continue;
          const ruleHolds = holdsIn(s, p.ruleWorld, p.rule);
          const wanted = want === "breaks" ? !ruleHolds : ruleHolds && (want === "keeps" || !sameAsCorrect());
          if (!wanted) continue;
          const c = full(spec, s.numbers);
          if (c !== null) return c;
          continue;
        }
        // A cap scene: the smallest limits that hold both amounts under the sentence's own reading.
        const correctMost = most(p.correct);
        const ruleMost = most(p.rule);
        if (want === "breaks" ? ruleMost <= correctMost : want === "keeps_changed" && sameAsCorrect()) continue;
        const first = Math.ceil((want === "breaks" ? correctMost : Math.max(correctMost, ruleMost)) / m.scale) * m.scale;
        for (let k = 0; k < LIMIT_STEPS; k++) {
          const limit = first + k * m.scale;
          if (want === "breaks" && limit >= ruleMost) break;
          if (meets([{ num: limit, den: 1 }], avoid)) continue;
          const c = full(spec, { known, num, den, limit });
          if (c !== null) return c;
        }
      }
    }
  }
  return null;
}

/**
 * Whether the reading changes any scene's world at all, on a few probes over every frame, both ends known,
 * multiples below and above 1 and small and large numbers. A reading that never changes one cannot break the
 * common-sense sentence, so the full search is skipped.
 */
function changesAnyScene(rule: Hypothesis): boolean {
  for (const spec of specsOf(SCENE_MATERIALS.filter((m) => m.id !== "wallet_money")))
    for (const [num, den] of [[3, 4], [1, 3], [4, 3], [5, 2]] as const)
      for (const known of [1, 60]) {
        const p = probe(rule, spec, { known: known * num * den, num, den, limit: spec.frame === "cap" ? 1 : null });
        if (p !== null && !sameWorld(p.ruleWorld, p.record.world)) return true;
      }
  return false;
}

const CACHE = new Map<string, ScenePair | null>();
const CACHE_MAX = 64;

/**
 * The program's pair for a reading (the fallback when no proposal passes): the first scene that breaks the
 * common-sense sentence under the reading, and the first that keeps it (where the reading changes the world
 * if any can, from another material when one can). Null when the reading never breaks a scene.
 */
export function pickScenes(rule: Hypothesis, avoid: readonly Rational[]): ScenePair | null {
  const key = JSON.stringify([rule, avoid.map((v) => toSchema(fromSchema(v)))]);
  if (CACHE.has(key)) return CACHE.get(key) ?? null;
  const breaks = changesAnyScene(rule) ? search(rule, avoid, "breaks", SCENE_MATERIALS) : null;
  let pair: ScenePair | null = null;
  if (breaks !== null) {
    const others = [...SCENE_MATERIALS.filter((m) => m.id !== breaks.scene.spec.material), ...SCENE_MATERIALS.filter((m) => m.id === breaks.scene.spec.material)];
    const keeps = search(rule, avoid, "keeps_changed", others) ?? search(rule, avoid, "keeps", others);
    pair = keeps === null ? null : { breaks, keeps };
  }
  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value as string);
  CACHE.set(key, pair);
  return pair;
}

const sceneChoice = z.strictObject({
  material: z.enum(SCENE_MATERIAL_IDS),
  frame: z.enum(["within", "cap"]),
  known: z.enum(["subject", "reference"]),
  order: z.enum(["relation_first", "known_first"]),
  known_value: z.int(),
  num: z.int(),
  den: z.int(),
  limit: z.int().nullable(),
});

/** A proposed pair of scenes (Claude's, or the program's in the same shape), always checked by checkScenePair. */
export const sceneProposal = z.strictObject({ breaks: sceneChoice, keeps: sceneChoice, reason_for_adult: z.string() });
export type SceneProposal = z.infer<typeof sceneProposal>;
export type SceneChoice = z.infer<typeof sceneChoice>;

export function choiceOf(c: CheckedScene): SceneChoice {
  const { spec, numbers } = c.scene;
  return { ...spec, known_value: numbers.known, num: numbers.num, den: numbers.den, limit: numbers.limit };
}

/** A proposal, checked by core: the first scene breaks the sentence under the reading, the second keeps it, the sentence's reading keeps both. */
export function checkScenePair(rule: Hypothesis, proposal: Pick<SceneProposal, "breaks" | "keeps">, avoid: readonly Rational[]): ScenePair | null {
  const parsed = sceneProposal.pick({ breaks: true, keeps: true }).safeParse({ breaks: proposal.breaks, keeps: proposal.keeps });
  if (!parsed.success) return null;
  const check = (c: SceneChoice): CheckedScene | null => {
    const res = checkScene(rule, { material: c.material, frame: c.frame, known: c.known, order: c.order }, { known: c.known_value, num: c.num, den: c.den, limit: c.limit }, avoid);
    return res.ok ? { scene: res.scene, underRule: res.underRule, underCorrect: res.underCorrect } : null;
  };
  const breaks = check(parsed.data.breaks);
  const keeps = check(parsed.data.keeps);
  if (breaks === null || keeps === null || breaks.scene.key === keeps.scene.key) return null;
  if (breaks.underRule.holds || !keeps.underRule.holds) return null;
  return { breaks, keeps };
}

/** The values the scenes must keep away from: each problem's answer and the values on the way (one part). */
export function sceneAvoidValues(records: readonly ProblemRecord[]): Rational[] {
  return dedupe(records.flatMap((r) => hiddenValues(r.world).map(fromSchema)));
}

/** Whether core built this scene (the gate lets only these through). */
export const isScene = (x: object): boolean => sceneMarks.has(x);
