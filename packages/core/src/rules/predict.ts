// What each hypothesis predicts on a problem, and the set W of worlds a child could build there
// (指示書 第6.7節 手順2). Pure functions only.
import type { ApplyResult } from "../apply/index.ts";
import { misreadCandidates } from "../diagnose/candidates.ts";
import type { ProblemRecord } from "../schema/problem-record.ts";
import type { WorldScene } from "../schema/world-scene.ts";
import { checkStatements, type StatementVerdict } from "../statements/index.ts";
import { runRule, type Hypothesis } from "./run.ts";
import { sameReading } from "./same-reading.ts";

export interface Prediction {
  hypothesisId: string;
  world: WorldScene;
  worldClass: number;
  verdicts: StatementVerdict[];
}

/** A world taken as the child's, with every element touched, so every sentence is checked. */
function asChild(world: WorldScene, record: ProblemRecord): ApplyResult {
  const all = [
    ...world.holders,
    ...world.item_kinds,
    ...world.quantities,
    ...world.relations,
    ...world.events,
  ].map((x) => x.id);
  const named = record.statements.flatMap((s) => s.element_ids);
  return {
    judgeWorld: world,
    drawWorld: world,
    checkWorld: world,
    touched: [...new Set([...all, ...named])].sort(),
    idMap: {},
    discarded: [],
    representable: "full",
    removedByCascade: [],
    judge: { released: [], unsatisfiable: [] },
    draw: { released: [], unsatisfiable: [], answerSetAside: [] },
    answers: [],
    unitValues: [],
    wordCues: [],
    procedures: [],
    observedReferences: [],
    carriedOnly: [],
  };
}

/** The index of the world in W, adding it when it is new. */
export function classOf(worlds: WorldScene[], w: WorldScene, referenceObserved: boolean): number {
  const i = worlds.findIndex((x) => sameReading(x, w, referenceObserved));
  if (i >= 0) return i;
  worlds.push(w);
  return worlds.length - 1;
}

export function predict(
  hs: readonly Hypothesis[],
  record: ProblemRecord,
  referenceObserved: boolean,
): { predictions: Prediction[]; worlds: WorldScene[]; referenceObserved: boolean } {
  const worlds: WorldScene[] = [];
  classOf(worlds, record.world, referenceObserved);
  for (const c of misreadCandidates(record.world)) classOf(worlds, c.world, referenceObserved);
  const predictions = hs.map((h) => {
    const world = runRule(h, record);
    const worldClass = classOf(worlds, world, referenceObserved);
    const checked = checkStatements({
      correct: record.world,
      statements: record.statements,
      syntaxMarks: record.syntax_marks,
      ops: [],
      child: asChild(world, record),
    });
    const verdicts = checked.kind === "checked" ? checked.statements.map((s) => s.verdict) : [];
    return { hypothesisId: h.id, world, worldClass, verdicts };
  });
  return { predictions, worlds, referenceObserved };
}
