// The child's name on the screen (Q60). The festival problem's child is a placeholder name in core
// (FESTIVAL_PLACEHOLDER); the screen shows the name the child typed in its place. The name is display only: it is
// kept on this device (the store's settings, removed with everything else from the grown-up's screen) and is put
// into the view just before it is drawn, never into the session, so nothing the session sends ever holds it.
import { FESTIVAL_PLACEHOLDER, festivalRecord, festivalWholeRecord, hasDistressWord, hasOperationName, numbersIn } from "@kimi/core";
import { hasForbiddenPhrase } from "./text.ts";
import { DONT_KNOW_WORDS, STOP_WORDS } from "./spoken.ts";

/** How long a name may be (characters). */
export const NAME_MAX = 10;

/** Hiragana for katakana (and back), so a name and the words heard meet in either kana. */
const toHiragana = (s: string): string => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const toKatakana = (s: string): string => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

/** The words of the festival problem: a name that is one of them would read as part of the problem. */
const PROBLEM_WORDS: ReadonlySet<string> = new Set([
  // Both festival stories of the child's route (Q60, Q62).
  ...[festivalRecord, festivalWholeRecord].flatMap((r) => [
    ...r.statements.flatMap((x) => x.tokens),
    ...r.world.holders.map((h) => h.label),
    ...r.world.item_kinds.map((k) => k.noun),
  ]),
]);

/**
 * The name as the screen may show it, or null. Only letters (kana, kanji, latin) and the long-vowel mark, 2 to
 * NAME_MAX characters, no spaces. The name is drawn into the problem and AI-kun's lines without the gate, so it may
 * not say a number (in any form core reads), an operation, a word of distress, a stop or "I don't know" word, or a
 * word of the problem (safety review, 2026-11-08, Q60).
 */
export function cleanName(raw: string): string | null {
  const s = raw.trim();
  const n = [...s].length;
  if (n < 2 || n > NAME_MAX) return null;
  if (!/^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}A-Za-zー々]+$/u.test(s)) return null;
  if (numbersIn(s).length > 0 || hasOperationName(s) || hasForbiddenPhrase(s) || hasDistressWord(s)) return null;
  const folded = toHiragana(s.normalize("NFKC").toLowerCase());
  if ([...STOP_WORDS, ...DONT_KNOW_WORDS].some((w) => folded.includes(toHiragana(w.toLowerCase())))) return null;
  if (PROBLEM_WORDS.has(s) || PROBLEM_WORDS.has(toHiragana(s)) || PROBLEM_WORDS.has(toKatakana(s))) return null;
  return s;
}

/** A copy of a view with the child's name where the placeholder was; the gate context is left as core wrote it. */
export function namedView<T>(view: T, name: string | null): T {
  if (name === null) return view;
  const walk = (x: unknown, key: string | null): unknown => {
    if (key === "gate") return x;
    if (typeof x === "string") return x.includes(FESTIVAL_PLACEHOLDER) ? x.replaceAll(FESTIVAL_PLACEHOLDER, name) : x;
    if (Array.isArray(x)) return x.map((y) => walk(y, null));
    if (x !== null && typeof x === "object" && Object.getPrototypeOf(x) === Object.prototype) {
      return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, walk(v, k)]));
    }
    return x;
  };
  return walk(view, null) as T;
}

/**
 * The child's words with the placeholder where the child said or typed the name (Q60): what the child says about
 * "ゆい" is about the problem's child, and the name itself never leaves the screen in the words sent. Speech
 * recognition may write a kana name in the other kana: both are put back. The words are checked for distress on
 * the device before this (session.hear), so a name can never hide a cry for help.
 */
export function unnamed(text: string, name: string | null): string {
  if (name === null) return text;
  return [name, toHiragana(name), toKatakana(name)].reduce((t, n) => t.replaceAll(n, FESTIVAL_PLACEHOLDER), text);
}
