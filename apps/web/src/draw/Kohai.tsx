// The junior character beside its line (assets/spec.ts CHARACTER_PARTS): a little book with a bookmark tail, never a
// face that shows feelings. Its pose says what the junior is doing (flow/pose.ts), decided from the flow state. It is
// decorative for screen readers: the line beside it carries the words, and the AI mark stays next to it (第9節).
// Its words sit in a speech bubble that comes from it. The bubble is the same plain white card for every line:
// nothing in its shape or colour shows a feeling.
import { useRef, type CSSProperties, type ReactNode } from "react";
import type { KohaiPose } from "../flow/pose.ts";
import { characterSvg } from "./parts.ts";
import { useAnimation, useReducedMotion } from "./motion.ts";
import { AiBadge } from "./AiBadge.tsx";
import { BORDER, COLOR, RADIUS, SHADOW, SPACE, TYPE } from "../ui/tokens.ts";

export const KOHAI_SIZE = 80;

export function Kohai({
  pose,
  reducedMotion,
}: {
  pose: KohaiPose;
  reducedMotion?: boolean;
}) {
  const part = characterSvg(`kohai_${pose}`);
  const reduced = useReducedMotion(reducedMotion);
  const el = useRef<HTMLSpanElement>(null);
  // A gentle fade when the pose changes; nothing under reduced motion. Never a happy or sad movement.
  useAnimation(el, "ui", [{ opacity: 0 }, { opacity: 1 }], !reduced, pose);
  return (
    <span
      ref={el}
      data-role="kohai"
      data-pose={pose}
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: KOHAI_SIZE,
        height: KOHAI_SIZE,
        flex: "none",
      }}
    >
      <svg
        viewBox={part.viewBox}
        width={KOHAI_SIZE}
        height={KOHAI_SIZE}
        style={{ display: "block" }}
        dangerouslySetInnerHTML={{ __html: part.body }}
      />
    </span>
  );
}

/**
 * The junior with its AI mark and its words in a bubble whose tail points at it. `reading` lights the bubble while
 * 「読み上げ」 reads the line (a fixed outline, no motion). The line keeps data-testid "junior-line" unless `testId`
 * says otherwise; `children` is the line (with its furigana) or several lines.
 */
export function KohaiSays({
  pose,
  reading = false,
  children,
  testId = "junior-line",
  live = true,
  style,
}: {
  pose: KohaiPose;
  reading?: boolean;
  children: ReactNode;
  testId?: string;
  live?: boolean;
  style?: CSSProperties;
}) {
  const bg = reading ? COLOR.highlight : COLOR.surface;
  return (
    <div
      data-role="junior-row"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: SPACE.md,
        margin: `${String(SPACE.md)}px 0`,
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: SPACE.xs,
          flex: "none",
        }}
      >
        <Kohai pose={pose} />
        <AiBadge />
      </div>
      <div
        data-role="bubble"
        style={{
          position: "relative",
          marginTop: SPACE.sm,
          padding: `${String(SPACE.md)}px ${String(SPACE.xl)}px`,
          background: bg,
          border: `${String(BORDER.width)}px solid ${COLOR.outline}`,
          borderRadius: RADIUS.lg,
          boxShadow: SHADOW.card,
          maxWidth: `${String(TYPE.proseChars)}em`,
          minWidth: 0,
          ...(reading
            ? { outline: `4px solid ${COLOR.ink}`, outlineOffset: 2 }
            : {}),
        }}
      >
        {/* The tail, pointing at the junior; it hides the bubble's border where they meet. */}
        <svg
          aria-hidden="true"
          width={18}
          height={24}
          viewBox="0 0 18 24"
          style={{
            position: "absolute",
            left: -15,
            top: 14,
            overflow: "visible",
          }}
        >
          <polygon points="18,0 1.5,12 18,24" fill={bg} />
          <polyline
            points="16.5,1 1.5,12 16.5,23"
            fill="none"
            stroke={COLOR.outline}
            strokeWidth={BORDER.width}
            strokeLinejoin="round"
          />
        </svg>
        <div
          data-testid={testId}
          {...(live ? { "aria-live": "polite" as const } : {})}
          data-reading={reading ? "true" : "false"}
          style={{
            margin: 0,
            fontSize: 22,
            lineHeight: TYPE.lineHeight,
            color: COLOR.ink,
            fontWeight: 500,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * The junior with its AI mark and no bubble, on a screen where it has nothing to say (the rebuilt world, the solved
 * problem, the child's own guess): it is still there beside the child, and an empty bubble would look like it
 * thinking (Q30). Its pose says what it does (flow/pose.ts), never a feeling.
 */
export function KohaiBeside({ pose, children }: { pose: KohaiPose; children?: ReactNode }) {
  return (
    <div data-role="junior-beside" style={{ display: "flex", alignItems: "center", gap: SPACE.md, margin: `${String(SPACE.md)}px 0` }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: SPACE.xs, flex: "none" }}>
        <Kohai pose={pose} />
        <AiBadge />
      </div>
      {children}
    </div>
  );
}
