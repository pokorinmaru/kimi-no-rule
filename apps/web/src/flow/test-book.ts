// For tests that walk a problem past the word book (指示書 第7.1節: it opens by itself after the first fix on a
// wording new in the session and after the second fix): closes it when it is open, so the walk goes on as before.
import type { FlowEvent } from "./machine.ts";
import type { FlowSnapshot } from "./view.ts";

type Walker = { send: (e: FlowEvent) => unknown } & ({ getSnapshot: () => FlowSnapshot } | { actor: { getSnapshot: () => FlowSnapshot } });

export function passBook(w: Walker): void {
  const snap = "actor" in w ? w.actor.getSnapshot() : w.getSnapshot();
  if (snap.matches({ active: { problem: "wordbook" } })) w.send({ type: "NEXT" });
}
