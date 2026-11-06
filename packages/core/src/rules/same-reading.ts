// Whether two worlds are the same reading (指示書 第5.8節 same_reading): the same world, and when the
// child placed the "1" card, the same base for every relation.
import type { WorldScene } from "../schema/world-scene.ts";
import { sameWorld } from "../world/same-world.ts";

export function sameReading(a: WorldScene, b: WorldScene, referenceObserved: boolean): boolean {
  if (!sameWorld(a, b)) return false;
  if (!referenceObserved) return true;
  const ref = new Map(b.relations.map((r) => [r.id, r.reference]));
  return a.relations.every((r) => ref.get(r.id) === r.reference);
}
