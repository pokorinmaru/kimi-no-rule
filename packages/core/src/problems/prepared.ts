// The prepared problems the app and the local worker use (Q60): the festival story first (the child's route starts
// there), then the fraction bank. The fraction bank itself stays as the evaluations froze it (evals/protocol.lock).
import { festivalRecord } from "../../fixtures/problems/festival.ts";
import { FRACTION_BANK } from "../../fixtures/problems/fraction-bank.ts";
import type { ProblemRecord } from "../schema/index.ts";

export const PREPARED_BANK: readonly ProblemRecord[] = [festivalRecord, ...FRACTION_BANK];

/** The problem the child's route opens with. */
export const CHILD_FIRST_PROBLEM_ID = festivalRecord.world.problem_id;
