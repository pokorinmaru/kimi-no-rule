// M1b: the junior's words (指示書 第6.8節). The fixed sentences are the default; Claude only adds a
// sentence made for this world, and only after ten gates. The generator never sees the correct world,
// whether the child is right, the research hypotheses, or the child's own transcript, so it cannot leak
// what it does not know. Only the kinds of rejection are kept, never the text.
import { z } from "zod";
import {
  gate,
  holderName,
  render,
  schemas,
  type GateContext,
  type KohaiUtterance,
  type ProblemRecord,
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
  | "mind";

export const KOHAI_TIMEOUT_MS = 4000;
/** Kanji the junior may use besides those of the problem (all taught by the fourth grade). */
const COMMON_KANJI = "足文世界読方合長短区切何見前後先輩数人上下大小多少中字今度話問題";
const MAX_CHARS = 40;

const RELATION_WORDS = /のはず|はずです|はずだ|本当は|ほんとうは|ほんとは|半分|倍|同じ|\bshould\b|\bactually\b|\breally\b|\bhalf\b|\btimes\b|\bsame\b|\btwice\b|\bdouble\b/i;
const JUDGING = /正しい|ただしい|間違|まちが|惜しい|おしい|すごい|さすが|ほんとに|本当に|えー|せいかい|正解|\bcorrect\b|\bwrong\b|\bright answer\b|\bclose\b|\bgreat\b|\bawesome\b|\bgood\b|\breally\?/i;
const FEELING = /うれしい|嬉しい|さみしい|寂しい|また来て|好き|すき|友だち|ともだち|友達|先輩も|\bhappy\b|\bsad\b|\blonely\b|\bfriend|\blove\b|\blike you\b|\bmiss you\b|come back/i;
const MIND = /と思|思う|思い|気が(する|します|して|した)|感じ|わかる気|\bI think\b|\bI feel\b|\bI guess\b|\bI believe\b|seems to me/i;
/** Words for the shape of the junior's own world, which is already on the screen. */
const SHAPE_WORDS = ["長い", "短い", "区切り", "足りない", "あふれ", "テープ", "文", "世界", "絵本", "読み方", "long", "short", "part", "tape", "sentence", "world", "picture book", "reading"];

function allowedHere(word: string, input: KohaiInput): boolean {
  return input.kohaiWorld.problem_text.includes(word) || input.statements.some((s) => s.text.includes(word));
}

function sentences(text: string): string[] {
  return text.split(/[。！？!?.]+/).filter((s) => s.trim() !== "");
}

/** The ten gates; an empty list means the utterance may be said (指示書 第6.8節). */
export function kohaiGates(u: KohaiUtterance, input: KohaiInput, gateCtx: GateContext): GateRule[] {
  const out = new Set<GateRule>();
  const text = u.utterance;
  const w = input.kohaiWorld;

  // 1 and 3: the general gates (numbers in every notation, kana readings included; operation names).
  const general = gate({ kind: "say", text }, gateCtx);
  if (!general.ok) {
    if (general.reasons.includes("answer_leak")) out.add("answer_leak");
    if (general.reasons.includes("operation_name")) out.add("operation_name");
    if (general.reasons.includes("unverified")) out.add("answer_leak");
  }
  // 2: words that could point to the right direction, unless the problem itself uses them.
  for (const m of text.matchAll(new RegExp(RELATION_WORDS.source, "gi"))) if (!allowedHere(m[0], input)) out.add("relation_word");
  // 4, 5, 10: judging, feelings and a mind.
  if (JUDGING.test(text)) out.add("judging");
  if (FEELING.test(text)) out.add("feeling");
  if (MIND.test(text)) out.add("mind");
  // 6: only the elements of the problem, the world's shape, and the picture book.
  const names = [...w.holders.map((h) => h.label), ...w.item_kinds.map((k) => k.noun)];
  if (![...names, ...SHAPE_WORDS].some((n) => text.toLowerCase().includes(n.toLowerCase())) && !input.statements.some((s) => text.includes(s.text))) {
    out.add("off_topic");
  }
  // 7: refers_to names real elements, and a sentence about the child's move names the child's move.
  const ids = new Set([...w.holders, ...w.item_kinds, ...w.quantities, ...w.relations, ...w.events].map((x) => x.id));
  const statementIds = new Set(input.statements.map((s) => `s_${s.index}`));
  if (u.refers_to.some((id) => !ids.has(id) && !statementIds.has(id))) out.add("refers_to");
  if (u.intent === "restate") {
    const holderOf = (id: string): string => w.quantities.find((q) => q.id === id)?.holder ?? id;
    const holders = u.refers_to.map(holderOf).filter((id) => id.startsWith("h_"));
    if (holders.length === 0 || holders.some((h) => !input.childOps.holderIds.includes(h))) out.add("refers_to");
  }
  // 8: kanji a child of the fourth grade can read: those of the problem and its names, and a few the
  // junior needs. Anything else falls back to a fixed sentence (safe side; no full grade table here).
  const known = new Set([...w.problem_text, ...input.statements.flatMap((s) => [...s.text]), ...names.join(""), ...COMMON_KANJI]);
  if ([...text].some((c) => /[一-鿿]/.test(c) && !known.has(c))) out.add("length");
  // 8: short, in the asked language.
  if ([...text].length > MAX_CHARS || sentences(text).length > 2 || u.intent !== u.intent) out.add("length");
  const hasKana = /[぀-ヿ]/.test(text);
  if (u.lang !== input.lang || (input.lang === "ja" && !hasKana) || (input.lang === "en" && /[぀-ヿ一-鿿]/.test(text))) out.add("length");
  // 9: the shape of each intent. A restating sentence holds only the holder's name, the "1" card and the child's words.
  // 9: the intent asked for, in the shape it needs.
  if (u.intent !== input.intent) out.add("intent_shape");
  const asks = /[？?]\s*$/.test(text);
  if (u.intent === "read" && asks) out.add("intent_shape");
  if (u.intent === "which" && !asks) out.add("intent_shape");
  if (u.intent === "restate") {
    const childHolders = input.childOps.holderIds.map((id) => w.holders.find((h) => h.id === id)?.label ?? "");
    let rest = text;
    for (const s of [...childHolders, ...input.childOps.words].filter((x) => x !== "")) rest = rest.split(s).join("");
    rest = rest.replace(/「1」|"1"|\b1\b|1/g, "");
    const frame = input.lang === "ja" ? /^[\sにがはを、。,]*(ですね)?[、。\s]*(合って(い)?ますか)?[？?\s]*$/ : /^[\s,.]*(is|on|the|goes|card|right|that|it|so)*[\s,.]*(right|is that right)?[?\s]*$/i;
    if (!asks || !frame.test(rest.replace(/\b(is|on|the|goes|card|right|that|it|so)\b/gi, ""))) out.add("intent_shape");
  }
  return [...out];
}

export const KOHAI_SYSTEM = [
  "You are the junior in a math app: you read a word problem and built the world shown, and you ask the child (your senior) about it.",
  "Write one or two short sentences, at most 40 characters, in the asked language, for the given intent only.",
  "read: say plainly that this is how you read it. which: ask which sentence does not fit, naming the sentence's words and the shape of your own world (long, short, parts). restate: repeat only the holder the child chose and the child's own words, and ask if that is right.",
  "Never say a number that is not written in the problem, never name an operation, never say what is right or wrong, never praise or thank, and never talk about feelings or yourself.",
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

/** What the generator is given: the junior's world without the asked value, the sentences, the child's move. */
function generatorContext(input: KohaiInput): string {
  const q = input.kohaiWorld.question;
  const world = {
    ...input.kohaiWorld,
    quantities: input.kohaiWorld.quantities.map((x) => (q.target_type === "quantity" && x.id === q.target_id ? { ...x, value: null } : x)),
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
        maxTokens: 300,
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
