// The child's name on the screen (Q60). The festival problem's child is a placeholder name in core
// (FESTIVAL_PLACEHOLDER); the screen shows the name the child typed in its place. The name is display only: it is
// kept on this device (the store's settings, removed with everything else from the grown-up's screen) and is put
// into the view just before it is drawn, never into the session, so nothing the session sends ever holds it.
import { FESTIVAL_PLACEHOLDER } from "@kimi/core";

/** How long a name may be (characters). */
export const NAME_MAX = 10;

/**
 * The name as the screen may show it, or null. Only letters (kana, kanji, latin) and the long-vowel mark, no
 * digits or marks (a number in a name would read as part of the problem), no spaces, at most NAME_MAX characters.
 */
export function cleanName(raw: string): string | null {
  const s = raw.trim();
  if (s === "" || [...s].length > NAME_MAX) return null;
  return /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}A-Za-zー々]+$/u.test(s) ? s : null;
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
 * "ゆい" is about the problem's child, and the name itself never leaves the screen in the words sent.
 */
export function unnamed(text: string, name: string | null): string {
  return name === null ? text : text.replaceAll(name, FESTIVAL_PLACEHOLDER);
}
