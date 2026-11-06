// M2: worlds built independently name their elements differently. canonicalWorld renames every id by
// what the element is, so two builds of the same problem can be compared (指示書 第6.6節, the two builds).
import type { WorldScene } from "../schema/world-scene.ts";
import { sameWorld } from "./same-world.ts";

type Rat = { num: number; den: number } | null;

const ratKey = (r: Rat): string => (r === null ? "" : `${r.num}/${r.den}`);
const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const cmpKeys = (a: readonly string[], b: readonly string[]): number => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const c = cmpStr(a[i] ?? "", b[i] ?? "");
    if (c !== 0) return c;
  }
  return 0;
};
/** Zero-padded so that a key's text order is its number order. */
const pad = (n: number): string => String(n).padStart(6, "0");

/** Sorts by content key (the original id only breaks exact ties) and gives prefix + position. */
function rename<T extends { id: string }>(items: readonly T[], prefix: string, key: (x: T) => string[], map: Map<string, string>): void {
  const sorted = [...items].sort((a, b) => cmpKeys(key(a), key(b)) || cmpStr(a.id, b.id));
  sorted.forEach((x, i) => map.set(x.id, `${prefix}${i + 1}`));
}

export function canonicalWorld(w: WorldScene): WorldScene {
  const map = new Map<string, string>();
  const to = (id: string): string => map.get(id) ?? id;
  const rank = (id: string | null): string => (id === null ? "" : pad(Number(to(id).slice(2))));

  const holderLabel = new Map(w.holders.map((h) => [h.id, h.label]));
  const kindLabel = new Map(w.item_kinds.map((k) => [k.id, `${k.noun}\u0000${k.counter}`]));
  rename(w.holders, "h_", (h) => [h.label], map);
  rename(w.item_kinds, "k_", (k) => [k.noun, k.counter], map);
  rename(w.events, "e_", (e) => [pad(e.order + 1_000_000), e.type, holderLabel.get(e.holder) ?? "", kindLabel.get(e.item_kind) ?? "", ratKey(e.amount)], map);
  rename(w.quantities, "q_", (q) => [rank(q.holder), rank(q.item_kind), q.at_event === null ? "" : rank(q.at_event), ratKey(q.value)], map);
  rename(
    w.relations,
    "r_",
    (r) => [r.operator, rank(r.subject), r.reference === null ? "" : rank(r.reference), (r.reference_list ?? []).map(rank).sort().join(","), ratKey(r.amount)],
    map,
  );

  const byId = <T extends { id: string }>(xs: T[]): T[] => xs.sort((a, b) => cmpKeys([a.id.slice(0, 2), pad(Number(a.id.slice(2)))], [b.id.slice(0, 2), pad(Number(b.id.slice(2)))]));
  return {
    ...w,
    holders: byId(w.holders.map((h) => ({ ...h, id: to(h.id) }))),
    item_kinds: byId(w.item_kinds.map((k) => ({ ...k, id: to(k.id) }))),
    quantities: byId(
      w.quantities.map((q) => ({ ...q, id: to(q.id), holder: to(q.holder), item_kind: to(q.item_kind), at_event: q.at_event === null ? null : to(q.at_event), value: q.value === null ? null : { ...q.value } })),
    ),
    relations: byId(
      w.relations.map((r) => ({
        ...r,
        id: to(r.id),
        subject: to(r.subject),
        reference: r.reference === null ? null : to(r.reference),
        reference_list: r.reference_list === null ? null : r.reference_list.map(to),
        amount: r.amount === null ? null : { ...r.amount },
      })),
    ),
    events: byId(w.events.map((e) => ({ ...e, id: to(e.id), holder: to(e.holder), item_kind: to(e.item_kind), to_holder: e.to_holder === null ? null : to(e.to_holder), amount: e.amount === null ? null : { ...e.amount } }))),
    question: { ...w.question, target_id: to(w.question.target_id) },
    word_links: w.word_links.map((l) => ({ ...l, element_id: to(l.element_id) })).sort((a, b) => cmpKeys([a.element_id, a.lang, a.phrase], [b.element_id, b.lang, b.phrase])),
  };
}

const multiset = (xs: readonly string[]): string => [...xs].sort().join("\u0000");

/** What a build says once renamed: the parts that must agree element by element. */
function buildFacts(w: WorldScene): string {
  const c = canonicalWorld(w);
  return JSON.stringify([
    c.problem_type,
    c.holders.map((h) => [h.id, h.label]),
    c.item_kinds.map((k) => [k.id, k.noun, k.counter, k.countable]),
    c.quantities.map((q) => [q.id, q.holder, q.item_kind, q.at_event, ratKey(q.value)]),
    c.relations.map((r) => [r.id, r.operator, r.subject, r.reference, r.reference_list === null ? null : [...r.reference_list].sort(), ratKey(r.amount)]),
    c.events.map((e) => [e.id, e.order, e.type, e.holder, e.item_kind, ratKey(e.amount), e.to_holder]),
    c.question,
  ]);
}

/**
 * Two independent builds agree: once renamed, every element says the same thing, and the worlds are the
 * same (Q25). An inverse relation (弟 = 4/3 兄 for 兄 = 3/4 弟) solves alike but sets the other base as 1,
 * so it is a different build.
 */
export function sameBuild(a: WorldScene, b: WorldScene): boolean {
  if (multiset(a.holders.map((h) => h.label)) !== multiset(b.holders.map((h) => h.label))) return false;
  if (buildFacts(a) !== buildFacts(b)) return false;
  return sameWorld(canonicalWorld(a), canonicalWorld(b));
}

/** The same shape of problem with other numbers or another scene (the pair and the companion world). */
export function sameStructure(a: WorldScene, b: WorldScene): boolean {
  if (a.problem_type !== b.problem_type) return false;
  if (a.question.target_type !== b.question.target_type) return false;
  if (multiset(a.relations.map((r) => r.operator)) !== multiset(b.relations.map((r) => r.operator))) return false;
  if (a.quantities.length !== b.quantities.length || a.events.length !== b.events.length) return false;
  return !sameBuild(a, b);
}
