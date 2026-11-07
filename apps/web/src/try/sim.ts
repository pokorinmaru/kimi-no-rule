// The simulated child plays one problem through the same machine a child uses (指示書 第6.9節 模擬の子ども): the
// prediction, then the "1" card where its rule puts it, confirmed, again after each try, until the problem is
// held or the junior's world fits (the adult then types the numbers). Every step is decided by the child's rule
// and core; nothing is random, so the same child on the same bank always plays the same events.
import { runRule, sameReading } from "@kimi/core";
import type { FlowEvent } from "../flow/machine.ts";
import type { FlowSnapshot } from "../flow/view.ts";
import type { Session } from "../flow/session.ts";
import { placementOf, type TryChild } from "./sim-children.ts";

/** The child's next event on the problem it started on; "wait" while the flow moves on by itself; "done" when it stops. */
export function simEvent(snap: FlowSnapshot, child: TryChild, startProblemId: string | null): FlowEvent | "wait" | "done" {
  if (snap.status !== "active") return "done";
  if (snap.matches({ active: "researching" }) || snap.matches({ active: "next" }) || snap.matches({ active: "loading" })) return "wait";
  const p = snap.context.problem;
  if (!snap.matches({ active: "problem" }) || p === null || startProblemId === null) return "done";
  if (p.record.world.problem_id !== startProblemId) return "done";
  if (snap.matches({ active: { problem: "reading" } })) {
    if (p.prediction !== null) return "done";
    let same: boolean;
    try {
      same = sameReading(runRule(child.rule, p.record), p.base, true);
    } catch {
      same = false;
    }
    return { type: "PREDICT", answer: same ? "fits" : "odd" };
  }
  if (snap.matches({ active: { problem: "looking" } })) return { type: "PLACE_ONE", quantityId: placementOf(child, p.record) };
  if (snap.matches({ active: { problem: "placed" } })) return { type: "CONFIRM_YES" };
  if (snap.matches({ active: { problem: "held" } })) return { type: "NEXT" };
  // The junior's staged questions and the word book: the simulated child reads on and answers nothing it has no rule for.
  if (snap.matches({ active: { problem: { help: "read" } } })) return { type: "NEXT" };
  if (snap.matches({ active: { problem: { help: "order" } } })) return { type: "DONT_KNOW" };
  if (snap.matches({ active: { problem: { help: "offer" } } })) return { type: "NEXT" };
  if (snap.matches({ active: { problem: "wordbook" } })) return { type: "NEXT" };
  return "done";
}

/** Plays the problem open now, one event every `delayMs` (so an adult can watch), and resolves when the child stops. */
export function runSim(session: Pick<Session, "actor" | "send">, child: TryChild, delayMs: number, signal?: AbortSignal): Promise<void> {
  const start = session.actor.getSnapshot().context.problem?.record.world.problem_id ?? null;
  return new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      sub.unsubscribe();
      if (timer !== undefined) clearTimeout(timer);
      resolve();
    };
    const tick = (): void => {
      timer = undefined;
      if (signal?.aborted === true) return finish();
      const ev = simEvent(session.actor.getSnapshot(), child, start);
      if (ev === "done") return finish();
      // The flow moves on by itself (the research reply): the next snapshot wakes the child again.
      if (ev === "wait") return;
      session.send(ev);
      schedule();
    };
    const schedule = (): void => {
      if (!finished && timer === undefined) timer = setTimeout(tick, delayMs);
    };
    const sub = session.actor.subscribe({ next: schedule, complete: finish, error: finish });
    signal?.addEventListener("abort", finish);
    schedule();
  });
}
