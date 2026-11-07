// Ruby readings over kanji (指示書 第8.4b節 読みの配慮). The segments come from core (rubySegments); this only draws
// them. With the switch off, the text is printed as it is.
import { Fragment, type ReactNode } from "react";
import { UI_READINGS, rubySegments, templateRuby, type Lang, type Readings, type RubySegment } from "@kimi/core";

export function rubyNodes(segs: readonly RubySegment[]): ReactNode {
  return segs.map((s, i) =>
    s.ruby === null ? (
      <Fragment key={i}>{s.text}</Fragment>
    ) : (
      <ruby key={i}>
        {s.text}
        <rt>{s.ruby}</rt>
      </ruby>
    ),
  );
}

/** A line with ruby when on (the fixed lines' readings unless others are given). */
export function RubyText({ text, on, readings = UI_READINGS }: { text: string; on: boolean; readings?: Readings }) {
  if (!on) return <>{text}</>;
  return <>{rubyNodes(rubySegments(text, readings))}</>;
}

/**
 * A junior's line with ruby when on: only a line made of core's templates gets readings (templateRuby); a generated
 * line is printed as it is, so no reading is guessed. `readings` are the problem's, for the holders' names.
 */
export function JuniorText({ text, on, lang, readings }: { text: string; on: boolean; lang: Lang; readings: Readings }) {
  const segs = on ? templateRuby(text, lang, readings) : null;
  return segs === null ? <>{text}</> : <>{rubyNodes(segs)}</>;
}
