// M1 step (4): apply a child's ops to the correct world (指示書 第5.3節; per-problem counts from 第5.7節).
// Pure functions only: the inputs are never changed. Open readings are recorded in QUESTIONS Q10-Q13.
import { PREFIX, type ElementKind, type Rational } from "../schema/common.ts";
import type { Interpretation } from "../schema/interpretation.ts";
import { validateOps, validateWorld, type AnyOp } from "../schema/semantic.ts";
import type { WorldScene } from "../schema/world-scene.ts";
import { add, cmp, div, fromSchema, isInteger, isZero, mul, rat, sub, toSchema } from "../rational/index.ts";
import { solve, withoutConstraints, type ImpossibleReason } from "../solve/index.ts";

/** Utterances per problem that may put a value into the world (Q11). */
export const MAX_VALUE_UTTERANCES = 2;

export interface ApplyInput {
  correct: WorldScene;
  ops: readonly AnyOp[];
  phrases?: Interpretation["phrases"];
  representable?: "full" | "partial" | "none";
  priorAnswerUtterances?: number;
  priorUnitValueUtterances?: number;
}

export interface Resolution {
  released: string[];
  unsatisfiable: string[][];
}

export interface ApplyResult {
  judgeWorld: WorldScene;
  drawWorld: WorldScene;
  /** The world the statements are checked on: answers and procedure values in, answers set aside out. */
  checkWorld: WorldScene;
  touched: string[];
  idMap: Record<string, string>;
  discarded: { index: number; reason: string }[];
  representable: "full" | "partial" | "none";
  removedByCascade: string[];
  judge: Resolution;
  draw: Resolution & { answerSetAside: string[] };
  answers: { target_id: string; value: Rational; onQuestionTarget: boolean; drawn: boolean }[];
  unitValues: { relation_id: string; value: Rational; drawn: boolean }[];
  wordCues: { statement_index: number; tokens: number[] }[];
  procedures: { target_id: string; value: Rational; impossible: ImpossibleReason[] }[];
  observedReferences: { relation_id: string; reference: string }[];
}

const INTRODUCES: Partial<Record<AnyOp["op"], ElementKind>> = {
  add_holder: "holder",
  add_item_kind: "item_kind",
  add_quantity: "quantity",
  add_relation: "relation",
  add_event: "event",
};

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

class Discard extends Error {}

/** Temporary ids (n_...) that have not been given a real id. */
const TEMP_LIKE = /^n_/;

function kindOf(w: WorldScene, id: string): ElementKind | undefined {
  if (w.holders.some((x) => x.id === id)) return "holder";
  if (w.item_kinds.some((x) => x.id === id)) return "item_kind";
  if (w.quantities.some((x) => x.id === id)) return "quantity";
  if (w.relations.some((x) => x.id === id)) return "relation";
  if (w.events.some((x) => x.id === id)) return "event";
  return undefined;
}

function allIds(w: WorldScene): Set<string> {
  return new Set([...w.holders, ...w.item_kinds, ...w.quantities, ...w.relations, ...w.events].map((x) => x.id));
}

/**
 * The ids an op touches (指示書 第5.3節): only these fields count. A procedure's operands do not;
 * the relations it links are added by procedureRelations.
 */
function idsNamed(op: AnyOp): string[] {
  const out: string[] = [];
  const o = op as Record<string, unknown>;
  for (const f of ["target_id", "subject", "reference", "holder"]) {
    if (typeof o[f] === "string") out.push(o[f]);
  }
  if (Array.isArray(o.reference_list)) out.push(...(o.reference_list as string[]));
  return out;
}

/** Relations of the correct world that link the holders of a procedure's operands and target. */
function procedureRelations(w: WorldScene, op: Extract<AnyOp, { op: "state_procedure" }>): string[] {
  const holderOf = new Map(w.quantities.map((q) => [q.id, q.holder]));
  const targetHolder = holderOf.get(op.target_id);
  if (targetHolder === undefined) return [];
  const operandHolders = new Set(
    op.operands.flatMap((x) => ("quantity_id" in x ? [holderOf.get(x.quantity_id)] : [])).filter((h) => h !== undefined),
  );
  return w.relations
    .filter((r) => {
      const hs = [r.subject, r.reference, ...(r.reference_list ?? [])]
        .filter((id): id is string => id !== null)
        .map((id) => holderOf.get(id));
      return hs.includes(targetHolder) && hs.some((h) => h !== undefined && h !== targetHolder && operandHolders.has(h));
    })
    .map((r) => r.id);
}

/** The child's starting world (指示書 第5.3節; Q13 for events kept only as time points). */
function baseWorld(correct: WorldScene, touched: ReadonlySet<string>, extraAnchors: ReadonlySet<string>): WorldScene {
  const w = structuredClone(correct);
  const q = w.question;
  const quantities = w.quantities.map((x) =>
    q.target_type === "quantity" && x.id === q.target_id ? { ...x, value: null } : x,
  );
  // What is asked stays as a place to ask about, without its amount (Q15).
  const asked = (id: string): boolean => q.target_type !== "quantity" && id === q.target_id;
  const relations = w.relations
    .filter((r) => touched.has(r.id) || asked(r.id))
    .map((r) => (q.target_type === "relation_amount" && r.id === q.target_id ? { ...r, amount: null } : r));
  const anchors = new Set([...extraAnchors, ...quantities.flatMap((x) => (x.at_event === null ? [] : [x.at_event]))]);
  const events = w.events
    .filter((e) => touched.has(e.id) || anchors.has(e.id) || asked(e.id))
    .map((e) =>
      !touched.has(e.id) || (q.target_type === "event_amount" && e.id === q.target_id) ? { ...e, amount: null } : e,
    );
  const kept = allIds({ ...w, quantities, relations, events });
  return { ...w, quantities, relations, events, word_links: w.word_links.filter((l) => kept.has(l.element_id)) };
}

/** Ids removed together with `id` (指示書 第5.3節 remove_element), the target included. */
function cascade(w: WorldScene, id: string): Set<string> {
  const gone = new Set([id]);
  for (const e of w.events) {
    if (e.holder === id || e.to_holder === id || e.item_kind === id) gone.add(e.id);
  }
  for (const x of w.quantities) {
    if (x.holder === id || x.item_kind === id || (x.at_event !== null && gone.has(x.at_event))) gone.add(x.id);
  }
  for (const r of w.relations) {
    const ends = [r.subject, r.reference, ...(r.reference_list ?? [])];
    if (ends.some((e) => e !== null && gone.has(e))) gone.add(r.id);
  }
  return gone;
}

function without(w: WorldScene, gone: ReadonlySet<string>): WorldScene {
  return {
    ...w,
    holders: w.holders.filter((x) => !gone.has(x.id)),
    item_kinds: w.item_kinds.filter((x) => !gone.has(x.id)),
    quantities: w.quantities.filter((x) => !gone.has(x.id)),
    relations: w.relations.filter((x) => !gone.has(x.id)),
    events: w.events.filter((x) => !gone.has(x.id)),
    word_links: w.word_links.filter((l) => !gone.has(l.element_id)),
  };
}

function freshId(w: WorldScene, kind: ElementKind): string {
  const used = allIds(w);
  for (let n = 1; ; n++) {
    const id = `${PREFIX[kind]}new${n}`;
    if (!used.has(id)) return id;
  }
}

/** Put a value on a quantity, relation amount or event amount. */
function setValue(w: WorldScene, id: string, v: Rational | null): WorldScene {
  return {
    ...w,
    quantities: w.quantities.map((x) => (x.id === id ? { ...x, value: v } : x)),
    relations: w.relations.map((x) => (x.id === id ? { ...x, amount: v } : x)),
    events: w.events.map((x) => (x.id === id ? { ...x, amount: v } : x)),
  };
}

function valueOf(w: WorldScene, id: string): Rational | null {
  return (
    w.quantities.find((x) => x.id === id)?.value ??
    w.relations.find((x) => x.id === id)?.amount ??
    w.events.find((x) => x.id === id)?.amount ??
    null
  );
}

function countable(w: WorldScene, id: string): boolean {
  const kind = w.quantities.find((x) => x.id === id)?.item_kind ?? w.events.find((x) => x.id === id)?.item_kind;
  return w.item_kinds.find((k) => k.id === kind)?.countable ?? false;
}

/** Rewrites the ids an op names through the map of temporary ids already given out. */
function translate(op: AnyOp, idMap: Readonly<Record<string, string>>): AnyOp {
  const t = (id: string): string => idMap[id] ?? id;
  const o = { ...op } as Record<string, unknown>;
  for (const f of ["target_id", "subject", "reference", "holder", "item_kind", "to_holder", "at_event"]) {
    if (typeof o[f] === "string") o[f] = t(o[f]);
  }
  if (Array.isArray(o.reference_list)) o.reference_list = (o.reference_list as string[]).map(t);
  if (op.op === "state_procedure") {
    o.operands = op.operands.map((x) => ("quantity_id" in x ? { quantity_id: t(x.quantity_id) } : x));
  }
  return o as AnyOp;
}

function compute(a: Rational, b: Rational, operation: "multiply" | "divide" | "add" | "subtract"): Rational {
  const x = fromSchema(a);
  const y = fromSchema(b);
  switch (operation) {
    case "multiply":
      return toSchema(mul(x, y));
    case "divide":
      if (isZero(y)) throw new Discard("division by zero");
      return toSchema(div(x, y));
    case "add":
      return toSchema(add(x, y));
    case "subtract":
      return toSchema(sub(x, y));
  }
}

/**
 * Releases untouched constraints until the world stops contradicting itself (指示書 第5.3節).
 * `answerId`, when given, is set aside if a conflict is made only of what the child touched.
 */
function resolve(
  world: WorldScene,
  touched: ReadonlySet<string>,
  answerId: string | null,
): { world: WorldScene; released: string[]; unsatisfiable: string[][]; aside: string[] } {
  let w = world;
  const released: string[] = [];
  const aside: string[] = [];
  for (;;) {
    const res = solve(w);
    if (res.kind !== "contradiction") return { world: w, released, unsatisfiable: [], aside };
    const first = res.minimalSets[0] ?? [];
    const untouched = first.filter((id) => !touched.has(id));
    const relations = untouched.filter((id) => kindOf(w, id) === "relation").sort(byCodeUnit);
    const numbers = untouched.filter((id) => kindOf(w, id) !== "relation").sort(byCodeUnit);
    const pick = relations.at(-1) ?? numbers.at(-1);
    if (pick !== undefined) {
      w = withoutConstraints(w, [pick]);
      released.push(pick);
      continue;
    }
    if (answerId !== null && first.includes(answerId) && !aside.includes(answerId)) {
      w = withoutConstraints(w, [answerId]);
      aside.push(answerId);
      continue;
    }
    const unsatisfiable = res.minimalSets.filter((s) => s.every((id) => touched.has(id)));
    return { world: w, released, unsatisfiable, aside };
  }
}

/** Builds the child's world from the correct world and the child's ops (指示書 第5.3節). */
export function apply(input: ApplyInput): ApplyResult {
  const { correct, ops } = input;
  const phrases = input.phrases ?? [];
  const priorAnswers = input.priorAnswerUtterances ?? 0;
  const priorUnits = input.priorUnitValueUtterances ?? 0;

  // 1. What the child touched, in the correct world's ids.
  const touchedBase = new Set<string>();
  const known = (id: string): boolean => !TEMP_LIKE.test(id);
  // An op that fails the meaning check even against the correct world will be discarded; it touches nothing.
  const precheck = validateOps(correct, ops);
  const failing = new Set(
    precheck.ok ? [] : precheck.errors.flatMap((e) => /^ops\[(\d+)\]/.exec(e.path)?.[1] ?? []).map(Number),
  );
  const anchors = new Set<string>();
  ops.forEach((op, i) => {
    if (failing.has(i)) return;
    for (const id of idsNamed(op)) if (known(id)) touchedBase.add(id);
    if (op.op === "state_procedure") for (const r of procedureRelations(correct, op)) touchedBase.add(r);
    if (op.op === "add_quantity" && op.at_event !== null && known(op.at_event)) anchors.add(op.at_event);
  });
  for (const p of phrases) if (known(p.element_id)) touchedBase.add(p.element_id);

  // 2. The starting world, then 3. the ops in order.
  let world = baseWorld(correct, touchedBase, anchors);
  const touched = new Set(touchedBase);
  const idMap: Record<string, string> = {};
  const discarded: ApplyResult["discarded"] = [];
  const removed = new Set<string>();
  const stated: { target_id: string; value: Rational }[] = [];
  const unitValues: ApplyResult["unitValues"] = [];
  const wordCues: ApplyResult["wordCues"] = [];
  const procedures: ApplyResult["procedures"] = [];
  const observedReferences: ApplyResult["observedReferences"] = [];

  ops.forEach((raw, index) => {
    const op = translate(raw, idMap);
    try {
      const kind = INTRODUCES[op.op];
      const newId = "new_id" in op ? op.new_id : null;
      if (newId !== null && newId in idMap) throw new Discard(`${newId} is introduced twice`);
      const check = validateOps(world, [op]);
      if (!check.ok) throw new Discard(check.errors.map((e) => e.message).join("; "));
      const next = step(world, op, kind === undefined ? null : freshId(world, kind));
      const v = validateWorld(next.world);
      if (!v.ok) throw new Discard(v.errors.map((e) => e.message).join("; "));
      if (next.newId !== null && newId !== null) idMap[newId] = next.newId;
      world = next.world;
      for (const id of idsNamed(op)) touched.add(id);
      if (next.newId !== null) touched.add(next.newId);
      for (const id of next.removed) removed.add(id);
      if (next.observed) observedReferences.push(next.observed);
      if (next.procedure) procedures.push(next.procedure);
      if (op.op === "state_answer") stated.push({ target_id: op.target_id, value: op.number });
      if (op.op === "set_unit_value") {
        unitValues.push({ relation_id: op.target_id, value: op.number, drawn: priorUnits < MAX_VALUE_UTTERANCES });
      }
      if (op.op === "word_cue") wordCues.push({ statement_index: op.statement_index, tokens: [...op.tokens] });
    } catch (e) {
      if (!(e instanceof Discard)) throw e;
      discarded.push({ index, reason: e.message });
    }
  });
  for (const p of phrases) {
    const id = idMap[p.element_id] ?? p.element_id;
    if (known(id)) touched.add(id);
  }

  // 4. The judging world leaves the child's answers out.
  const judged = resolve(world, touched, null);
  // 5. The drawing world adds the answers, and never holds a procedure's value: the child did not say
  //    that number, so it is only for the order of lengths (指示書 第5.3節, Q12).
  const target = world.question.target_id;
  const answers = stated.map((a) => {
    const onQuestionTarget = a.target_id === target;
    return { ...a, onQuestionTarget, drawn: onQuestionTarget && priorAnswers < MAX_VALUE_UTTERANCES };
  });
  const drawnAnswer = answers.filter((a) => a.drawn).at(-1);
  // The statements are checked on the world with the answers and the procedure values (指示書 第5.7節,
  // 第5.3節); the drawing world is that world without the procedure values.
  const checkStart = drawnAnswer === undefined ? world : setValue(world, target, drawnAnswer.value);
  const drawTouched = drawnAnswer === undefined ? touched : new Set([...touched, target]);
  const drawn = resolve(checkStart, drawTouched, drawnAnswer === undefined ? null : target);
  const checkWorld = drawn.world;
  let drawWorld = checkWorld;
  for (const p of procedures) drawWorld = setValue(drawWorld, p.target_id, null);
  // The child said this number, so it is drawn even when it was set aside or a procedure aimed at it.
  if (drawnAnswer !== undefined) drawWorld = setValue(drawWorld, target, drawnAnswer.value);

  return {
    judgeWorld: judged.world,
    drawWorld,
    checkWorld,
    touched: [...touched].sort(byCodeUnit),
    idMap,
    discarded,
    representable: discarded.length > 0 ? "partial" : (input.representable ?? "full"),
    removedByCascade: [...removed].sort(byCodeUnit),
    judge: { released: judged.released, unsatisfiable: judged.unsatisfiable },
    draw: {
      released: drawn.released,
      unsatisfiable: drawn.unsatisfiable,
      answerSetAside: drawn.aside,
    },
    answers,
    unitValues,
    wordCues,
    procedures,
    observedReferences,
  };
}

interface Step {
  world: WorldScene;
  newId: string | null;
  removed: string[];
  observed?: { relation_id: string; reference: string };
  procedure?: { target_id: string; value: Rational; impossible: ImpossibleReason[] };
}

/** One op on a world that already passed the meaning check. */
function step(w: WorldScene, op: AnyOp, fresh: string | null): Step {
  const done = (world: WorldScene, extra: Partial<Step> = {}): Step => ({ world, newId: null, removed: [], ...extra });
  const relation = (id: string) => w.relations.find((r) => r.id === id);
  const editRelation = (id: string, f: (r: WorldScene["relations"][number]) => WorldScene["relations"][number]) =>
    ({ ...w, relations: w.relations.map((r) => (r.id === id ? f(r) : r)) });
  const editEvent = (id: string, f: (e: WorldScene["events"][number]) => WorldScene["events"][number]) =>
    ({ ...w, events: w.events.map((e) => (e.id === id ? f(e) : e)) });
  const swap = (id: string): WorldScene => {
    const r = relation(id);
    if (r === undefined || r.reference === null) throw new Discard(`${id} has no single reference to swap with`);
    return editRelation(id, (x) => ({ ...x, subject: r.reference as string, reference: r.subject }));
  };

  switch (op.op) {
    case "set_quantity":
    case "set_relation_amount":
    case "set_event_amount":
      return done(setValue(w, op.target_id, op.number));
    case "set_relation_operator": {
      const r = relation(op.target_id);
      const needsList = op.operator === "total_of";
      if (r === undefined || (needsList ? r.reference_list === null : r.reference === null)) {
        throw new Discard(`${op.target_id} cannot take ${op.operator}`);
      }
      return done(editRelation(op.target_id, (x) => ({ ...x, operator: op.operator })));
    }
    case "swap_relation_direction":
      return done(swap(op.target_id));
    case "set_relation_reference": {
      const r = relation(op.target_id);
      if (r === undefined) throw new Discard(`${op.target_id} does not exist`);
      if (r.reference === op.reference) {
        return done(w, { observed: { relation_id: op.target_id, reference: op.reference } });
      }
      if (r.subject === op.reference) return done(swap(op.target_id));
      if (r.reference === null) throw new Discard(`${op.target_id} has no single reference`);
      return done(editRelation(op.target_id, (x) => ({ ...x, reference: op.reference })));
    }
    case "add_relation": {
      const id = fresh as string;
      const relations = [
        ...w.relations,
        {
          id,
          operator: op.operator,
          subject: op.subject,
          reference: op.reference,
          reference_list: op.reference_list === null ? null : [...op.reference_list],
          amount: op.number,
          other_description: null,
        },
      ];
      return { world: { ...w, relations }, newId: id, removed: [] };
    }
    case "add_event": {
      const id = fresh as string;
      const order = Math.max(0, ...w.events.map((e) => e.order)) + 1;
      const event = {
        id,
        order,
        type: op.event_type,
        holder: op.holder,
        item_kind: op.item_kind,
        amount: op.number,
        to_holder: op.to_holder,
      };
      return { world: { ...w, events: [...w.events, event] }, newId: id, removed: [] };
    }
    case "set_event_type": {
      const e = w.events.find((x) => x.id === op.target_id);
      if (op.event_type === "move" && (e?.to_holder ?? null) === null) {
        throw new Discard(`${op.target_id} has no to_holder for a move`);
      }
      return done(
        editEvent(op.target_id, (x) => ({
          ...x,
          type: op.event_type,
          to_holder: op.event_type === "move" ? x.to_holder : null,
        })),
      );
    }
    case "set_event_to_holder": {
      const e = w.events.find((x) => x.id === op.target_id);
      if (e?.type !== "move") throw new Discard(`${op.target_id} is not a move`);
      return done(editEvent(op.target_id, (x) => ({ ...x, to_holder: op.to_holder })));
    }
    case "set_question_target":
      return done({ ...w, question: { target_type: op.question_type, target_id: op.target_id } });
    case "rename_item_kind":
      return done({
        ...w,
        item_kinds: w.item_kinds.map((k) => (k.id === op.target_id ? { ...k, noun: op.label } : k)),
      });
    case "add_holder": {
      const id = fresh as string;
      return { world: { ...w, holders: [...w.holders, { id, label: op.label }] }, newId: id, removed: [] };
    }
    case "add_item_kind": {
      const id = fresh as string;
      // Whether the new kind is counted one by one is not said by the child; leave it uncounted.
      const kind = { id, noun: op.label, counter: "", asset_key: null, countable: false };
      return { world: { ...w, item_kinds: [...w.item_kinds, kind] }, newId: id, removed: [] };
    }
    case "add_quantity": {
      const id = fresh as string;
      const q = { id, holder: op.holder, item_kind: op.item_kind, at_event: op.at_event, value: op.number };
      return { world: { ...w, quantities: [...w.quantities, q] }, newId: id, removed: [] };
    }
    case "remove_element": {
      const gone = cascade(w, op.target_id);
      if (gone.has(w.question.target_id)) throw new Discard(`removing ${op.target_id} removes what is asked`);
      gone.delete(op.target_id);
      const all = new Set([...gone, op.target_id]);
      return done(without(w, all), { removed: [...gone] });
    }
    case "state_procedure": {
      const [a, b] = op.operands.map((x) => {
        if (!("quantity_id" in x)) return x;
        const v = valueOf(w, x.quantity_id);
        if (v === null) throw new Discard(`${x.quantity_id} has no value to compute with`);
        return v;
      }) as [Rational, Rational];
      const value = compute(a, b, op.operation);
      const exact = fromSchema(value);
      const impossible: ImpossibleReason[] = [];
      if (cmp(exact, rat(0)) < 0) impossible.push("negative");
      if (countable(w, op.target_id) && !isInteger(exact)) impossible.push("non_integer");
      return done(setValue(w, op.target_id, value), { procedure: { target_id: op.target_id, value, impossible } });
    }
    case "state_answer":
    case "set_unit_value":
    case "word_cue":
      return done(w);
  }
}
