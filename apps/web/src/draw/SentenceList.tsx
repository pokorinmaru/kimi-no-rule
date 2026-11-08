// The problem's sentences, numbered (指示書 第8.5節 文と世界の結び). The verdicts come from core's
// checkStatements; this list never judges. A sentence glows only when core says it fails.
import { useRef, type ReactNode } from "react";
import {
  rubySegments,
  rubyTokens,
  type Lang,
  type Readings,
  type StatementCheck,
} from "@kimi/core";
import { ui } from "../flow/text.ts";
import { useAnimation, useReducedMotion } from "./motion.ts";
import { COLORS, FONT } from "./theme.ts";
import { fractions, rubyNodes } from "../ui/Ruby.tsx";
import type { HolderColor } from "./holder-colors.ts";
import { COLOR } from "../ui/tokens.ts";

/** A holder's name in the sentences and its colour in the stage picture (指示書 第8.4節: with an underline too). */
export interface HolderInk {
  label: string;
  color: HolderColor;
}

function inked(
  node: ReactNode,
  color: HolderColor,
  key: string | number,
): ReactNode {
  return (
    <span
      key={key}
      data-role="holder-name"
      style={{ color: color.ink, borderBottom: `3px solid ${color.fill}` }}
    >
      {node}
    </span>
  );
}

/** The text cut at the holders' names (longest first), so each name can be coloured. */
export function splitByHolders(
  text: string,
  holders: readonly HolderInk[],
): { text: string; holder: HolderInk | null }[] {
  const names = [...holders]
    .filter((h) => h.label !== "")
    .sort((a, b) => b.label.length - a.label.length);
  const out: { text: string; holder: HolderInk | null }[] = [];
  let rest = text;
  while (rest !== "") {
    let at = -1;
    let hit: HolderInk | null = null;
    for (const h of names) {
      const i = rest.indexOf(h.label);
      if (i >= 0 && (at < 0 || i < at)) {
        at = i;
        hit = h;
      }
    }
    if (hit === null || at < 0) {
      out.push({ text: rest, holder: null });
      break;
    }
    if (at > 0) out.push({ text: rest.slice(0, at), holder: null });
    out.push({ text: hit.label, holder: hit });
    rest = rest.slice(at + hit.label.length);
  }
  return out;
}

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
  /** The holders' names, coloured as in the stage picture; absent = none. */
  holders?: readonly HolderInk[];
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
  holders,
}: {
  s: SentenceItem;
  glow: boolean;
  reduced: boolean;
  onTapWord: SentenceListProps["onTapWord"];
  glowText: string;
  readings: Readings | null;
  reading: boolean;
  holders: readonly HolderInk[];
}) {
  const perToken = readings === null ? null : rubyTokens(s.tokens, readings);
  const holderOf = (t: string): HolderInk | undefined =>
    holders.find((x) => x.label === t);
  const halo = useRef<HTMLSpanElement>(null);
  useAnimation(
    halo,
    "pulse",
    [{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }],
    glow && !reduced,
    `${String(s.index)}`,
    true,
  );
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
        background: reading ? COLOR.highlight : "transparent",
      }}
    >
      {glow && (
        <span
          ref={halo}
          aria-hidden="true"
          data-role="glow"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 10,
            background: COLORS.accentSoft,
            zIndex: -1,
          }}
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
          // The lit sentence is marked by its band and outline alone: a wavy line under every word read as an error mark (screen check, 2026-11-08).
        }}
      >
        {onTapWord === undefined
          ? splitByHolders(s.tokens.join(""), holders).map((part, i) => {
              const node =
                readings === null
                  ? fractions(part.text)
                  : rubyNodes(rubySegments(part.text, readings));
              return part.holder === null ? (
                <span key={i}>{node}</span>
              ) : (
                inked(node, part.holder.color, i)
              );
            })
          : wordGroups(s.tokens).map((g) => (
              // A closing mark (、。」) stays on the line of the word before it.
              <span key={g[0]} style={{ whiteSpace: "nowrap" }}>
                {g.map((i) => {
                  const t = s.tokens[i] ?? "";
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onTapWord(s.index, i)}
                      {...(holderOf(t) === undefined
                        ? {}
                        : { "data-role": "holder-name" })}
                      style={{
                        minHeight: "44px",
                        // A word's target is the word itself and a few px on each side, and never reaches into its neighbour's:
                        // with targets that overlapped, the middle of 「弟」 pressed 「の」 (whole-app review, 2026-11-08). Words in a
                        // sentence are inline targets, so the target follows the word's width; the height stays 44 px.
                        // A closing mark sits right after its word, with no room of its own (it is still its own target).
                        padding: CLOSING.test(t) ? 0 : `0 ${String(WORD_PAD)}px`,
                        margin: 0,
                        border: "none",
                        borderRadius: 6,
                        background: "transparent",
                        color: holderOf(t)?.color.ink ?? "inherit",
                        font: "inherit",
                        textDecoration: "inherit",
                        cursor: "pointer",
                        // A holder's name: its colour and an underline in it (the button stays the word's only wrapper).
                        ...(holderOf(t) === undefined
                          ? {}
                          : {
                              borderBottom: `3px solid ${holderOf(t)?.color.fill ?? ""}`,
                              borderRadius: 0,
                            }),
                      }}
                    >
                      {perToken === null
                        ? fractions(t)
                        : rubyNodes(perToken[i] ?? [{ text: t, ruby: null }])}
                    </button>
                  );
                })}
              </span>
            ))}
      </span>
      {glow && <span style={srOnly}>{glowText}</span>}
    </li>
  );
}

/** A closing mark (、。」 and the like), kept on the line of the word before it. */
const CLOSING = /^[、。，．！？!?」』）)]+$/;

/** The words' indices in groups that must not be split across lines: a closing mark joins the word before it. */
export function wordGroups(tokens: readonly string[]): number[][] {
  const out: number[][] = [];
  tokens.forEach((t, i) => {
    const last = out[out.length - 1];
    if (last !== undefined && CLOSING.test(t))
      last.push(i);
    else out.push([i]);
  });
  return out;
}

/** The room on each side of a word inside its tap target (px); neighbouring targets touch but never overlap. */
export const WORD_PAD = 3;

export function SentenceList({
  statements,
  checks,
  onTapWord,
  reducedMotion,
  lang = "ja",
  label = ui(lang).draw.sentences,
  readings = null,
  readingIndex = null,
  holders = [],
}: SentenceListProps) {
  const glowText = ui(lang).draw.glow;
  const reduced = useReducedMotion(reducedMotion);
  const failing = new Set(
    (checks ?? []).filter((c) => c.verdict === "fails").map((c) => c.index),
  );
  return (
    <ol
      aria-label={label}
      style={{ padding: 0, margin: 0, isolation: "isolate" }}
    >
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
          holders={holders}
        />
      ))}
    </ol>
  );
}
