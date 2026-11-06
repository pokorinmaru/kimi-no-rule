// The simulated children of the research eval (指示書 第10.2節, cut to the submission's one type). Each has
// a reading fixed in advance and a few ways of saying it. They are AI drafts (BLOCKED B3: a third party
// should write and freeze them); the words are invented for this repository, no real child said them.
// Kinds: "listed" readings are in the common list core starts from; "inside" ones are not in that list
// but within the enumeration baseline's reach; "outside" ones are beyond it (nested conditions or a word
// the enumeration does not try); "inexpressible" ones are procedures the reading language cannot write,
// to measure that nothing is confirmed for them.
import { COMMON_FRACTION_READINGS, runRule, type Hypothesis, type ProblemRecord, type WorldScene } from "@kimi/core";

type Clause = Hypothesis["clauses"][number];
const rule = (id: string, clauses: Clause[]): Hypothesis => ({ id, origin: "math", clauses, word_cues: [], note_for_adult: "" });
const ALWAYS = { pred: "true" as const, args: [] };
const common = (id: string): Hypothesis => {
  const h = COMMON_FRACTION_READINGS.find((x) => x.id === id);
  if (h === undefined) throw new Error(id);
  return h;
};

export type ChildKind = "listed" | "inside" | "outside" | "inexpressible";

export interface SimChild {
  id: string;
  kind: ChildKind;
  /** The reading as a rule; null for the inexpressible ones. */
  rule: Hypothesis | null;
  /** The child's first world on a problem (the n-th problem of the session, from 0). */
  world(record: ProblemRecord, n: number): WorldScene;
  words: string[];
}

const ruled = (id: string, kind: ChildKind, h: Hypothesis, words: string[]): SimChild => ({
  id,
  kind,
  rule: h,
  world: (r) => runRule(h, r),
  words,
});

const swap = common("c_swap");

export const SIM_CHILDREN: readonly SimChild[] = [
  ruled("s_correct", "listed", common("c_correct"), ["ふつうに読んだ", "書いてあるとおり", "えっと、この人がもとだから", "文のとおりにした", "そのまま"]),
  ruled("s_swap", "listed", swap, ["反対だと思った", "逆のほうがもと", "うーん、こっちが1かな", "ひっくり返した", "the other one is 1"]),
  ruled("s_known", "listed", common("c_known_whole"), ["わかってる数をもとにした", "数が書いてあるほうが1", "えっと、知ってる数から", "数があるからそっちが全部", "the number I know is 1"]),
  ruled("s_first", "listed", common("c_first_whole"), ["先に出てきたほうがもと", "最初の人が1", "前に書いてあるから", "はじめの人が全部", "first one is 1"]),
  ruled("s_additive", "listed", common("c_additive"), ["3つ少ないってこと", "上の数だけちがう", "えっと、その分少ない", "分子の分だけへる", "less by the top number"]),
  ruled("s_divide", "listed", common("c_divide"), ["いつもわり算", "分数はわるもの", "わればいいと思った", "分数があるからわる", "always divide"]),
  ruled("s_invert", "listed", common("c_invert"), ["分数を反対にした", "上と下を入れかえた", "4分の3じゃなくて3分の4", "ひっくり返す", "flip the fraction"]),
  ruled(
    "s_more_swap",
    "inside",
    rule("s_more_swap", [
      { when: { pred: "ratio_kind_is", args: ["gt1"] }, then: { action: "swap_reference" } },
      { when: ALWAYS, then: { action: "no_change" } },
    ]),
    ["倍って書いてあると反対", "1より大きいときはこっちがもと", "大きい分数だけ逆", "倍のときは入れかえる", "bigger than 1 means the other way"],
  ),
  ruled(
    "s_unit_additive",
    "inside",
    rule("s_unit_additive", [
      { when: { pred: "ratio_is_unit_fraction", args: [] }, then: { action: "set_relation_type_additive", amount: "numerator" } },
      { when: ALWAYS, then: { action: "no_change" } },
    ]),
    ["3分の1は1つ少ない", "1の分数だけ少ない", "上が1だとひくのかな", "1分のじゃなくて、1少ない", "one over means one less"]),
  ruled("s_larger", "inside", rule("s_larger", [{ when: ALWAYS, then: { action: "choose_reference", by: "larger_number" } }]), [
    "大きいほうがもと",
    "数が多いほうが1",
    "でかい方が全部",
    "大きい数が1",
    "the bigger one is 1",
  ]),
  ruled(
    "s_kore_additive",
    "outside",
    rule("s_kore_additive", [
      { when: { pred: "word_in_statement", args: ["もとにすると"] }, then: { action: "no_change" } },
      { when: { pred: "word_in_statement", args: ["これ"] }, then: { action: "set_relation_type_additive", amount: "numerator" } },
      { when: ALWAYS, then: { action: "choose_reference", by: "known_value" } },
    ]),
    ["「これは」のときは、上の数だけ少ない", "これって言われると、その分ちがう", "わかってる数がもと、でもこれのときは少ない", "もとにするはそのとおり", "with kore it is less by the top"],
  ),
  ruled(
    "s_motoni_plain",
    "outside",
    rule("s_motoni_plain", [
      { when: { pred: "word_in_statement", args: ["もとにすると"] }, then: { action: "no_change" } },
      { when: ALWAYS, then: { action: "choose_reference", by: "first_mentioned" } },
    ]),
    ["もとにするって書いてあると、そのとおり", "先の人がもと、でももとにするのときは書いてあるほう", "もとにするはわかる", "最初の人が1かな", "first is 1, but not with moto"],
  ),
  {
    id: "s_tired",
    kind: "inexpressible",
    rule: null,
    // Reads the first two problems as written, then turns every later one round: the language has no
    // predicate on how far into the session a problem comes.
    world: (r, n) => (n >= 2 ? runRule(swap, r) : r.world),
    words: ["さいしょはわかった", "だんだんわからなくなった", "つかれてきて反対にした", "あとのほうはむずかしい", "I got tired"],
  },
  {
    id: "s_alternate",
    kind: "inexpressible",
    rule: null,
    // Reads every other problem the other way round, as if carried over from the last one.
    world: (r, n) => (n % 2 === 1 ? runRule(swap, r) : r.world),
    words: ["さっきと反対", "前の問題とちがうやり方", "交代で読む", "前のをおぼえてた", "the opposite of last time"],
  },
];
