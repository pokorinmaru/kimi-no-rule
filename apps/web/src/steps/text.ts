// The words of the problem one sentence at a time (Q62). Short, in hiragana where a child may not read the kanji
// (the problem's own words keep their kanji and the problem's furigana). One question per screen. No word says right
// or wrong about the child, and nothing pins a way of reading on the child (原則10): another reading is drawn as
// "if we compare with …".
import type { Lang } from "@kimi/core";

export interface StepsText {
  label: string;
  progress: (i: number, n: number) => string;
  fact: (holder: string, noun: string, counter: string) => string;
  factHint: string;
  relation: (subject: string, noun: string) => string;
  relationHint: (ratio: string) => string;
  unknown: string;
  misread: (chosen: string, noun: string) => string;
  /** What the other reading makes of the asked holder: whole things, and a cut one when the count is not whole. */
  misreadCount: (holder: string, noun: string, wholes: number, counter: string, cut: boolean) => string;
  again: string;
  /** What p/q means, once the child has found who is compared with. */
  explain: (num: number, den: number) => string;
  /** One part when the known count is the whole (split into den parts). */
  unitWhole: (holder: string, n: string, counter: string, parts: number) => string;
  /** One part when the known count is num parts. */
  unitPart: (holder: string, n: string, counter: string, parts: number) => string;
  unitHelp: (counter: string) => string;
  total: (target: string, parts: number, counter: string) => string;
  totalHelp: (parts: number) => string;
  pad: string;
  solved: string;
  held: string;
  nextProblem: string;
}

const JA: StepsText = {
  label: "もんだい",
  progress: (i, n) => `${String(i)} / ${String(n)}`,
  fact: (holder, noun, counter) => `${holder}の ${noun}は、なん${counter}？`,
  factHint: "文の中の 数を 見てみてね。",
  relation: (subject, noun) => `${subject}の ${noun}は、だれの ${noun}と くらべている？`,
  relationHint: (ratio) => `「だれかの ${ratio}」の ことばを さがしてみてね。`,
  unknown: "わからない",
  misread: (chosen, noun) => `もし ${chosen}の ${noun}と くらべると、こうなっちゃう。問題と あうかな？`,
  misreadCount: (holder, noun, wholes, counter, cut) => `${holder}の ${noun}は ${String(wholes)}${counter}${cut ? `と、きれた ${noun}` : ""}。`,
  again: "もういちど えらぶ",
  explain: (num, den) => `「${String(num)}/${String(den)}」は、${String(den)}つに わけた うちの ${String(num)}つぶん、ということ。`,
  unitWhole: (holder, n, counter, parts) => `${holder}の ${n}${counter}を ${String(parts)}つに わけると、1つぶんは なん${counter}？`,
  unitPart: (holder, n, counter, parts) => `${holder}の ${n}${counter}は、${String(parts)}つぶん。1つぶんは なん${counter}？`,
  unitHelp: (counter) => `おさらに 1つずつ くばったよ。1つの おさらに なん${counter}？`,
  total: (target, parts, counter) => `${target}は、${String(parts)}つぶん。なん${counter}？`,
  totalHelp: (parts) => `${String(parts)}つぶんの おさらを かぞえてみてね。`,
  pad: "こたえ",
  solved: "この問題は、ここまで。",
  held: "この問題は、また あとで やってみよう。",
  nextProblem: "つぎの問題へ",
};

const EN: StepsText = {
  label: "Problem",
  progress: (i, n) => `${String(i)} / ${String(n)}`,
  fact: (holder, noun, counter) => `How many ${noun} (${counter}) does ${holder} have?`,
  factHint: "Look at the number in the sentence.",
  relation: (subject, noun) => `${subject}'s ${noun}: whose ${noun} is it compared with?`,
  relationHint: (ratio) => `Look for the words "someone's ${ratio}".`,
  unknown: "I don't know",
  misread: (chosen, noun) => `If we compare with ${chosen}'s ${noun}, this happens. Does it fit the problem?`,
  misreadCount: (holder, noun, wholes, counter, cut) => `${holder}'s ${noun}: ${String(wholes)} ${counter}${cut ? ` and a cut ${noun}` : ""}.`,
  again: "Choose again",
  explain: (num, den) => `"${String(num)}/${String(den)}" means ${String(num)} of ${String(den)} equal parts.`,
  unitWhole: (holder, n, counter, parts) => `Split ${holder}'s ${n} ${counter} into ${String(parts)} parts. How many in one part?`,
  unitPart: (holder, n, counter, parts) => `${holder}'s ${n} ${counter} are ${String(parts)} parts. How many in one part?`,
  unitHelp: (counter) => `They are dealt onto the plates one by one. How many ${counter} on one plate?`,
  total: (target, parts, counter) => `${target} has ${String(parts)} parts. How many ${counter}?`,
  totalHelp: (parts) => `Count the plates of ${String(parts)} parts.`,
  pad: "Answer",
  solved: "That is this problem done.",
  held: "Let's try this problem again later.",
  nextProblem: "Next problem",
};

export const stepsText = (lang: Lang): StepsText => (lang === "en" ? EN : JA);
