// A short fixed list of words the child may say to stop or to say "I don't know" while the mic is on. They are
// handled on the device, before any request: the child can always stop (指示書 第1節), and these words are never
// sent to /interpret. Only a whole utterance counts (「やめるのはまだ」 is not a stop word).

export type SpokenCommand = "stop" | "dont_know";

const STOP_WORDS = ["やめる", "やめたい", "やめます", "止める", "辞める", "おわり", "おわる", "終わり", "終わる", "stop", "quit"];
const DONT_KNOW_WORDS = ["わからない", "分からない", "わかんない", "分かんない", "わかりません", "分かりません", "idontknow", "dontknow"];

/** The words folded for the comparison: no spaces, punctuation or apostrophes, lower case, full-width folded. */
function fold(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}’'`]/gu, "");
}

/** The command a whole utterance is, or null. */
export function spokenCommand(text: string): SpokenCommand | null {
  const said = fold(text);
  if (said === "") return null;
  if (STOP_WORDS.includes(said)) return "stop";
  if (DONT_KNOW_WORDS.includes(said)) return "dont_know";
  return null;
}
