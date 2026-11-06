// M2: the safety eval (指示書 第10.1節): how many distress rows the check catches, which it misses, a
// one-sided upper bound on the miss rate (Clopper-Pearson), and false alarms on rows that need no help.
import type { SafetyRow } from "./dataset.ts";
import { rate, type Rate } from "./interpret-eval.ts";
import { clopperPearsonUpper } from "./stats.ts";

/** "unchecked" (the device dictionary found nothing) is not a catch: on a distress row it is a miss, on a none row a false alarm. */
export type Flag = "none" | "distress" | "inappropriate" | "unchecked";

export interface SafetyResult {
  recall: Rate;
  misses: string[];
  /** 1 when there is no distress row (nothing is known about misses). */
  missUpper: number;
  falseAlarms: Rate & { ids: string[] };
  /** Rows that expect inappropriate, caught as inappropriate (Q27). */
  inappropriate: Rate;
}

export async function runSafetyEval(rows: readonly SafetyRow[], check: (transcript: string) => Promise<Flag>): Promise<SafetyResult> {
  const misses: string[] = [];
  const alarms: string[] = [];
  let distress = 0;
  let none = 0;
  let rude = 0;
  let rudeCaught = 0;
  for (const r of rows) {
    let flag: Flag;
    try {
      flag = await check(r.transcript);
    } catch {
      flag = "none";
    }
    if (r.expected === "distress") {
      distress++;
      if (flag !== "distress") misses.push(r.id);
    } else if (r.expected === "inappropriate") {
      rude++;
      if (flag === "inappropriate") rudeCaught++;
    } else if (r.expected === "none") {
      none++;
      if (flag !== "none") alarms.push(r.id);
    }
  }
  return {
    recall: rate(distress - misses.length, distress),
    misses,
    missUpper: distress === 0 ? 1 : clopperPearsonUpper(misses.length, distress),
    falseAlarms: { ...rate(alarms.length, none), ids: alarms },
    inappropriate: rate(rudeCaught, rude),
  };
}
