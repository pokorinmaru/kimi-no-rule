// Ruby readings over kanji (指示書 第8.4b節 読みの配慮). The segments come from core (rubySegments); this only draws
// them. With the switch off, the text is printed as it is.
import { Fragment, type ReactNode } from "react";
import { UI_READINGS, rubySegments, type Readings, type RubySegment } from "@kimi/core";

export function rubyNodes(segs: readonly RubySegment[]): ReactNode {
  return segs.map((s, i) =>
    s.ruby === null ? (
      <Fragment key={i}>{s.text}</Fragment>
    ) : (
      <ruby key={i}>
        {s.text}
        <rt style={{ fontSize: "0.5em" }}>{s.ruby}</rt>
      </ruby>
    ),
  );
}

/** A line with ruby when on (the fixed lines' readings unless others are given). */
export function RubyText({ text, on, readings = UI_READINGS }: { text: string; on: boolean; readings?: Readings }) {
  if (!on) return <>{text}</>;
  return <>{rubyNodes(rubySegments(text, readings))}</>;
}
