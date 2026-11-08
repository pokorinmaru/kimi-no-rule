// The furigana of the prepared problems (指示書 第8.4b節 読みの配慮): for each problem, its kanji words and their
// readings in hiragana, written for these exact sentences. A key may carry plain context around its kanji
// (「8本」: the reading is for 本 after 8, はっぽん); a reading with "|" gives one part per kanji (「何本」 is
// written 何 and 本, two words a child can tap). Every key is a word of the problem's own sentences, so a
// reading never holds the answer. They are display data: nothing here judges or computes.

export type Readings = Readonly<Record<string, string>>;

const SISTERS: Readings = { 姉: "あね", 妹: "いもうと" };
const BROTHERS: Readings = { 兄: "あに", 弟: "おとうと" };

export const PROBLEM_READINGS: Readonly<Record<string, Readings>> = {
  // 姉のリボンは8本です。妹のリボンは、姉のリボンの3/4です。妹のリボンは何本ですか。
  p_fraction_c: { ...SISTERS, "8本": "ぽん", 何本: "なん|ぼん" },
  // なつまつりの金魚すくいで、そらは金魚を6匹すくいました。これは、AIくんがすくった金魚の数の3/4です。…
  p_festival: { 金魚: "きんぎょ", "6匹": "ぴき", 数: "かず", 何匹: "なん|びき" },
  // なつまつりの金魚すくいで、そらは金魚を8匹すくいました。AIくんがすくった金魚は、そらの金魚の3/4です。…
  // シャツの定価は800円です。セールで、代金は定価の20%引きです。代金は何円ですか。
  p_sale: { 定価: "ていか", "1000円": "えん", 代金: "だいきん", "%引き": "び", 何円: "なん|えん" },
  p_festival_whole: { 金魚: "きんぎょ", "8匹": "ぴき", 何匹: "なん|びき" },
  // 兄の金魚は6匹。これは、弟の金魚の数の3/4です。弟の金魚は何匹ですか。
  p_signboard: { ...BROTHERS, 金魚: "きんぎょ", "6匹": "ぴき", 数: "かず", 何匹: "なん|びき" },
  p_bank_sticker: { ...SISTERS, 何: "なん" },
  p_bank_tulip: { 赤組: "あかぐみ", 学年: "がくねん", "10本": "ぽん", 何本: "なん|ぼん" },
  p_bank_fish_more: { 子ども: "こ", "8匹": "ぴき", 父: "ちち", 倍: "ばい", 何匹: "なん|びき" },
  p_bank_fish_back: { 父: "ちち", "15匹": "ひき", 子ども: "こ", 数: "かず", 倍: "ばい", 何匹: "なん|びき" },
  p_bank_motoni: { 白い: "しろ", 赤い: "あか", 花: "はな", 数: "かず", "9本": "ほん", 何本: "なん|ぼん" },
  p_bank_taishite: { 数: "かず", 対して: "たい", 何: "なん" },
  p_bank_card: { ...BROTHERS, 何: "なん" },
  p_disc_c_correct_s_unit_additive_1: { 大きい: "おお", 小さい: "ちい", 水そう: "すい", 金魚: "きんぎょ", "24匹": "ひき", 何匹: "なん|びき" },
  p_disc_c_correct_s_unit_additive_2: { 青い: "あお", 赤い: "あか", 箱: "はこ", 何: "なん" },
  p_disc_c_first_whole_s_motoni_plain_1: { ...SISTERS, おり紙: "がみ", 数: "かず", 何: "なん" },
  p_disc_c_first_whole_s_motoni_plain_2: { 大きい: "おお", 小さい: "ちい", 何: "なん" },
  // The transfer problems (content/problems/transfer, Q48). p_transfer_c_additive_different_1 is still to be written.
  p_transfer_c_additive_same_1: { 小さい: "ちい", 大きい: "おお", 何: "なん" },
  p_transfer_c_first_whole_different_1: { 祖父: "そふ", 父: "ちち", 数: "かず", 何: "なん" },
  p_transfer_c_first_whole_same_1: { 折り: "お", 折っ: "お", 姉: "あね", 母: "はは", 数: "かず", "10羽": "わ", 何羽: "なん|わ" },
  p_transfer_c_known_whole_different_1: { 小さい: "ちい", 大きい: "おお", 箱: "はこ", 数: "かず", 対して: "たい", 何: "なん" },
  p_transfer_c_known_whole_same_1: { 祖母: "そぼ", 母: "はは", 数: "かず", 何: "なん" },
  p_transfer_c_swap_different_1: { 青い: "あお", 赤い: "あか", 水: "みず", 量: "りょう", 何: "なん" },
  p_transfer_c_swap_same_1: { 大きい: "おお", 小さい: "ちい", 水そう: "すい", 水: "みず", 何: "なん" },
};
