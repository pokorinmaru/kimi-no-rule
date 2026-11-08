// The prepared problems the app and the local worker use (Q60): the festival story first (the child's route starts
// there), then the fraction bank. The fraction bank itself stays as the evaluations froze it (evals/protocol.lock).
import { festivalRecord, festivalWholeRecord } from "../../fixtures/problems/festival.ts";
import { FRACTION_BANK } from "../../fixtures/problems/fraction-bank.ts";
import { saleRecord } from "../../fixtures/problems/sale.ts";
import type { ProblemRecord } from "../schema/index.ts";

// The child's route opens with the story where the child's count is the whole (Q62), then the story where it is a part,
// then a percent off (Q63).
export const PREPARED_BANK: readonly ProblemRecord[] = [festivalWholeRecord, festivalRecord, saleRecord, ...FRACTION_BANK];

/** The problem the child's route opens with. */
export const CHILD_FIRST_PROBLEM_ID = festivalWholeRecord.world.problem_id;

/** The problem the child's route takes second (the part is given). */
export const CHILD_SECOND_PROBLEM_ID = festivalRecord.world.problem_id;

/** The problem the child's route takes third (a percent off, Q63). */
export const CHILD_THIRD_PROBLEM_ID = saleRecord.world.problem_id;
