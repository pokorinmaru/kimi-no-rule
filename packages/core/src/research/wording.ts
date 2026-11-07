// The wording of a transfer problem (指示書 第6.7節 手順6). After a child fixes a reading, one transfer problem
// keeps the relation words of the fixed problem and one uses another known phrasing, to see whether the fix
// holds beyond a cue word. Which phrasings a text uses is decided here, by the program. Pure functions only.

export type WordingCueId = "ni_taishite" | "wo_ichi_to_miru" | "wo_moto_ni_suru" | "no_wariai_wa";

/** The known phrasings around a fraction used as a multiple, other than the plain の. */
export const TRANSFER_CUES: readonly { id: WordingCueId; words: readonly string[] }[] = [
  { id: "ni_taishite", words: ["に対して"] },
  { id: "wo_ichi_to_miru", words: ["を1とみる", "を1と見る"] },
  { id: "wo_moto_ni_suru", words: ["をもとにする", "を元にする"] },
  { id: "no_wariai_wa", words: ["の割合は"] },
];

const flat = (text: string): string => text.replace(/\s+/g, "").replace(/１/g, "1");

/** The known phrasings the text uses, in the order of TRANSFER_CUES; none for a text with the plain の only. */
export function wordingCues(text: string): WordingCueId[] {
  const t = flat(text);
  return TRANSFER_CUES.filter((c) => c.words.some((w) => t.includes(w))).map((c) => c.id);
}

export type WordingTag = "same" | "different" | "neither";

/**
 * "same": the text uses exactly the phrasings of the fixed text (both plain counts). "different": it uses at
 * least one known phrasing and none of the fixed text's. Anything else is "neither".
 */
export function wordingTag(fixedText: string, text: string): WordingTag {
  const fixed = wordingCues(fixedText);
  const mine = wordingCues(text);
  if (fixed.length === mine.length && fixed.every((c) => mine.includes(c))) return "same";
  if (mine.length > 0 && mine.every((c) => !fixed.includes(c))) return "different";
  return "neither";
}
