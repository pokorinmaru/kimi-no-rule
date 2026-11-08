// The browser's speech for 「読み上げ」 (safety review, 2026-11-08, Q60): the problem now carries the child's name,
// and some browsers offer voices that speak through a network service, so a voice on the device is chosen first.
import { afterEach, describe, expect, it } from "vitest";
import { createSpeaker } from "./speaker.ts";

type FakeVoice = { lang: string; localService: boolean; name: string };
const g = globalThis as Record<string, unknown>;

function install(voices: FakeVoice[]): { spoken: { voice: FakeVoice | null }[] } {
  const spoken: { voice: FakeVoice | null }[] = [];
  class Utt {
    lang = "";
    rate = 1;
    voice: FakeVoice | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public text: string) {}
  }
  g.SpeechSynthesisUtterance = Utt;
  g.speechSynthesis = { getVoices: () => voices, speak: (u: Utt) => spoken.push(u), cancel: () => undefined };
  return { spoken };
}

afterEach(() => {
  delete g.SpeechSynthesisUtterance;
  delete g.speechSynthesis;
});

describe("createSpeaker", () => {
  it("speaks with a voice on the device for the language when there is one", () => {
    const local = { lang: "ja-JP", localService: true, name: "local" };
    const { spoken } = install([{ lang: "ja-JP", localService: false, name: "online" }, local]);
    createSpeaker().speak({ text: "そら", lang: "ja-JP", rate: 0.85 }, { end: () => undefined, error: () => undefined });
    expect(spoken[0]?.voice).toBe(local);
  });

  it("leaves the choice to the browser when no voice on the device speaks the language", () => {
    const { spoken } = install([{ lang: "en-US", localService: true, name: "en" }]);
    createSpeaker().speak({ text: "そら", lang: "ja-JP", rate: 0.85 }, { end: () => undefined, error: () => undefined });
    expect(spoken[0]?.voice).toBeNull();
  });
});
