// The child's own dealing for one part (user request, 2026-11-08): the plates as core dealt them at the child's number,
// things left over in a pool, and the child moving things between plates by dragging (or tapping a thing, then a plate).
// After every move core says what each plate holds (its share of the whole) and whether all plates are the same; the
// screen only counts what is on each plate, which the child can see.
import { useEffect, useState, type CSSProperties } from "react";
import { dealStatus, type DealAttempt, type Lang } from "@kimi/core";
import { itemPartFor } from "../draw/assets/spec.ts";
import { itemSvg } from "../draw/parts.ts";
import { BORDER, COLOR, RADIUS, SPACE, TYPE } from "../ui/tokens.ts";
import { stepsText } from "./text.ts";

/** Where a thing sits: a plate (its index) or the pool of things left over. */
type Spot = number | "pool";

function Thing({ svg, size, selected }: { svg: { viewBox: string; body: string }; size: number; selected: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={svg.viewBox}
      aria-hidden="true"
      style={{ display: "block", borderRadius: 8, outline: selected ? `3px solid ${COLOR.attention}` : "none", outlineOffset: 1 }}
      dangerouslySetInnerHTML={{ __html: svg.body }}
    />
  );
}

export function DealBoard({ attempt, lang, holderLabel }: { attempt: DealAttempt; lang: Lang; holderLabel: string }) {
  const t = stepsText(lang);
  const [plates, setPlates] = useState<number[]>(() => [...attempt.plates]);
  const [pool, setPool] = useState(attempt.left);
  const [picked, setPicked] = useState<Spot | null>(null);
  useEffect(() => {
    setPlates([...attempt.plates]);
    setPool(attempt.left);
    setPicked(null);
  }, [attempt]);
  const part = itemPartFor(attempt.noun, holderLabel);
  const svg = itemSvg(part ?? "token");
  const status = dealStatus(plates, attempt.total, attempt.worth);
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
  };
  const tapSpot = (s: Spot): void => {
    if (picked === null) {
      if (countAt(s) > 0) setPicked(s);
      return;
    }
    move(picked, s);
    setPicked(null);
  };
  const size = attempt.parts >= 5 ? 30 : 36;
  const unit = attempt.unitCounter;
  const totalValue = attempt.total * attempt.worth;
  const box = (s: Spot, n: number, label: string, sub: string | null): React.ReactElement => (
    <div
      key={String(s)}
      data-testid={s === "pool" ? "deal-pool" : `deal-plate-${String(s)}`}
      data-count={String(n)}
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={() => tapSpot(s)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") tapSpot(s);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const raw = e.dataTransfer.getData("text/plain");
        move(raw === "pool" ? "pool" : Number(raw), s);
        setPicked(null);
      }}
      style={plateStyle(s === "pool", picked === s)}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 2, justifyContent: "center", alignContent: "flex-start", minHeight: size * 2 + 4 }}>
        {Array.from({ length: n }, (_, i) => (
          <div
            key={i}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", String(s));
              e.dataTransfer.effectAllowed = "move";
            }}
            style={{ cursor: "grab" }}
          >
            <Thing svg={svg} size={size} selected={picked === s && i === n - 1} />
          </div>
        ))}
      </div>
      <p style={{ margin: `${String(SPACE.xs)}px 0 0`, fontSize: TYPE.small, lineHeight: 1.4, textAlign: "center", color: COLOR.ink }}>{label}</p>
      {sub !== null && <p data-role="deal-share" style={{ margin: 0, fontSize: TYPE.small, textAlign: "center", fontWeight: 700, color: COLOR.ink }}>{sub}</p>}
    </div>
  );
  return (
    <section aria-label={t.deal.label} data-testid="deal-board" style={{ border: `${String(BORDER.thin)}px solid ${COLOR.line}`, borderRadius: RADIUS.md, background: COLOR.surface, padding: SPACE.sm }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${String(attempt.parts)}, minmax(0, 1fr))`, gap: SPACE.xs }}>
        {plates.map((n, i) => {
          const value = status.plates[i]?.value ?? 0;
          return box(i, n, t.deal.plate(`${String(totalValue)}${unit}`, `${String(value)}${unit}`), `${String(n)}/${String(attempt.total)}`);
        })}
      </div>
      {(pool > 0 || attempt.left > 0) && <div style={{ marginTop: SPACE.xs }}>{box("pool", pool, t.deal.pool(`${String(pool * attempt.worth)}${unit}`), null)}</div>}
      <p data-testid="deal-status" role="status" style={{ margin: `${String(SPACE.xs)}px 0 0`, fontSize: TYPE.small, fontWeight: 700, color: status.equal ? COLOR.ink : COLOR.inkSoft, minHeight: "1.5em" }}>
        {status.equal ? t.deal.equal(attempt.parts) : t.deal.how}
      </p>
    </section>
  );
}

function plateStyle(pool: boolean, picked: boolean): CSSProperties {
  return {
    border: `${String(BORDER.thin)}px ${pool ? "dashed" : "solid"} ${picked ? COLOR.attention : COLOR.line}`,
    borderRadius: pool ? RADIUS.md : 999,
    background: pool ? COLOR.surfaceSoft : "#fdf7ec",
    padding: `${String(SPACE.xs)}px ${String(SPACE.xs)}px`,
    cursor: "pointer",
    minWidth: 0,
  };
}
