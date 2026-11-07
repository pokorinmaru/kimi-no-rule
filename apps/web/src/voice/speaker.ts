// The browser's speech synthesis for 「読み上げ」 (指示書 第8.4b節): one utterance at a time, so the screen can light
// the sentence being read. Nothing is sent anywhere; the browser speaks on the device. Without the API the
// button is not offered.

export interface Utterance {
  text: string;
  /** "ja-JP" or "en-US". */
  lang: string;
  rate: number;
}

export interface Speaker {
  isSupported(): boolean;
  /** Speaks one utterance; end or error is called once when it is over. */
  speak(u: Utterance, on: { end: () => void; error: () => void }): void;
  cancel(): void;
}

/** A little slower than the default, for children who find reading hard. 【仮】 */
export const READ_RATE = 0.85;

export function createSpeaker(): Speaker {
  const g = globalThis as { speechSynthesis?: SpeechSynthesis; SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance };
  return {
    isSupported: () => g.speechSynthesis !== undefined && g.SpeechSynthesisUtterance !== undefined,
    speak(u, on) {
      const synth = g.speechSynthesis;
      const Ctor = g.SpeechSynthesisUtterance;
      if (synth === undefined || Ctor === undefined) {
        on.error();
        return;
      }
      const ut = new Ctor(u.text);
      ut.lang = u.lang;
      ut.rate = u.rate;
      ut.onend = () => on.end();
      ut.onerror = () => on.error();
      synth.speak(ut);
    },
    cancel() {
      g.speechSynthesis?.cancel();
    },
  };
}
