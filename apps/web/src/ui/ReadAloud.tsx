// 「読み上げ」 and 「ふりがな」 (指示書 第8.4b節 読みの配慮). Read aloud speaks the given lines one at a time with the
// browser's speech synthesis, a little slower than the default, and tells the screen which line is being read
// so it can light it (a fixed outline, no motion). The lines are the problem's sentences and the junior's line
// that is already on the screen: nothing else is read, so never an answer. Without the API the button is not
// offered. The furigana switch is a pressed/unpressed button.
import { useEffect, useRef, useState } from "react";
import type { Lang } from "@kimi/core";
import { ui } from "../flow/text.ts";
import { READ_RATE, type Speaker } from "../voice/speaker.ts";
import { RubyText } from "./Ruby.tsx";
import { Toggle } from "./controls.tsx";
import { SPACE } from "./tokens.ts";

export interface ReadLine {
  /** What the browser says (core's spoken form for a Japanese line). */
  text: string;
  /** "ja-JP" or "en-US". */
  lang: string;
}

export function ReadingTools(props: {
  lang: Lang;
  lines: readonly ReadLine[];
  speaker: Speaker;
  /** The line being read (its index in lines), or null. */
  onReading: (index: number | null) => void;
  furigana: boolean;
  onFurigana: (on: boolean) => void;
}) {
  const { lines, speaker, onReading } = props;
  const t = ui(props.lang).reading;
  const [playing, setPlaying] = useState(false);
  // Each run has its own id: a late end from a stopped run reads nothing more.
  const run = useRef(0);
  const key = lines.map((l) => `${l.lang}:${l.text}`).join("\n");

  const stop = (): void => {
    run.current++;
    speaker.cancel();
    setPlaying(false);
    onReading(null);
  };

  // New lines (another problem, another step) stop the reading; leaving the screen stops it too.
  useEffect(() => {
    return () => {
      if (run.current > 0) {
        run.current++;
        speaker.cancel();
        onReading(null);
      }
    };
  }, [key, speaker, onReading]);

  const play = (): void => {
    speaker.cancel();
    const id = ++run.current;
    setPlaying(true);
    const at = (i: number): void => {
      if (run.current !== id) return;
      const line = lines[i];
      if (line === undefined) {
        setPlaying(false);
        onReading(null);
        return;
      }
      onReading(i);
      speaker.speak({ text: line.text, lang: line.lang, rate: READ_RATE }, { end: () => at(i + 1), error: () => run.current === id && stop() });
    };
    at(0);
  };

  const supported = speaker.isSupported() && lines.length > 0;
  return (
    <div role="group" aria-label={t.label} style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap", margin: `0 0 ${String(SPACE.md)}px` }}>
      {supported &&
        (playing ? (
          <Toggle pressed onClick={stop} testId="btn-read-stop">
            <RubyText text={t.stop} on={props.furigana && props.lang === "ja"} />
          </Toggle>
        ) : (
          <Toggle pressed={false} onClick={play} testId="btn-read-aloud">
            <RubyText text={t.aloud} on={props.furigana && props.lang === "ja"} />
          </Toggle>
        ))}
      <Toggle pressed={props.furigana} onClick={() => props.onFurigana(!props.furigana)} testId="btn-furigana">
        {t.furigana}
      </Toggle>
    </div>
  );
}
