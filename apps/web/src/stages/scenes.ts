// Every stage picture the app can show for the child's problems (the premise harness, 2026-11-08): for each problem
// of the bank, the correct world before and after the child's answer, and each common misreading's world. core
// computes each scene; this file only lists them. Used by the adults' #/stages page and by the scene check
// (tools/asset-builder/src/scenes-cli.ts), never by a child's screen.
import { COMMON_FRACTION_READINGS, FRACTION_BANK, objectScene, readingLine, runRule, sameWorld, solve, type ObjectScene, type ProblemRecord, type Rational, type WorldScene } from "@kimi/core";

export interface SceneCase {
  id: string;
  problemId: string;
  problemText: string;
  /** What this world is, in words for the reviewer (never shown to a child). */
  world: string;
  correct: boolean;
  scene: ObjectScene;
}

const asked = (r: ProblemRecord): Rational[] => {
  const s = solve(r.world);
  if (s.kind !== "unique") return [];
  const v = s.values.get(r.world.question.target_id);
  return v === undefined ? [] : [{ num: Number(v.num), den: Number(v.den) }];
};

export function sceneCases(bank: readonly ProblemRecord[] = FRACTION_BANK): SceneCase[] {
  const out: SceneCase[] = [];
  for (const r of bank) {
    const text = r.statements.map((s) => s.text).join("");
    const add = (id: string, world: string, shown: WorldScene, said: Rational[], correct: boolean): void => {
      const scene = objectScene(shown, r.world, { values: said });
      if (scene !== null) out.push({ id: `${r.world.problem_id}/${id}`, problemId: r.world.problem_id, problemText: text, world, correct, scene });
    };
    add("correct", "the correct world, before the child answers", r.world, [], true);
    add("correct_answered", "the correct world, after the child answered", r.world, asked(r), true);
    for (const h of COMMON_FRACTION_READINGS) {
      if (h.id === "c_correct") continue;
      let w: WorldScene;
      try {
        w = runRule(h, r);
      } catch {
        continue;
      }
      // A misreading that gives the correct world on this problem is never shown as a wrong world (the junior's
      // world would fit), so it is not a misread scene (scene check, 2026-11-08).
      if (sameWorld(w, r.world)) continue;
      add(h.id, `a misread world: ${readingLine(h, "en")}`, w, [], false);
    }
  }
  return out;
}

/**
 * The stored problems of a continuous unit (juice dL, water L, yarn m), for listing their scenes too:
 * `sceneCases(continuousRecords(STORED_PROBLEMS))` (the bank has none; added for the continuous stage pictures, 2026-11-08).
 */
export function continuousRecords(records: readonly ProblemRecord[]): ProblemRecord[] {
  return records.filter((r) => r.world.item_kinds.some((k) => !k.countable));
}
