// The word book (ことばの絵本, 指示書 第7.1節) and the help for a child who is stuck: which wordings a problem uses,
// which relation words to light in a sentence, and a page drawn as a world core has checked. A page is shown on
// a problem with the first of its sets of numbers that meets none of that problem's values and whose sentences
// core's gate passes. Pure functions only; no number of the current problem is ever put on a page.
import type { ProblemRecord } from "../schema/problem-record.ts";
import type { Rational } from "../schema/common.ts";
import type { WorldScene } from "../schema/world-scene.ts";
import { validateWorld } from "../schema/index.ts";
import { gate, hasOperationName, numbersIn, type GateContext } from "../gates/index.ts";
import { worldValues } from "../scenes/values.ts";
import { eq, fromSchema } from "../rational/index.ts";
import { WORDBOOK_PAGES, WORDBOOK_PAGE_IDS, type WordbookNumbers, type WordbookPageData, type WordbookPageId } from "./pages.ts";
import { drawnValues, objectScene, type ObjectScene } from "../stage/index.ts";

export { WORDBOOK_PAGES, WORDBOOK_PAGE_IDS, WORDBOOK_READINGS, type WordbookNumbers, type WordbookPageData, type WordbookPageId } from "./pages.ts";

type Lang = "ja" | "en";

function pageOf(id: WordbookPageId): WordbookPageData {
  const p = WORDBOOK_PAGES.find((x) => x.id === id);
  if (p === undefined) throw new Error(`no word book page ${id}`);
  return p;
}

/** A page's sentence with its numbers written in. */
function fill(text: string, n: WordbookNumbers): string {
  return text
    .replaceAll("{one}", String(n.one))
    .replaceAll("{other}", String(n.other))
    .replaceAll("{amount}", `${String(n.amount.num)}/${String(n.amount.den)}`);
}

/**
 * The page's example as a world with its n-th set of numbers: the holder taken as 1 is the relation's reference;
 * both counts are given.
 */
export function wordbookWorld(id: WordbookPageId, lang: Lang, variant = 0): WorldScene {
  const p = pageOf(id);
  const n = p.numbers[variant];
  if (n === undefined) throw new Error(`no numbers ${String(variant)} on page ${id}`);
  const r = (x: number): Rational => ({ num: x, den: 1 });
  return {
    schema_version: "3",
    problem_id: `wordbook_${id}`,
    problem_type: "ratio",
    // The page's own sentences: the numbers it may draw are read from here.
    problem_text: p.lines.ja.map((l) => fill(l, n)).join(""),
    grade: 5,
    problem_lang: "ja",
    holders: [
      { id: "h_other", label: p.other[lang] },
      { id: "h_one", label: p.one[lang] },
    ],
    item_kinds: [{ id: "k_thing", noun: p.thing.noun, counter: p.thing.counter, asset_key: null, countable: true }],
    quantities: [
      { id: "q_other", holder: "h_other", item_kind: "k_thing", at_event: null, value: r(n.other) },
      { id: "q_one", holder: "h_one", item_kind: "k_thing", at_event: null, value: r(n.one) },
    ],
    relations: [
      {
        id: "r_page",
        operator: p.operator,
        subject: "q_other",
        reference: "q_one",
        reference_list: null,
        amount: { num: n.amount.num, den: n.amount.den },
        other_description: null,
      },
    ],
    events: [],
    question: { target_type: "relation_amount", target_id: "r_page" },
    word_links: [],
  };
}

/** The "1" of "taken as 1" is the name of the card, not a number of the page. */
function withoutTheOne(text: string): string {
  return text.replace(/「[1１]」|"[1１]"|“[1１]”/g, "").replace(/[1１](?=\s*と\s*(?:み|見))/g, "");
}

function numbersOf(p: WordbookPageData, n: WordbookNumbers): Rational[] {
  const out: Rational[] = [{ num: n.one, den: 1 }, { num: n.other, den: 1 }, { ...n.amount }];
  for (const line of [...p.lines.ja, ...p.lines.en]) out.push(...numbersIn(withoutTheOne(fill(line, n))));
  return out;
}

/** Every number a page may show, over all its sets: its counts, its multiple and the numbers its sentences write. */
export function pageNumbers(id: WordbookPageId): Rational[] {
  const p = pageOf(id);
  return p.numbers.flatMap((n) => numbersOf(p, n));
}

/** Every value of a problem: given, on the way (one part included), its answer, and the numbers of its text. */
function problemValues(r: ProblemRecord): Rational[] {
  const out: Rational[] = [...numbersIn(r.world.problem_text)];
  for (const v of worldValues(r.world)) out.push({ num: Number(v.num), den: Number(v.den) });
  if (r.expected_answer !== null) out.push(r.expected_answer);
  return out;
}

const same = (a: Rational, b: Rational): boolean => eq(fromSchema(a), fromSchema(b));

export interface WordbookPageView {
  id: WordbookPageId;
  /** The wording, as the page's title. */
  title: string;
  lines: string[];
  /** The page's world, labelled in the screen's language (drawn with the "1" card on oneHolderId). */
  world: WorldScene;
  oneHolderId: string;
  /**
   * The page's example drawn twice, as contrasting cases: read as the wording says (the "1" holder's things dealt
   * onto as many dishes as the fraction's bottom, all whole), and read with the other holder as 1 (dealt the same
   * way: it breaks). Each has a short neutral caption, never a verdict. Null when the page draws no stage
   * picture; otherAsOne null when it cannot be drawn without a number of the problem.
   */
  contrast: WordbookContrast | null;
}

export interface WordbookContrast {
  asWorded: ObjectScene;
  otherAsOne: ObjectScene | null;
  captions: [string, string | null];
}

/** A short neutral caption: which holder is taken as 1 (no verdict). */
export function contrastCaption(holder: string, lang: Lang): string {
  return lang === "ja" ? `${holder}を「1」とみると` : `Taking ${holder} as "1"`;
}

/** The page's world read with the other holder as 1: the other holder's count kept, the "1" holder's derived. */
function otherAsOneWorld(w: WorldScene): WorldScene {
  return {
    ...w,
    quantities: w.quantities.map((q) => (q.id === "q_one" ? { ...q, value: null } : q)),
    relations: w.relations.map((r) => ({ ...r, subject: "q_one", reference: "q_other" })),
    question: { target_type: "quantity", target_id: "q_one" },
  };
}

/** The two pictures of a page's world, or null when the first does not deal into whole things or draws a hidden value. */
function contrastOf(world: WorldScene, record: ProblemRecord, theirs: readonly Rational[], lang: Lang): WordbookContrast | null {
  // The problem's values it does not write (its answer, values on the way): never drawn here.
  const given = numbersIn(record.world.problem_text);
  const unsaid = theirs.filter((t) => !given.some((g) => same(g, t)));
  // Neither picture draws a hidden value of the problem (its answer, a value on the way, one part) nor hides a holder.
  // A number the problem's text gives may be drawn: it is on the problem's screen already.
  const clean = (sc: ObjectScene | null): sc is ObjectScene =>
    sc !== null && sc.holders.every((h) => !h.hidden) && !drawnValues(sc).some((d) => sc.hidden.some((t) => same(d, t)) || unsaid.some((t) => same(d, t)));
  const asWorded = objectScene(world, record.world, { values: [] });
  if (!clean(asWorded) || asWorded.share === null || asWorded.share.piece !== null) return null;
  const swapped = objectScene(otherAsOneWorld(world), record.world, { values: [] });
  const otherAsOne = clean(swapped) && swapped.share !== null ? swapped : null;
  const label = (id: string): string => world.holders.find((h) => h.id === id)?.label ?? "";
  return { asWorded, otherAsOne, captions: [contrastCaption(label("h_one"), lang), otherAsOne === null ? null : contrastCaption(label("h_other"), lang)] };
}

/**
 * The page as it may be shown on a problem: with the first of its sets of numbers that meets none of the problem's
 * values (given, on the way, its answer) and whose sentences core's gate passes (no hidden value, no operation
 * name). Null only when no set is left, when one of the problem's holders is on the page, or when its world fails
 * core's meaning check.
 */
export function wordbookPage(id: WordbookPageId, record: ProblemRecord, lang: Lang): WordbookPageView | null {
  try {
    const p = pageOf(id);
    if (record.world.holders.some((h) => [p.one[lang], p.other[lang], ...p.lines[lang]].some((l) => l.includes(h.label)))) return null;
    const theirs = problemValues(record);
    const ctx: GateContext = {
      correct: record.world,
      lang,
      childSaid: { numbers: [], words: [] },
      grade: record.world.grade,
      interpretationRecorded: true,
      prediction: "disabled",
    };
    // The first set of numbers kept apart from the problem; a later set when only it lets both pictures be drawn.
    let first: WordbookPageView | null = null;
    for (let i = 0; i < p.numbers.length; i++) {
      const n = p.numbers[i] as WordbookNumbers;
      if (numbersOf(p, n).some((x) => theirs.some((t) => same(x, t)))) continue;
      const lines = p.lines[lang].map((l) => fill(l, n));
      if ([p.words[lang], ...lines].some((t) => hasOperationName(t) || !gate({ kind: "say", text: withoutTheOne(t) }, ctx).ok)) continue;
      const world = wordbookWorld(id, lang, i);
      if (!validateWorld(world).ok) return null;
      const view: WordbookPageView = { id, title: p.words[lang], lines, world, oneHolderId: "h_one", contrast: contrastOf(world, record, theirs, lang) };
      // The second picture must break visibly (a cut piece), else a later set is tried.
      if (view.contrast?.otherAsOne != null && view.contrast.otherAsOne.breaks) return view;
      first ??= view;
    }
    return first;
  } catch {
    return null;
  }
}

/** The order the pages are taken in when a problem uses more than one wording: the plain の last. */
const PRIORITY: readonly WordbookPageId[] = ["wo_moto", "ni_taishite", "wo_ichi", "bai", "no"];

const flat = (s: string): string => s.normalize("NFKC").replace(/\s+/g, "");

/** The wordings of a problem's sentences (the question aside), in PRIORITY order; empty when none is known. */
export function wordbookPagesOf(record: ProblemRecord): WordbookPageId[] {
  const found = new Set<WordbookPageId>();
  for (const st of record.statements) {
    if (st.is_question) continue;
    const text = flat(st.tokens.join(""));
    const marks = record.syntax_marks.filter((m) => m.kind === "relation_word" && m.statement_index === st.index);
    if (/を(?:もと|元)にする/.test(text)) found.add("wo_moto");
    if (text.includes("に対して")) found.add("ni_taishite");
    if (/を1と(?:み|見)/.test(text)) found.add("wo_ichi");
    if (/\d+\/\d+倍|\d倍/.test(text)) found.add("bai");
    if (marks.some((m) => m.word === "の") || /の\d+\/\d+/.test(text)) found.add("no");
  }
  return PRIORITY.filter((id) => found.has(id));
}

/**
 * The words to light in a sentence (指示書 第7.1節 手順5): every token written like one of its relation words, all
 * at the same strength (every の, not only the one before the multiple), with を and もとにすると together and
 * 倍. Never a number or a holder. Empty for a sentence without a relation word.
 */
export function relationWordTokens(record: ProblemRecord, statementIndex: number): number[] {
  const st = record.statements.find((s) => s.index === statementIndex);
  if (st === undefined) return [];
  const words = new Set(record.syntax_marks.filter((m) => m.kind === "relation_word" && m.statement_index === statementIndex).map((m) => m.word));
  if (words.size === 0) return [];
  const holders = new Set(record.world.holders.map((h) => h.label));
  const lit = new Set<number>();
  st.tokens.forEach((t, i) => {
    if (words.has(t)) lit.add(i);
  });
  st.tokens.forEach((t, i) => {
    const prev = st.tokens[i - 1];
    if (/^(?:もと|元)に/.test(t) && prev === "を") lit.add(i).add(i - 1);
    if (t === "倍") lit.add(i);
  });
  return [...lit].filter((i) => numbersIn(st.tokens[i] ?? "").length === 0 && !holders.has(st.tokens[i] ?? "")).sort((a, b) => a - b);
}

/** The sentence of the help's first step: the first failing sentence with a relation word, else the first sentence with one. */
export function helpSentence(record: ProblemRecord, failing: readonly number[]): { statementIndex: number; tokens: number[] } | null {
  const order = [...failing, ...record.statements.map((s) => s.index).filter((i) => !failing.includes(i))];
  for (const i of order) {
    const tokens = relationWordTokens(record, i);
    if (tokens.length > 0) return { statementIndex: i, tokens };
  }
  return null;
}

export const isWordbookPageId = (x: unknown): x is WordbookPageId => typeof x === "string" && (WORDBOOK_PAGE_IDS as readonly string[]).includes(x);
