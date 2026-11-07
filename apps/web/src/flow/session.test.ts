// The session controller: the junior's words with a 4 s limit (第6.8節), the research call with a limit
// and the fallback (HANDOFF §3 F3), the device records (第7.5節), and the flow with the server down.
// Written before the implementation.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COMMON_FRACTION_READINGS, FRACTION_BANK, initialState, observe, type Hypothesis, type Rational } from "@kimi/core";
import { KOHAI_TIMEOUT_MS, RESEARCH_TIMEOUT_MS, startSession, type FlowApi } from "./session.ts";
import { createHttpApi } from "./api.ts";
import { openStore, type FlowStore } from "../store/store.ts";
import { firstReading, judgeTotal, judgeUnit } from "./problem.ts";
import { createApp } from "../../../worker/src/app.ts";
import { passBook } from "./test-book.ts";

let n = 0;
const stores: FlowStore[] = [];
function store(): FlowStore {
  const s = openStore(`kimi-session-${++n}`);
  stores.push(s);
  return s;
}
afterEach(async () => {
  for (const s of stores.splice(0)) await s.close();
});

const never = <T>(): Promise<T> => new Promise<T>(() => undefined);
const down: FlowApi = {
  kohai: () => Promise.reject(new Error("down")),
  research: () => Promise.reject(new Error("down")),
  safety: () => Promise.reject(new Error("down")),
};

const flush = () => new Promise((r) => setTimeout(r, 0));

function right(record: Parameters<typeof judgeUnit>[0]): { unit: Rational; total: Rational } {
  let unit: Rational | null = null;
  let total: Rational | null = null;
  for (let i = 1; i <= 60; i++) {
    if (unit === null && judgeUnit(record, { num: i, den: 1 })) unit = { num: i, den: 1 };
    if (total === null && judgeTotal(record, { num: i, den: 1 })) total = { num: i, den: 1 };
  }
  return { unit: unit as Rational, total: total as Rational };
}

async function solveCurrent(s: Awaited<ReturnType<typeof startSession>>): Promise<void> {
  const snap = s.actor.getSnapshot();
  const p = snap.context.problem;
  if (p === null) throw new Error("no problem");
  const rel = p.record.world.relations[0];
  s.send({ type: "PREDICT", answer: "fits" });
  s.send({ type: "PLACE_ONE", quantityId: rel?.reference as string });
  s.send({ type: "CONFIRM_YES" });
  passBook(s);
  s.send({ type: "NEXT" });
  const v = right(p.record);
  s.send({ type: "ANSWER_UNIT", value: v.unit });
  s.send({ type: "ANSWER_TOTAL", value: v.total });
  s.send({ type: "NEXT" });
  await flush();
}

describe("startSession", () => {
  it("reads consent, the intro and the research state from the device and saves them back", async () => {
    const st = store();
    const s = await startSession({ store: st, api: down });
    expect(s.actor.getSnapshot().matches({ active: "intro" })).toBe(true);
    s.send({ type: "NEXT" });
    s.send({ type: "CONSENT_YES" });
    await s.settle();
    expect(await st.getSettings()).toEqual({ consented: true, introSeen: true, lang: "ja" });
    s.stop();
    const again = await startSession({ store: st, api: down });
    expect(again.actor.getSnapshot().matches({ active: { problem: "reading" } })).toBe(true);
    again.stop();
  });

  it("with the server down, runs problems on templates, falls back for research and keeps records", async () => {
    const st = store();
    await st.setConsent(true);
    await st.setIntroSeen(true);
    const s = await startSession({ store: st, api: down, input: { maxProblems: 2 } });
    await solveCurrent(s);
    await flush();
    await s.settle();
    const snap = s.actor.getSnapshot();
    expect(snap.matches({ active: { problem: "reading" } })).toBe(true);
    expect(snap.context.line?.source).toBe("template");
    expect(snap.context.research.pool.length).toBeGreaterThan(0);
    const rows = await st.listAttempts();
    expect(rows.map((r) => r.outcome)).toEqual(["solved"]);
    expect((await st.loadResearch()).pool.length).toBeGreaterThan(0);
    s.stop();
  });

  it("keeps the junior's rule card the child left on the device (指示書 第7.1節 後輩のルールカード)", async () => {
    const st = store();
    await st.setConsent(true);
    await st.setIntroSeen(true);
    const s = await startSession({ store: st, api: down, input: { maxProblems: 3 } });
    await solveCurrent(s);
    await vi.waitFor(() => expect(s.actor.getSnapshot().matches({ active: { problem: "reading" } })).toBe(true));
    await solveCurrent(s);
    expect(s.actor.getSnapshot().matches({ active: "card" })).toBe(true);
    s.send({ type: "CARD_PICK", ruleId: "c_correct" });
    s.send({ type: "NEXT" });
    await flush();
    await s.settle();
    const rows = await st.listCards();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ leftRuleId: "c_correct", picks: 1, fitsAll: true });
    s.stop();
  });

  it("uses the junior's generated words when they come in time and pass core's gate; logs only rejected kinds", async () => {
    const st = store();
    await st.setConsent(true);
    await st.setIntroSeen(true);
    const api: FlowApi = {
      kohai: async (req) => ({ text: req.intent === "read" ? "この読み方で、テープをならべました" : "x", source: "generated", rejected: ["judging"] }),
      research: () => never(),
      safety: () => never(),
    };
    const s = await startSession({ store: st, api });
    await flush();
    expect(s.actor.getSnapshot().context.line?.text).toBe("この読み方で、テープをならべました");
    expect((await st.listGateLog()).map((g) => g.kinds)).toEqual([["judging"]]);
    s.stop();
  });

  it("keeps the template when the junior's words take longer than the limit (4 s by default)", async () => {
    expect(KOHAI_TIMEOUT_MS).toBe(4000);
    const st = store();
    await st.setConsent(true);
    await st.setIntroSeen(true);
    const api: FlowApi = { kohai: () => never(), research: () => never(), safety: () => never() };
    const s = await startSession({ store: st, api, kohaiTimeoutMs: 20 });
    const before = s.actor.getSnapshot().context.line;
    await new Promise((r) => setTimeout(r, 40));
    expect(s.actor.getSnapshot().context.line).toEqual(before);
    expect(before?.source).toBe("template");
    s.stop();
  });

  it("sends the research request once, and falls back when it does not answer in time", async () => {
    const st = store();
    await st.setConsent(true);
    await st.setIntroSeen(true);
    const research = vi.fn(() => never<{ kind: "failed" }>());
    const api: FlowApi = { kohai: () => never(), research, safety: () => never() };
    const s = await startSession({ store: st, api, researchTimeoutMs: 1500 });
    await solveCurrent(s);
    expect(research).toHaveBeenCalledTimes(1);
    expect(s.actor.getSnapshot().matches({ active: "researching" })).toBe(true);
    await new Promise((r) => setTimeout(r, 1700));
    expect(s.actor.getSnapshot().matches({ active: { problem: "reading" } })).toBe(true);
    s.stop();
  });

  it("waits at most 8 s for the research agent", () => {
    expect(RESEARCH_TIMEOUT_MS).toBe(8000);
  });

  it("with a long history on the device, the research call still gets a 200 from the worker (12 readings at most)", async () => {
    const st = store();
    await st.setConsent(true);
    await st.setIntroSeen(true);
    let research = initialState();
    const others = FRACTION_BANK.filter((x) => x.world.problem_id !== "p_signboard");
    for (let i = 0; i < 20; i++) {
      const rec = others[i % others.length] as (typeof FRACTION_BANK)[number];
      const rel = rec.world.relations[0];
      const reading = firstReading(rec, rel?.id as string, rel?.subject as string);
      if (reading !== null) research = observe(research, reading);
    }
    await st.saveResearch(research);
    const worker = createApp({ client: () => null, agent: () => ({ step: async () => ({ stopReason: "end_turn", text: "", toolCalls: [] }) }) });
    const statuses: number[] = [];
    const sent: number[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      const res = await worker.request(url, init);
      if (url.endsWith("/research")) {
        statuses.push(res.status);
        sent.push((JSON.parse(String(init?.body)) as { readings: unknown[] }).readings.length);
      }
      return res;
    }) as typeof fetch;
    const s = await startSession({ store: st, api: createHttpApi("http://localhost:8787", fetchImpl), input: { maxProblems: 2 } });
    await solveCurrent(s);
    await new Promise((r) => setTimeout(r, 50));
    expect(statuses).toEqual([200]);
    expect(sent[0]).toBeLessThanOrEqual(12);
    expect(s.actor.getSnapshot().context.research.readings.length).toBeGreaterThan(12);
    s.stop();
  });

  it("takes the research agent's pool when it comes back (core checks it again)", async () => {
    const st = store();
    await st.setConsent(true);
    await st.setIntroSeen(true);
    const pool = COMMON_FRACTION_READINGS.filter((h) => h.id === "c_correct" || h.id === "c_known_whole");
    const api: FlowApi = { kohai: () => never(), research: async () => ({ kind: "submitted", pool: structuredClone(pool) }), safety: () => never() };
    const s = await startSession({ store: st, api, input: { maxProblems: 2 } });
    await solveCurrent(s);
    await flush();
    // The agent's two come back; the floor may add the common readings the reading supports (Q43).
    expect(s.actor.getSnapshot().context.research.pool.map((e) => e.hypothesis.id)).toEqual(expect.arrayContaining(["c_correct", "c_known_whole"]));
    s.stop();
  });

  it("a safety check that cannot be done counts as unchecked; distress opens the safety screen and is logged by kind", async () => {
    const st = store();
    await st.setConsent(true);
    await st.setIntroSeen(true);
    const s = await startSession({ store: st, api: down });
    await s.checkWords("zz");
    expect(s.actor.getSnapshot().context.highlight).toBe(true);
    s.stop();
    const api: FlowApi = { kohai: () => never(), research: () => never(), safety: async () => ({ flag: "distress" }) };
    const t = await startSession({ store: st, api });
    await t.checkWords("zz");
    await flush();
    expect(t.actor.getSnapshot().matches("hard")).toBe(true);
    expect((await st.listSafety()).map((x) => x.kind)).toEqual(["distress"]);
    t.stop();
  });
});

describe("createHttpApi", () => {
  it("posts JSON to the worker's routes and gives back the reply", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ flag: "none" }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const api = createHttpApi("http://localhost:8787", fetchImpl);
    expect(await api.safety("hello", new AbortController().signal)).toEqual({ flag: "none" });
    expect(calls).toEqual([{ url: "http://localhost:8787/safety", body: { text: "hello" } }]);
  });

  it("throws on a non-2xx reply (503 without a key), so the flow falls back", async () => {
    const fetchImpl = (async () => new Response("{}", { status: 503 })) as unknown as typeof fetch;
    const api = createHttpApi("http://localhost:8787", fetchImpl);
    await expect(api.safety("x", new AbortController().signal)).rejects.toThrow();
  });
});

describe("the screen's language (HANDOFF §7 の4)", () => {
  it("starts the session in the language chosen on the device", async () => {
    const st = store();
    await st.setLang("en");
    const s = await startSession({ store: st, api: down });
    expect(s.actor.getSnapshot().context.lang).toBe("en");
    s.stop();
  });
});

describe("the research agent runs on behind the flow (Q45)", () => {
  it("the child goes on with the fallback after the wait, and a pool that comes later is used from then on", async () => {
    const st = store();
    await st.setConsent(true);
    await st.setIntroSeen(true);
    let release: (v: { kind: "submitted"; pool: Hypothesis[] }) => void = () => {};
    const late = new Promise<{ kind: "submitted"; pool: Hypothesis[] }>((r) => (release = r));
    const lateRule: Hypothesis = { ...(COMMON_FRACTION_READINGS.find((h) => h.id === "c_invert") as Hypothesis), id: "h_from_opus" };
    const api: FlowApi = { kohai: () => never(), research: () => late as never, safety: () => never() };
    const s = await startSession({ store: st, api, researchTimeoutMs: 50 });
    await solveCurrent(s);
    await new Promise((r) => setTimeout(r, 200));
    expect(s.actor.getSnapshot().context.researchApplied).toBe(true);
    expect(s.actor.getSnapshot().context.research.pool.some((e) => e.hypothesis.id === "h_from_opus")).toBe(false);
    release({ kind: "submitted", pool: [lateRule] });
    await new Promise((r) => setTimeout(r, 50));
    expect(s.actor.getSnapshot().context.lateResearchApplied).toBe(true);
    expect(s.actor.getSnapshot().context.research.pool.some((e) => e.hypothesis.id === "h_from_opus")).toBe(true);
    s.stop();
  });
});
