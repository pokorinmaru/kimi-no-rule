// M1 step (8): the fixed sentences of the guide and the junior (keys and roles after 指示書 第5.6節).
// Every key has three or more ways of saying it in Japanese and English. Slots take only values checked
// against the world; the child's own words go in as an echo. The sentences never name an operation,
// never judge, and the junior never thanks or praises. Every rendered sentence still goes through the gates.
import type { Rational } from "../schema/common.ts";
import type { WorldScene } from "../schema/world-scene.ts";
import { eq, fromSchema } from "../rational/index.ts";
import { numbersIn } from "../gates/index.ts";
import { markRendered } from "../gates/template-mark.ts";

export type Lang = "ja" | "en";
export type SlotKind = "holder" | "item" | "number" | "transcript";

declare const SLOT: unique symbol;
export type Slot<K extends SlotKind> = { readonly kind: K; readonly text: string; readonly [SLOT]: true };
const made = new WeakSet<object>();

function slot<K extends SlotKind>(kind: K, text: string): Slot<K> {
  const s = Object.freeze({ kind, text }) as Slot<K>;
  made.add(s);
  return s;
}

/** A holder of the world, by its label. */
export function holderName(world: WorldScene, id: string): Slot<"holder"> {
  const h = world.holders.find((x) => x.id === id);
  if (h === undefined) throw new Error(`no holder ${id}`);
  return slot("holder", h.label);
}

/** A kind of item of the world, by its noun. */
export function itemName(world: WorldScene, id: string): Slot<"item"> {
  const k = world.item_kinds.find((x) => x.id === id);
  if (k === undefined) throw new Error(`no item kind ${id}`);
  return slot("item", k.noun);
}

/** A number the problem gives (a value or an amount written into the world); never a solved one. */
export function problemNumber(world: WorldScene, value: Rational): Slot<"number"> {
  const given = [
    ...world.quantities.flatMap((q) => (q.value === null ? [] : [q.value])),
    ...world.relations.flatMap((r) => (r.amount === null ? [] : [r.amount])),
    ...world.events.flatMap((e) => (e.amount === null ? [] : [e.amount])),
  ];
  // Written into the world and also in the problem text: a solved or child's world cannot pass the answer off.
  const inText = numbersIn(world.problem_text);
  const same = (a: Rational): boolean => eq(fromSchema(a), fromSchema(value));
  if (!given.some(same) || !inText.some(same)) throw new Error("not a number of the problem");
  return slot("number", value.den === 1 ? String(value.num) : `${value.num}/${value.den}`);
}

/** The child's own words, handed back as they were said. */
export function transcript(text: string): Slot<"transcript"> {
  return slot("transcript", text);
}

interface Template {
  slots: SlotKind[];
  ja: string[];
  en: string[];
}

export const TEMPLATES = {
  "confirm.transcript": {
    slots: ["transcript"],
    ja: ["いまのは「{transcript}」かな？", "「{transcript}」と聞こえたよ。それでいい？", "「{transcript}」、で合ってるかな？"],
    en: ['I heard "{transcript}". Is that right?', 'Did you say "{transcript}"?', '"{transcript}" — did I get that?'],
  },
  "predict.ask": {
    slots: [],
    ja: ["この世界と問題、ぴったり重なってる？", "問題とこの世界、同じに見える？", "この世界、問題のとおりになってる？"],
    en: ["Does this world line up with the problem?", "Do this world and the problem look the same?", "Is this world just like the problem?"],
  },
  "statement.fails": {
    slots: [],
    ja: ["この文は、この世界では成り立たないみたい", "ここでは、この文がうまく合わないね", "この文と世界が、そろっていないよ"],
    en: ["This sentence does not hold in this world.", "In this world, this sentence does not fit.", "This sentence and the world disagree."],
  },
  "statement.undetermined": {
    slots: [],
    ja: ["この文は、まだどちらとも言えないね", "この文は、まだ決まらないね", "この文がどうなるかは、まだわからないね"],
    en: ["This sentence is not decided yet.", "We cannot tell about this sentence yet.", "We do not know about this sentence yet."],
  },
  "statement.question_differs": {
    slots: [],
    ja: [
      "この世界は、問題とちがうことを聞いているみたい",
      "この世界は、問題とは別のことをたずねているね",
      "問題がたずねていることと、この世界がたずねていることが、ちがうね",
    ],
    en: ["This world is asking about something else.", "The question here is not the problem's question.", "This world asks a different thing."],
  },
  "answer_only.ask": {
    slots: [],
    ja: ["どう考えたのか、世界で見せてくれる？", "その考え方を、世界の形で見せて", "どう読んだか、テープで見せてくれる？"],
    en: ["Can you show me how you thought, with the world?", "Show me on the tapes how the problem reads.", "How did you see it? Show me in the world."],
  },
  "show_by_finger.ask": {
    slots: [],
    ja: ["指で見せてくれる？ もとになるのはだれかな", "指で教えて。どっちが長いと思う？", "指で動かしてみて。もとはだれだろう"],
    en: ["Show me with your finger: who do you take as 1?", "Point it out: which is longer?", 'Move the "1" card with your finger: who do you take as 1?'],
  },
  "cue.ask": {
    slots: [],
    ja: ["どの言葉から、そう読んだの？", "問題のどこを見て、そう思った？", "そう読んだ手がかりの言葉はどれ？"],
    en: ["Which word made you see it that way?", "What in the problem told you that?", "Which word was your clue?"],
  },
  "unit.mismatch": {
    slots: ["holder", "number"],
    ja: [
      "この世界だと、{holder}の{number}と長さがそろわないみたい",
      "{holder}の{number}と、長さが合っていないね",
      "{holder}の{number}に、ぴったりそろっていないよ",
    ],
    en: [
      "In this world, the length does not match {holder}'s {number}.",
      "{holder}'s {number} and the length do not line up.",
      "The tape is not the same as {holder}'s {number}.",
    ],
  },
  "hint.question_target": {
    slots: [],
    ja: ["この問題がたずねているのは、だれの数だろう？", "問題の最後の文を、もういちど読んでみよう", "たずねられているのは、だれのことかな？"],
    en: ["Whose count is the problem asking about?", "Let's read the last sentence again.", "Who is the question about?"],
  },
  "hint.relation_direction": {
    slots: [],
    ja: ["多いのは、どっちのほうだろう？", "長いのは、どっちかな？", "どっちが少ないか、もういちど見てみよう"],
    en: ["Which has more?", "Which is longer?", "Let's look again: which has less?"],
  },
  "hint.relation_type": {
    slots: [],
    ja: ["差をくらべる文かな、倍をくらべる文かな？", "これは、どれだけ多いかの話？ 何倍かの話？", "くらべ方は、差かな、倍かな？"],
    en: ["Are we comparing a gap or a multiple?", "Is this about how much more, or about a multiple?", "Is the gap the point here, or the multiple?"],
  },
  "hint.ratio_reference": {
    slots: [],
    ja: ["この文で、もとになっているのはだれ？", "この文は、だれをもとにしているかな？", "もとにする人を、この文から見つけてみよう"],
    en: ["In this sentence, who is taken as 1?", "Who does this sentence take as 1?", "Find who is taken as 1 in this sentence."],
  },
  "fix.ask": {
    slots: [],
    ja: ["じゃあ、世界を直してみようか", "世界を、自分の読み方に直してみよう", "テープを動かして、世界を直してみよう"],
    en: ["Then let's fix the world.", "Let's make the world match the sentences.", "Move the tapes and fix the world."],
  },
  "kohai.read": {
    slots: [],
    ja: ["ぼくは、こう読んでみました", "ぼくの読み方だと、こうなりました", "ぼく、こんなふうに読みました"],
    en: ["This is how I read it.", "Here is my reading.", "I read it like this."],
  },
  "kohai.which": {
    slots: [],
    ja: [
      "この読み方だと、合わない文があります。どこがおかしいんでしょう",
      "合わない文が出てきました。先輩、どこがおかしいでしょう",
      "この文が合わないみたいです。どこを直せばいいでしょう",
    ],
    en: [
      "With this reading, a sentence does not fit. Which part is off?",
      "A sentence does not fit. What looks strange?",
      "This sentence does not fit. What should I change?",
    ],
  },
  "kohai.why": {
    slots: [],
    ja: ["どうして、そこなんですか？", "なんで、そこにしたんですか？", "そこにしたわけを、教えてもらえますか？"],
    en: ["Why there?", "What made you pick that?", "Can you tell me the reason for that?"],
  },
  "kohai.restate": {
    slots: ["holder"],
    ja: ["{holder}が「1」、ですね。合っていますか？", "「1」は{holder}、でいいですか？", "「1」の札は{holder}、ですね。合っていますか？"],
    en: ["You take {holder} as 1, right?", "So {holder} is taken as 1, is that it?", 'You put the "1" card on {holder}. Is that right?'],
  },
  "kohai.restate_word": {
    slots: ["transcript"],
    ja: ["手がかりは「{transcript}」、ですね", "「{transcript}」を見たんですね", "手がかりにしたのは「{transcript}」、ですね"],
    en: ['Your clue was "{transcript}", right?', 'You looked at "{transcript}".', 'You picked "{transcript}" as your clue.'],
  },
  "kohai.restate_heard": {
    slots: ["transcript"],
    ja: ["「{transcript}」と聞こえました。", "「{transcript}」、と聞きました。", "「{transcript}」と言いましたね。"],
    en: ['I heard "{transcript}".', 'You said "{transcript}".', '"{transcript}" is what I heard.'],
  },
  "kohai.listening": {
    slots: [],
    ja: ["うん、聞いています", "はい、聞いていますよ", "うん、ちゃんと聞いています"],
    en: ["Okay, I am listening.", "Mm-hm, I am listening.", "I am listening. One moment."],
  },
  "kohai.show_card": {
    slots: [],
    ja: ["カードで見せてもらえますか？", "「1」の札で見せてもらえますか？", "札を動かして、見せてもらえますか？"],
    en: ["Could you show me with the card?", 'Could you show me with the "1" card?', "Can you move the card to show me?"],
  },
  "kohai.result": {
    slots: [],
    ja: ["先輩の読み方で読んだら、どの文も合いました", "教わった読み方にしたら、文がぜんぶそろいました", "その読み方だと、合わない文がなくなりました"],
    en: ["Reading it that way, every sentence fit.", "With that reading, all the sentences fit.", "With that reading, the sentences all lined up."],
  },
  "kohai.wordbook": {
    slots: [],
    ja: [
      "この言い方、ぼくにはよくわかりません。いっしょに絵本を見ませんか",
      "ここの言葉、ぼくにはむずかしいです。絵本で見てみませんか",
      "この言葉の意味を、絵本でいっしょにさがしませんか",
    ],
    en: [
      "I do not get this wording. Shall we look at the picture book together?",
      "These words are hard for me. Want to check the picture book?",
      "Can we look up this word in the picture book together?",
    ],
  },
  // The help for a child who is stuck (指示書 第7.1節 手順4・5): read the lit words again, then the length order.
  // Neither names a holder, an answer or an operation; neither judges.
  "kohai.help_read": {
    slots: [],
    ja: ["光った言葉を、もう一度読んでみませんか", "光ったところを、いっしょに読みませんか", "この言葉のところを、読み直しませんか"],
    en: ["Shall we read the lit words once more?", "Can we read the lit part together?", "Let's read around these words again."],
  },
  "kohai.help_order": {
    slots: [],
    ja: ["どっちが長いと思いますか？", "長いのは、どっちだと思いますか？", "どっちのテープが長いと思いますか？"],
    en: ["Which one do you think is longer?", "Which seems longer to you?", "Whose tape do you think is longer?"],
  },
  "kohai.wait": {
    slots: [],
    ja: ["ゆっくり考えていいですよ。待っています", "考える時間、たっぷりありますよ", "急がなくていいですよ。ぼくは待ってます"],
    en: ["Take your time. I will wait.", "No need to hurry. Take all the time you need.", "Think as long as you like."],
  },
  "kohai.which_first": {
    slots: [],
    ja: ["どの文から見ていきましょうか", "まず、どの文をたしかめますか", "最初は、どの文にしましょう"],
    en: ["Which sentence shall we look at first?", "Where do you want to start?", "Pick a sentence to check first."],
  },
  "kohai.check_again": {
    slots: [],
    ja: ["もういちど、文をたしかめてみますか？", "文を、もういちど見てみますか？", "直したところで、文を見直しますか？"],
    en: ["Shall we check the sentences again?", "Want to look at the sentences once more?", "Now that you changed it, shall we check the sentences?"],
  },
  "kohai.unit": {
    slots: [],
    ja: ["ひと区切りは、いくつになるんでしょう", "ひと区切りぶんは、どれくらいでしょう", "ひと区切りの大きさは、いくつでしょう"],
    en: ["How big is each part?", "What is the size of a single part?", "How much is in each part?"],
  },
  "why.ask": {
    slots: [],
    ja: ["どうしてそう考えたの？", "その考え方になったわけを教えて", "そう決めたわけを、聞かせてくれる？"],
    en: ["Why did you think that?", "What makes you say so?", "Tell me how you got there."],
  },
  "reflect.ask": {
    slots: [],
    ja: ["今日は、どんなことができるようになった？", "今日、新しくわかったことはある？", "今日やってみて、どうだった？"],
    en: ["What can you do now that you could not before?", "What did you find out today?", "How did today go?"],
  },
  "hold.offer": {
    slots: [],
    ja: ["この問題は、またあとでやってみよう", "この問題は、次のときにもういちどやろう", "ここでやめて、あとでまた見よう"],
    en: ["Let's try this problem again later.", "We can come back to this problem next time.", "Let's stop here and look again later."],
  },
  "distress.reply": {
    slots: [],
    ja: [
      "つらいときは、ここでやめていいよ。信じられる大人に話してみてね",
      "今日はもうやめていいよ。話しやすい大人や先生に、伝えてみてね",
      "自分だけでかかえなくていいよ。信じられる大人に話してみてね",
    ],
    en: [
      "You can stop here. Talk to a grown-up you trust.",
      "It is okay to stop for today. You can tell a grown-up you trust.",
      "You do not have to carry this by yourself. Talk to a grown-up you trust.",
    ],
  },
} as const satisfies Record<string, Template>;

export type TemplateKey = keyof typeof TEMPLATES;
export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];

export type SlotValues = Partial<{ [K in SlotKind]: Slot<K> }>;

/** A fixed sentence as a "say" action for the gates. The variant index wraps around. */
export function render(
  key: TemplateKey,
  lang: Lang,
  variant: number,
  slots: SlotValues,
): { kind: "say"; text: string; echo: boolean } {
  const t: Template = TEMPLATES[key];
  const variants = t[lang];
  const base = variants[((variant % variants.length) + variants.length) % variants.length] as string;
  let text = base;
  for (const kind of t.slots) {
    const s = slots[kind];
    if (s === undefined || !made.has(s) || s.kind !== kind) throw new Error(`slot ${kind} is missing or unchecked`);
    // A function, so "$&" and the like in the child's words are kept as they were said.
    text = text.replaceAll(`{${kind}}`, () => s.text);
  }
  return markRendered({ kind: "say" as const, text, echo: t.slots.includes("transcript") });
}
