// The problem's sentences, numbered (指示書 第8.5節 文と世界の結び). The verdicts come from core's
// checkStatements; this list never judges. A sentence glows only when core says it fails.
import { useRef } from "react";
import { rubySegments, rubyTokens, type Lang, type Readings, type StatementCheck } from "@kimi/core";
import { ui } from "../flow/text.ts";
import { useAnimation, useReducedMotion } from "./motion.ts";
import { COLORS, FONT } from "./theme.ts";
import { rubyNodes } from "../ui/Ruby.tsx";

export interface SentenceItem {
  index: number;
  text: string;
  tokens: readonly string[];
}

export interface SentenceListProps {
  /** The problem record's statements, in order. */
  statements: readonly SentenceItem[];
  /** core's checkStatements(...).statements, once the flow may show them; absent = nothing glows. */
  checks?: readonly StatementCheck[] | null;
  /** When given, every word is a button: (statement index, token index). */
  onTapWord?: (statementIndex: number, tokenIndex: number) => void;
  reducedMotion?: boolean;
  /** Accessible name of the list. */
  label?: string;
  /** The language of the words the list adds (the sentences stay as written). */
  lang?: Lang;
  /** Ruby readings over the kanji (指示書 第8.4b節); absent or null = none. The words stay the problem's own. */
  readings?: Readings | null;
  /** The sentence being read aloud (its index), lit with a fixed outline; absent or null = none. */
  readingIndex?: number | null;
}

const srOnly = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
} as const;

function Sentence({
  s,
  glow,
  reduced,
  onTapWord,
  glowText,
  readings,
  reading,
}: {
  s: SentenceItem;
  glow: boolean;
  reduced: boolean;
  onTapWord: SentenceListProps["onTapWord"];
  glowText: string;
  readings: Readings | null;
  reading: boolean;
}) {
  const perToken = readings === null ? null : rubyTokens(s.tokens, readings);
  const halo = useRef<HTMLSpanElement>(null);
  useAnimation(halo, "pulse", [{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }], glow && !reduced, `${String(s.index)}`, true);
  return (
    <li
      data-statement={s.index}
      data-glow={glow ? "true" : "false"}
      data-reading={reading ? "true" : "false"}
      {...(reading ? { "aria-current": "true" as const } : {})}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 8px",
        margin: "4px 0",
        borderRadius: 12,
        border: glow ? `3px dashed ${COLORS.accent}` : "3px solid transparent",
        listStyle: "none",
        // The sentence being read aloud: a fixed solid outline and a light ground (no motion).
        outline: reading ? `4px solid ${COLORS.ink}` : "none",
        outlineOffset: 2,
        background: reading ? "#fff6d5" : "transparent",
      }}
    >
      {glow && (
        <span
          ref={halo}
          aria-hidden="true"
          data-role="glow"
          style={{ position: "absolute", inset: 0, borderRadius: 10, background: COLORS.accentSoft, zIndex: -1 }}
        />
      )}
      <span
        data-role="sentence-number"
        aria-hidden="true"
        style={{
          flex: "none",
          display: "inline-grid",
          placeItems: "center",
          width: 32,
          height: 32,
          borderRadius: 16,
          border: `2px solid ${COLORS.ink}`,
          font: `700 16px/1 ${FONT}`,
        }}
      >
        {s.index + 1}
      </span>
      <span
        style={{
          font: `500 22px/1.6 ${FONT}`,
          color: COLORS.ink,
          textDecoration: glow ? `underline wavy ${COLORS.accent}` : "none",
          textUnderlineOffset: 6,
        }}
      >
        {onTapWord === undefined
          ? readings === null
            ? s.tokens.join("")
            : rubyNodes(rubySegments(s.tokens.join(""), readings))
          : s.tokens.map((t, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onTapWord(s.index, i)}
                style={{
                  minHeight: "44px",
                  minWidth: "44px",
                  padding: "0 2px",
                  margin: 0,
                  border: "none",
                  borderRadius: 6,
                  background: "transparent",
                  color: "inherit",
                  font: "inherit",
                  textDecoration: "inherit",
                  cursor: "pointer",
                }}
              >
                {perToken === null ? t : rubyNodes(perToken[i] ?? [{ text: t, ruby: null }])}
              </button>
            ))}
      </span>
      {glow && <span style={srOnly}>{glowText}</span>}
    </li>
  );
}

export function SentenceList({
  statements,
  checks,
  onTapWord,
  reducedMotion,
  lang = "ja",
  label = ui(lang).draw.sentences,
  readings = null,
  readingIndex = null,
}: SentenceListProps) {
  const glowText = ui(lang).draw.glow;
  const reduced = useReducedMotion(reducedMotion);
  const failing = new Set((checks ?? []).filter((c) => c.verdict === "fails").map((c) => c.index));
  return (
    <ol aria-label={label} style={{ padding: 0, margin: 0, isolation: "isolate" }}>
      {statements.map((s) => (
        <Sentence
          key={s.index}
          s={s}
          glow={failing.has(s.index)}
          reduced={reduced}
          onTapWord={onTapWord}
          glowText={glowText}
          readings={readings}
          reading={readingIndex === s.index}
        />
      ))}
    </ol>
  );
}
