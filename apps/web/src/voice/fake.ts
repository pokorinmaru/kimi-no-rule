// A recognizer for the tests: the test plays the interim words and the final words, or an error.
import type { Lang } from "@kimi/core";
import { speechLang, type Recognizer, type VoiceErrorKind } from "./recognizer.ts";

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
