// The options of the junior's rule card (Q38). Kept apart from common.ts, which the research eval freezes.
import type { Hypothesis } from "../rules/run.ts";
import { COMMON_FRACTION_READINGS, CORRECT_READING_ID } from "./common.ts";
/**
 * The options of the junior's rule card that the child edits (指示書 第7.1節 後輩のルールカード): the common
 * readings that change who is taken as 1, and the reading that keeps the 1 the sentence says. The order is
 * fixed here and says nothing about which one fits.
 */
export const CARD_RULE_IDS = ["c_known_whole", "c_first_whole", "c_swap", CORRECT_READING_ID] as const;
export const CARD_RULES: readonly Hypothesis[] = CARD_RULE_IDS.map((id) => {
  const h = COMMON_FRACTION_READINGS.find((x) => x.id === id);
  if (h === undefined) throw new Error(`no common reading ${id}`);
  return h;
});
