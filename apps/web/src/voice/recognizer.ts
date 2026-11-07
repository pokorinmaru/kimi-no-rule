// The child's voice through the browser's own speech recognition (the Web Speech API; the user chose it on
// 2026-11-07, 指示書 第11節 M6 names an Azure part instead). This file only turns the browser's events into
// interim words, final words and a few kinds of error. It keeps nothing and logs nothing: the words go to
// the session in memory, and never to the device's store.
import type { Lang } from "@kimi/core";

export type VoiceErrorKind = "unsupported" | "denied" | "no_speech" | "failed";

/** The small interface the screens use; FakeRecognizer (fake.ts) is the same for the tests. */
export interface Recognizer {
  isSupported(): boolean;
  start(): void;
  stop(): void;
  onInterim: ((text: string) => void) | null;
  onFinal: ((text: string) => void) | null;
  onError: ((kind: VoiceErrorKind) => void) | null;
  onEnd: (() => void) | null;
}

/** The parts of the browser's SpeechRecognition this file uses. */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort?(): void;
  onresult: ((e: unknown) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
}

export type SpeechCtor = new () => SpeechRecognitionLike;

/** Where the constructor is looked up: the window, or a stand-in in the tests. `__kimiFakeSpeech` is the e2e fake. */
export interface SpeechHost {
  __kimiFakeSpeech?: SpeechCtor;
  SpeechRecognition?: SpeechCtor;
  webkitSpeechRecognition?: SpeechCtor;
}

/** The recognition language follows the screen's language. */
export function speechLang(lang: Lang): "ja-JP" | "en-US" {
  return lang === "en" ? "en-US" : "ja-JP";
}

function ctorOf(host: SpeechHost): SpeechCtor | undefined {
  return host.__kimiFakeSpeech ?? host.SpeechRecognition ?? host.webkitSpeechRecognition;
}

export function isSpeechSupported(host: SpeechHost = globalThis as unknown as SpeechHost): boolean {
  return typeof ctorOf(host) === "function";
}

function errorKind(e: unknown): VoiceErrorKind {
  const code = typeof e === "object" && e !== null ? (e as { error?: unknown }).error : undefined;
  if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") return "denied";
  if (code === "no-speech" || code === "aborted") return "no_speech";
  return "failed";
}

/** The interim and final words of one result event (one phrase at a time). */
function wordsOf(e: unknown): { interim: string; final: string } {
  let interim = "";
  let final = "";
  if (typeof e !== "object" || e === null) return { interim, final };
  const ev = e as { resultIndex?: number; results?: ArrayLike<ArrayLike<{ transcript?: unknown }> & { isFinal?: boolean }> };
  const results = ev.results;
  if (results === undefined) return { interim, final };
  for (let i = ev.resultIndex ?? 0; i < results.length; i++) {
    const r = results[i];
    const t = r?.[0]?.transcript;
    if (typeof t !== "string") continue;
    if (r?.isFinal === true) final += t;
    else interim += t;
  }
  return { interim, final };
}

export function createRecognizer(lang: Lang, host: SpeechHost = globalThis as unknown as SpeechHost): Recognizer {
  const Ctor = ctorOf(host);
  let rec: SpeechRecognitionLike | null = null;
  const self: Recognizer = {
    onInterim: null,
    onFinal: null,
    onError: null,
    onEnd: null,
    isSupported: () => typeof Ctor === "function",
    start() {
      if (typeof Ctor !== "function") {
        self.onError?.("unsupported");
        return;
      }
      try {
        const r = new Ctor();
        r.lang = speechLang(lang);
        r.interimResults = true;
        r.continuous = false;
        r.maxAlternatives = 1;
        r.onresult = (e) => {
          const w = wordsOf(e);
          if (w.final.trim() !== "") self.onFinal?.(w.final.trim());
          else if (w.interim !== "") self.onInterim?.(w.interim);
        };
        r.onerror = (e) => self.onError?.(errorKind(e));
        r.onend = () => {
          rec = null;
          self.onEnd?.();
        };
        rec = r;
        r.start();
      } catch {
        rec = null;
        self.onError?.("failed");
      }
    },
    stop() {
      try {
        rec?.stop();
      } catch {
        // already stopped
      }
    },
  };
  return self;
}
