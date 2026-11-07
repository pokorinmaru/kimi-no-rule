// The simulated children of the adults' try route (指示書 第6.9節 模擬の子ども). A web-side copy of the rules of the
// research eval's children (tools/evals), limited to the readings a finger can show in this flow: who is taken
// as 1. The eval's code is not imported here; a test checks that every rule is the eval's rule with the same id.
// The words of the eval's children are not copied (the simulated child taps no word).
import { COMMON_FRACTION_READINGS, runRule, type Hypothesis, type ProblemRecord } from "@kimi/core";

export interface TryChild {
  /** The id of the eval's simulated child. */
  id: string;
  /** For the adult: what this child does (never shown on the child's screens). */
  label: string;
  rule: Hypothesis;
}

const common = (id: string): Hypothesis => {
  const h = COMMON_FRACTION_READINGS.find((x) => x.id === id);
  if (h === undefined) throw new Error(`no common reading ${id}`);
  return h;
};

export const TRY_CHILDREN: readonly TryChild[] = [
  { id: "s_known", label: "わかっている数の人を「1」とみる子", rule: common("c_known_whole") },
  { id: "s_first", label: "先に出てきた人を「1」とみる子", rule: common("c_first_whole") },
  { id: "s_swap", label: "文と反対の人を「1」とみる子", rule: common("c_swap") },
  {
    id: "s_larger",
    label: "数が大きいほうの人を「1」とみる子",
    rule: { id: "s_larger", origin: "math", clauses: [{ when: { pred: "true", args: [] }, then: { action: "choose_reference", by: "larger_number" } }], word_cues: [], note_for_adult: "" },
  },
  {
    id: "s_more_swap",
    label: "1より大きい分数の時だけ反対にする子",
    rule: {
      id: "s_more_swap",
      origin: "math",
      clauses: [
        { when: { pred: "ratio_kind_is", args: ["gt1"] }, then: { action: "swap_reference" } },
        { when: { pred: "true", args: [] }, then: { action: "no_change" } },
      ],
      word_cues: [],
      note_for_adult: "",
    },
  },
  { id: "s_correct", label: "文のとおりに読む子", rule: common("c_correct") },
];

/** Where this child puts the "1" card on a problem: the reference of the relation in the world its rule builds (core runRule). */
export function placementOf(child: TryChild, record: ProblemRecord): string {
  const rel = record.world.relations[0];
  if (rel === undefined) throw new Error(`no relation in ${record.world.problem_id}`);
  const built = runRule(child.rule, record).relations.find((r) => r.id === rel.id);
  const ref = built?.reference ?? rel.reference;
  if (ref === null) throw new Error(`no reference in ${record.world.problem_id}`);
  return ref;
}
