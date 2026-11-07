// A world drawn as tapes in SVG (指示書 第8.5節). Every length and label comes from layoutWorld, which
// takes its values from @kimi/core; this component draws and handles input only.
//
// The 「1」 card is a mark for "who is 1" (data-role=reference_mark), never a number. It can be placed
// on a whole tape only: by dragging, by tapping the card then a tape, or by keyboard (focus the card,
// arrow keys choose a tape, Enter or Space places it, Escape cancels) (指示書 第8.4b節).
import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Lang, Rational, WorldScene } from "@kimi/core";
import { ui } from "../flow/text.ts";
import { describeLayout, layoutWorld, type LayoutOptions, type TapeLayout, type ValueLabel } from "./layout.ts";
import { useAnimation, useReducedMotion } from "./motion.ts";
import { COLORS, FONT } from "./theme.ts";

export interface WorldViewProps {
  /** A verified world from core (verifiedDrawWorld / verifiedCorrectWorld). */
  world: WorldScene;
  /** Where the 「1」 card is: a holder id; null = not placed yet (order only); omitted = the world's own unit. */
  cardHolder?: string | null;
  /** The correct world: when `world` is the same world (core's sameWorld), only the length order is drawn. */
  correct?: WorldScene;
  /** Values the child said, by quantity id: only these may show for the asked quantity. */
  answered?: Readonly<Record<string, Rational>>;
  /** Other numbers the child said (may be shown, e.g. on a difference). */
  childNumbers?: readonly Rational[];
  /** The size of one segment the child said: drawn on each segment of the 「1」 tape (Q29); null before. */
  unitValue?: Rational | null;
  /** Makes the card movable. Called with the holder whose whole tape the card was put on. */
  onPlaceCard?: (holderId: string) => void;
  /** Element ids (quantity, holder or relation ids) whose part of the world glows with a failing sentence. */
  glowIds?: readonly string[];
  /** Texts of sentences that fail, for the spoken description only. */
  failingSentences?: readonly string[];
  /** Overrides the system's prefers-reduced-motion. */
  reducedMotion?: boolean;
  /** The language of the words the drawing adds (names and numbers stay as in the problem). */
  lang?: Lang;
  /** Accessible name of the drawing. */
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

const valueText = (v: ValueLabel): string | null =>
  v.kind === "number" ? `${v.text}${v.counter}` : v.kind === "unknown" ? "？" : null;
const valueData = (v: ValueLabel): string => (v.kind === "number" ? v.text : "?");

function Tape({ t, glow, reduced }: { t: TapeLayout; glow: boolean; reduced: boolean }) {
  const bar = useRef<SVGGElement>(null);
  const halo = useRef<SVGRectElement>(null);
  useAnimation(bar, "grow", [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], !reduced, `${String(t.width)}`);
  useAnimation(halo, "pulse", [{ opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }], glow && !reduced, t.holderId, true);
  const text = valueText(t.value);
  const mid = t.tapeY + t.height / 2;
  return (
    <g
      data-role="tape"
      data-holder={t.holderId}
      data-unit={t.isUnit ? "true" : "false"}
      data-glow={glow ? "true" : "false"}
      data-impossible={t.impossible ? "true" : "false"}
    >
      <text x={16} y={mid} dominantBaseline="central" fill={COLORS.ink} style={{ font: `700 22px ${FONT}` }}>
        {t.label}
      </text>
      {glow && (
        <rect
          ref={halo}
          data-role="glow"
          x={t.x - 6}
          y={t.tapeY - 6}
          width={t.width + 12}
          height={t.height + 12}
          rx={10}
          fill={COLORS.accentSoft}
          stroke={COLORS.accent}
          strokeWidth={3}
          strokeDasharray="10 6"
        />
      )}
      <g ref={bar} style={{ transformBox: "fill-box", transformOrigin: "left center" }}>
        <rect
          data-role="tape-bar"
          data-holder={t.holderId}
          x={t.x}
          y={t.tapeY}
          width={t.width}
          height={t.height}
          rx={6}
          fill={t.isUnit ? COLORS.tapeUnit : COLORS.tape}
          stroke={COLORS.tapeEdge}
          strokeWidth={2}
          strokeDasharray={t.value.kind === "unknown" ? "8 5" : undefined}
        />
        {t.segments.map((s, i) => (
          <rect
            key={i}
            data-role="segment"
            x={s.x}
            y={t.tapeY}
            width={s.width}
            height={t.height}
            fill="none"
            stroke={COLORS.tapeEdge}
            strokeWidth={2}
          />
        ))}
        {t.segments.map((s, i) =>
          s.value?.kind === "number" ? (
            <text
              key={`v${String(i)}`}
              data-role="segment-value"
              data-holder={t.holderId}
              x={s.x + s.width / 2}
              y={mid}
              textAnchor="middle"
              dominantBaseline="central"
              fill={COLORS.ink}
              style={{ font: `700 18px ${FONT}` }}
            >
              {s.value.text}
            </text>
          ) : null,
        )}
      </g>
      {t.impossible && (
        // The end that cannot be reached: a broken edge, not a cross and not a number (第8.5節).
        <path
          data-role="impossible-mark"
          d={`M ${String(t.x + t.width)} ${String(t.tapeY - 6)} l 8 ${String(t.height / 4 + 3)} l -8 ${String(t.height / 4 + 3)} l 8 ${String(t.height / 4 + 3)} l -8 ${String(t.height / 4 + 3)}`}
          fill="none"
          stroke={COLORS.accent}
          strokeWidth={3}
        />
      )}
      {text !== null && (
        <text
          data-role="value"
          data-holder={t.holderId}
          data-value={valueData(t.value)}
          x={t.x + t.width + 20}
          y={mid}
          dominantBaseline="central"
          fill={COLORS.ink}
          style={{ font: `700 24px ${FONT}` }}
        >
          {text}
        </text>
      )}
    </g>
  );
}

interface Drag {
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  moved: boolean;
}

export function WorldView(props: WorldViewProps) {
  const lang = props.lang ?? "ja";
  const words = ui(lang).draw;
  const { world, onPlaceCard, glowIds = [], failingSentences = [], label = words.world } = props;
  const reduced = useReducedMotion(props.reducedMotion);
  const descId = useId();

  const { cardHolder, correct, answered, childNumbers, unitValue } = props;
  const l = useMemo(() => {
    const opts: LayoutOptions = {};
    if (cardHolder !== undefined) opts.cardHolder = cardHolder;
    if (correct !== undefined) opts.correct = correct;
    if (answered !== undefined) opts.answered = answered;
    if (childNumbers !== undefined) opts.childNumbers = childNumbers;
    if (unitValue !== undefined) opts.unitValue = unitValue;
    return layoutWorld(world, opts);
  }, [world, cardHolder, correct, answered, childNumbers, unitValue]);

  // A relation glows through the tapes it ties together.
  const glowing = useMemo(() => {
    const ids = new Set(glowIds);
    for (const r of world.relations) {
      if (!ids.has(r.id)) continue;
      ids.add(r.subject);
      if (r.reference !== null) ids.add(r.reference);
    }
    return ids;
  }, [glowIds, world]);

  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [armed, setArmed] = useState(false);
  const [candidate, setCandidate] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const movable = onPlaceCard !== undefined;

  const place = (holderId: string): void => {
    setDrag(null);
    setArmed(false);
    setCandidate(null);
    onPlaceCard?.(holderId);
  };

  const scale = (): number => {
    const w = svg.current?.getBoundingClientRect().width ?? 0;
    return w > 0 ? l.width / w : 1;
  };

  const onCardPointerDown = (e: PointerEvent<SVGGElement>): void => {
    if (!movable) return;
    e.preventDefault();
    setDrag({ startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, moved: false });
  };
  const onSvgPointerMove = (e: PointerEvent<SVGSVGElement>): void => {
    if (drag === null) return;
    const k = scale();
    const dx = (e.clientX - drag.startX) * k;
    const dy = (e.clientY - drag.startY) * k;
    setDrag({ ...drag, dx, dy, moved: drag.moved || Math.hypot(dx, dy) > 4 });
  };
  const onSvgPointerUp = (): void => {
    if (drag === null) return;
    // A tap without a move picks the card up; the next tap on a tape puts it there.
    if (!drag.moved) setArmed(true);
    setDrag(null);
  };
  const onTargetPointerUp = (holderId: string) => (e: PointerEvent<SVGRectElement>) => {
    if (drag === null || !drag.moved) return;
    e.stopPropagation();
    place(holderId);
  };
  const onTargetClick = (holderId: string) => () => {
    if (armed) place(holderId);
  };

  const announce = (i: number | null): string => {
    if (i === null) return "";
    const t = l.tapes[i];
    return t === undefined ? "" : words.tape(t.label);
  };
  const onCardKey = (e: KeyboardEvent<SVGGElement>): void => {
    const n = l.tapes.length;
    if (n === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      setCandidate((c) => ((c ?? -1) + 1) % n);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      setCandidate((c) => ((c ?? 0) - 1 + n) % n);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const t = candidate === null ? undefined : l.tapes[candidate];
      if (t !== undefined) place(t.holderId);
    } else if (e.key === "Escape") {
      setCandidate(null);
      setArmed(false);
    }
  };

  const card = l.card;
  const chosen = candidate === null ? undefined : l.dropTargets[candidate];
  const cardShift = drag === null ? undefined : `translate(${String(drag.dx)} ${String(drag.dy)})`;

  return (
    <div data-impossible-world={l.impossible ? "true" : "false"} style={{ position: "relative" }}>
      <svg
        ref={svg}
        role="group"
        aria-label={label}
        aria-describedby={descId}
        viewBox={`0 0 ${String(l.width)} ${String(l.height)}`}
        width="100%"
        style={{ maxWidth: l.width, display: "block", background: COLORS.paper, touchAction: drag === null ? "auto" : "none" }}
        onPointerMove={onSvgPointerMove}
        onPointerUp={onSvgPointerUp}
      >
        {l.tapes.map((t) => (
          <Tape key={t.holderId} t={t} glow={glowing.has(t.quantityId) || glowing.has(t.holderId)} reduced={reduced} />
        ))}
        {l.differences.map((d) => {
          const text = valueText(d.label);
          return (
            <g key={d.relationId} data-role="difference" data-relation={d.relationId}>
              <path
                d={`M ${String(d.x)} ${String(d.y)} v 8 h ${String(d.width)} v -8`}
                fill="none"
                stroke={COLORS.ink}
                strokeWidth={2}
              />
              {text !== null && (
                <text
                  data-role="value"
                  data-relation={d.relationId}
                  data-value={valueData(d.label)}
                  x={d.x + d.width / 2}
                  y={d.y + 24}
                  textAnchor="middle"
                  fill={COLORS.ink}
                  style={{ font: `700 18px ${FONT}` }}
                >
                  {text}
                </text>
              )}
            </g>
          );
        })}
        {movable &&
          l.dropTargets.map((d) => (
            <rect
              key={d.holderId}
              data-drop-target={d.holderId}
              x={d.x}
              y={d.y}
              width={d.width}
              height={d.height}
              fill="transparent"
              onPointerUp={onTargetPointerUp(d.holderId)}
              onClick={onTargetClick(d.holderId)}
              style={{ cursor: armed || drag !== null ? "pointer" : "default" }}
            />
          ))}
        {chosen !== undefined && (
          <rect
            data-role="candidate"
            x={chosen.x}
            y={chosen.y}
            width={chosen.width}
            height={chosen.height}
            rx={10}
            fill="none"
            stroke={COLORS.focus}
            strokeWidth={3}
            strokeDasharray="6 4"
            pointerEvents="none"
          />
        )}
        <g
          data-role="reference_mark"
          data-on={card.placedOn ?? ""}
          transform={cardShift}
          {...(movable
            ? {
                role: "button",
                tabIndex: 0,
                "aria-label": words.cardAria,
                onPointerDown: onCardPointerDown,
                onKeyDown: onCardKey,
                onFocus: () => setFocused(true),
                onBlur: () => {
                  setFocused(false);
                  setCandidate(null);
                },
              }
            : { "aria-hidden": true })}
          style={{ cursor: movable ? "grab" : "default", pointerEvents: drag === null ? "auto" : "none", outline: "none" }}
        >
          {/* A touch target of at least 44 around the card. */}
          {movable && (
            <rect x={card.x} y={card.y + card.height / 2 - 22} width={Math.max(card.width, 44)} height={44} fill="transparent" />
          )}
          <rect
            x={card.x}
            y={card.y + 2}
            width={card.width}
            height={card.height - 6}
            rx={8}
            fill={COLORS.card}
            stroke={focused || armed ? COLORS.focus : COLORS.cardEdge}
            strokeWidth={focused || armed ? 4 : 2}
          />
          <text
            x={card.x + card.width / 2}
            y={card.y + 2 + (card.height - 6) / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fill={COLORS.ink}
            style={{ font: `800 22px ${FONT}` }}
          >
            1
          </text>
        </g>
      </svg>
      <p id={descId} style={srOnly}>
        {describeLayout(l, failingSentences, lang)}
      </p>
      <p role="status" aria-live="polite" style={srOnly}>
        {announce(candidate)}
      </p>
    </div>
  );
}
