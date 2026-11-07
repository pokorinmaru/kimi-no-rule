// The problem's sentences, numbered (指示書 第8.5節 文と世界の結び). The verdicts come from core's
// checkStatements; this list never judges. A sentence glows only when core says it fails.
import { useRef } from "react";
import type { StatementCheck } from "@kimi/core";
import { useAnimation, useReducedMotion } from "./motion.ts";
import { COLORS, FONT } from "./theme.ts";

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
}: {
  s: SentenceItem;
  glow: boolean;
  reduced: boolean;
  onTapWord: SentenceListProps["onTapWord"];
}) {
  const halo = useRef<HTMLSpanElement>(null);
  useAnimation(halo, "pulse", [{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }], glow && !reduced, `${String(s.index)}`, true);
  return (
    <li
      data-statement={s.index}
      data-glow={glow ? "true" : "false"}
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
          ? s.tokens.join("")
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
                {t}
              </button>
            ))}
      </span>
      {glow && <span style={srOnly}>（この世界と 合わない 文です）</span>}
    </li>
  );
}

export function SentenceList({ statements, checks, onTapWord, reducedMotion, label = "もんだいの 文" }: SentenceListProps) {
  const reduced = useReducedMotion(reducedMotion);
  const failing = new Set((checks ?? []).filter((c) => c.verdict === "fails").map((c) => c.index));
  return (
    <ol aria-label={label} style={{ padding: 0, margin: 0, isolation: "isolate" }}>
      {statements.map((s) => (
        <Sentence key={s.index} s={s} glow={failing.has(s.index)} reduced={reduced} onTapWord={onTapWord} />
      ))}
    </ol>
  );
}
