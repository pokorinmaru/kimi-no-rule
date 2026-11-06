// Whether a rule reproduces the child's first readings (指示書 第5.8節 再現の判定) and grouping rules
// that build the same readings everywhere. Pure functions only.
import type { ApplyResult } from "../apply/index.ts";
import type { ProblemRecord } from "../schema/problem-record.ts";
import type { AnyOp } from "../schema/semantic.ts";
import type { WorldScene } from "../schema/world-scene.ts";
import { runRule, type Hypothesis } from "./run.ts";
import { sameReading } from "./same-reading.ts";

export interface Observation {
  record: ProblemRecord;
  child: ApplyResult;
  ops: readonly AnyOp[];
  referencePlaced: boolean;
}

export type Reproduction = "reproduced" | "missed" | "not_applicable";

/** The rule's world cut down to the relations and events the child touched. */
function cutTo(w: WorldScene, touched: ReadonlySet<string>): WorldScene {
  return {
    ...w,
    relations: w.relations.filter((r) => touched.has(r.id)),
    events: w.events.map((e) => (touched.has(e.id) ? e : { ...e, amount: null })),
  };
}

export function reproduction(h: Hypothesis, obs: Observation): Reproduction {
  if (obs.ops.length > 0 && obs.ops.every((o) => o.op === "state_answer")) return "not_applicable";
  const correct = obs.record.world;
  const touched = new Set(
    obs.child.touched.filter((id) => correct.relations.some((r) => r.id === id) || correct.events.some((e) => e.id === id)),
  );
  if (touched.size === 0) return "not_applicable";
  const ruled = cutTo(runRule(h, obs.record), touched);
  return sameReading(obs.child.judgeWorld, ruled, obs.referencePlaced) ? "reproduced" : "missed";
}

export function scoreRule(
  h: Hypothesis,
  observations: readonly Observation[],
): { reproduced: number; missed: number; notApplicable: number } {
  const out = { reproduced: 0, missed: 0, notApplicable: 0 };
  for (const o of observations) {
    const r = reproduction(h, o);
    if (r === "reproduced") out.reproduced++;
    else if (r === "missed") out.missed++;
    else out.notApplicable++;
  }
  return out;
}

/** Rules that build the same reading on every record are one hypothesis; the first of each group stands for it. */
export function groupHypotheses(hs: readonly Hypothesis[], records: readonly ProblemRecord[]): Hypothesis[][] {
  const groups: { worlds: WorldScene[]; members: Hypothesis[] }[] = [];
  for (const h of hs) {
    const worlds = records.map((r) => runRule(h, r));
    const g = groups.find((x) => x.worlds.every((w, i) => sameReading(w, worlds[i] as WorldScene, true)));
    if (g === undefined) groups.push({ worlds, members: [h] });
    else g.members.push(h);
  }
  return groups.map((g) => g.members);
}
