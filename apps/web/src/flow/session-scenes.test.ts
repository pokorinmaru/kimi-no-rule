// 指示書 第6.7節 手順5 through the session controller: when the rule card opens (and whenever its scenes are made
// for another reading), the controller asks POST /scenes once; a passing proposal replaces the program's pair,
// and a failed, late or refused call leaves it. Through the real worker app with a fake Claude client.
// Written before the implementation.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type { Rational } from "@kimi/core";
import { startSession, type FlowApi } from "./session.ts";
import { createHttpApi } from "./api.ts";
import { openStore, type FlowStore } from "../store/store.ts";
import { judgeTotal, judgeUnit } from "./problem.ts";
import { createApp, type WorkerDeps } from "../../../worker/src/app.ts";
import { passBook } from "./test-book.ts";

type ClaudeClient = NonNullable<ReturnType<WorkerDeps["client"]>>;
type ClaudeRequest = Parameters<ClaudeClient["complete"]>[0];

let n = 0;
const stores: FlowStore[] = [];
async function store(): Promise<FlowStore> {
  const s = openStore(`kimi-session-scenes-${++n}`);
  stores.push(s);
  await s.setConsent(true);
  await s.setIntroSeen(true);
  return s;
}
afterEach(async () => {
  for (const s of stores.splice(0)) await s.close();
});
const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));

async function solveCurrent(s: Awaited<ReturnType<typeof startSession>>): Promise<void> {
  if (s.actor.getSnapshot().matches({ active: "researching" })) s.send({ type: "RESEARCH_RESULT", pool: null });
  const p = s.actor.getSnapshot().context.problem;
  if (p === null) throw new Error("no problem");
  const rel = p.record.world.relations[0];
  s.send({ type: "PREDICT", answer: "fits" });
  s.send({ type: "PLACE_ONE", quantityId: rel?.reference as string });
  s.send({ type: "CONFIRM_YES" });
  passBook(s);
  s.send({ type: "NEXT" });
  let unit: Rational | null = null;
  let total: Rational | null = null;
  for (let i = 1; i <= 60; i++) {
    if (unit === null && judgeUnit(p.record, { num: i, den: 1 })) unit = { num: i, den: 1 };
    if (total === null && judgeTotal(p.record, { num: i, den: 1 })) total = { num: i, den: 1 };
  }
  s.send({ type: "ANSWER_UNIT", value: unit as Rational });
  s.send({ type: "ANSWER_TOTAL", value: total as Rational });
  s.send({ type: "NEXT" });
  await flush();
}

const proposal = {
  breaks: { material: "cup_juice", frame: "within", known: "reference", order: "relation_first", known_value: 28, num: 3, den: 4, limit: null },
  keeps: { material: "tank_water", frame: "cap", known: "subject", order: "known_first", known_value: 21, num: 3, den: 4, limit: 29 },
  reason_for_adult: "The cup overflows when the juice is taken as 1.",
};

class Fake implements ClaudeClient {
  readonly requests: ClaudeRequest[] = [];
  constructor(private readonly text: string) {}
  async complete(req: ClaudeRequest) {
    this.requests.push(req);
    return { stopReason: "end_turn" as const, text: this.text };
  }
}

function through(client: ClaudeClient | null, seen: string[]): FlowApi {
  const worker = createApp({ client: () => client, agent: () => null });
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    if (url.endsWith("/scenes")) seen.push(String(init?.body));
    return worker.request(url, init);
  }) as typeof fetch;
  return createHttpApi("http://localhost:8787", fetchImpl);
}

async function toCard(api: FlowApi | null): Promise<Awaited<ReturnType<typeof startSession>>> {
  const s = await startSession({ store: await store(), api, input: { maxProblems: 3 }, researchTimeoutMs: 10 });
  await solveCurrent(s);
  await flush(20);
  await solveCurrent(s);
  expect(s.actor.getSnapshot().matches({ active: "card" })).toBe(true);
  return s;
}

describe("the scenes call from the rule card", () => {
  it("asks once per reading and takes a proposal core passes for the swap", async () => {
    const seen: string[] = [];
    const fake = new Fake(JSON.stringify(proposal));
    const s = await toCard(through(fake, seen));
    await flush(30);
    expect(seen.length).toBe(1);
    // The card opened with the junior's reading; the fake's proposal is one core passes for the swap only.
    const start = s.actor.getSnapshot().context.ruleCard?.start.id;
    const other = start === "c_known_whole" ? "c_first_whole" : "c_known_whole";
    s.send({ type: "CARD_PICK", ruleId: other });
    await flush(50);
    s.send({ type: "CARD_PICK", ruleId: "c_swap" });
    await flush(50);
    expect(seen.length).toBe(3);
    const body = JSON.parse(seen.at(-1) ?? "{}") as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["lang", "rule", "word_kinds"]);
    expect((body.rule as { id: string }).id).toBe("c_swap");
    const scenes = s.actor.getSnapshot().context.ruleCard?.scenes;
    expect(scenes?.focus.id).toBe("c_swap");
    expect(scenes?.source).toBe("claude");
    // Back to the sentence's own reading: the scenes stay for the card's first reading; no call for it.
    s.send({ type: "CARD_PICK", ruleId: "c_correct" });
    await flush(30);
    s.stop();
  });

  it("keeps the program's pair without a key (503), and with the server down", async () => {
    const seen: string[] = [];
    const s = await toCard(through(null, seen));
    s.send({ type: "CARD_PICK", ruleId: "c_swap" });
    await flush(50);
    expect(s.actor.getSnapshot().context.ruleCard?.scenes?.source).toBe("program");
    s.stop();
    const offline = await toCard(null);
    expect(offline.actor.getSnapshot().context.ruleCard?.scenes?.source).toBe("program");
    offline.stop();
  });
});
