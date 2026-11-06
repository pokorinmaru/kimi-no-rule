// Provisional problems for every type, one consistent and one inconsistent each (指示書 第11節 M1).
// A consistent problem's words point to the operation it needs; an inconsistent one's point the other way.
// The texts are written for this repository. The signboard problem is the inconsistent multiple.
import type { ProblemRecord, WorldScene } from "../../src/schema/index.ts";
import { signboardRecord } from "./signboard-record.ts";

export const PROVISIONAL_TYPES = ["percent", "fraction_multiple", "ratio", "unit_rate", "speed"] as const;
export type ProvisionalType = (typeof PROVISIONAL_TYPES)[number];

const n = (num: number, den = 1) => ({ num, den });
type Relation = WorldScene["relations"][number];
type Quantity = WorldScene["quantities"][number];

const rel = (id: string, operator: Relation["operator"], subject: string, reference: string | null, amount: { num: number; den: number } | null, list: string[] | null = null): Relation => ({
  id,
  operator,
  subject,
  reference,
  reference_list: list,
  amount,
  other_description: null,
});
const qty = (id: string, holder: string, item_kind: string, value: { num: number; den: number } | null): Quantity => ({
  id,
  holder,
  item_kind,
  at_event: null,
  value,
});

interface Spec {
  id: string;
  pair: string;
  type: ProvisionalType;
  consistency: ProblemRecord["consistency"];
  problemType: WorldScene["problem_type"];
  grade: number;
  sentences: { text: string; ids: string[]; question?: true }[];
  holders: WorldScene["holders"];
  kinds: WorldScene["item_kinds"];
  quantities: Quantity[];
  relations: Relation[];
  asked: string;
  answer: { num: number; den: number };
}

function build(s: Spec): ProblemRecord {
  return {
    schema_version: "1",
    world: {
      schema_version: "3",
      problem_id: s.id,
      problem_type: s.problemType,
      problem_text: s.sentences.map((x) => x.text).join(""),
      grade: s.grade,
      problem_lang: "ja",
      holders: s.holders,
      item_kinds: s.kinds,
      quantities: s.quantities,
      relations: s.relations,
      events: [],
      question: { target_type: "quantity", target_id: s.asked },
      word_links: [],
    },
    consistency: s.consistency,
    pair_id: s.pair,
    source: "prepared",
    checks: { double_build_match: false, restate_match: false, misread_pass_rate: null, human_checked: false },
    expected_answer: s.answer,
    statements: s.sentences.map((x, index) => ({
      index,
      text: x.text,
      element_ids: x.ids,
      is_question: x.question === true,
      speaker_holder_id: null,
      tokens: [x.text],
    })),
    syntax_marks: [],
    companion_ids: [],
  };
}

const kind = (id: string, noun: string, counter: string, countable = true) => ({ id, noun, counter, asset_key: null, countable });

const SPECS: Spec[] = [
  // Percent: the part is asked (consistent: "の25%" asks for a part) and the whole is asked (inconsistent).
  {
    id: "p_percent_c",
    pair: "p_percent_i",
    type: "percent",
    consistency: "consistent",
    problemType: "ratio",
    grade: 5,
    sentences: [
      { text: "畑でとれたいもは60こです。", ids: ["q_all"] },
      { text: "そのうち、やきいもにしたのは、とれたいもの25%です。", ids: ["r_p"] },
      { text: "やきいもにしたのは何こですか。", ids: ["q_part"], question: true },
    ],
    holders: [
      { id: "h_all", label: "とれたいも" },
      { id: "h_part", label: "やきいも" },
    ],
    kinds: [kind("k_imo", "いも", "こ")],
    quantities: [qty("q_all", "h_all", "k_imo", n(60)), qty("q_part", "h_part", "k_imo", null)],
    relations: [rel("r_p", "fraction_of", "q_part", "q_all", n(1, 4))],
    asked: "q_part",
    answer: n(15),
  },
  {
    id: "p_percent_i",
    pair: "p_percent_c",
    type: "percent",
    consistency: "inconsistent",
    problemType: "ratio",
    grade: 5,
    sentences: [
      { text: "やきいもにしたいもは15こです。", ids: ["q_part"] },
      { text: "これは、畑でとれたいもの25%にあたります。", ids: ["r_p"] },
      { text: "とれたいもは何こですか。", ids: ["q_all"], question: true },
    ],
    holders: [
      { id: "h_all", label: "とれたいも" },
      { id: "h_part", label: "やきいも" },
    ],
    kinds: [kind("k_imo", "いも", "こ")],
    quantities: [qty("q_all", "h_all", "k_imo", null), qty("q_part", "h_part", "k_imo", n(15))],
    relations: [rel("r_p", "fraction_of", "q_part", "q_all", n(1, 4))],
    asked: "q_all",
    answer: n(60),
  },
  // A fraction as a multiple: the consistent one; the inconsistent one is the signboard problem.
  {
    id: "p_fraction_c",
    pair: signboardRecord.world.problem_id,
    type: "fraction_multiple",
    consistency: "consistent",
    problemType: "ratio",
    grade: 6,
    sentences: [
      { text: "姉のリボンは8本です。", ids: ["q_ane"] },
      { text: "妹のリボンは、姉のリボンの3/4です。", ids: ["r_f"] },
      { text: "妹のリボンは何本ですか。", ids: ["q_imo"], question: true },
    ],
    holders: [
      { id: "h_ane", label: "姉" },
      { id: "h_imo", label: "妹" },
    ],
    kinds: [kind("k_ribbon", "リボン", "本")],
    quantities: [qty("q_ane", "h_ane", "k_ribbon", n(8)), qty("q_imo", "h_imo", "k_ribbon", null)],
    relations: [rel("r_f", "fraction_of", "q_imo", "q_ane", n(3, 4))],
    asked: "q_imo",
    answer: n(6),
  },
  // Ratio a:b: the whole is kept with total_of, a part is a fraction of the whole.
  {
    id: "p_ratio_c",
    pair: "p_ratio_i",
    type: "ratio",
    consistency: "consistent",
    problemType: "ratio",
    grade: 6,
    sentences: [
      { text: "赤い花と白い花が、合わせて20本あります。", ids: ["q_all", "r_sum"] },
      { text: "赤い花と白い花の本数の比は3:2です。", ids: ["r_red"] },
      { text: "赤い花は何本ですか。", ids: ["q_red"], question: true },
    ],
    holders: [
      { id: "h_red", label: "赤い花" },
      { id: "h_white", label: "白い花" },
      { id: "h_all", label: "花ぜんぶ" },
    ],
    kinds: [kind("k_flower", "花", "本")],
    quantities: [qty("q_red", "h_red", "k_flower", null), qty("q_white", "h_white", "k_flower", null), qty("q_all", "h_all", "k_flower", n(20))],
    relations: [rel("r_sum", "total_of", "q_all", null, null, ["q_red", "q_white"]), rel("r_red", "fraction_of", "q_red", "q_all", n(3, 5))],
    asked: "q_red",
    answer: n(12),
  },
  {
    id: "p_ratio_i",
    pair: "p_ratio_c",
    type: "ratio",
    consistency: "inconsistent",
    problemType: "ratio",
    grade: 6,
    sentences: [
      { text: "赤い花は12本です。", ids: ["q_red"] },
      { text: "赤い花と白い花の本数の比は3:2です。", ids: ["r_red", "r_sum"] },
      { text: "花は、合わせて何本ですか。", ids: ["q_all"], question: true },
    ],
    holders: [
      { id: "h_red", label: "赤い花" },
      { id: "h_white", label: "白い花" },
      { id: "h_all", label: "花ぜんぶ" },
    ],
    kinds: [kind("k_flower", "花", "本")],
    quantities: [qty("q_red", "h_red", "k_flower", n(12)), qty("q_white", "h_white", "k_flower", null), qty("q_all", "h_all", "k_flower", null)],
    relations: [rel("r_sum", "total_of", "q_all", null, null, ["q_red", "q_white"]), rel("r_red", "fraction_of", "q_red", "q_all", n(3, 5))],
    asked: "q_all",
    answer: n(20),
  },
  // Per unit: the total is asked (consistent: "ずつ" with a count of boxes) and the count of boxes (inconsistent).
  {
    id: "p_rate_c",
    pair: "p_rate_i",
    type: "unit_rate",
    consistency: "consistent",
    problemType: "rate",
    grade: 5,
    sentences: [
      { text: "1箱に、クッキーが6まいずつ入っています。", ids: ["r_per"] },
      { text: "箱は4箱あります。", ids: ["q_box"] },
      { text: "クッキーはぜんぶで何まいですか。", ids: ["q_cookie"], question: true },
    ],
    holders: [{ id: "h_shop", label: "おかし屋" }],
    kinds: [kind("k_box", "箱", "箱"), kind("k_cookie", "クッキー", "まい")],
    quantities: [qty("q_box", "h_shop", "k_box", n(4)), qty("q_cookie", "h_shop", "k_cookie", null)],
    relations: [rel("r_per", "per", "q_cookie", "q_box", n(6))],
    asked: "q_cookie",
    answer: n(24),
  },
  {
    id: "p_rate_i",
    pair: "p_rate_c",
    type: "unit_rate",
    consistency: "inconsistent",
    problemType: "rate",
    grade: 5,
    sentences: [
      { text: "クッキーが24まいあります。", ids: ["q_cookie"] },
      { text: "1箱に6まいずつ入れます。", ids: ["r_per"] },
      { text: "箱は何箱いりますか。", ids: ["q_box"], question: true },
    ],
    holders: [{ id: "h_shop", label: "おかし屋" }],
    kinds: [kind("k_box", "箱", "箱"), kind("k_cookie", "クッキー", "まい")],
    quantities: [qty("q_box", "h_shop", "k_box", null), qty("q_cookie", "h_shop", "k_cookie", n(24))],
    relations: [rel("r_per", "per", "q_cookie", "q_box", n(6))],
    asked: "q_box",
    answer: n(4),
  },
  // Speed: the distance is asked (consistent) and the time (inconsistent). Distances and times are not counted one by one.
  {
    id: "p_speed_c",
    pair: "p_speed_i",
    type: "speed",
    consistency: "consistent",
    problemType: "rate",
    grade: 5,
    sentences: [
      { text: "自転車は、1時間に12km進みます。", ids: ["r_speed"] },
      { text: "この自転車で3時間走りました。", ids: ["q_time"] },
      { text: "何km進みましたか。", ids: ["q_dist"], question: true },
    ],
    holders: [{ id: "h_bike", label: "自転車" }],
    kinds: [kind("k_hour", "時間", "時間", false), kind("k_km", "道のり", "km", false)],
    quantities: [qty("q_time", "h_bike", "k_hour", n(3)), qty("q_dist", "h_bike", "k_km", null)],
    relations: [rel("r_speed", "per", "q_dist", "q_time", n(12))],
    asked: "q_dist",
    answer: n(36),
  },
  {
    id: "p_speed_i",
    pair: "p_speed_c",
    type: "speed",
    consistency: "inconsistent",
    problemType: "rate",
    grade: 5,
    sentences: [
      { text: "自転車で36km進みました。", ids: ["q_dist"] },
      { text: "この自転車は、1時間に12km進みます。", ids: ["r_speed"] },
      { text: "何時間走りましたか。", ids: ["q_time"], question: true },
    ],
    holders: [{ id: "h_bike", label: "自転車" }],
    kinds: [kind("k_hour", "時間", "時間", false), kind("k_km", "道のり", "km", false)],
    quantities: [qty("q_time", "h_bike", "k_hour", null), qty("q_dist", "h_bike", "k_km", n(36))],
    relations: [rel("r_speed", "per", "q_dist", "q_time", n(12))],
    asked: "q_time",
    answer: n(3),
  },
];

const signboardAsPair: ProblemRecord = { ...structuredClone(signboardRecord), pair_id: "p_fraction_c", consistency: "inconsistent" };

export const PROVISIONAL: { type: ProvisionalType; record: ProblemRecord }[] = [
  ...SPECS.map((s) => ({ type: s.type, record: build(s) })),
  { type: "fraction_multiple", record: signboardAsPair },
];
