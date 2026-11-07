// An everyday scene on the rule card (指示書 第6.7節 手順5, 第8.5節): its sentences, its tapes as the world of the
// rule on the card, and the common-sense sentence, lit where it does not hold in that world. Every length and
// part comes from core (viewScene through the view); this component only draws. No number is drawn on a tape:
// the numbers stay in the scene's sentences, and the lit sentence is the only feedback (no judging word).
import type { Lang } from "@kimi/core";
import type { SceneItemView } from "../flow/view.ts";
import { COLORS, FONT } from "./theme.ts";

const WIDTH = 640;
const LABEL_W = 200;
const BAR_W = WIDTH - LABEL_W - 24;
const ROW = 46;
const BAR_H = 26;
const TOP = 28;

export function SceneView({ item, drawing, lang }: { item: SceneItemView; drawing: string; lang: Lang }) {
  const height = TOP + item.tapes.length * ROW + 8;
  const limitX = item.limit === null ? null : LABEL_W + BAR_W * item.limit.at;
  return (
    <div data-testid="scene" data-scene-key={item.key} lang={lang}>
      {item.lines.map((l) => (
        <p key={l} style={{ margin: "0 0 4px" }} lang={lang}>
          {l}
        </p>
      ))}
      <svg
        role="img"
        aria-label={drawing}
        viewBox={`0 0 ${String(WIDTH)} ${String(height)}`}
        style={{ width: "100%", maxWidth: WIDTH, height: "auto", display: "block", margin: "6px 0" }}
      >
        {item.tapes.map((t, i) => {
          const y = TOP + i * ROW;
          const w = Math.max(2, BAR_W * t.length);
          const parts = t.segments ?? 0;
          return (
            <g key={t.quantityId} data-role="scene-tape" data-holder={t.holderId} data-segments={t.segments === null ? "" : String(t.segments)} data-length={t.length.toFixed(4)}>
              <text x={8} y={y + BAR_H / 2} dominantBaseline="central" fill={COLORS.ink} style={{ font: `700 17px ${FONT}` }}>
                {t.label}
              </text>
              <rect x={LABEL_W} y={y} width={w} height={BAR_H} rx={4} fill={COLORS.tape} stroke={COLORS.tapeEdge} strokeWidth={2} />
              {parts > 1 &&
                Array.from({ length: parts - 1 }, (_, k) => {
                  const x = LABEL_W + (w * (k + 1)) / parts;
                  return <line key={k} data-role="scene-segment" x1={x} x2={x} y1={y + 2} y2={y + BAR_H - 2} stroke={COLORS.tapeEdge} strokeWidth={1.5} />;
                })}
            </g>
          );
        })}
        {limitX !== null && item.limit !== null && (
          <g data-role="scene-limit">
            <line x1={limitX} x2={limitX} y1={TOP - 6} y2={height - 4} stroke={COLORS.cardEdge} strokeWidth={3} strokeDasharray="6 4" />
            <text x={Math.min(limitX, WIDTH - 8)} y={14} textAnchor="end" fill={COLORS.ink} style={{ font: `400 15px ${FONT}` }}>
              {item.limit.label}
            </text>
          </g>
        )}
      </svg>
      <p
        data-role="common-sense"
        data-glow={item.lit ? "true" : "false"}
        lang={lang}
        style={{
          margin: "4px 0 0",
          padding: "4px 10px",
          borderRadius: 8,
          // Meaning never rests on colour alone: the lit sentence also gets a thick dashed outline and a wavy underline.
          border: item.lit ? `3px dashed ${COLORS.accent}` : "3px solid transparent",
          background: item.lit ? COLORS.accentSoft : "transparent",
          textDecoration: item.lit ? `underline wavy ${COLORS.accent}` : "none",
          color: COLORS.ink,
        }}
      >
        {item.commonSense}
      </p>
    </div>
  );
}
