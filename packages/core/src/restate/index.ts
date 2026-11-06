// M1 step (8): restate a world as sentences of fixed shapes, and read them back (指示書 第6.6節: the
// restated sentences are compared with the problem text to catch a reversed direction). The sentences
// name holders, items and numbers only, never ids. parseRestated is the exact inverse of restate.
import type { Rational } from "../schema/common.ts";
import type { WorldScene } from "../schema/world-scene.ts";

export interface RestatedSentence {
  text: string;
  kind: "given" | "relation" | "event" | "after_event" | "question";
  element_id: string;
}

type Lang = "ja" | "en";
type Relation = WorldScene["relations"][number];
type WorldEvent = WorldScene["events"][number];
type Quantity = WorldScene["quantities"][number];

const BLANK = "□";

function numberText(r: Rational | null): string {
  if (r === null) return BLANK;
  return r.den === 1 ? String(r.num) : `${r.num}/${r.den}`;
}

function parseNumber(s: string): Rational | null {
  if (s === BLANK) return null;
  const f = /^(-?\d+)\/(\d+)$/.exec(s);
  if (f) return { num: Number(f[1]), den: Number(f[2]) };
  if (/^-?\d+$/.test(s)) return { num: Number(s), den: 1 };
  throw new Error(`not a number: ${s}`);
}

const NUM = "(□|-?\\d+(?:/\\d+)?)";
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The order of events: their position after sorting by (order, id), counted from 1. */
function eventRank(w: WorldScene): Map<string, number> {
  const sorted = [...w.events].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return new Map(sorted.map((e, i) => [e.id, i + 1]));
}

/** How a quantity is named: its holder, its item, and the event it comes after. */
function nameOf(w: WorldScene, q: Quantity, lang: Lang, rank: Map<string, number>): string {
  const holder = w.holders.find((h) => h.id === q.holder)?.label ?? q.holder;
  const noun = w.item_kinds.find((k) => k.id === q.item_kind)?.noun ?? q.item_kind;
  // Events are named by letters, so a question sentence never carries a digit.
  const when = q.at_event === null ? null : String.fromCharCode(64 + (rank.get(q.at_event) ?? 0));
  if (lang === "ja") return when === null ? `${holder}の${noun}` : `できごと${when}の後の${holder}の${noun}`;
  return when === null ? `${holder}'s ${noun}` : `${holder}'s ${noun} after event ${when}`;
}

const counterOf = (w: WorldScene, kind: string): string => w.item_kinds.find((k) => k.id === kind)?.counter ?? "";

function relationText(w: WorldScene, r: Relation, lang: Lang, name: (id: string) => string): string {
  const s = name(r.subject);
  const ref = r.reference === null ? "" : name(r.reference);
  const a = numberText(r.amount);
  const list = (r.reference_list ?? []).map(name);
  if (lang === "ja") {
    switch (r.operator) {
      case "more_by":
        return `${s}は、${ref}より${a}多い。`;
      case "less_by":
        return `${s}は、${ref}より${a}少ない。`;
      case "times":
        return `${s}は、${ref}の${a}倍。`;
      case "fraction_of":
        return `${s}は、${ref}の${a}。`;
      case "per":
        return `${s}は、${ref}あたり${a}。`;
      case "same_as":
        return `${s}は、${ref}と同じ。`;
      case "total_of":
        return `${s}は、${list.join("と")}を合わせたもの。`;
      default:
        return r.other_description ?? "";
    }
  }
  switch (r.operator) {
    case "more_by":
      return `${s} is ${a} more than ${ref}.`;
    case "less_by":
      return `${s} is ${a} fewer than ${ref}.`;
    case "times":
      return `${s} is ${a} times ${ref}.`;
    case "fraction_of":
      return `${s} is ${a} of ${ref}.`;
    case "per":
      return `${s} is ${a} for each ${ref}.`;
    case "same_as":
      return `${s} is the same as ${ref}.`;
    case "total_of":
      return `${s} is ${list.join(" and ")} together.`;
    default:
      return r.other_description ?? "";
  }
}

function eventText(w: WorldScene, e: WorldEvent, lang: Lang): string {
  const h = w.holders.find((x) => x.id === e.holder)?.label ?? e.holder;
  const to = e.to_holder === null ? "" : (w.holders.find((x) => x.id === e.to_holder)?.label ?? e.to_holder);
  const noun = w.item_kinds.find((k) => k.id === e.item_kind)?.noun ?? e.item_kind;
  const a = numberText(e.amount);
  const c = counterOf(w, e.item_kind);
  if (lang === "ja") {
    if (e.type === "gain") return `${h}は${noun}を${a}${c}ふやした。`;
    if (e.type === "lose") return `${h}は${noun}を${a}${c}へらした。`;
    return `${h}は${to}に${noun}を${a}${c}うつした。`;
  }
  if (e.type === "gain") return `${h} gains ${a} ${noun}.`;
  if (e.type === "lose") return `${h} loses ${a} ${noun}.`;
  return `${h} moves ${a} ${noun} to ${to}.`;
}

function givenText(name: string, v: Rational, counter: string, after: boolean, lang: Lang): string {
  if (lang === "ja") return after ? `その後、${name}は${numberText(v)}${counter}。` : `${name}は${numberText(v)}${counter}。`;
  return after ? `After that, ${name} is ${numberText(v)}.` : `${name} is ${numberText(v)}.`;
}

function questionText(w: WorldScene, lang: Lang, name: (id: string) => string): string {
  const q = w.question;
  if (q.target_type === "quantity") {
    const qty = w.quantities.find((x) => x.id === q.target_id);
    const c = qty === undefined ? "" : counterOf(w, qty.item_kind);
    return lang === "ja" ? `${name(q.target_id)}は何${c}ですか。` : `How many is ${name(q.target_id)}?`;
  }
  return lang === "ja" ? `${BLANK}はいくつですか。` : `What number goes in ${BLANK}?`;
}

/** The world as sentences of fixed shapes (指示書 第6.6節). */
export function restate(world: WorldScene, lang: Lang): RestatedSentence[] {
  const rank = eventRank(world);
  const names = new Map(world.quantities.map((q) => [q.id, nameOf(world, q, lang, rank)]));
  // Two quantities read the same way could not be told apart in the sentences, or read back.
  if (new Set(names.values()).size !== names.size) throw new Error("two quantities would have the same name");
  const name = (id: string): string => names.get(id) ?? id;
  const out: RestatedSentence[] = [];
  const given = (q: Quantity, after: boolean): void => {
    // A value is written whenever the world holds one; in a correct world the asked count holds none.
    if (q.value === null) return;
    out.push({ text: givenText(name(q.id), q.value, counterOf(world, q.item_kind), after, lang), kind: after ? "after_event" : "given", element_id: q.id });
  };
  for (const q of world.quantities) if (q.at_event === null) given(q, false);
  for (const r of world.relations) out.push({ text: relationText(world, r, lang, name), kind: "relation", element_id: r.id });
  const events = [...world.events].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  for (const e of events) {
    out.push({ text: eventText(world, e, lang), kind: "event", element_id: e.id });
    for (const q of world.quantities) if (q.at_event === e.id) given(q, true);
  }
  out.push({ text: questionText(world, lang, name), kind: "question", element_id: world.question.target_id });
  return out;
}

/** Reads restated sentences back into a world (the inverse of restate). */
export function parseRestated(sentences: readonly RestatedSentence[], base: WorldScene, lang: Lang): WorldScene {
  // Events first, so the names of quantities after an event can be built.
  const eventSentences = sentences.filter((s) => s.kind === "event");
  const events: WorldEvent[] = [];
  eventSentences.forEach((s, i) => {
    const e = parseEvent(s, base, lang, i + 1);
    events.push(e);
  });
  const skeleton: WorldScene = { ...structuredClone(base), events, relations: [] };
  const rank = eventRank(skeleton);
  const qs = base.quantities.map((q) => ({ q, name: nameOf(skeleton, q, lang, rank) }));
  const byName = new Map(qs.map(({ q, name }) => [name, q.id]));
  const idOf = (name: string): string => {
    const id = byName.get(name);
    if (id === undefined) throw new Error(`unknown quantity: ${name}`);
    return id;
  };
  const names = qs.map(({ name }) => escape(name)).sort((a, b) => b.length - a.length).join("|");
  const Q = `(${names})`;

  const values = new Map<string, Rational>();
  const relations: Relation[] = [];
  let question: WorldScene["question"] = base.question;
  for (const s of sentences) {
    if (s.kind === "given" || s.kind === "after_event") {
      const re =
        lang === "ja"
          ? new RegExp(`^${s.kind === "after_event" ? "その後、" : ""}${Q}は${NUM}.*。$`)
          : new RegExp(`^${s.kind === "after_event" ? "After that, " : ""}${Q} is ${NUM}\\.$`);
      const m = re.exec(s.text);
      if (!m) throw new Error(`cannot read: ${s.text}`);
      const v = parseNumber(m[2] as string);
      if (v !== null) values.set(idOf(m[1] as string), v);
    } else if (s.kind === "relation") {
      relations.push(parseRelation(s, lang, Q, idOf));
    } else if (s.kind === "question") {
      const id = s.element_id;
      const type = base.quantities.some((q) => q.id === id)
        ? "quantity"
        : relations.some((r) => r.id === id)
          ? "relation_amount"
          : "event_amount";
      question = { target_type: type, target_id: id };
    }
  }
  return {
    ...structuredClone(base),
    quantities: base.quantities.map((q) => ({ ...q, value: values.get(q.id) ?? null })),
    relations,
    events,
    question,
  };
}

function parseRelation(s: RestatedSentence, lang: Lang, Q: string, idOf: (name: string) => string): Relation {
  const base = { id: s.element_id, reference_list: null, other_description: null } as const;
  const forms: [Relation["operator"], RegExp][] =
    lang === "ja"
      ? [
          ["more_by", new RegExp(`^${Q}は、${Q}より${NUM}多い。$`)],
          ["less_by", new RegExp(`^${Q}は、${Q}より${NUM}少ない。$`)],
          ["times", new RegExp(`^${Q}は、${Q}の${NUM}倍。$`)],
          ["fraction_of", new RegExp(`^${Q}は、${Q}の${NUM}。$`)],
          ["per", new RegExp(`^${Q}は、${Q}あたり${NUM}。$`)],
          ["same_as", new RegExp(`^${Q}は、${Q}と同じ。$`)],
        ]
      : [
          ["more_by", new RegExp(`^${Q} is ${NUM} more than ${Q}\\.$`)],
          ["less_by", new RegExp(`^${Q} is ${NUM} fewer than ${Q}\\.$`)],
          ["times", new RegExp(`^${Q} is ${NUM} times ${Q}\\.$`)],
          ["fraction_of", new RegExp(`^${Q} is ${NUM} of ${Q}\\.$`)],
          ["per", new RegExp(`^${Q} is ${NUM} for each ${Q}\\.$`)],
          ["same_as", new RegExp(`^${Q} is the same as ${Q}\\.$`)],
        ];
  for (const [operator, re] of forms) {
    const m = re.exec(s.text);
    if (!m) continue;
    if (operator === "same_as") {
      return { ...base, operator, subject: idOf(m[1] as string), reference: idOf(m[2] as string), amount: null };
    }
    // ja puts the amount after both names; en puts it between them.
    const [subject, amount, reference] = lang === "ja" ? [m[1], m[3], m[2]] : [m[1], m[2], m[3]];
    return { ...base, operator, subject: idOf(subject as string), reference: idOf(reference as string), amount: parseNumber(amount as string) };
  }
  const total =
    lang === "ja" ? new RegExp(`^${Q}は、(.+)を合わせたもの。$`).exec(s.text) : new RegExp(`^${Q} is (.+) together\\.$`).exec(s.text);
  if (total) {
    // Read the parts name by name, so a name that holds the joining word (おとうと) stays whole.
    const joiner = lang === "ja" ? "と" : " and ";
    const parts: string[] = [];
    let rest = total[2] as string;
    const one = new RegExp(`^${Q}`);
    for (;;) {
      const m = one.exec(rest);
      if (!m) throw new Error(`cannot read the parts of: ${s.text}`);
      parts.push(m[1] as string);
      rest = rest.slice((m[1] as string).length);
      if (rest === "") break;
      if (!rest.startsWith(joiner)) throw new Error(`cannot read the parts of: ${s.text}`);
      rest = rest.slice(joiner.length);
    }
    return { ...base, operator: "total_of", subject: idOf(total[1] as string), reference: null, reference_list: parts.map(idOf), amount: null };
  }
  return { ...base, operator: "other", subject: "", reference: null, amount: null, other_description: s.text };
}

function parseEvent(s: RestatedSentence, w: WorldScene, lang: Lang, order: number): WorldEvent {
  const H = `(${w.holders.map((h) => escape(h.label)).sort((a, b) => b.length - a.length).join("|")})`;
  const K = `(${w.item_kinds.map((k) => escape(k.noun)).sort((a, b) => b.length - a.length).join("|")})`;
  const holder = (label: string): string => w.holders.find((h) => h.label === label)?.id ?? label;
  const kind = (noun: string): string => w.item_kinds.find((k) => k.noun === noun)?.id ?? noun;
  const forms: [WorldEvent["type"], RegExp][] =
    lang === "ja"
      ? [
          ["gain", new RegExp(`^${H}は${K}を${NUM}.*ふやした。$`)],
          ["lose", new RegExp(`^${H}は${K}を${NUM}.*へらした。$`)],
        ]
      : [
          ["gain", new RegExp(`^${H} gains ${NUM} ${K}\\.$`)],
          ["lose", new RegExp(`^${H} loses ${NUM} ${K}\\.$`)],
        ];
  for (const [type, re] of forms) {
    const m = re.exec(s.text);
    if (!m) continue;
    const [h, k, a] = lang === "ja" ? [m[1], m[2], m[3]] : [m[1], m[3], m[2]];
    return { id: s.element_id, order, type, holder: holder(h as string), item_kind: kind(k as string), amount: parseNumber(a as string), to_holder: null };
  }
  const move =
    lang === "ja"
      ? new RegExp(`^${H}は${H}に${K}を${NUM}.*うつした。$`).exec(s.text)
      : new RegExp(`^${H} moves ${NUM} ${K} to ${H}\\.$`).exec(s.text);
  if (!move) throw new Error(`cannot read: ${s.text}`);
  const [h, to, k, a] = lang === "ja" ? [move[1], move[2], move[3], move[4]] : [move[1], move[4], move[3], move[2]];
  return {
    id: s.element_id,
    order,
    type: "move",
    holder: holder(h as string),
    item_kind: kind(k as string),
    amount: parseNumber(a as string),
    to_holder: holder(to as string),
  };
}
