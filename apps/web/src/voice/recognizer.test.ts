// The browser's speech recognition behind a small interface (指示書 第11節 M6, voice part; the user chose the
// Web Speech API on 2026-11-07). Interim words come live, the final words once; a denied microphone and a
// browser without the API are told apart from other errors. Nothing is logged. Written before the implementation.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRecognizer, isSpeechSupported, speechLang, type SpeechCtor, type SpeechHost } from "./recognizer.ts";
import { FakeRecognizer } from "./fake.ts";

/** A stand-in for the browser's SpeechRecognition: the test fires its events. */
class FakeSpeech {
  static last: FakeSpeech | null = null;
  lang = "";
  interimResults = false;
  continuous = true;
  maxAlternatives = 0;
  started = 0;
  stopped = 0;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    FakeSpeech.last = this;
  }
  start(): void {
    this.started++;
  }
  stop(): void {
    this.stopped++;
  }
  abort(): void {
    this.stopped++;
  }
  /** One result event: each entry is [text, isFinal]. */
  emit(results: [string, boolean][], resultIndex = 0): void {
    const list = results.map(([t, f]) => Object.assign([{ transcript: t, confidence: 0.9 }], { isFinal: f }));
    this.onresult?.({ resultIndex, results: list });
  }
}

const host = (over: Partial<SpeechHost> = {}): SpeechHost => ({ SpeechRecognition: FakeSpeech as unknown as SpeechCtor, ...over });

afterEach(() => {
  FakeSpeech.last = null;
  vi.restoreAllMocks();
});

describe("speechLang", () => {
  it("is ja-JP on the Japanese screen and en-US on the English screen", () => {
    expect(speechLang("ja")).toBe("ja-JP");
    expect(speechLang("en")).toBe("en-US");
  });
});

describe("isSpeechSupported", () => {
  it("is false without the API (Firefox) and true with either name", () => {
    expect(isSpeechSupported({})).toBe(false);
    expect(isSpeechSupported(host())).toBe(true);
    expect(isSpeechSupported({ webkitSpeechRecognition: FakeSpeech as unknown as SpeechCtor })).toBe(true);
  });
});

describe("createRecognizer on the browser API", () => {
  it("says it is unsupported and does nothing on start when there is no API", () => {
    const r = createRecognizer("ja", {});
    const errors: string[] = [];
    r.onError = (k) => errors.push(k);
    expect(r.isSupported()).toBe(false);
    r.start();
    expect(errors).toEqual(["unsupported"]);
  });

  it("listens in the screen's language with interim results, one phrase at a time", () => {
    const r = createRecognizer("en", host());
    r.start();
    const s = FakeSpeech.last as FakeSpeech;
    expect(s.lang).toBe("en-US");
    expect(s.interimResults).toBe(true);
    expect(s.continuous).toBe(false);
    expect(s.started).toBe(1);
    const ja = createRecognizer("ja", host());
    ja.start();
    expect((FakeSpeech.last as FakeSpeech).lang).toBe("ja-JP");
  });

  it("hands interim words on as they come and the final words once", () => {
    const r = createRecognizer("ja", host());
    const interim: string[] = [];
    const final: string[] = [];
    r.onInterim = (t) => interim.push(t);
    r.onFinal = (t) => final.push(t);
    r.start();
    const s = FakeSpeech.last as FakeSpeech;
    s.emit([["弟が", false]]);
    s.emit([["弟が1だよ", false]]);
    s.emit([["弟が1だよ", true]]);
    expect(interim).toEqual(["弟が", "弟が1だよ"]);
    expect(final).toEqual(["弟が1だよ"]);
  });

  it("tells a denied microphone apart from other errors, and reports the end", () => {
    const r = createRecognizer("ja", host());
    const errors: string[] = [];
    let ended = 0;
    r.onError = (k) => errors.push(k);
    r.onEnd = () => ended++;
    r.start();
    const s = FakeSpeech.last as FakeSpeech;
    s.onerror?.({ error: "not-allowed" });
    s.onerror?.({ error: "service-not-allowed" });
    s.onerror?.({ error: "no-speech" });
    s.onerror?.({ error: "network" });
    s.onend?.();
    expect(errors).toEqual(["denied", "denied", "no_speech", "failed"]);
    expect(ended).toBe(1);
  });

  it("stops the browser's recognition on stop, and logs nothing", () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const r = createRecognizer("ja", host());
    r.start();
    (FakeSpeech.last as FakeSpeech).emit([["zz-heard", true]]);
    r.stop();
    expect((FakeSpeech.last as FakeSpeech).stopped).toBeGreaterThan(0);
    for (const sp of spies) expect(sp).not.toHaveBeenCalled();
  });

  it("uses a fake put on the page for the end-to-end test before the browser's own", () => {
    class Other extends FakeSpeech {}
    const r = createRecognizer("ja", { __kimiFakeSpeech: Other as unknown as SpeechCtor, SpeechRecognition: FakeSpeech as unknown as SpeechCtor });
    r.start();
    expect(FakeSpeech.last).toBeInstanceOf(Other);
  });
});

describe("FakeRecognizer (for the tests)", () => {
  it("plays interim words and the final words, and can fail", () => {
    const f = new FakeRecognizer("ja");
    const seen: string[] = [];
    f.onInterim = (t) => seen.push(`i:${t}`);
    f.onFinal = (t) => seen.push(`f:${t}`);
    f.onError = (k) => seen.push(`e:${k}`);
    f.start();
    expect(f.listening).toBe(true);
    f.say(["弟", "弟が"], "弟が1だよ");
    expect(f.listening).toBe(false);
    f.start();
    f.fail("denied");
    expect(seen).toEqual(["i:弟", "i:弟が", "f:弟が1だよ", "e:denied"]);
    expect(f.lang).toBe("ja-JP");
    expect(new FakeRecognizer("en", false).isSupported()).toBe(false);
  });
});
