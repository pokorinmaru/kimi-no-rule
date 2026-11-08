// The words of distress the device checks without Claude (指示書 第6.2節; packages/interpret's safety check uses them
// when Claude does not answer, and the screen keeps a child's name from hiding them, Q60). A first list that waits
// for a person's check (BLOCKED.md). Written in hiragana where a word has a kana form: text is folded to hiragana
// before matching.
export const DISTRESS_WORDS: { ja: string[]; en: string[] } = {
  // Written in hiragana where a word has a kana form: the text is folded to hiragana before matching.
  ja: [
    "しにたい", "死にたい", "しんじゃいたい", "死んじゃいたい", "きえたい", "消えたい", "いなくなりたい", "いきていたくない", "生きていたくない",
    "たすけて", "助けて", "つらい", "辛い", "くるしい", "苦しい", "こわい", "怖い", "恐い", "かなしい", "悲しい", "さみしい", "寂しい", "ひとりぼっち",
    "いじめ", "苛め", "虐め", "なぐられ", "殴られ", "たたかれ", "叩かれ", "けられ", "蹴られ", "ぶたれ", "さわられ", "触られ", "むしされ", "無視され",
    "いたい", "痛い", "なきたい", "泣きたい", "もういやだ", "ひみつにしろ", "だれにもいうな", "ごはんもらえない", "しね", "死ね", "ころす", "殺",
  ],
  en: [
    "want to die", "wanna die", "kill myself", "suicide", "hurt myself", "help me", "scared", "afraid", "bullied", "hurts me", "it hurts",
    "hit me", "sad", "lonely", "hate myself", "nobody likes me", "touched me", "keep it secret", "kill",
  ],
};

/** Width, case and script folded away, so 辛い, ツライ and full-width spellings meet the same words. */
function fold(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** Whether a text holds one of the words of distress (the device's own check, without Claude). */
export function hasDistressWord(text: string): boolean {
  const t = fold(text);
  return [...DISTRESS_WORDS.ja, ...DISTRESS_WORDS.en].some((w) => t.includes(fold(w)));
}
