// A child's wish to AI-kun (Q61). What reaches the developer is never the child's own words but Claude's
// rephrasing of them, and only when this check lets it through: one short line, with nothing in it that could
// name a person or a school, or reach someone (a number, a mail or web address). The parent reads it before
// anything is sent, so the check is the floor, not the only guard.

/** The longest rephrased wish, in characters. */
export const MAX_WISH_CHARS = 80;

export type WishRefusal = "empty" | "too_long" | "multi_line" | "contact" | "person" | "place" | "answers" | "attribution";

export type WishGateResult = { ok: true } | { ok: false; reason: WishRefusal };

/** A run of digits that may be split by spaces or dashes; six or more digits in it look like a number to call. */
const DIGIT_RUN = /\d[\d\s\-‐ー－]*\d/g;
const MAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
/** An account name (@name). */
const HANDLE = /@[A-Za-z0-9_.]{2,}/;
/** Numbers written in kanji, six or more in a row (〇九〇…). */
const KANJI_DIGITS = /[〇零一二三四五六七八九]{6,}/;
/** Digits in the whole text: eight or more look like a number to call, however they are split. */
const MAX_DIGITS = 7;
const WEB = /https?:\/\/|www\./i;
/** The junior's own name, which is not a person's (Q60). */
const AI_KUN = /AI\s*くん|AI-kun/gi;
/** A name with an honorific: some word just before くん, ちゃん, さん or 先生. */
const HONORIFIC = /[^\s、。，．,.!?！？「」『』（）()]\s*(くん|ちゃん|さん|先生|せんせい|君|様|さま|氏)|\b(Mr|Mrs|Ms|Miss)\.?\s+[A-Z]/;
/** A request that the app give answers, which it never does (原則1): to tell, show or give the answer. */
const ANSWERS = /(答え|こたえ|正解|せいかい)(を|が)?(教え|おしえ|見せ|みせ|見られ|みられ|出し|だし|ほしい)|(show|tell|give)( me)?( the)? answers?/i;
/** A school named (a word before 小学校 and the like), or a class (3年2組, 2組). */
const SCHOOL = /[^\s、。，．,.!?！？「」『』（）()](小学校|中学校|幼稚園|保育園|学園|塾)|学童|\d+\s*年\s*\d+\s*組|\d+\s*組|丁目|番地|[一-龥ぁ-んァ-ヶ]{1,6}(市|県)(?![一-龥])/;
/** A sentence about how the child read or thought, which the app never pins on the child (原則10). */
const ATTRIBUTION = /読み(違|ちが|間違)|と読んで|と読ん(だ|でる)|勘違い|かんちがい|誤解/;

export function wishGate(raw: string): WishGateResult {
  const text = raw.normalize("NFKC").trim();
  if (text === "") return { ok: false, reason: "empty" };
  if (/[\r\n]/.test(text)) return { ok: false, reason: "multi_line" };
  if ([...text].length > MAX_WISH_CHARS) return { ok: false, reason: "too_long" };
  if (MAIL.test(text) || WEB.test(text) || HANDLE.test(text) || KANJI_DIGITS.test(text)) return { ok: false, reason: "contact" };
  if ((text.match(/\d/g) ?? []).length > MAX_DIGITS) return { ok: false, reason: "contact" };
  for (const m of text.matchAll(DIGIT_RUN)) {
    if (m[0].replace(/\D/g, "").length >= 6) return { ok: false, reason: "contact" };
  }
  const withoutJunior = text.replace(AI_KUN, "");
  if (HONORIFIC.test(withoutJunior)) return { ok: false, reason: "person" };
  if (SCHOOL.test(withoutJunior)) return { ok: false, reason: "place" };
  if (ANSWERS.test(text)) return { ok: false, reason: "answers" };
  if (ATTRIBUTION.test(text)) return { ok: false, reason: "attribution" };
  return { ok: true };
}
