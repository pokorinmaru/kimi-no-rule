// M1b: the junior's words (指示書 第6.8節). The fixed sentences are the default; Claude only adds a
// sentence made for this world, and only after the gates below. The generator is not given the correct
// world, whether the child is right, the research hypotheses, or the child's transcript. It does see the
// problem text, from which it could work out the answer, so the gates are the real guard: they allow
// what may be said (numbers of the problem, lengths that match the junior's own world) rather than
// trying to list what may not. Only the kinds of rejection are kept, never the text.
import { z } from "zod";
import {
  gate,
  holderName,
  numbersIn,
  render,
  schemas,
  solve,
  type GateContext,
  type KohaiUtterance,
  type ProblemRecord,
  type Rational,
  type WorldScene,
} from "@kimi/core";
import { MODELS, withDeadline, type ClaudeClient } from "./client.ts";

export type KohaiIntent = "read" | "which" | "restate";

export interface KohaiInput {
  intent: KohaiIntent;
  lang: "ja" | "en";
  kohaiWorld: WorldScene;
  statements: ProblemRecord["statements"];
  childOps: { holderIds: string[]; words: string[] };
  /** For "which": the sentences that do not fit in the junior's world and the words tied to them (no right or wrong). */
  failing?: { statement_index: number; words: string[] }[];
}

export type GateRule =
  | "answer_leak"
  | "relation_word"
  | "operation_name"
  | "judging"
  | "feeling"
  | "off_topic"
  | "refers_to"
  | "length"
  | "intent_shape"
  | "mind"
  | "attribution";

export const KOHAI_TIMEOUT_MS = 4000;
/** Kanji the junior may use besides those of the problem (all taught by the fourth grade). */
const COMMON_KANJI = "足文世界読方合長短区切何見前後先輩数人上下大小中字今度話問題";
const MAX_CHARS = 40;

/** Words that could point to the right reading, or settle a size the world does not show. */
const RELATION_WORDS =
  /はず|べき|ないと|なくちゃ|なければ|本当は|ほんとうは|ほんとは|実は|じつは|本来|半分|倍|同じ|多い|少ない|大きい|小さい|\bshould\b|\bactually\b|\breally\b|\bmust\b|\bsupposed\b|\bought\b|\bhas to\b|\bhalf\b|\btimes\b|\bsame\b|\btwice\b|\bdouble\b|\bmore\b|\bfewer\b|\bless\b|\bbigger\b|\bsmaller\b/gi;
const JUDGING =
  /正しい|ただしい|間違|まちが|惜しい|おしい|すごい|さすが|ほんとに|本当に|えー|せいかい|正解|ありがと|合って(い)?ます(?!か)|そのとおり|よくでき|えらい|いいね|ばっちり|ぴったり|だいじょうぶ|大丈夫|がんば|ならできる|\bcorrect\b|\bwrong\b|\bright answer\b|\bthat'?s right\b|\byou'?re right\b|\bexactly\b|\bamazing\b|\bsmart\b|\bclever\b|\bexcellent\b|\bgood job\b|\bmistake\b|\bclose\b|\bgreat\b|\bawesome\b|\bgood\b|\bnice\b|\bwell done\b|\bperfect\b|\bthank|\breally\?/i;
const FEELING =
  /うれしい|嬉しい|さみしい|寂しい|たのしい|楽しい|かなしい|悲しい|ごめん|いっしょに|また来て|好き|すき|友だち|ともだち|友達|先輩も|きみのため|\bhappy\b|\bsad\b|\blonely\b|\bfun\b|\bsorry\b|\bfriend|\blove\b|\blike you\b|\bmiss you\b|come back|\btogether\b/i;
const MIND =
  /と思|思う|思い|気が(する|します|して|した)|感じ|わかる気|かんがえ|考え|わかりました|わかった|おぼえ|覚え|まよ|ふしぎ|びっくり|\bI think\b|\bI feel\b|\bI guess\b|\bI believe\b|seems to me|\bconfused\b|\bI am sure\b|\bI'm sure\b|\bwonder\b|\bI know\b/i;
/** Putting the child's reading in the junior's mouth, or saying where the junior's reading came from. */
const ATTRIBUTION = /先輩の(読み|考え|まね|やり方)|きみの|君の|あなたの|まね|\byour (reading|way|rule|idea)\b|\blike you\b|\bsame as you\b|\byou read\b|\bcopied\b|\blearned from you\b|\byou taught me\b/i;
/** Questions about the child, not about the problem. */
const ABOUT_THE_CHILD = /なまえ|名前|どこ|住ん|すん|学校|がっこう|ねんせい|年生|なんさい|何さい|何歳|おうち|家族|かぞく|\bname\b|\blive\b|\bschool\b|\bage\b|how old|\bgrade\b/i;
/** Words for the shape of the junior's own world, which is already on the screen. */
const SHAPE_WORDS = ["長い", "短い", "区切り", "足りない", "あふれ", "テープ", "文", "世界", "絵本", "読み方", "long", "short", "part", "tape", "sentence", "world", "picture book", "reading"];

function allowedHere(word: string, input: KohaiInput): boolean {
  return input.kohaiWorld.problem_text.includes(word) || input.statements.some((s) => s.text.includes(word));
}

function sentences(text: string): string[] {
  return text.split(/[。！？!?.]+/).filter((s) => s.trim() !== "");
}

const sameNumber = (a: Rational, b: Rational): boolean => a.num * b.den === b.num * a.den;

/** Numbers that may be said: those the problem writes and those the child said. */
function sayableNumbers(input: KohaiInput): Rational[] {
  return [...numbersIn(input.kohaiWorld.problem_text), ...input.statements.flatMap((s) => numbersIn(s.text)), ...input.childOps.words.flatMap((w) => numbersIn(w))];
}

/** Each holder's count in the junior's world, when the world fixes it. */
function lengthsOf(w: WorldScene): Map<string, Rational> {
  const res = solve(w);
  const out = new Map<string, Rational>();
  if (res.kind !== "unique" && res.kind !== "underdetermined") return out;
  for (const q of w.quantities) {
    const v = res.values.get(q.id);
    if (v !== undefined && !out.has(q.holder)) out.set(q.holder, { num: Number(v.num), den: Number(v.den) });
  }
  return out;
}

/**
 * A sentence that says one tape is longer or shorter is allowed only when the junior's world draws it
 * so: "A ... B より 短い" (or "A ... shorter than B") holds when A is shorter than B there; with one
 * holder, when it is the shortest (or longest) of all.
 */
const FRACTION = /の\s*(\d+\s*\/\s*\d+|\d+\s*分の\s*\d+)/;

/**
 * When a reading line names a holder as the base of a fraction ("Xの3/4", "3/4 of X"), X must be a base
 * in the junior's own world. Otherwise the junior would say the right direction while its world shows
 * the other one (found by the leak judge, 2026-11-07).
 */
function basesMatch(text: string, input: KohaiInput): boolean {
  const w = input.kohaiWorld;
  const holderOf = (id: string | null): string | undefined => w.quantities.find((q) => q.id === id)?.holder;
  const bases = new Set(w.relations.map((r) => holderOf(r.reference)).filter((h): h is string => h !== undefined));
  const labels = w.holders.map((h) => h.label).filter((l) => l !== "");
  for (const h of w.holders) {
    if (h.label === "" || bases.has(h.id)) continue;
    // Japanese: "<label>(の…)の3/4" within the same phrase (not past は, が, 、, 。 or another holder).
    for (let at = text.indexOf(h.label); at !== -1; at = text.indexOf(h.label, at + 1)) {
      let tail = text.slice(at + h.label.length, at + h.label.length + 14);
      const stop = tail.search(/[はが、。,.]/);
      if (stop !== -1) tail = tail.slice(0, stop);
      for (const other of labels) if (other !== h.label && !h.label.includes(other) && tail.includes(other)) tail = tail.slice(0, tail.indexOf(other));
      if (FRACTION.test(tail)) return false;
    }
    // English: "3/4 of (the) <label>".
    const escaped = h.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\d+\\s*/\\s*\\d+\\s+of\\s+(the\\s+)?${escaped}`, "i").test(text)) return false;
  }
  return true;
}

function lengthsMatch(sentence: string, input: KohaiInput): boolean {
  const w = input.kohaiWorld;
  const longer = /長い|長く|\blonger\b|\blong\b/i.test(sentence);
  const shorter = /短い|短く|\bshorter\b|\bshort\b/i.test(sentence);
  if (!longer && !shorter) return true;
  if (longer && shorter) return false;
  const lengths = lengthsOf(w);
  const mentioned = w.holders
    .map((h) => {
      const words = [h.label, ...(input.lang === "en" ? [] : [])];
      const at = Math.min(...words.map((x) => (sentence.includes(x) ? sentence.indexOf(x) : Infinity)));
      return { id: h.id, at };
    })
    .filter((m) => Number.isFinite(m.at))
    .sort((a, b) => a.at - b.at);
  const value = (id: string): number | undefined => {
    const v = lengths.get(id);
    return v === undefined ? undefined : v.num / v.den;
  };
  if (mentioned.length === 0) return false;
  const marker = input.lang === "ja" ? "より" : "than";
  const markAt = sentence.indexOf(marker);
  if (mentioned.length >= 2 && markAt >= 0) {
    // The holder named right before より (or right after "than") is the one compared against.
    const reference = input.lang === "ja" ? [...mentioned].reverse().find((m) => m.at < markAt) : mentioned.find((m) => m.at > markAt);
    const subject = mentioned.find((m) => m.id !== reference?.id);
    const s = subject === undefined ? undefined : value(subject.id);
    const r = reference === undefined ? undefined : value(reference.id);
    if (s === undefined || r === undefined) return false;
    return longer ? s > r : s < r;
  }
  if (mentioned.length !== 1) return false;
  const only = mentioned[0];
  const v = only === undefined ? undefined : value(only.id);
  const all = [...lengths.values()].map((x) => x.num / x.den);
  if (v === undefined || all.length < 2) return false;
  return longer ? v === Math.max(...all) && all.filter((x) => x === v).length === 1 : v === Math.min(...all) && all.filter((x) => x === v).length === 1;
}

/** The gates; an empty list means the utterance may be said (after 指示書 第6.8節, made stricter in review). */
export function kohaiGates(u: KohaiUtterance, input: KohaiInput, gateCtx: GateContext): GateRule[] {
  const out = new Set<GateRule>();
  const text = u.utterance;
  const w = input.kohaiWorld;
  const childLabels = input.childOps.holderIds.map((id) => w.holders.find((h) => h.id === id)?.label ?? "").filter((l) => l !== "");

  // 1: numbers. Only numbers the problem writes or the child said; the "1" card only when restating.
  const spoken = u.intent === "restate" ? text.replace(/「1」|"1"|“1”/g, "") : text;
  const sayable = sayableNumbers(input);
  if (numbersIn(spoken).some((n) => !sayable.some((s) => sameNumber(s, n)))) out.add("answer_leak");
  // 1 and 3: the general gates on top (answers in every notation, operation names, a solvable world).
  const general = gate({ kind: "say", text: spoken }, gateCtx);
  if (!general.ok) {
    if (general.reasons.includes("answer_leak") || general.reasons.includes("unverified")) out.add("answer_leak");
    if (general.reasons.includes("operation_name")) out.add("operation_name");
  }
  // 2: words that could point to the right reading, unless the problem itself uses them; lengths only as drawn.
  for (const m of text.matchAll(RELATION_WORDS)) if (!allowedHere(m[0], input)) out.add("relation_word");
  for (const s of sentences(text)) if (!lengthsMatch(s, input)) out.add("relation_word");
  if (u.intent === "read" && !basesMatch(text, input)) out.add("relation_word");
  // 4, 5, 10, and the child's reading put in the junior's mouth.
  if (JUDGING.test(text)) out.add("judging");
  if (FEELING.test(text)) out.add("feeling");
  if (MIND.test(text)) out.add("mind");
  if (ATTRIBUTION.test(text)) out.add("attribution");
  // 6: only the elements of the problem, the world's shape, and the picture book; never about the child.
  const names = [...w.holders.map((h) => h.label), ...w.item_kinds.map((k) => k.noun)];
  if (ABOUT_THE_CHILD.test(text)) out.add("off_topic");
  if (![...names, ...SHAPE_WORDS].some((n) => text.toLowerCase().includes(n.toLowerCase())) && !input.statements.some((s) => text.includes(s.text))) {
    out.add("off_topic");
  }
  // 7: refers_to names real elements; a sentence about the "1" card or about why names only the child's move.
  const ids = new Set([...w.holders, ...w.item_kinds, ...w.quantities, ...w.relations, ...w.events].map((x) => x.id));
  const statementIds = new Set(input.statements.map((s) => `s_${s.index}`));
  if (u.refers_to.some((id) => !ids.has(id) && !statementIds.has(id))) out.add("refers_to");
  const holderOf = (id: string): string => w.quantities.find((q) => q.id === id)?.holder ?? id;
  const aboutMove = /「1」|"1"|どうして|なんで|なぜ|\bwhy\b/i.test(text);
  if (aboutMove) {
    const named = w.holders.filter((h) => text.includes(h.label)).map((h) => h.id);
    const referred = u.refers_to.map(holderOf).filter((id) => id.startsWith("h_"));
    if ([...named, ...referred].some((h) => !input.childOps.holderIds.includes(h))) out.add("refers_to");
  }
  if (u.intent === "restate") {
    const holders = u.refers_to.map(holderOf).filter((id) => id.startsWith("h_"));
    if (holders.length === 0 || holders.some((h) => !input.childOps.holderIds.includes(h))) out.add("refers_to");
  }
  // 8: kanji a child of the fourth grade can read (those of the problem and its names, and a few the
  // junior needs; safe side, no full grade table), short, in the asked language.
  const known = new Set([...w.problem_text, ...input.statements.flatMap((s) => [...s.text]), ...names.join(""), ...COMMON_KANJI]);
  if ([...text].some((c) => /[一-鿿]/.test(c) && !known.has(c))) out.add("length");
  if ([...text].length > MAX_CHARS || sentences(text).length > 2) out.add("length");
  const hasKana = /[぀-ヿ]/.test(text);
  if (u.lang !== input.lang || (input.lang === "ja" && !hasKana) || (input.lang === "en" && /[぀-ヿ一-鿿]/.test(text))) out.add("length");
  // 9: the intent asked for, in the shape it needs. Restating holds only the holder's name, the "1"
  // card and the child's words, and always asks the child to check.
  if (u.intent !== input.intent) out.add("intent_shape");
  const asks = /[？?]\s*$/.test(text);
  if (u.intent === "read" && asks) out.add("intent_shape");
  if (u.intent === "which" && !asks) out.add("intent_shape");
  if (u.intent === "restate") {
    let rest = text;
    for (const s of [...childLabels, ...input.childOps.words].filter((x) => x !== "")) rest = rest.split(s).join("");
    rest = rest.replace(/「1」|"1"|“1”/g, "");
    const frame =
      input.lang === "ja"
        ? /^[\sにがはを、。,]*ですね[、。\s]*合って(い)?ますか[？?\s]*$/
        : /^[\s,.]*(is|on|the|goes|card|so|you|put)*[\s,.]*(is that right|right)\s*\?\s*$/i;
    const restEn = rest.replace(/\b(is|on|the|goes|card|so|you|put)\b/gi, "");
    if (!asks || !frame.test(input.lang === "ja" ? rest : restEn)) out.add("intent_shape");
  }
  return [...out];
}

export const KOHAI_SYSTEM = [
  "You are the junior in a math app: you read a word problem and built the world shown, and you ask the child (your senior) about it.",
  "Write one or two short sentences, at most 40 characters, in the asked language, for the given intent only.",
  "read: say plainly that this is how you read it. which: ask which sentence does not fit, naming the sentence's words and the shape of your own world (long, short, parts). restate: repeat only the holder the child chose and the child's own words, and ask if that is right.",
  "Never say a number that is not written in the problem, never name an operation, never say what is right or wrong, never praise or thank, and never talk about feelings, yourself, or the child.",
].join("\n");

function templateFor(input: KohaiInput): string {
  const key = input.intent === "read" ? "kohai.read" : input.intent === "which" ? "kohai.which" : "kohai.restate";
  const holder = input.childOps.holderIds[0];
  if (key === "kohai.restate") {
    if (holder === undefined || !input.kohaiWorld.holders.some((h) => h.id === holder)) return render("kohai.which_first", input.lang, 0, {}).text;
    return render(key, input.lang, 0, { holder: holderName(input.kohaiWorld, holder) }).text;
  }
  return render(key, input.lang, 0, {}).text;
}

/** What the generator is given: the junior's world without the asked value (of any kind), the sentences, the child's move. */
function generatorContext(input: KohaiInput): string {
  const q = input.kohaiWorld.question;
  const asked = (id: string): boolean => id === q.target_id;
  const world = {
    ...input.kohaiWorld,
    quantities: input.kohaiWorld.quantities.map((x) => (q.target_type === "quantity" && asked(x.id) ? { ...x, value: null } : x)),
    relations: input.kohaiWorld.relations.map((x) => (q.target_type === "relation_amount" && asked(x.id) ? { ...x, amount: null } : x)),
    events: input.kohaiWorld.events.map((x) => (q.target_type === "event_amount" && asked(x.id) ? { ...x, amount: null } : x)),
  };
  return JSON.stringify({ world, statements: input.statements.map((s) => ({ index: s.index, text: s.text })) });
}

export async function kohai(
  input: KohaiInput,
  client: ClaudeClient,
  gateCtx: GateContext,
  opts: { timeoutMs?: number } = {},
): Promise<{ text: string; source: "generated" | "template"; rejected: GateRule[] }> {
  const fallback = (rejected: GateRule[]) => ({ text: templateFor(input), source: "template" as const, rejected });
  try {
    const schema = z.toJSONSchema(schemas.kohaiUtterance, { target: "draft-2020-12" }) as Record<string, unknown>;
    const res = await withDeadline(opts.timeoutMs ?? KOHAI_TIMEOUT_MS, (signal) =>
      client.complete({
        model: MODELS.kohai,
        system: KOHAI_SYSTEM,
        cachedContext: generatorContext(input),
        userText: JSON.stringify({
          intent: input.intent,
          lang: input.lang,
          child_move: { holders: input.childOps.holderIds, words: input.childOps.words },
          ...(input.intent === "which" && input.failing !== undefined ? { sentences_that_do_not_fit: input.failing } : {}),
        }),
        schema,
        effort: "low",
        maxTokens: 1000,
        signal,
      }),
    );
    if (res === "timeout" || res.stopReason !== "end_turn") return fallback([]);
    const parsed = schemas.kohaiUtterance.safeParse(JSON.parse(res.text));
    if (!parsed.success || parsed.data.intent !== input.intent) return fallback(["intent_shape"]);
    const rejected = kohaiGates(parsed.data, input, gateCtx);
    if (rejected.length > 0) return fallback(rejected);
    return { text: parsed.data.utterance, source: "generated", rejected: [] };
  } catch {
    return fallback([]);
  }
}
