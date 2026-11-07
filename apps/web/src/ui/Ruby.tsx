// Ruby readings over kanji (指示書 第8.4b節 読みの配慮). The segments come from core (rubySegments); this only draws
// them. With the switch off, the text is printed as it is.
import { Fragment, type ReactNode } from "react";
import { UI_READINGS, rubySegments, templateRuby, type Lang, type Readings, type RubySegment } from "@kimi/core";

/**
 * A fraction written "3/4" drawn as a school fraction, the numerator over the bar over the denominator (a slash is
 * hard to read at nine; screen check, 2026-11-08). The digits are drawn by CSS (.k-frac in ui/tokens.ts) from data
 * attributes, so the text itself stays "3/4" for reading aloud, the tests and copying.
 */
export function fractions(text: string): ReactNode {
  const parts = text.split(/(\d+\/\d+)/);
  if (parts.length === 1) return text;
  return parts.map((p, i) => {
    const m = /^(\d+)\/(\d+)$/.exec(p);
    if (m === null) return p === "" ? null : <Fragment key={i}>{p}</Fragment>;
    return (
      <span key={i} className="k-frac" data-num={m[1]} data-den={m[2]}>
        <span className="k-frac-text">{p}</span>
      </span>
    );
  });
}

export function rubyNodes(segs: readonly RubySegment[]): ReactNode {
  return segs.map((s, i) =>
    s.ruby === null ? (
      <Fragment key={i}>{fractions(s.text)}</Fragment>
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
  if (!on) return <>{fractions(text)}</>;
  return <>{rubyNodes(rubySegments(text, readings))}</>;
}

/**
 * A junior's line with ruby when on: only a line made of core's templates gets readings (templateRuby); a generated
 * line is printed as it is, so no reading is guessed. `readings` are the problem's, for the holders' names.
 */
export function JuniorText({ text, on, lang, readings }: { text: string; on: boolean; lang: Lang; readings: Readings }) {
  const segs = on ? templateRuby(text, lang, readings) : null;
  return segs === null ? <>{fractions(text)}</> : <>{rubyNodes(segs)}</>;
}
