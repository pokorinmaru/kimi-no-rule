// M1 step (7): run a reading rule on a problem (指示書 第5.8節). A rule is a list of clauses; for each
// relation and event of the correct world, the first clause whose condition holds is applied.
// Pure functions only.
import type { Rational } from "../schema/common.ts";
import type { ProblemRecord } from "../schema/problem-record.ts";
import type { Expr, ReadingRule } from "../schema/reading-rule.ts";
import { validateWorld } from "../schema/semantic.ts";
import type { WorldScene } from "../schema/world-scene.ts";
import { cmp, div, fromSchema, inv, isZero, rat, toSchema } from "../rational/index.ts";
import { solve } from "../solve/index.ts";

export type Hypothesis = ReadingRule["hypotheses"][number];
type Action = Hypothesis["clauses"][number]["then"];
type Relation = WorldScene["relations"][number];
type WorldEvent = WorldScene["events"][number];
type Position = "first_mentioned" | "second_mentioned" | "known_value" | "asked" | "larger_number" | "smaller_number";

const MULTIPLICATIVE = new Set(["times", "fraction_of", "per"]);

interface Context {
  record: ProblemRecord;
  correct: WorldScene;
  values: Map<string, ReturnType<typeof fromSchema>>;
  holderOf: Map<string, string>;
  /** Holders in the order the text mentions them. */
  mentionOrder: string[];
}

function contextOf(record: ProblemRecord): Context {
  const correct = record.world;
  const res = solve(correct);
  const values = res.kind === "unique" || res.kind === "underdetermined" ? res.values : new Map();
  const holderOf = new Map(correct.quantities.map((q) => [q.id, q.holder]));
  const marks = record.syntax_marks
    .filter((m) => m.kind === "holder_mention" && m.element_id !== null)
    .sort((a, b) => a.statement_index - b.statement_index || a.token_start - b.token_start);
  const mentionOrder: string[] = [];
  for (const m of marks) {
    const h = holderOf.get(m.element_id as string) ?? (m.element_id as string);
    if (!mentionOrder.includes(h)) mentionOrder.push(h);
  }
  // Holders never marked follow in the order the world lists their quantities.
  for (const q of correct.quantities) if (!mentionOrder.includes(q.holder)) mentionOrder.push(q.holder);
  return { record, correct, values, holderOf, mentionOrder };
}

const endsOf = (r: Relation): string[] => (r.reference === null ? [r.subject] : [r.subject, r.reference]);

function statementsOf(ctx: Context, id: string) {
  return ctx.record.statements.filter((s) => s.element_ids.includes(id));
}

function ratioMark(ctx: Context, r: Relation) {
  return ctx.record.syntax_marks.find((m) => m.kind === "ratio_notation" && m.element_id === r.id);
}

/** The end of the relation at a position of the text or of the numbers (指示書 第5.8節 reference_is). */
function endAt(ctx: Context, r: Relation, pos: Position): string | undefined {
  const ends = endsOf(r);
  const known = ends.filter((e) => ctx.correct.quantities.find((q) => q.id === e)?.value !== null);
  const asked = ends.filter((e) => e === ctx.correct.question.target_id);
  const byMention = [...ends].sort(
    (a, b) => ctx.mentionOrder.indexOf(ctx.holderOf.get(a) ?? "") - ctx.mentionOrder.indexOf(ctx.holderOf.get(b) ?? ""),
  );
  // The two ends ordered by their solved values, when both are known and differ.
  const valued = ends.flatMap((e) => {
    const v = ctx.values.get(e);
    return v === undefined ? [] : [{ e, v }];
  });
  const [lo, hi] = valued.length === 2 ? [...valued].sort((x, y) => cmp(x.v, y.v)) : [];
  const ordered = lo !== undefined && hi !== undefined && cmp(lo.v, hi.v) !== 0;
  switch (pos) {
    case "first_mentioned":
      return byMention[0];
    case "second_mentioned":
      return byMention[1];
    case "known_value":
      return known.length === 1 ? known[0] : undefined;
    case "asked":
      return asked[0] ?? (known.length === 1 ? ends.find((e) => e !== known[0]) : undefined);
    case "larger_number":
      return ordered ? hi.e : undefined;
    case "smaller_number":
      return ordered ? lo.e : undefined;
  }
}

function ratioKinds(ctx: Context, r: Relation): string[] {
  const m = ratioMark(ctx, r);
  if (m?.ratio_kind) return m.ratio_kind;
  if (r.amount === null || !MULTIPLICATIVE.has(r.operator)) return [];
  const a = fromSchema(r.amount);
  const kinds = [cmp(a, rat(1)) > 0 ? "gt1" : "lt1"];
  if (a.den !== 1n) kinds.push("fraction");
  return kinds;
}

/** The token index of the occurrence of a word nearest the ratio of the relation. */
function wordOccurrence(ctx: Context, r: Relation, word: string): { statement: number; start: number; end: number } | undefined {
  const mark = ratioMark(ctx, r);
  let best: { statement: number; start: number; end: number; d: number } | undefined;
  for (const s of statementsOf(ctx, r.id)) {
    for (let i = 0; i < s.tokens.length; i++) {
      let text = "";
      for (let j = i; j < s.tokens.length; j++) {
        text += s.tokens[j];
        if (text === word) {
          const d = mark !== undefined && mark.statement_index === s.index ? Math.abs(i - mark.token_start) : 1000 + i;
          if (best === undefined || d < best.d) best = { statement: s.index, start: i, end: j, d };
        }
        if (text.length >= word.length) break;
      }
    }
  }
  return best;
}

function holderNextTo(ctx: Context, at: { statement: number; start: number; end: number }, side: "before" | "after"): string | undefined {
  const mentions = ctx.record.syntax_marks
    .filter((m) => m.kind === "holder_mention" && m.statement_index === at.statement && m.element_id !== null)
    .sort((a, b) => a.token_start - b.token_start);
  const m = side === "before" ? mentions.filter((x) => x.token_end < at.start).at(-1) : mentions.find((x) => x.token_start > at.end);
  if (m === undefined) return undefined;
  return ctx.holderOf.get(m.element_id as string) ?? (m.element_id as string);
}

function evalExpr(e: Expr, ctx: Context, target: Relation | WorldEvent, isRelation: boolean): boolean {
  if ("op" in e) {
    if (e.op === "and") return e.args.every((a) => evalExpr(a, ctx, target, isRelation));
    if (e.op === "or") return e.args.some((a) => evalExpr(a, ctx, target, isRelation));
    if (e.op === "not") return !evalExpr(e.arg, ctx, target, isRelation);
    return false;
  }
  const [a0 = "", a1 = ""] = e.args;
  switch (e.pred) {
    case "true":
      return true;
    case "problem_type_is":
      return ctx.correct.problem_type === a0;
    case "consistency_is":
      return ctx.record.consistency === a0;
    default:
      break;
  }
  if (!isRelation) return false;
  const r = target as Relation;
  switch (e.pred) {
    case "relation_operator_is":
      return r.operator === a0;
    case "ratio_kind_is":
      return ratioKinds(ctx, r).includes(a0);
    case "word_in_statement":
      return statementsOf(ctx, r.id).some((s) => s.text.includes(a0) || s.tokens.join("").includes(a0));
    case "word_before_ratio": {
      const m = ratioMark(ctx, r);
      const s = m === undefined ? undefined : ctx.record.statements.find((x) => x.index === m.statement_index);
      if (m === undefined || s === undefined) return false;
      return s.tokens.slice(0, m.token_start).join("").endsWith(a0);
    }
    case "word_after_holder": {
      // The role is the relation's subject or reference; the word is the occurrence nearest the multiple,
      // and the holder mentioned right before it must be the holder in that role.
      const end = a0 === "subject" ? r.subject : a0 === "reference" ? r.reference : endAt(ctx, r, a0 as Position);
      const holder = end === null || end === undefined ? undefined : ctx.holderOf.get(end);
      const at = wordOccurrence(ctx, r, a1);
      if (holder === undefined || at === undefined) return false;
      // "Right after" the holder: the word starts at the token that follows the mention.
      return ctx.record.syntax_marks.some(
        (m) =>
          m.kind === "holder_mention" &&
          m.element_id !== null &&
          m.statement_index === at.statement &&
          m.token_end + 1 === at.start &&
          (ctx.holderOf.get(m.element_id) ?? m.element_id) === holder,
      );
    }
    case "reference_is":
      return r.reference !== null && endAt(ctx, r, a0 as Position) === r.reference;
    case "numbers_compare": {
      // The two numbers of the problem: the known count and the multiple.
      const known = endAt(ctx, r, "known_value");
      const knownValue = known === undefined ? undefined : ctx.values.get(known);
      if (knownValue === undefined || r.amount === null) return false;
      const c = cmp(knownValue, fromSchema(r.amount));
      return a0 === "larger_is_known" ? c > 0 : c < 0;
    }
    case "ratio_is_unit_fraction":
      return r.amount !== null && r.amount.num === 1 && r.amount.den > 1;
    default:
      return false;
  }
}

/** The number written for a multiple: the numerator of a fraction, or the number of a decimal or percent. */
function writtenNumber(ctx: Context, r: Relation): Rational | null {
  const m = ratioMark(ctx, r);
  const word = m?.word.normalize("NFKC") ?? "";
  const frac = /(\d+)\s*\/\s*(\d+)/.exec(word);
  if (frac) return { num: Number(frac[1]), den: 1 };
  const bunno = /(\d+)\s*分の\s*(\d+)/.exec(word);
  if (bunno) return { num: Number(bunno[2]), den: 1 };
  const plain = /(\d+(?:\.\d+)?)/.exec(word);
  if (plain) {
    const [w = "0", f = ""] = (plain[1] ?? "0").split(".");
    return toSchema(rat(BigInt(w + f), 10n ** BigInt(f.length)));
  }
  if (r.amount === null) return null;
  return { num: r.amount.num, den: 1 };
}

function withRelation(w: WorldScene, r: Relation): WorldScene {
  return { ...w, relations: w.relations.map((x) => (x.id === r.id ? r : x)) };
}

/** One action on one relation of the world; undefined when it does not apply. */
function actOnRelation(w: WorldScene, ctx: Context, r: Relation, a: Action): WorldScene | undefined {
  const known = endAt(ctx, r, "known_value");
  const asked = endAt(ctx, r, "asked");
  switch (a.action) {
    case "no_change":
      return w;
    case "swap_reference":
      return r.reference === null ? undefined : withRelation(w, { ...r, subject: r.reference, reference: r.subject });
    case "choose_reference": {
      let end: string | undefined;
      if (typeof a.by === "string") end = endAt(ctx, r, a.by);
      else {
        const at = wordOccurrence(ctx, r, a.by.word);
        const holder = at === undefined ? undefined : holderNextTo(ctx, at, a.by.holder === "before_word" ? "before" : "after");
        end = endsOf(r).find((e) => ctx.holderOf.get(e) === holder);
      }
      if (end === undefined || r.reference === null) return undefined;
      if (end === r.reference) return w;
      return withRelation(w, { ...r, subject: r.reference, reference: end });
    }
    case "invert_ratio":
      if (!MULTIPLICATIVE.has(r.operator) || r.amount === null || isZero(fromSchema(r.amount))) return undefined;
      return withRelation(w, { ...r, amount: toSchema(inv(fromSchema(r.amount))) });
    case "set_relation_type_additive": {
      if (!MULTIPLICATIVE.has(r.operator) || r.amount === null) return undefined;
      const amount = a.amount === "numerator" ? writtenNumber(ctx, r) : r.amount;
      if (amount === null) return undefined;
      const operator = cmp(fromSchema(r.amount), rat(1)) < 0 ? "less_by" : "more_by";
      return withRelation(w, { ...r, operator, amount });
    }
    case "number_op": {
      if (!MULTIPLICATIVE.has(r.operator) || r.amount === null || known === undefined || asked === undefined) return undefined;
      if (a.mode === "multiply_always") return withRelation(w, { ...r, subject: asked, reference: known });
      if (a.mode === "divide_always") return withRelation(w, { ...r, subject: known, reference: asked });
      const knownValue = ctx.values.get(known);
      if (knownValue === undefined) return undefined;
      if (a.mode === "divide_large_by_small") {
        const ratio = fromSchema(r.amount);
        if (cmp(knownValue, ratio) >= 0) return withRelation(w, { ...r, subject: known, reference: asked });
        // The ratio is the larger number: the asked count becomes the ratio divided by the known count.
        const value = toSchema(div(ratio, knownValue));
        return dropRelationSetValue(w, r, asked, value);
      }
      // percent_as_count: the percent number itself becomes the asked count (only for a percent).
      if (!ratioKinds(ctx, r).includes("percent")) return undefined;
      const written = writtenNumber(ctx, r);
      return written === null ? undefined : dropRelationSetValue(w, r, asked, written);
    }
    case "misread_question": {
      if (ctx.correct.question.target_type !== "quantity") return undefined;
      const other = endsOf(r).find((e) => e !== ctx.correct.question.target_id);
      if (other === undefined || !endsOf(r).includes(ctx.correct.question.target_id)) return undefined;
      return { ...w, question: { target_type: "quantity", target_id: other } };
    }
    case "flip_event":
      return undefined;
  }
}

function dropRelationSetValue(w: WorldScene, r: Relation, id: string, value: Rational): WorldScene {
  return {
    ...w,
    relations: w.relations.filter((x) => x.id !== r.id),
    quantities: w.quantities.map((q) => (q.id === id ? { ...q, value } : q)),
  };
}

function actOnEvent(w: WorldScene, e: WorldEvent, a: Action): WorldScene | undefined {
  if (a.action === "no_change") return w;
  if (a.action !== "flip_event") return undefined;
  const flipped: WorldEvent =
    e.type === "gain"
      ? { ...e, type: "lose" }
      : e.type === "lose"
        ? { ...e, type: "gain" }
        : e.to_holder === null
          ? e
          : { ...e, holder: e.to_holder, to_holder: e.holder };
  return { ...w, events: w.events.map((x) => (x.id === e.id ? flipped : x)) };
}

/** The world the child with this reading would build for the problem (指示書 第5.8節 run_rule). */
export function runRule(h: Hypothesis, record: ProblemRecord): WorldScene {
  const ctx = contextOf(record);
  let world = structuredClone(record.world);
  const keep = (next: WorldScene | undefined): void => {
    if (next !== undefined && validateWorld(next).ok) world = next;
  };
  for (const r of record.world.relations) {
    const clause = h.clauses.find((c) => evalExpr(c.when, ctx, r, true));
    if (clause === undefined) continue;
    const current = world.relations.find((x) => x.id === r.id);
    if (current === undefined) continue;
    keep(actOnRelation(world, ctx, current, clause.then));
  }
  for (const e of record.world.events) {
    const clause = h.clauses.find((c) => evalExpr(c.when, ctx, e, false));
    if (clause === undefined) continue;
    const current = world.events.find((x) => x.id === e.id);
    if (current === undefined) continue;
    keep(actOnEvent(world, current, clause.then));
  }
  return world;
}
