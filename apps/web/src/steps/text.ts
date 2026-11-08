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
  /** The solved screen (user request, 2026-11-08): a clear 「せいかい！」 and the child's answer, for the sense of having done it. */
  cheer: { title: string; line: (target: string, value: string) => string };
  /** How a percent off becomes the fraction kept (20%引き → 4/5), said before one part is asked. */
  percent: (percent: number, parts: number, kept: number) => string;
  nextProblem: string;
  /** Under the relation's buttons: the child may say or type why (the words go to Claude, core checks what comes back). */
  voiceLead: string;
  /** Nothing usable came back from the words: the buttons still choose (no dead end). */
  voiceMiss: string;
  /** What was understood from the child's words, on top of the next screen: a restatement only, never a judgement. */
  heard: (holder: string, noun: string) => string;
  /** The voice panel's notes on this screen, where the buttons (not the card) are the other way. */
  voiceNotes: { unsupported: string; denied: string; off: string };
  /**
   * Money (Q63): the holders are things (定価, 代金), not people, and the picture draws coins while the questions stay
   * in the problem's unit. What one coin is worth is said wherever coins are drawn; a count of coins is said in coins.
   */
  /** The child's own dealing for one part (user request, 2026-11-08): plate labels, the pool, and when all are equal. */
  deal: { label: string; plate: (whole: string, part: string) => string; pool: (n: string) => string; equal: (parts: number) => string; how: string };
  money: {
    note: (coinNoun: string, coinCounter: string, worth: number, counter: string) => string;
    fact: (holder: string, counter: string) => string;
    relation: (subject: string) => string;
    misread: (chosen: string) => string;
    misreadCount: (holder: string, coinNoun: string, wholes: number, coinCounter: string, cut: boolean) => string;
    heard: (holder: string) => string;
  };
}

const JA: StepsText = {
  label: "もんだい",
  progress: (i, n) => `${String(i)} / ${String(n)}`,
  fact: (holder, noun, counter) => `${holder}の ${noun}は、なん${counter}？`,
  factHint: "文の中の 数を 見てみてね。",
  relation: (subject, noun) => `${subject}の ${noun}は、だれの ${noun}と くらべている？`,
  relationHint: (ratio) => `「${ratio}」は、だれの 数と くらべた 大きさかな。文を よく 見てみてね。`,
  unknown: "わからない",
  misread: (chosen, noun) => `AIくんが ${chosen}の ${noun}と くらべて 読むと、こうなっちゃう。問題と あうかな？`,
  misreadCount: (holder, noun, wholes, counter, cut) => `${holder}の ${noun}は ${String(wholes)}${counter}${cut ? `と、1${counter}に たりない ${noun}` : ""}。`,
  again: "もういちど えらぶ",
  explain: (num, den) => `「${String(num)}/${String(den)}」は、${String(den)}つに わけた うちの ${String(num)}つぶん、ということ。`,
  unitWhole: (holder, n, counter, parts) => `${holder}の ${n}${counter}を ${String(parts)}つに わけると、1つぶんは なん${counter}？`,
  unitPart: (holder, n, counter, parts) => `${holder}の ${n}${counter}は、${String(parts)}つぶん。1つぶんは なん${counter}？`,
  unitHelp: (counter) => `おさらに 1つずつ くばったよ。1つの おさらに なん${counter}？`,
  total: (target, parts, counter) => `${target}は、${String(parts)}つぶん。なん${counter}？`,
  totalHelp: (parts) => `1つの おさらの 数を、${String(parts)}こ ぶん あわせてみてね。`,
  pad: "こたえ",
  solved: "この問題は、ここまで。",
  cheer: { title: "せいかい！", line: (target, value) => `${target}は ${value}。じぶんで たしかめられたね！` },
  percent: (percent, parts, kept) => `「${String(percent)}%」は、${String(parts)}つに わけた うちの 1つぶん。「${String(percent)}%引き」は、そこから 1つぶん へらすから、${String(parts)}つに わけた うちの ${String(kept)}つぶん（${String(kept)}/${String(parts)}）。`,
  held: "この問題は、また あとで やってみよう。",
  nextProblem: "つぎの問題へ",
  voiceLead: "ことばで こたえても いいよ",
  voiceMiss: "うまく 聞きとれなかったよ。ボタンでも えらべるよ",
  // What AI-kun took the words as, said as AI-kun's own taking, never as the child's words (safety review).
  heard: (holder, noun) => `AIくんは、「${holder}の ${noun}と くらべる」と うけとったよ。`,
  voiceNotes: {
    unsupported: "このブラウザでは、声は使えません。ボタンで えらんでね。",
    denied: "マイクが使えないので、ボタンで えらんでね。",
    off: "いまは、声は使えません。ボタンで えらんでね。",
  },
  deal: {
    label: "おさら",
    plate: (whole, part) => `${whole}のうち ${part}`,
    pool: (n) => `のこり ${n}`,
    equal: (parts) => `${String(parts)}つの おさらが 同じに なったね！`,
    how: "ドラッグか、タップで えらんで おさらを タップすると、うごかせるよ。",
  },
  money: {
    note: (coinNoun, coinCounter, worth, counter) => `絵の ${coinNoun} 1${coinCounter}は ${String(worth)}${counter}。`,
    fact: (holder, counter) => `${holder}は、なん${counter}？`,
    relation: (subject) => `${subject}は、どちらと くらべている？`,
    misread: (chosen) => `AIくんが ${chosen}と くらべて 読むと、こうなっちゃう。問題と あうかな？`,
    misreadCount: (holder, coinNoun, wholes, coinCounter, cut) => `${holder}は ${coinNoun} ${String(wholes)}${coinCounter}${cut ? `と、1${coinCounter}に たりない ${coinNoun}` : ""}。`,
    heard: (holder) => `AIくんは、「${holder}と くらべる」と うけとったよ。`,
  },
};

const EN: StepsText = {
  label: "Problem",
  progress: (i, n) => `${String(i)} / ${String(n)}`,
  fact: (holder, noun, counter) => `How many ${noun} (${counter}) does ${holder} have?`,
  factHint: "Look at the number in the sentence.",
  relation: (subject, noun) => `${subject}'s ${noun}: whose ${noun} is it compared with?`,
  relationHint: (ratio) => `"${ratio}" is the size compared with whose number? Read the sentence again.`,
  unknown: "I don't know",
  misread: (chosen, noun) => `If AI-kun reads it comparing with ${chosen}'s ${noun}, this happens. Does it fit the problem?`,
  misreadCount: (holder, noun, wholes, counter, cut) => `${holder}'s ${noun}: ${String(wholes)} ${counter}${cut ? ` and a part of one` : ""}.`,
  again: "Choose again",
  explain: (num, den) => `"${String(num)}/${String(den)}" means ${String(num)} of ${String(den)} equal parts.`,
  unitWhole: (holder, n, counter, parts) => `Split ${holder}'s ${n} ${counter} into ${String(parts)} parts. How many in one part?`,
  unitPart: (holder, n, counter, parts) => `${holder}'s ${n} ${counter} are ${String(parts)} parts. How many in one part?`,
  unitHelp: (counter) => `They are dealt onto the plates one by one. How many ${counter} on one plate?`,
  total: (target, parts, counter) => `${target} has ${String(parts)} parts. How many ${counter}?`,
  totalHelp: (parts) => `Put together what one plate has, ${String(parts)} times.`,
  pad: "Answer",
  solved: "That is this problem done.",
  cheer: { title: "That's it!", line: (target, value) => `${target}: ${value}. You checked it yourself!` },
  percent: (percent, parts, kept) => `"${String(percent)}%" is 1 of ${String(parts)} equal parts. "${String(percent)}% off" takes 1 part away, so ${String(kept)} of ${String(parts)} parts are left (${String(kept)}/${String(parts)}).`,
  held: "Let's try this problem again later.",
  nextProblem: "Next problem",
  voiceLead: "You can also answer in words.",
  voiceMiss: "I could not catch that. You can choose with the buttons too.",
  heard: (holder, noun) => `AI-kun took it as: compared with ${holder}'s ${noun}.`,
  voiceNotes: {
    unsupported: "Talking does not work in this browser. Choose with the buttons.",
    denied: "The microphone is not available. Choose with the buttons.",
    off: "Talking does not work right now. Choose with the buttons.",
  },
  deal: {
    label: "Plates",
    plate: (whole, part) => `${part} of ${whole}`,
    pool: (n) => `Left over: ${n}`,
    equal: (parts) => `All ${String(parts)} plates are the same now!`,
    how: "Drag one, or tap one and then tap a plate, to move it.",
  },
  money: {
    note: (coinNoun, _coinCounter, worth, counter) => `In the picture, one ${coinNoun} is ${String(worth)}${counter}.`,
    fact: (holder, counter) => `How much is ${holder} (${counter})?`,
    relation: (subject) => `${subject}: which is it compared with?`,
    misread: (chosen) => `If AI-kun reads it comparing with ${chosen}, this happens. Does it fit the problem?`,
    misreadCount: (holder, coinNoun, wholes, _coinCounter, cut) => `${holder}: ${String(wholes)} ${coinNoun}${cut ? ` and a part of one` : ""}.`,
    heard: (holder) => `AI-kun took it as: compared with ${holder}.`,
  },
};

export const stepsText = (lang: Lang): StepsText => (lang === "en" ? EN : JA);
