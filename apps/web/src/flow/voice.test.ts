// The child's voice in the flow (指示書 第7.1節 手順5, 第6.1節; 第11節 M6 with the browser's speech recognition
// the user chose). On the "looking" and "placed" steps the child may say who is taken as 1. The junior says a
// fixed acknowledgement at once; the words go to POST /safety and POST /interpret together; core checks the ops
// before the flow uses them; a reference op becomes the same as the child's PLACE_ONE, problem words heard become
// tapped-word cues, and the words themselves stay in memory only (the restate line and the research request).
// Any failure leaves the card: the junior asks for it with a fixed line. Written before the implementation.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { createActor } from "xstate";
import { TEMPLATES, type AnyOp } from "@kimi/core";
import { MAX_VOICE_TURNS, flowMachine, type FlowInput } from "./machine.ts";
import { startSession, type FlowApi } from "./session.ts";
import { WorkerError, type InterpretReply, type SafetyReply } from "./api.ts";
import { childTexts, viewOf } from "./view.ts";
import { hasForbiddenPhrase } from "./text.ts";
import { openStore, type FlowStore } from "../store/store.ts";
import { passBook } from "./test-book.ts";

const SAID = "弟が1だよ、弟の金魚の3/4だから";
const toOtouto: AnyOp = { op: "set_relation_reference", target_id: "r_ratio", reference: "q_otouto", evidence: "" };

function run(input: FlowInput = { introSeen: true, consented: true }) {
  const actor = createActor(flowMachine, { input });
  actor.start();
  return actor;
}

function looking(input?: FlowInput) {
  const actor = run(input);
  actor.send({ type: "GUESS", larger: null });
  actor.send({ type: "PREDICT", answer: "odd" });
  expect(actor.getSnapshot().matches({ active: { problem: "looking" } })).toBe(true);
  return actor;
}

const variants = (key: keyof typeof TEMPLATES, lang: "ja" | "en" = "ja"): readonly string[] => TEMPLATES[key][lang];
const isLine = (key: keyof typeof TEMPLATES, text: string | undefined, lang: "ja" | "en" = "ja"): boolean => variants(key, lang).includes(text ?? "");

describe("the machine: the child's voice on the problem", () => {
  it("is heard only on the looking and placed steps, and the junior acknowledges at once with a fixed line", () => {
    const actor = run();
    actor.send({ type: "VOICE_HEARD", transcript: SAID });
    // Before the prediction nothing is heard (the sentences have not been checked yet).
    expect(actor.getSnapshot().context.problem?.heard ?? null).toBeNull();
    actor.send({ type: "GUESS", larger: null });
    actor.send({ type: "PREDICT", answer: "fits" });
    actor.send({ type: "VOICE_HEARD", transcript: SAID });
    const s = actor.getSnapshot();
    expect(s.context.line?.key).toBe("kohai.listening");
    expect(isLine("kohai.listening", s.context.line?.text)).toBe(true);
    // The acknowledgement asks the worker for nothing.
    expect(s.context.line?.request).toBeNull();
    expect(s.context.problem?.listening).toBe(true);
    const v = viewOf(s);
    expect(v.screen === "problem" && v.voice.canTalk).toBe(false);
    expect(v.screen === "problem" && v.voice.listening).toBe(true);
  });

  it("a reference op from the voice is the same as the child's PLACE_ONE, and the junior restates with the words heard", () => {
    const actor = looking();
    actor.send({ type: "VOICE_HEARD", transcript: SAID });
    actor.send({ type: "VOICE_OPS", ops: [toOtouto] });
    const s = actor.getSnapshot();
    expect(s.matches({ active: { problem: "placed" } })).toBe(true);
    expect(s.context.problem?.placement).toBe("q_otouto");
    const line = s.context.line?.text ?? "";
    expect(line).toContain("弟");
    expect(line).toContain(SAID);
    expect(s.context.line?.key).toBe("kohai.restate");
    // The problem words heard (弟, 3/4) become the tapped-word cues; "の" alone is too common to take.
    const p = s.context.problem;
    const words = (p?.words ?? []).map((w) => p?.record.statements[w.statementIndex]?.tokens[w.token]);
    expect(words).toEqual(expect.arrayContaining(["弟", "3/4"]));
    expect(words).not.toContain("の");
    // The worker's restate request gets the problem's words only, never the raw words.
    expect(JSON.stringify(s.context.line?.request)).not.toContain(SAID);
  });

  it("takes 4分の3 as the problem's 3/4", () => {
    const actor = looking();
    actor.send({ type: "VOICE_HEARD", transcript: "弟の金魚の4分の3だから、弟が1" });
    actor.send({ type: "VOICE_OPS", ops: [toOtouto] });
    const p = actor.getSnapshot().context.problem;
    const words = (p?.words ?? []).map((w) => p?.record.statements[w.statementIndex]?.tokens[w.token]);
    expect(words).toContain("3/4");
  });

  it("the child confirms; the research request carries the words heard, the device's log does not", () => {
    const actor = looking();
    actor.send({ type: "VOICE_HEARD", transcript: SAID });
    actor.send({ type: "VOICE_OPS", ops: [toOtouto] });
    actor.send({ type: "CONFIRM_YES" });
    passBook(actor);
    const s = actor.getSnapshot();
    expect(s.matches({ active: { problem: "rebuilt" } })).toBe(true);
    expect(s.context.researchRequest?.readings.at(-1)?.words).toEqual([SAID]);
    // The words are let go once taught (memory only, and not longer than needed).
    expect(s.context.problem?.heard).toBeNull();
    actor.send({ type: "STOP" });
    expect(JSON.stringify(actor.getSnapshot().context.log)).not.toContain("弟が1だよ");
    expect(JSON.stringify(actor.getSnapshot().context.research)).not.toContain("弟が1だよ");
  });

  it("no usable op, ops core refuses, an op on a quantity that is not an end, and no ops all leave the card, with the fixed ask", () => {
    const cases: (AnyOp[] | null)[] = [
      null,
      [],
      [{ op: "swap_relation_direction", target_id: "r_nowhere", evidence: "" } as AnyOp],
      [{ op: "set_relation_reference", target_id: "r_ratio", reference: "q_nobody", evidence: "" }],
      [{ op: "state_answer", target_id: "q_otouto", value: { num: 8, den: 1 }, evidence: "" } as unknown as AnyOp],
    ];
    for (const ops of cases) {
      const actor = looking();
      actor.send({ type: "VOICE_HEARD", transcript: SAID });
      actor.send({ type: "VOICE_OPS", ops });
      const s = actor.getSnapshot();
      expect(s.matches({ active: { problem: "looking" } }), JSON.stringify(ops)).toBe(true);
      expect(s.context.problem?.placement).toBeNull();
      expect(isLine("kohai.show_card", s.context.line?.text)).toBe(true);
      expect(s.context.problem?.heard).toBeNull();
      // Taps go on as before.
      const rel = s.context.problem?.record.world.relations.find((r) => r.id === s.context.problem?.relationId);
      actor.send({ type: "PLACE_ONE", quantityId: rel?.reference as string });
      expect(actor.getSnapshot().matches({ active: { problem: "placed" } })).toBe(true);
    }
  });

  it("never says back a number the child said that is the answer (core's gate), nor an operation name", () => {
    for (const said of ["弟は8匹だよ、弟が1", "6に3/4をかけるから弟が1"]) {
      const actor = looking();
      actor.send({ type: "VOICE_HEARD", transcript: said });
      actor.send({ type: "VOICE_OPS", ops: [toOtouto] });
      const line = actor.getSnapshot().context.line?.text ?? "";
      expect(actor.getSnapshot().context.problem?.placement).toBe("q_otouto");
      expect(line).toContain("弟");
      expect(line).not.toContain("8");
      expect(line).not.toContain("かける");
      expect(line).not.toContain(said);
    }
  });

  it("the child's own card moves win: a finger placement after the voice drops the words heard and the late ops", () => {
    const actor = looking();
    actor.send({ type: "VOICE_HEARD", transcript: SAID });
    const rel = actor.getSnapshot().context.problem?.record.world.relations[0];
    actor.send({ type: "PLACE_ONE", quantityId: rel?.subject as string });
    expect(actor.getSnapshot().context.problem?.heard).toBeNull();
    actor.send({ type: "VOICE_OPS", ops: [toOtouto] });
    expect(actor.getSnapshot().context.problem?.placement).toBe(rel?.subject);
  });

  it(`hears at most ${String(MAX_VOICE_TURNS)} times on one problem (指示書 第7.1節), then the card only`, () => {
    const actor = looking();
    for (let i = 0; i < MAX_VOICE_TURNS; i++) {
      actor.send({ type: "VOICE_HEARD", transcript: "えっと" });
      actor.send({ type: "VOICE_OPS", ops: null });
    }
    actor.send({ type: "VOICE_HEARD", transcript: SAID });
    const s = actor.getSnapshot();
    expect(s.context.problem?.heard).toBeNull();
    expect(s.context.problem?.listening).toBe(false);
    const v = viewOf(s);
    expect(v.screen === "problem" && v.voice.canTalk).toBe(false);
  });

  it("an unreachable worker turns the voice off for the session", () => {
    const actor = looking();
    actor.send({ type: "VOICE_HEARD", transcript: SAID });
    actor.send({ type: "VOICE_OPS", ops: null, offline: true });
    const s = actor.getSnapshot();
    expect(s.context.voiceOff).toBe(true);
    const v = viewOf(s);
    expect(v.screen === "problem" && v.voice.canTalk).toBe(false);
    expect(v.screen === "problem" && v.voice.off).toBe(true);
  });

  it("the English screen says the same lines in English, and no screen has a forbidden phrase", () => {
    const actor = looking({ introSeen: true, consented: true, lang: "en" });
    actor.send({ type: "VOICE_HEARD", transcript: "the little brother is one" });
    expect(isLine("kohai.listening", actor.getSnapshot().context.line?.text, "en")).toBe(true);
    for (const t of childTexts(viewOf(actor.getSnapshot()))) expect(hasForbiddenPhrase(t), t).toBe(false);
    actor.send({ type: "VOICE_OPS", ops: null });
    expect(isLine("kohai.show_card", actor.getSnapshot().context.line?.text, "en")).toBe(true);
    for (const t of childTexts(viewOf(actor.getSnapshot()))) expect(hasForbiddenPhrase(t), t).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// The session controller: the calls, their limits, and the device's store
// ---------------------------------------------------------------------------------------------

let n = 0;
const stores: FlowStore[] = [];
async function readyStore(): Promise<FlowStore> {
  const s = openStore(`kimi-voice-${String(++n)}`);
  stores.push(s);
  await s.setConsent(true);
  await s.setIntroSeen(true);
  return s;
}
afterEach(async () => {
  for (const s of stores.splice(0)) await s.close();
});

const never = <T>(): Promise<T> => new Promise<T>(() => undefined);
const flush = () => new Promise((r) => setTimeout(r, 0));

interface Calls {
  safety: string[];
  interpret: unknown[];
}

function api(over: { safety?: (t: string) => Promise<SafetyReply>; interpret?: (b: unknown) => Promise<InterpretReply> } = {}): { api: FlowApi; calls: Calls } {
  const calls: Calls = { safety: [], interpret: [] };
  return {
    calls,
    api: {
      kohai: () => Promise.reject(new Error("down")),
      research: () => Promise.reject(new Error("down")),
      safety: (t) => {
        calls.safety.push(t);
        return over.safety?.(t) ?? Promise.resolve({ flag: "none" });
      },
      interpret: (b) => {
        calls.interpret.push(b);
        return over.interpret?.(b) ?? Promise.resolve({ status: "ok", ops: [toOtouto] });
      },
    },
  };
}

describe("the session: what the child said goes to /safety and /interpret together", () => {
  it("acknowledges before the replies, sends the words with the problem's id only, and places the card from the ops", async () => {
    const st = await readyStore();
    let release: (r: InterpretReply) => void = () => undefined;
    const { api: a, calls } = api({ interpret: () => new Promise<InterpretReply>((r) => (release = r)) });
    const s = await startSession({ store: st, api: a });
    s.send({ type: "GUESS", larger: null });
    s.send({ type: "PREDICT", answer: "fits" });
    expect(s.canHear).toBe(true);
    const done = s.hear(SAID);
    await flush();
    expect(isLine("kohai.listening", s.actor.getSnapshot().context.line?.text)).toBe(true);
    expect(calls.safety).toEqual([SAID]);
    expect(calls.interpret).toEqual([{ problem_id: "p_signboard", transcript: SAID, lang: "ja" }]);
    release({ status: "ok", ops: [toOtouto] });
    await done;
    const snap = s.actor.getSnapshot();
    expect(snap.matches({ active: { problem: "placed" } })).toBe(true);
    expect(snap.context.line?.text).toContain(SAID);
    s.stop();
  });

  it("a distress result goes to the hard screen and the ops are not used", async () => {
    const st = await readyStore();
    const { api: a } = api({ safety: () => Promise.resolve({ flag: "distress" }) });
    const s = await startSession({ store: st, api: a });
    s.send({ type: "GUESS", larger: null });
    s.send({ type: "PREDICT", answer: "fits" });
    await s.hear("もういやだ");
    expect(s.actor.getSnapshot().matches("hard")).toBe(true);
    s.stop();
  });

  it("an unchecked result (Q26): the junior does not answer what was said, and the three buttons are lit", async () => {
    const st = await readyStore();
    const { api: a } = api({ safety: () => Promise.reject(new Error("down")) });
    const s = await startSession({ store: st, api: a, safetyTimeoutMs: 50 });
    s.send({ type: "GUESS", larger: null });
    s.send({ type: "PREDICT", answer: "fits" });
    await s.hear(SAID);
    const snap = s.actor.getSnapshot();
    expect(snap.context.highlight).toBe(true);
    expect(snap.context.problem?.placement).toBeNull();
    expect(isLine("kohai.show_card", snap.context.line?.text)).toBe(true);
    s.stop();
  });

  it("a late or failed interpretation leaves the card, with the fixed ask; taps go on", async () => {
    for (const interpret of [() => never<InterpretReply>(), () => Promise.reject(new WorkerError(500)), () => Promise.resolve({ status: "ask_back", ops: [] } as InterpretReply)]) {
      const st = await readyStore();
      const { api: a } = api({ interpret });
      const s = await startSession({ store: st, api: a, interpretTimeoutMs: 30 });
      s.send({ type: "GUESS", larger: null });
      s.send({ type: "PREDICT", answer: "fits" });
      await s.hear(SAID);
      const snap = s.actor.getSnapshot();
      expect(snap.matches({ active: { problem: "looking" } })).toBe(true);
      expect(isLine("kohai.show_card", snap.context.line?.text)).toBe(true);
      expect(snap.context.voiceOff).toBe(false);
      s.stop();
    }
  });

  it("no key (503) or no worker turns the voice off; without an interpret call the session cannot hear", async () => {
    const st = await readyStore();
    const { api: a } = api({ interpret: () => Promise.reject(new WorkerError(503)) });
    const s = await startSession({ store: st, api: a });
    s.send({ type: "GUESS", larger: null });
    s.send({ type: "PREDICT", answer: "fits" });
    await s.hear(SAID);
    expect(s.actor.getSnapshot().context.voiceOff).toBe(true);
    s.stop();
    const none = await startSession({ store: await readyStore(), api: null });
    expect(none.canHear).toBe(false);
    none.stop();
  });

  it("the English screen sends lang en", async () => {
    const st = await readyStore();
    await st.setLang("en");
    const { api: a, calls } = api();
    const s = await startSession({ store: st, api: a });
    s.send({ type: "GUESS", larger: null });
    s.send({ type: "PREDICT", answer: "fits" });
    await s.hear("the little brother is one");
    expect(calls.interpret).toEqual([{ problem_id: "p_signboard", transcript: "the little brother is one", lang: "en" }]);
    s.stop();
  });

  it("the words heard never reach the device's store, on any method, through a whole solved problem", async () => {
    const st = await readyStore();
    const written: string[] = [];
    const spied = new Proxy(st, {
      get(target, prop, recv) {
        const v = Reflect.get(target, prop, recv) as unknown;
        if (typeof v !== "function") return v;
        return (...args: unknown[]) => {
          written.push(`${String(prop)}:${JSON.stringify(args)}`);
          return (v as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
    const heard = "zzheard 弟が1だよ";
    const { api: a } = api();
    const s = await startSession({ store: spied, api: a, input: { maxProblems: 1 } });
    s.send({ type: "GUESS", larger: null });
    s.send({ type: "PREDICT", answer: "fits" });
    await s.hear(heard);
    expect(s.actor.getSnapshot().context.line?.text).toContain("zzheard");
    s.send({ type: "CONFIRM_YES" });
    passBook(s);
    s.send({ type: "NEXT" });
    s.send({ type: "ANSWER_UNIT", value: { num: 2, den: 1 } });
    s.send({ type: "ANSWER_TOTAL", value: { num: 8, den: 1 } });
    s.send({ type: "NEXT" });
    await flush();
    await s.settle();
    expect(written.some((w) => w.startsWith("addAttempt"))).toBe(true);
    expect(written.filter((w) => w.includes("zzheard"))).toEqual([]);
    s.stop();
  });
});

describe("the session: safety review of the voice (Q46)", () => {
  it("words not yet checked by /safety never go into the research request (the child confirms before /safety answers)", async () => {
    const st = await readyStore();
    const { api: a } = api({ safety: () => never<SafetyReply>(), interpret: () => never<InterpretReply>() });
    let sent: unknown = null;
    a.research = (req) => {
      sent = req;
      return never();
    };
    const s = await startSession({ store: st, api: a });
    s.send({ type: "GUESS", larger: null });
    s.send({ type: "PREDICT", answer: "fits" });
    const rel = s.actor.getSnapshot().context.problem?.record.world.relations.find((r) => r.id === s.actor.getSnapshot().context.problem?.relationId);
    s.send({ type: "PLACE_ONE", quantityId: rel?.reference as string });
    void s.hear("zzunchecked 弟が1");
    await flush();
    expect(s.actor.getSnapshot().context.problem?.listening).toBe(true);
    s.send({ type: "CONFIRM_YES" });
    passBook(s);
    await flush();
    const req = s.actor.getSnapshot().context.researchRequest;
    expect(req).not.toBeNull();
    expect(JSON.stringify(req)).not.toContain("zzunchecked");
    expect(JSON.stringify(sent)).not.toContain("zzunchecked");
    s.stop();
  });

  it("a fixed stop word is handled on the device: STOP, with no /interpret and no /safety", async () => {
    for (const said of ["やめる", "やめたい。", "おわり", "Stop", "quit."]) {
      const st = await readyStore();
      const { api: a, calls } = api();
      const s = await startSession({ store: st, api: a });
      s.send({ type: "GUESS", larger: null });
      s.send({ type: "PREDICT", answer: "fits" });
      await s.hear(said);
      expect(s.actor.getSnapshot().matches("ended"), said).toBe(true);
      expect(calls.interpret).toEqual([]);
      expect(calls.safety).toEqual([]);
      s.stop();
    }
  });

  it("a fixed don't-know word is handled on the device: the junior's staged questions, with no /interpret", async () => {
    for (const said of ["わからない", "分からない", "I don't know"]) {
      const st = await readyStore();
      const { api: a, calls } = api();
      const s = await startSession({ store: st, api: a });
      s.send({ type: "GUESS", larger: null });
      s.send({ type: "PREDICT", answer: "fits" });
      await s.hear(said);
      expect(s.actor.getSnapshot().matches({ active: { problem: "help" } }), said).toBe(true);
      expect(calls.interpret).toEqual([]);
      s.stop();
    }
  });

  it("longer words that hold a stop word are not taken as one (they go on as usual)", async () => {
    const st = await readyStore();
    const { api: a, calls } = api();
    const s = await startSession({ store: st, api: a });
    s.send({ type: "GUESS", larger: null });
    s.send({ type: "PREDICT", answer: "fits" });
    await s.hear("弟が1だからやめるのはまだ");
    expect(s.actor.getSnapshot().matches("ended")).toBe(false);
    expect(calls.interpret.length).toBe(1);
    s.stop();
  });

  it("final words the flow refuses still go through the safety check only", async () => {
    const st = await readyStore();
    const { api: a, calls } = api({ safety: () => Promise.resolve({ flag: "distress" }) });
    const s = await startSession({ store: st, api: a });
    // Before the prediction the flow does not hear (the step does not take the voice).
    await s.hear("もういやだ");
    expect(calls.interpret).toEqual([]);
    expect(calls.safety).toEqual(["もういやだ"]);
    expect(s.actor.getSnapshot().matches("hard")).toBe(true);
    s.stop();
  });
});

describe("the consent and intro say where the child's voice goes (ja and en)", () => {
  it("the words are made text by the browser, sent to Claude to understand them, and not kept on the device", async () => {
    const { ui } = await import("./text.ts");
    const ja = ui("ja");
    const en = ui("en");
    const consentJa = ja.consent.lines.join("");
    expect(consentJa).toMatch(/ブラウザ/);
    expect(consentJa).toMatch(/文字/);
    expect(consentJa).toMatch(/Claude/);
    expect(consentJa).toMatch(/残しません|のこしません/);
    // What the words are sent for (safety review, Q46): understanding, the safety check, and the session's research.
    const voiceJa = ja.consent.lines.find((l) => l.includes("話して教える")) ?? "";
    expect(voiceJa).toMatch(/安全/);
    expect(voiceJa).toMatch(/研究/);
    expect(consentJa).not.toMatch(/声、自由に書いた言葉は送りません/);
    const consentEn = en.consent.lines.join(" ");
    expect(consentEn).toMatch(/browser/i);
    expect(consentEn).toMatch(/text/i);
    expect(consentEn).toMatch(/Claude/);
    expect(consentEn).toMatch(/not kept on this device/i);
    expect(consentEn).toMatch(/safety check/i);
    expect(consentEn).toMatch(/research on that session/i);
    expect(consentEn).not.toMatch(/name, voice or anything/);
    expect(ja.intro.lines.join("")).toMatch(/ブラウザ/);
    expect(ja.intro.lines.join("")).toMatch(/のこりません|のこしません/);
    expect(en.intro.lines.join(" ")).toMatch(/browser/i);
    expect(en.intro.lines.join(" ")).toMatch(/not kept/i);
    for (const t of [...ja.consent.lines, ...ja.intro.lines, ...en.consent.lines, ...en.intro.lines]) expect(hasForbiddenPhrase(t), t).toBe(false);
  });
});
