// The bank of prepared problems the research layer picks discriminating problems from (指示書 第6.7節 手順3;
// the submission keeps only the fraction-as-a-multiple type, and the bank is prepared, never written at run time).
// Each problem is written for this repository. They differ in what the text gives away: which holder is
// mentioned first, which number is known, which one is asked, whether the multiple is below or above 1,
// and the words around the multiple (の, をもとにすると, に対して). That is what makes the common readings
// build different worlds on some of them. Every record waits for a person's check (human_checked false).
import type { ProblemRecord, WorldScene } from "../../src/schema/index.ts";
import { PROVISIONAL } from "./provisional.ts";

type Mark = ProblemRecord["syntax_marks"][number];
type RatioKind = NonNullable<Mark["ratio_kind"]>[number];
type Tok = string | { t: string; k: Mark["kind"]; id: string | null; rk?: RatioKind[] };

const H = (t: string, id: string): Tok => ({ t, k: "holder_mention", id });
const R = (t: string, id: string, ...rk: RatioKind[]): Tok => ({ t, k: "ratio_notation", id, rk });
const W = (t: string, id: string): Tok => ({ t, k: "relation_word", id });
const U = (t: string, id: string): Tok => ({ t, k: "unit_word", id });
const D = (t: string, id: string): Tok => ({ t, k: "demonstrative", id });
const ASK: Tok = { t: "何", k: "sentence_pattern", id: null };

interface Spec {
  id: string;
  consistency: ProblemRecord["consistency"];
  sentences: { toks: Tok[]; ids: string[]; question?: true }[];
  holders: [string, string][];
  kind: [string, string, string];
  /** [quantity id, holder id, value or null] */
  quantities: [string, string, number | null][];
  /** subject = amount x reference */
  relation: { id: string; operator: "fraction_of" | "times"; subject: string; reference: string; num: number; den: number };
  asked: string;
  answer: number;
}

function build(s: Spec): ProblemRecord {
  const statements = s.sentences.map((x, index) => {
    const tokens = x.toks.map((t) => (typeof t === "string" ? t : t.t));
    return {
      index,
      text: tokens.join(""),
      element_ids: x.ids,
      is_question: x.question === true,
      speaker_holder_id: null,
      tokens,
    };
  });
  const syntax_marks: Mark[] = s.sentences.flatMap((x, si) =>
    x.toks.flatMap((t, i): Mark[] =>
      typeof t === "string"
        ? []
        : [
            {
              kind: t.k,
              statement_index: si,
              token_start: i,
              token_end: i,
              element_id: t.id,
              word: t.t,
              ratio_kind: t.rk ?? null,
              l1_pattern_id: null,
              native_checked: null,
            },
          ],
    ),
  );
  const [kid, noun, counter] = s.kind;
  const world: WorldScene = {
    schema_version: "3",
    problem_id: s.id,
    problem_type: "ratio",
    problem_text: statements.map((x) => x.text).join(""),
    grade: 6,
    problem_lang: "ja",
    holders: s.holders.map(([id, label]) => ({ id, label })),
    item_kinds: [{ id: kid, noun, counter, asset_key: null, countable: true }],
    quantities: s.quantities.map(([id, holder, v]) => ({
      id,
      holder,
      item_kind: kid,
      at_event: null,
      value: v === null ? null : { num: v, den: 1 },
    })),
    relations: [
      {
        id: s.relation.id,
        operator: s.relation.operator,
        subject: s.relation.subject,
        reference: s.relation.reference,
        reference_list: null,
        amount: { num: s.relation.num, den: s.relation.den },
        other_description: null,
      },
    ],
    events: [],
    question: { target_type: "quantity", target_id: s.asked },
    word_links: [],
  };
  return {
    schema_version: "1",
    world,
    consistency: s.consistency,
    pair_id: null,
    source: "prepared",
    checks: { double_build_match: false, restate_match: false, misread_pass_rate: null, human_checked: false },
    expected_answer: { num: s.answer, den: 1 },
    statements,
    syntax_marks,
    companion_ids: [],
  };
}

const SPECS: Spec[] = [
  // The part is mentioned first and asked; the whole is known.
  {
    id: "p_bank_sticker",
    consistency: "consistent",
    sentences: [
      { toks: [H("妹", "h_imo"), "の", "シール", "は", "、", H("姉", "h_ane"), "の", "シール", W("の", "r_m"), R("3/5", "r_m", "lt1", "fraction"), "です", "。"], ids: ["r_m"] },
      { toks: [H("姉", "h_ane"), "の", "シール", "は", "20", U("まい", "k_seal"), "です", "。"], ids: ["q_ane"] },
      { toks: [H("妹", "h_imo"), "の", "シール", "は", ASK, U("まい", "k_seal"), "です", "か", "。"], ids: ["q_imo"], question: true },
    ],
    holders: [["h_imo", "妹"], ["h_ane", "姉"]],
    kind: ["k_seal", "シール", "まい"],
    quantities: [["q_imo", "h_imo", null], ["q_ane", "h_ane", 20]],
    relation: { id: "r_m", operator: "fraction_of", subject: "q_imo", reference: "q_ane", num: 3, den: 5 },
    asked: "q_imo",
    answer: 12,
  },
  // The part is mentioned first and known; the whole is asked.
  {
    id: "p_bank_tulip",
    consistency: "inconsistent",
    sentences: [
      { toks: [H("赤組", "h_aka"), "の", "チューリップ", "は", "、", H("学年", "h_gakunen"), "の", "チューリップ", W("の", "r_m"), R("2/5", "r_m", "lt1", "fraction"), "です", "。"], ids: ["r_m"] },
      { toks: [H("赤組", "h_aka"), "の", "チューリップ", "は", "10", U("本", "k_tulip"), "です", "。"], ids: ["q_aka"] },
      { toks: [H("学年", "h_gakunen"), "の", "チューリップ", "は", ASK, U("本", "k_tulip"), "です", "か", "。"], ids: ["q_gakunen"], question: true },
    ],
    holders: [["h_aka", "赤組"], ["h_gakunen", "学年"]],
    kind: ["k_tulip", "チューリップ", "本"],
    quantities: [["q_aka", "h_aka", 10], ["q_gakunen", "h_gakunen", null]],
    relation: { id: "r_m", operator: "fraction_of", subject: "q_aka", reference: "q_gakunen", num: 2, den: 5 },
    asked: "q_gakunen",
    answer: 25,
  },
  // A multiple above 1, the whole known and mentioned first.
  {
    id: "p_bank_fish_more",
    consistency: "consistent",
    sentences: [
      { toks: [H("子ども", "h_ko"), "は", "8", U("匹", "k_fish"), "つり", "ました", "。"], ids: ["q_ko"] },
      { toks: [H("父", "h_chichi"), "は", "、", H("子ども", "h_ko"), W("の", "r_m"), R("5/4", "r_m", "gt1", "fraction"), "倍", "つり", "ました", "。"], ids: ["r_m"] },
      { toks: [H("父", "h_chichi"), "は", ASK, U("匹", "k_fish"), "つり", "ました", "か", "。"], ids: ["q_chichi"], question: true },
    ],
    holders: [["h_ko", "子ども"], ["h_chichi", "父"]],
    kind: ["k_fish", "魚", "匹"],
    quantities: [["q_ko", "h_ko", 8], ["q_chichi", "h_chichi", null]],
    relation: { id: "r_m", operator: "times", subject: "q_chichi", reference: "q_ko", num: 5, den: 4 },
    asked: "q_chichi",
    answer: 10,
  },
  // A multiple above 1, the compared amount known; the whole is asked.
  {
    id: "p_bank_fish_back",
    consistency: "inconsistent",
    sentences: [
      { toks: [H("父", "h_chichi"), "は", "15", U("匹", "k_fish"), "つり", "ました", "。"], ids: ["q_chichi"] },
      { toks: [D("これ", "q_chichi"), "は", "、", H("子ども", "h_ko"), "が", "つった", "数", W("の", "r_m"), R("5/4", "r_m", "gt1", "fraction"), "倍", "です", "。"], ids: ["r_m"] },
      { toks: [H("子ども", "h_ko"), "は", ASK, U("匹", "k_fish"), "つり", "ました", "か", "。"], ids: ["q_ko"], question: true },
    ],
    holders: [["h_chichi", "父"], ["h_ko", "子ども"]],
    kind: ["k_fish", "魚", "匹"],
    quantities: [["q_chichi", "h_chichi", 15], ["q_ko", "h_ko", null]],
    relation: { id: "r_m", operator: "times", subject: "q_chichi", reference: "q_ko", num: 5, den: 4 },
    asked: "q_ko",
    answer: 12,
  },
  // "をもとにすると": the whole comes after the first holder, and is asked.
  {
    id: "p_bank_motoni",
    consistency: "inconsistent",
    sentences: [
      { toks: [H("白い花", "h_shiro"), "の", "数", "は", "、", H("赤い花", "h_aka"), "の", "数", W("を", "r_m"), "もとにすると", R("3/4", "r_m", "lt1", "fraction"), "です", "。"], ids: ["r_m"] },
      { toks: [H("白い花", "h_shiro"), "は", "9", U("本", "k_hana"), "です", "。"], ids: ["q_shiro"] },
      { toks: [H("赤い花", "h_aka"), "は", ASK, U("本", "k_hana"), "です", "か", "。"], ids: ["q_aka"], question: true },
    ],
    holders: [["h_shiro", "白い花"], ["h_aka", "赤い花"]],
    kind: ["k_hana", "花", "本"],
    quantities: [["q_shiro", "h_shiro", 9], ["q_aka", "h_aka", null]],
    relation: { id: "r_m", operator: "fraction_of", subject: "q_shiro", reference: "q_aka", num: 3, den: 4 },
    asked: "q_aka",
    answer: 12,
  },
  // "に対して": the whole is known and mentioned first.
  {
    id: "p_bank_taishite",
    consistency: "consistent",
    sentences: [
      { toks: [H("みかん", "h_mikan"), "は", "15", U("こ", "k_kudamono"), "あり", "ます", "。"], ids: ["q_mikan"] },
      { toks: [H("りんご", "h_ringo"), "の", "数", "は", "、", H("みかん", "h_mikan"), "の", "数", W("に対して", "r_m"), R("2/3", "r_m", "lt1", "fraction"), "です", "。"], ids: ["r_m"] },
      { toks: [H("りんご", "h_ringo"), "は", ASK, U("こ", "k_kudamono"), "あり", "ます", "か", "。"], ids: ["q_ringo"], question: true },
    ],
    holders: [["h_mikan", "みかん"], ["h_ringo", "りんご"]],
    kind: ["k_kudamono", "くだもの", "こ"],
    quantities: [["q_mikan", "h_mikan", 15], ["q_ringo", "h_ringo", null]],
    relation: { id: "r_m", operator: "fraction_of", subject: "q_ringo", reference: "q_mikan", num: 2, den: 3 },
    asked: "q_ringo",
    answer: 10,
  },
  // A unit fraction, the part mentioned first and asked.
  {
    id: "p_bank_card",
    consistency: "consistent",
    sentences: [
      { toks: [H("弟", "h_otouto"), "の", "カード", "は", "、", H("兄", "h_ani"), "の", "カード", W("の", "r_m"), R("1/3", "r_m", "lt1", "fraction"), "です", "。"], ids: ["r_m"] },
      { toks: [H("兄", "h_ani"), "の", "カード", "は", "18", U("まい", "k_card"), "です", "。"], ids: ["q_ani"] },
      { toks: [H("弟", "h_otouto"), "の", "カード", "は", ASK, U("まい", "k_card"), "です", "か", "。"], ids: ["q_otouto"], question: true },
    ],
    holders: [["h_otouto", "弟"], ["h_ani", "兄"]],
    kind: ["k_card", "カード", "まい"],
    quantities: [["q_otouto", "h_otouto", null], ["q_ani", "h_ani", 18]],
    relation: { id: "r_m", operator: "fraction_of", subject: "q_otouto", reference: "q_ani", num: 1, den: 3 },
    asked: "q_otouto",
    answer: 6,
  },
];

const fromProvisional = PROVISIONAL.filter((p) => p.type === "fraction_multiple").map((p) => p.record);

/** Every prepared fraction-as-a-multiple problem: the signboard pair first, then the bank. */
export const FRACTION_BANK: ProblemRecord[] = [...fromProvisional, ...SPECS.map(build)];
