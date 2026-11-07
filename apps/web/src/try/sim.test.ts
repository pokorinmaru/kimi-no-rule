// The simulated child of the adults' try route (指示書 第6.9節 模擬の子ども, 第11節 M5). Its readings are a
// web-side copy of the research eval's children that a finger can show (who is taken as 1); each places the
// "1" card where its rule puts it, deterministically, through the same machine a child uses.
// Written before the implementation.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { FRACTION_BANK, runRule, sameReading } from "@kimi/core";
import { SIM_CHILDREN as EVAL_CHILDREN } from "../../../../tools/evals/src/research-children.ts";
import { TRY_CHILDREN, placementOf } from "./sim-children.ts";
import { simEvent, runSim } from "./sim.ts";
import { firstReading } from "../flow/problem.ts";
import { startSession, type FlowApi } from "../flow/session.ts";
import { openStore, type FlowStore } from "../store/store.ts";

const stores: FlowStore[] = [];
let n = 0;
function store(): FlowStore {
  const s = openStore(`kimi-try-sim-${++n}`);
  stores.push(s);
  return s;
}
afterEach(async () => {
  for (const s of stores.splice(0)) await s.close();
});

const down: FlowApi = {
  kohai: () => Promise.reject(new Error("down")),
  research: () => Promise.reject(new Error("down")),
  safety: () => Promise.reject(new Error("down")),
};

describe("the try route's simulated children", () => {
  it("are the eval's children (same id, same rule), only those a finger can show", () => {
    expect(TRY_CHILDREN.length).toBeGreaterThanOrEqual(4);
    for (const c of TRY_CHILDREN) {
      const e = EVAL_CHILDREN.find((x) => x.id === c.id);
      expect(e, c.id).toBeDefined();
      expect(c.rule).toEqual(e?.rule);
      expect(c.label.length).toBeGreaterThan(0);
    }
  });

  it("place the 1 card so that the child's first reading is the rule's world on every bank problem", () => {
    for (const c of TRY_CHILDREN) {
      for (const record of FRACTION_BANK) {
        const rel = record.world.relations[0];
        const q = placementOf(c, record);
        expect(q === rel?.subject || q === rel?.reference, `${c.id} ${record.world.problem_id}`).toBe(true);
        const fr = firstReading(record, rel?.id as string, q);
        expect(fr).not.toBeNull();
        expect(sameReading(runRule(c.rule, record), fr?.childWorld as never, true), `${c.id} ${record.world.problem_id}`).toBe(true);
      }
    }
  });
});

describe("simEvent and runSim", () => {
  it("plays nothing before the problem screen (the adult goes through the intro and consent)", async () => {
    const s = await startSession({ store: store(), api: null });
    const child = TRY_CHILDREN.find((c) => c.id === "s_known");
    if (child === undefined) throw new Error("s_known");
    expect(simEvent(s.actor.getSnapshot(), child, "p_signboard")).toBe("done");
    s.stop();
  });

  it("plays one problem: the same prediction, the same placement, repeated until the problem is held; then stops on the next problem", async () => {
    const s = await startSession({ store: store(), api: down, input: { lang: "ja" } });
    s.send({ type: "NEXT" });
    s.send({ type: "CONSENT_YES" });
    const child = TRY_CHILDREN.find((c) => c.id === "s_known");
    if (child === undefined) throw new Error("s_known");
    const first = s.actor.getSnapshot().context.problem?.record.world.problem_id;
    await runSim(s, child, 0);
    const c = s.actor.getSnapshot().context;
    expect(c.log).toHaveLength(1);
    expect(c.log[0]?.problemId).toBe(first);
    expect(c.log[0]?.outcome).toBe("held");
    // The first placement is where the rule puts the 1 (the research observation).
    const rec = FRACTION_BANK.find((r) => r.world.problem_id === first);
    if (rec === undefined) throw new Error("record");
    expect(c.log[0]?.firstPlacement).toBe(placementOf(child, rec));
    // One reading per problem: the first placement (the card of its prediction adds none, Q52).
    expect(c.research.readings).toHaveLength(1);
    // The second problem is open and untouched.
    expect(c.problem?.record.world.problem_id).not.toBe(first);
    expect(c.problem?.prediction).toBeNull();
    expect(c.problem?.guess).toBeNull();
    expect(s.actor.getSnapshot().matches({ active: { problem: "guess" } })).toBe(true);

    // The same run again gives the same events (deterministic).
    const s2 = await startSession({ store: store(), api: down, input: { lang: "ja" } });
    s2.send({ type: "NEXT" });
    s2.send({ type: "CONSENT_YES" });
    await runSim(s2, child, 0);
    expect(s2.actor.getSnapshot().context.log).toEqual(c.log);
    expect(s2.actor.getSnapshot().context.problem?.record.world.problem_id).toBe(c.problem?.record.world.problem_id);
    s.stop();
    s2.stop();
  });

  it("stops when the child's 1 makes the junior's world fit: the adult types the numbers", async () => {
    const s = await startSession({ store: store(), api: null, input: { lang: "ja" } });
    s.send({ type: "NEXT" });
    s.send({ type: "CONSENT_YES" });
    const child = TRY_CHILDREN.find((c) => c.id === "s_correct");
    if (child === undefined) throw new Error("s_correct");
    await runSim(s, child, 0);
    expect(s.actor.getSnapshot().matches({ active: { problem: "rebuilt" } })).toBe(true);
    expect(s.actor.getSnapshot().context.log).toHaveLength(0);
    s.stop();
  });
});
