// The child's own dealing for one part (user request, 2026-11-08): the plates as core dealt them at the child's number,
// things left over in a pool, and the child moving things between plates by dragging with a finger or the mouse (or
// tapping a thing, then a plate). After every move core says what each plate holds (its share of the whole) and whether
// all plates are the same; the screen only counts what is on each plate, which the child can see.
//
// User request, 2026-11-08 夜: that the things can be moved must stand out (a big call and the things wiggling until the
// first move); while and after moving, a line says the plates are not the same yet and what they are now; when they
// are the same, a big cheer, and the child is sent on to type one part (onEqual lets the screen light the answer pad).
// Dragging uses pointer events, so a finger on a tablet drags as a mouse does (HTML drag and drop does not on touch).
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { dealStatus, type DealAttempt, type Lang } from "@kimi/core";
import { PALETTE, itemPartFor } from "../draw/assets/spec.ts";
import { itemSvg } from "../draw/parts.ts";
import { BORDER, COLOR, RADIUS, SPACE, TYPE } from "../ui/tokens.ts";
import { stepsText } from "./text.ts";
import { RubyText } from "../ui/Ruby.tsx";
import type { Readings } from "@kimi/core";

/** Where a thing sits: a plate (its index) or the pool of things left over. */
type Spot = number | "pool";

const spotKey = (s: Spot): string => String(s);
const spotOf = (raw: string | null | undefined): Spot | null => (raw === null || raw === undefined ? null : raw === "pool" ? "pool" : Number(raw));

/** A finger or mouse that moved less than this (px) is a tap, not a drag. */
const DRAG_SLOP = 6;

const CSS = `
@keyframes k-deal-wiggle { 0%, 100% { transform: rotate(0deg); } 25% { transform: rotate(-9deg); } 75% { transform: rotate(9deg); } }
@keyframes k-deal-glow { 0%, 100% { box-shadow: 0 0 0 0 rgba(255, 216, 77, 0.0); } 50% { box-shadow: 0 0 0 6px rgba(255, 216, 77, 0.9); } }
@keyframes k-deal-pop { 0% { transform: scale(0.85); opacity: 0; } 60% { transform: scale(1.05); opacity: 1; } 100% { transform: scale(1); } }
.k-deal-wiggle { animation: k-deal-wiggle 0.9s ease-in-out infinite; }
.k-deal-glow { animation: k-deal-glow 1.4s ease-in-out infinite; }
.k-deal-pop { animation: k-deal-pop 0.45s ease-out; }
@media (prefers-reduced-motion: reduce) { .k-deal-wiggle, .k-deal-glow, .k-deal-pop { animation: none; } }
`;

function Thing({ svg, size, selected, wiggle }: { svg: { viewBox: string; body: string }; size: number; selected: boolean; wiggle: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={svg.viewBox}
      aria-hidden="true"
      className={wiggle ? "k-deal-wiggle" : undefined}
      style={{ display: "block", borderRadius: 8, outline: selected ? `3px solid ${COLOR.attention}` : "none", outlineOffset: 1 }}
      dangerouslySetInnerHTML={{ __html: svg.body }}
    />
  );
}

/**
 * `unit`: the child looks for one part, so all plates the same is the goal (a cheer, onEqual). `total`: the child's
 * answer dealt one part per plate; plates the same is not the goal there, so only what the plates are now is said.
 * `onTalk` hands AI-kun's line for the plates now (null: AI-kun keeps the step's line).
 */
export function DealBoard({
  attempt,
  lang,
  holderLabel,
  mode = "unit",
  onEqual,
  onTalk,
  ruby = false,
  readings,
}: {
  attempt: DealAttempt;
  lang: Lang;
  holderLabel: string;
  mode?: "unit" | "total";
  onEqual?: (equal: boolean) => void;
  onTalk?: (line: string | null) => void;
  /** Furigana over the board's words, as on the rest of the step (code review, 2026-11-08). */
  ruby?: boolean;
  readings?: Readings;
}) {
  const t = stepsText(lang);
  const [plates, setPlates] = useState<number[]>(() => [...attempt.plates]);
  const [pool, setPool] = useState(attempt.left);
  const [picked, setPicked] = useState<Spot | null>(null);
  const [moved, setMoved] = useState(false);
  const [drag, setDrag] = useState<{ from: Spot; x: number; y: number; over: Spot | null; dragging: boolean } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const part = itemPartFor(attempt.noun, holderLabel);
  const svg = itemSvg(part ?? "token");
  const raw = dealStatus(plates, attempt.total, attempt.worth, pool, attempt.hidden);
  const status = mode === "unit" ? raw : { ...raw, equal: false };
  useEffect(() => {
    onEqual?.(status.equal);
  }, [status.equal, onEqual]);
  const countAt = (s: Spot): number => (s === "pool" ? pool : (plates[s] ?? 0));
  const move = (from: Spot, to: Spot): void => {
    if (from === to || countAt(from) === 0) return;
    const next = [...plates];
    let nextPool = pool;
    if (from === "pool") nextPool -= 1;
    else next[from] = (next[from] ?? 0) - 1;
    if (to === "pool") nextPool += 1;
    else next[to] = (next[to] ?? 0) + 1;
    setPlates(next);
    setPool(nextPool);
    setMoved(true);
  };
  const tapSpot = (s: Spot): void => {
    if (picked === null) {
      if (countAt(s) > 0) setPicked(s);
      return;
    }
    move(picked, s);
    setPicked(null);
  };
  const spotUnder = (x: number, y: number): Spot | null => {
    const el = document.elementFromPoint(x, y);
    return spotOf(el?.closest("[data-deal-spot]")?.getAttribute("data-deal-spot"));
  };
  const onThingDown = (s: Spot) => (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY };
    setDrag({ from: s, x: e.clientX, y: e.clientY, over: s, dragging: false });
  };
  const onThingMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (drag === null || start.current === null) return;
    const far = Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > DRAG_SLOP;
    setDrag({ ...drag, x: e.clientX, y: e.clientY, over: spotUnder(e.clientX, e.clientY), dragging: drag.dragging || far });
  };
  const onThingUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (drag === null) return;
    const d = drag;
    setDrag(null);
    start.current = null;
    if (!d.dragging) {
      // A tap on a thing: pick its spot (or drop the picked one there).
      tapSpot(d.from);
      return;
    }
    const to = spotUnder(e.clientX, e.clientY);
    if (to !== null) move(d.from, to);
    setPicked(null);
  };

  const size = attempt.parts >= 5 ? 30 : 36;
  const unit = attempt.unitCounter;
  const totalValue = status.totalValue;
  /** A value core gives, or 「？」 for one part or the answer before the plates are all the same. */
  const said = (v: number | null): string => (v === null ? "？" : `${String(v)}${unit}`);
  const dragging = drag !== null && drag.dragging;
  const wiggle = !moved && !dragging;
  const box = (s: Spot, n: number, label: string, sub: string | null): React.ReactElement => {
    const over = dragging && drag.over === s && drag.from !== s;
    return (
      <div
        key={spotKey(s)}
        data-testid={s === "pool" ? "deal-pool" : `deal-plate-${String(s)}`}
        data-deal-spot={spotKey(s)}
        data-count={String(n)}
        role="button"
        tabIndex={0}
        // No aria-label: the plate's visible words are its name, so a screen reader says what is shown (axe, 2026-11-08).
        onClick={() => tapSpot(s)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            // Space would scroll the page (code review, 2026-11-08).
            e.preventDefault();
            tapSpot(s);
          }
        }}
        style={plateStyle(s === "pool", picked === s || over, status.equal && s !== "pool")}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 2, justifyContent: "center", alignContent: "flex-start", minHeight: size * 2 + 4 }}>
          {Array.from({ length: n }, (_, i) => {
            const lifted = dragging && drag.from === s && i === n - 1;
            return (
              <div
                key={i}
                data-role="deal-thing"
                onPointerDown={onThingDown(s)}
                onPointerMove={onThingMove}
                onPointerUp={onThingUp}
                onPointerCancel={() => setDrag(null)}
                onClick={(e) => e.stopPropagation()}
                style={{ cursor: dragging ? "grabbing" : "grab", touchAction: "none", opacity: lifted ? 0.3 : 1 }}
              >
                <Thing svg={svg} size={size} selected={picked === s && i === n - 1} wiggle={wiggle && n > 0} />
              </div>
            );
          })}
        </div>
        <p style={{ margin: `${String(SPACE.xs)}px 0 0`, fontSize: TYPE.small, lineHeight: 1.4, textAlign: "center", color: COLOR.ink }}>
          <RubyText text={label} on={ruby} {...(readings === undefined ? {} : { readings })} />
        </p>
        {sub !== null && <p data-role="deal-share" style={{ margin: 0, fontSize: TYPE.small, textAlign: "center", fontWeight: 700, color: COLOR.ink }}>{sub}</p>}
      </div>
    );
  };
  const now = plates.map((_, i) => said(status.plates[i]?.value ?? null)).join("・");
  // AI-kun says what the plates are now once the child has moved one (and the cheer's question when they are the same).
  const talk = status.equal ? t.deal.equalSay(attempt.parts, unit) : moved || dragging ? (mode === "unit" ? t.deal.notYet(attempt.parts, now) : t.deal.nowSay(now)) : null;
  useEffect(() => {
    onTalk?.(talk);
  }, [talk, onTalk]);
  return (
    <section aria-label={t.deal.label} data-testid="deal-board" style={{ border: `${String(BORDER.thin)}px solid ${COLOR.line}`, borderRadius: RADIUS.md, background: COLOR.surface, padding: SPACE.sm, position: "relative", userSelect: "none", WebkitUserSelect: "none" }}>
      <style>{CSS}</style>
      {/* The call to move things: big, until the child has moved one. */}
      {/* On the answer step moving cannot fill the empty plates, so the call to move is shown for one part only. */}
      {mode === "unit" && !moved && !status.equal && (
        <p
          data-testid="deal-hint"
          className="k-deal-glow"
          style={{ margin: `0 0 ${String(SPACE.sm)}px`, padding: `${String(SPACE.sm)}px ${String(SPACE.md)}px`, borderRadius: RADIUS.md, background: COLOR.attention, color: COLOR.ink, fontSize: TYPE.large, fontWeight: 800, lineHeight: 1.5, textAlign: "center", border: `${String(BORDER.thin)}px solid ${COLOR.outline}` }}
        >
          <span aria-hidden="true" style={{ marginRight: 6 }}>
            ☝
          </span>
          <RubyText text={t.deal.hint(attempt.noun)} on={ruby} {...(readings === undefined ? {} : { readings })} />
        </p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${String(attempt.parts)}, minmax(0, 1fr))`, gap: SPACE.xs }}>
        {plates.map((n, i) => {
          const shown = status.plates[i];
          const fraction = shown?.fraction ?? null;
          return box(i, n, t.deal.plate(`${String(totalValue)}${unit}`, said(shown?.value ?? null)), fraction === null ? "？" : `${String(fraction.num)}/${String(fraction.den)}`);
        })}
      </div>
      {(pool > 0 || attempt.left > 0) && <div style={{ marginTop: SPACE.xs }}>{box("pool", pool, t.deal.pool(said(status.poolValue)), null)}</div>}
      {status.equal ? (
        <p
          data-testid="deal-status"
          data-equal="true"
          role="status"
          className="k-deal-pop"
          style={{ margin: `${String(SPACE.sm)}px 0 0`, padding: `${String(SPACE.sm)}px ${String(SPACE.md)}px`, borderRadius: RADIUS.md, background: PALETTE.greenLight, border: `${String(BORDER.thin)}px solid ${PALETTE.green}`, fontSize: TYPE.large, fontWeight: 800, color: COLOR.ink, textAlign: "center", lineHeight: 1.5 }}
        >
          <RubyText text={t.deal.equal(attempt.parts)} on={ruby} {...(readings === undefined ? {} : { readings })} />
        </p>
      ) : (
        // AI-kun says what the plates are now (onTalk), and the big call says how to move them: the board keeps one
        // screen with no line of its own here (user request, 2026-11-08 夜). Kept for screen readers.
        <p data-testid="deal-status" data-equal="false" role="status" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
          {moved || dragging ? (mode === "unit" ? t.deal.notYet(attempt.parts, now) : t.deal.nowSay(now)) : t.deal.how}
        </p>
      )}
      {/* The thing under the finger while dragging. */}
      {dragging && (
        <div aria-hidden="true" style={{ position: "fixed", left: drag.x - size / 2, top: drag.y - size / 2, pointerEvents: "none", zIndex: 50, transform: "scale(1.25)" }}>
          <Thing svg={svg} size={size} selected={false} wiggle={false} />
        </div>
      )}
    </section>
  );
}

function plateStyle(pool: boolean, lit: boolean, done: boolean): CSSProperties {
  return {
    border: `${String(lit || done ? 3 : BORDER.thin)}px ${pool ? "dashed" : "solid"} ${done ? PALETTE.green : lit ? COLOR.attention : COLOR.line}`,
    borderRadius: pool ? RADIUS.md : 999,
    background: done ? "#eefaf1" : pool ? COLOR.surfaceSoft : "#fdf7ec",
    padding: `${String(SPACE.xs)}px ${String(SPACE.xs)}px`,
    cursor: "pointer",
    minWidth: 0,
  };
}
