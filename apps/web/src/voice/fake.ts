// A recognizer for the tests: the test plays the interim words and the final words, or an error.
import type { Lang } from "@kimi/core";
import { speechLang, type Recognizer, type VoiceErrorKind } from "./recognizer.ts";
import type { Speaker, Utterance } from "./speaker.ts";

export class FakeRecognizer implements Recognizer {
  onInterim: ((text: string) => void) | null = null;
  onFinal: ((text: string) => void) | null = null;
  onError: ((kind: VoiceErrorKind) => void) | null = null;
  onEnd: (() => void) | null = null;
  listening = false;
  starts = 0;
  readonly lang: string;

  constructor(
    lang: Lang,
    private readonly supported = true,
  ) {
    this.lang = speechLang(lang);
  }

  isSupported(): boolean {
    return this.supported;
  }

  start(): void {
    if (!this.supported) {
      this.onError?.("unsupported");
      return;
    }
    this.starts++;
    this.listening = true;
  }

  stop(): void {
    if (!this.listening) return;
    this.listening = false;
    this.onEnd?.();
  }

  /** Interim words one after another, then the final words, then the end. */
  say(interims: readonly string[], final: string): void {
    for (const t of interims) this.onInterim?.(t);
    this.onFinal?.(final);
    this.listening = false;
    this.onEnd?.();
  }

  fail(kind: VoiceErrorKind): void {
    this.onError?.(kind);
    this.listening = false;
    this.onEnd?.();
  }
}

/** A speaker for the tests: keeps what was asked to be read; the test ends the current utterance. */
export class FakeSpeaker implements Speaker {
  spoken: Utterance[] = [];
  cancels = 0;
  private current: { end: () => void; error: () => void } | null = null;

  constructor(private readonly supported = true) {}

  isSupported(): boolean {
    return this.supported;
  }

  speak(u: Utterance, on: { end: () => void; error: () => void }): void {
    this.spoken.push(u);
    this.current = on;
  }

  cancel(): void {
    this.cancels++;
  }

  /** The current utterance ends (as the browser would, even after a cancel). */
  finish(): void {
    const on = this.current;
    this.current = null;
    on?.end();
  }
}
