// The common readings of a fraction as a multiple (指示書 第6.7節 手順4 (b), 第10.2節): the readings the junior
// borrows before a hypothesis exists, the competitors it alternates with, and the pool the enumeration
// baseline starts from. Each is a rule of the reading language, run only through runRule.
import type { Hypothesis } from "../rules/run.ts";

type Action = Hypothesis["clauses"][number]["then"];
const always = (id: string, then: Action, note: string): Hypothesis => ({
  id,
  origin: "math",
  clauses: [{ when: { pred: "true", args: [] }, then }],
  word_cues: [],
  note_for_adult: note,
});

export const CORRECT_READING_ID = "c_correct";

export const COMMON_FRACTION_READINGS: readonly Hypothesis[] = [
  always(CORRECT_READING_ID, { action: "no_change" }, "reads the text as written"),
  always("c_swap", { action: "swap_reference" }, "takes the other holder as 1"),
  always("c_known_whole", { action: "choose_reference", by: "known_value" }, "takes the holder whose number is known as 1 (on this type, the same reading as always multiplying)"),
  always("c_first_whole", { action: "choose_reference", by: "first_mentioned" }, "takes the holder mentioned first as 1"),
  always("c_additive", { action: "set_relation_type_additive", amount: "numerator" }, "reads the numerator as a difference"),
  always("c_divide", { action: "number_op", mode: "divide_always" }, "always divides the numbers"),
  always("c_invert", { action: "invert_ratio" }, "turns the fraction upside down"),
];

/** The common readings other than the correct one: what the junior may borrow as a competitor. */
export const COMMON_MISREADINGS: readonly Hypothesis[] = COMMON_FRACTION_READINGS.filter((h) => h.id !== CORRECT_READING_ID);
