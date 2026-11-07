// The stage picture above the tape (指示書 第8節). Each holder's things are drawn one by one in its container, its
// name under it in the holder's colour, and below it the dishes the multiple deals the things onto. A misread
// world is drawn with its own values, so a goldfish cut in pieces shows the misreading (user decision,
// 2026-11-08). Every count comes from core's objectScene, which also hides the correct world's values the
// child has not said: those holders are drawn as 「？」. This component draws and moves only.
import { useEffect, useId, useMemo, useRef } from "react";
import type { Lang, ObjectScene } from "@kimi/core";
import { ui } from "../flow/text.ts";
import { containerSvg, groupSvg, itemSvg } from "./parts.ts";
import { PALETTE, shareStyleOf, type ItemPart, type ShareStyle } from "./assets/spec.ts";
import { holderColors } from "./holder-colors.ts";
import { MOTION } from "./motion-tokens.ts";
import { useReducedMotion } from "./motion.ts";
import { CUP_BOTTOM, CUP_INNER, PANEL, THING_FILL, layoutStage, liquidOf, partBoxOf, pieceKeepOf, type StageHolderLayout, type StageItem, type StageLayout, type ThingLayout } from "./stage-layout.ts";
import { COLORS, FONT } from "./theme.ts";

export interface ObjectSceneProps {
  /** core's objectScene for the world on the screen. */
  scene: ObjectScene;
  reducedMotion?: boolean;
  lang?: Lang;
  /** Accessible name of the picture. */
  label?: string;
  /** How a piece of a thing is drawn, per thing (default: the contract's setting, assets/spec.ts ITEM_SHARE). */
  shareStyle?: (item: ItemPart) => ShareStyle;
  /** Draw things without a part of their own as plain round counters (the word book's everyday examples). */
  counters?: boolean;
  /** A small picture beside another (the word book's contrasting cases): smaller things on the dishes. */
  compact?: boolean;
  /** The width the picture is drawn at on a 1024 screen (px), when narrower than the page. */
  pagePx?: number;
}

const srOnly = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
} as const;

/** The gap between two things starting to move, and the most the starts may spread (指示書 第8.6節). */
const STAGGER = { step: 150, total: 1200 } as const;

/** What is drawn, said in words: the counts as drawn, the dishes, a cut thing. Never a verdict, never a hidden value. */
export function describeStage(scene: ObjectScene, layout: StageLayout, lang: Lang = "ja", shareStyle: (item: ItemPart) => ShareStyle = shareStyleOf): string {
  const styleOf = (item: StageItem): ShareStyle => (item === "cup" || item === "token" ? "cut" : shareStyle(item));
  const w = ui(lang).draw;
  const { noun, counter } = scene.item;
  const parts = scene.holders.flatMap((h) => {
    if (h.hidden) return [w.stageUnknown(h.label, noun)];
    if (h.count === null) return [w.stageEmpty(h.label, noun)];
    const out = [w.stageHolder(h.label, noun, w.amount(h.count.wholes, h.count.piece, counter))];
    const drawn = layout.holders.find((x) => x.holderId === h.holderId);
    if (scene.share !== null && drawn !== undefined && drawn.dishes.length > 0) {
      const each = w.amount(scene.share.wholes, scene.share.piece, counter);
      if (drawn.item === "cup") out.push(w.stagePoured(h.label, noun, drawn.dishes.length), w.stageEachGroup(each));
      else if (drawn.item === "yarn") out.push(w.stageMeasured(h.label, noun, drawn.dishes.length), w.stageEachGroup(each));
      else out.push(w.stageDishes(h.label, noun, drawn.dishes.length), w.stageEach(each));
    }
    return out;
  });
  const p = scene.pairing;
  if (p !== null && layout.pairing !== null) {
    const large = scene.holders.find((h) => h.holderId === p.larger);
    const small = scene.holders.find((h) => h.holderId !== p.larger);
    if (large !== undefined && small !== undefined) {
      parts.push(w.stagePaired(small.label, large.label, noun), w.stageUnpaired(large.label, noun, w.amount(p.extra, null, counter)));
    }
  }
  const cutHolders = layout.holders.filter((h) => h.things.some((t) => t.piece !== null));
  const pieces = cutHolders.flatMap((h) => h.things.filter((t) => t.piece !== null));
  const first = cutHolders[0];
  const half = pieces.every((t) => t.pieceText === "1/2");
  if (first !== undefined) parts.push(first.item === "cup" ? w.stageCupPart(noun, half) : w.stageCut(noun, half, styleOf(first.item) === "ghost"));
  return w.join(parts);
}

const safeId = (s: string): string => s.replace(/[^a-zA-Z0-9_-]/g, "");

const LIQUID_COLOR: Readonly<Record<"juice" | "water", string>> = { juice: PALETTE.orange, water: PALETTE.blue };

/** A cup filled to its share (a whole cup is full): the liquid a rectangle rising from the cup's foot, clipped inside. */
function Cup({ t, holderId, liquid, clipId }: { t: ThingLayout; holderId: string; liquid: "juice" | "water"; clipId: string }) {
  const cup = groupSvg("cup");
  const fill = t.piece ?? 1;
  const h = t.size * THING_FILL;
  const w = (h * 100) / 130;
  const level = CUP_INNER.y + (CUP_BOTTOM - CUP_INNER.y) * (1 - fill);
  return (
    <g data-role="thing" data-holder={holderId} data-part="cup" data-place={t.place} data-dish={String(t.dish)} data-piece={t.pieceText} data-fill={String(fill)} data-dx={String(t.fromX - t.x)} data-dy={String(t.fromY - t.y)}>
      <svg x={t.x + (t.size - w) / 2} y={t.y + t.size - h} width={w} height={h} viewBox={cup.viewBox} overflow="visible">
        <clipPath id={clipId}>
          <rect x={CUP_INNER.x} y={CUP_INNER.y} width={CUP_INNER.w} height={CUP_BOTTOM - CUP_INNER.y} rx={12} />
        </clipPath>
        <g dangerouslySetInnerHTML={{ __html: cup.body }} />
        <rect data-role="liquid" x={CUP_INNER.x} y={level} width={CUP_INNER.w} height={CUP_BOTTOM - level} fill={LIQUID_COLOR[liquid]} opacity={0.85} clipPath={`url(#${clipId})`} />
        {/* The liquid's top: a straight line in the outline colour, so a part-filled cup reads as a level. */}
        {t.piece !== null && <line data-role="liquid-level" x1={CUP_INNER.x} y1={level} x2={CUP_INNER.x + CUP_INNER.w} y2={level} stroke={PALETTE.outline} strokeWidth={4} />}
      </svg>
    </g>
  );
}

function Thing({ t, holderId, part, clipId, style }: { t: ThingLayout; holderId: string; part: ReturnType<typeof itemSvg> & { id: string }; clipId: string; style: ShareStyle }) {
  // The kept part is t.piece of the drawing's own width (PART_BOX: half a fish is half of the fish you see), from its
  // left or (a fish, its head) from its right; the cut is straight.
  const right = pieceKeepOf(part.id) === "right";
  const bb = partBoxOf(part.id);
  const share = t.piece ?? 1;
  const cutX = right ? bb.x + bb.w * (1 - share) : bb.x + bb.w * share;
  const keptX = right ? cutX : 0;
  const kept = right ? 100 - cutX : cutX;
  const restX = right ? 0 : cutX;
  return (
    <g
      data-role="thing"
      data-holder={holderId}
      data-part={part.id}
      data-place={t.place}
      data-dish={String(t.dish)}
      data-piece={t.pieceText}
      data-keep={t.piece === null ? "" : right ? "right" : "left"}
      data-share={t.piece === null ? "" : style}
      data-dx={String(t.fromX - t.x)}
      data-dy={String(t.fromY - t.y)}
    >
      {/* A thing fills THING_FILL of its cell, so neighbours never touch; it stands on the cell's foot. */}
      <svg
        x={t.x + (t.size * (1 - THING_FILL)) / 2}
        y={t.y + t.size * (1 - THING_FILL)}
        width={t.size * THING_FILL}
        height={t.size * THING_FILL}
        viewBox={part.viewBox}
        overflow="visible"
      >
        {t.piece === null ? (
          <g dangerouslySetInnerHTML={{ __html: part.body }} />
        ) : (
          <>
            <clipPath id={clipId}>
              <rect x={keptX} y={0} width={kept} height={100} />
            </clipPath>
            <g clipPath={`url(#${clipId})`} dangerouslySetInnerHTML={{ __html: part.body }} />
            {style === "ghost" && (
              // The missing part as a faint dashed outline of the whole thing.
              <>
                <clipPath id={`${clipId}-r`}>
                  <rect x={restX} y={0} width={100 - kept} height={100} />
                </clipPath>
                <g data-role="ghost" className="stage-ghost" opacity={0.75} clipPath={`url(#${clipId}-r)`} dangerouslySetInnerHTML={{ __html: part.body }} />
              </>
            )}
            {/* A clean straight cut in the outline colour, only across the thing itself (masked by its silhouette): the
                piece is part of one thing, not a smaller thing. */}
            <filter id={`${clipId}-w`}>
              <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0" />
            </filter>
            <mask id={`${clipId}-m`} maskUnits="userSpaceOnUse" x={-10} y={-10} width={120} height={120}>
              <g filter={`url(#${clipId}-w)`} dangerouslySetInnerHTML={{ __html: part.body }} />
            </mask>
            <line data-role="cut-edge" x1={cutX} y1={0} x2={cutX} y2={100} stroke={PALETTE.outline} strokeWidth={5} mask={`url(#${clipId}-m)`} />
          </>
        )}
      </svg>
    </g>
  );
}

export function ObjectSceneView({ scene, reducedMotion, lang = "ja", label, shareStyle = shareStyleOf, counters = false, compact = false, pagePx }: ObjectSceneProps) {
  const words = ui(lang).draw;
  const reduced = useReducedMotion(reducedMotion);
  const uid = safeId(useId());
  const layout = useMemo(() => layoutStage(scene, undefined, { counters, compact, ...(pagePx === undefined ? {} : { pagePx }) }), [scene, counters, compact, pagePx]);
  const desc = useMemo(() => (layout === null ? "" : describeStage(scene, layout, lang, shareStyle)), [scene, layout, lang, shareStyle]);
  const root = useRef<HTMLDivElement>(null);
  const colors = useMemo(() => new Map(holderColors(scene.holders.map((h) => ({ id: h.holderId, label: h.label }))).map((c) => [c.id, c.color])), [scene]);

  // Deal: each thing moves from its container onto its dish (or drops into its container), a few at a time.
  const motionKey = layout === null ? "" : layout.holders.map((h) => `${h.holderId}:${String(h.things.length)}:${String(h.dishes.length)}`).join("|");
  useEffect(() => {
    const el = root.current;
    if (reduced || el === null) return;
    const things = [...el.querySelectorAll<SVGGElement>('[data-role="thing"]')];
    if (things.length === 0 || typeof things[0]?.animate !== "function") return;
    const step = Math.min(STAGGER.step, STAGGER.total / things.length);
    const running = things.map((t, i) => {
      const dealt = t.getAttribute("data-place") === "dish";
      const preset = dealt ? MOTION.move : MOTION.drop;
      const from = `translate(${t.getAttribute("data-dx") ?? "0"}px, ${t.getAttribute("data-dy") ?? "0"}px)`;
      return t.animate([{ transform: from }, { transform: "translate(0px, 0px)" }], {
        duration: preset.duration,
        easing: preset.easing,
        delay: Math.round(i * step),
        fill: "backwards",
      });
    });
    return () => {
      for (const a of running) a.cancel();
    };
  }, [reduced, motionKey]);

  if (layout === null) return null;
  const plate = groupSvg();
  const drawHolder = (h: StageHolderLayout, layer: "back" | "front" | "all" = "all") => {
    const box = h.container === null ? null : containerSvg(h.container);
    const part = h.item === "cup" ? null : { ...itemSvg(h.item), id: h.item };
    const liquid = liquidOf(scene.item.noun) ?? "water";
    const color = colors.get(h.holderId);
    const back = layer !== "front";
    const front = layer !== "back";
    return (
      <>
        {back && h.box !== null && box !== null && (
          <svg data-role="container" x={h.box.x} y={h.box.y} width={h.box.w} height={h.box.h} viewBox={box.viewBox}>
            <g dangerouslySetInnerHTML={{ __html: box.back }} />
          </svg>
        )}
        {back && h.soil.map((b, k) => (
          <rect key={`s${String(k)}`} data-role="soil" x={b.x} y={b.y} width={b.w} height={b.h} rx={b.h / 2} fill={PALETTE.brown} stroke={PALETTE.outline} strokeWidth={3} />
        ))}
        {back && h.groups.map((g, k) => (
          <rect key={`g${String(k)}`} data-role="share-group" data-holder={h.holderId} x={g.x} y={g.y} width={g.w} height={g.h} rx={14} fill={PALETTE.greyLight} stroke={PALETTE.grey} strokeWidth={3} />
        ))}
        {back && h.plates.map((d, k) => (
          <svg key={`p${String(k)}`} data-role="dish" data-holder={h.holderId} x={d.x} y={d.y} width={d.w} height={d.h} viewBox={plate.viewBox} preserveAspectRatio="none" overflow="visible">
            <g dangerouslySetInnerHTML={{ __html: plate.body }} />
          </svg>
        ))}
        {front &&
          h.things.map((t, i) =>
            part === null ? (
              <Cup key={i} t={t} holderId={h.holderId} liquid={liquid} clipId={`${uid}-${h.holderId}-${String(i)}`} />
            ) : (
              <Thing key={i} t={t} holderId={h.holderId} part={part} clipId={`${uid}-${h.holderId}-${String(i)}`} style={h.item === "token" ? "cut" : shareStyle(h.item as ItemPart)} />
            ),
          )}
        {front && h.box !== null && box !== null && (
          <svg x={h.box.x} y={h.box.y} width={h.box.w} height={h.box.h} viewBox={box.viewBox} pointerEvents="none">
            <g dangerouslySetInnerHTML={{ __html: box.front }} />
          </svg>
        )}
        {front && h.unknown !== null && (
          <text
            data-role="stage-unknown"
            data-holder={h.holderId}
            x={h.unknown.x}
            y={h.unknown.y}
            textAnchor="middle"
            dominantBaseline="central"
            fill={COLORS.ink}
            style={{ font: `800 64px ${FONT}` }}
          >
            ？
          </text>
        )}
        {front && (
          <>
        <text
          data-role="name-tag"
          data-holder={h.holderId}
          x={h.tag.x}
          y={h.tag.y}
          textAnchor="middle"
          dominantBaseline="central"
          fill={color?.ink ?? COLORS.ink}
          style={{ font: `700 26px ${FONT}` }}
        >
          {h.label}
        </text>
        {color !== undefined && <rect x={h.tag.x - 30} y={h.tag.y + 16} width={60} height={5} rx={2.5} fill={color.fill} />}
          </>
        )}
      </>
    );
  };
  return (
    <div data-role="stage" data-breaks={scene.breaks ? "true" : "false"} style={{ position: "relative", marginBottom: 8 }}>
      {/* A ghost piece: every shape of the part as a dashed outline in the outline colour, unfilled, so it reads as a
          thing that is not there (CSS wins over the part's own presentation attributes). */}
      {/* Only when a ghost piece is drawn (no stray signs in the page's text otherwise). */}
      {layout.holders.some((h) => h.item !== "cup" && h.item !== "token" && shareStyle(h.item) === "ghost" && h.things.some((t) => t.piece !== null)) && (
        <style>{`.stage-ghost :is(path, circle, ellipse, rect, polygon, polyline, line) { fill: none; stroke: ${PALETTE.outline}; stroke-width: 5; stroke-dasharray: 9 7; }`}</style>
      )}
      <div
        ref={root}
        role="img"
        aria-label={label ?? words.stage}
        aria-describedby={`${uid}-d`}
        style={{ display: "flex", flexWrap: "wrap", gap: PANEL.gap, alignItems: "flex-start", background: COLORS.paper }}
      >
        {layout.pairing === null ? (
          layout.holders.map((h) => {
            const color = colors.get(h.holderId);
            return (
              // One panel per holder: side by side when two fit, stacked on a narrow screen; never overlapping.
              <svg
                key={h.holderId}
                data-role="stage-holder"
                data-holder={h.holderId}
                data-hidden={h.hidden ? "true" : "false"}
                aria-hidden="true"
                viewBox={`0 0 ${String(layout.width)} ${String(h.height)}`}
                // A frame in the holder's colour keeps each holder's dishes apart from the other's.
                style={{
                  // Side by side, two panels share the row (stacked below about 704 px); stacked, each takes the full width.
                  flex: layout.stacked ? "1 1 100%" : `1 1 ${String((PANEL.minPx * layout.pagePx) / PANEL.pagePx)}px`,
                  minWidth: 0,
                  maxWidth: layout.stacked ? PANEL.stackedMaxPx : PANEL.maxPx,
                  display: "block",
                  boxSizing: "border-box",
                  padding: 6,
                  border: `3px solid ${color?.fill ?? COLORS.muted}`,
                  borderRadius: 16,
                }}
              >
                {drawHolder(h)}
              </svg>
            );
          })
        ) : (
          // An additive reading: both holders in one panel, thing i above thing i, joined by a light line; the
          // larger holder's things without a partner in dashed boxes.
          <svg
            data-role="stage-pairing"
            aria-hidden="true"
            viewBox={`0 0 ${String(layout.width)} ${String(layout.height)}`}
            style={{ flex: "1 1 100%", minWidth: 0, maxWidth: PANEL.stackedMaxPx, display: "block", boxSizing: "border-box", padding: 6, border: `3px solid ${COLORS.muted}`, borderRadius: 16 }}
          >
            {/* The containers' backs, then the lines joining each pair (behind the things), then the things. */}
            {layout.holders.map((h, i) => (
              <g key={`b${h.holderId}`} transform={`translate(0 ${String(layout.pairing?.offsets[i] ?? 0)})`}>
                {drawHolder(h, "back")}
              </g>
            ))}
            {layout.pairing.lines.map((ln, k) => (
              <line key={`l${String(k)}`} data-role="pair-line" x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2} stroke={PALETTE.outline} strokeWidth={4} strokeLinecap="round" opacity={0.3} />
            ))}
            {layout.holders.map((h, i) => (
              <g key={h.holderId} data-role="stage-holder" data-holder={h.holderId} data-hidden={h.hidden ? "true" : "false"} transform={`translate(0 ${String(layout.pairing?.offsets[i] ?? 0)})`}>
                {drawHolder(h, "front")}
              </g>
            ))}
            {layout.pairing.unpaired.map((b, k) => (
              <rect key={`u${String(k)}`} data-role="unpaired" x={b.x} y={b.y} width={b.w} height={b.h} rx={12} fill="none" stroke={PALETTE.red} strokeWidth={4} strokeDasharray="10 7" />
            ))}
          </svg>
        )}
      </div>
      <p id={`${uid}-d`} data-role="stage-description" style={srOnly}>
        {desc}
      </p>
    </div>
  );
}
