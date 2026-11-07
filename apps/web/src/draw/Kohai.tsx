// The junior character beside its line (assets/spec.ts CHARACTER_PARTS): a little book with a bookmark tail, never a
// face that shows feelings. Its pose says what the junior is doing (flow/pose.ts), decided from the flow state. It is
// decorative for screen readers: the line beside it carries the words, and the AI mark stays next to it (第9節).
import { useRef } from "react";
import type { KohaiPose } from "../flow/pose.ts";
import { characterSvg } from "./parts.ts";
import { useAnimation, useReducedMotion } from "./motion.ts";

export const KOHAI_SIZE = 60;

export function Kohai({ pose, reducedMotion }: { pose: KohaiPose; reducedMotion?: boolean }) {
  const part = characterSvg(`kohai_${pose}`);
  const reduced = useReducedMotion(reducedMotion);
  const el = useRef<HTMLSpanElement>(null);
  // A gentle fade when the pose changes; nothing under reduced motion. Never a happy or sad movement.
  useAnimation(el, "ui", [{ opacity: 0 }, { opacity: 1 }], !reduced, pose);
  return (
    <span ref={el} data-role="kohai" data-pose={pose} aria-hidden="true" style={{ display: "inline-block", width: KOHAI_SIZE, height: KOHAI_SIZE, flex: "none" }}>
      <svg viewBox={part.viewBox} width={KOHAI_SIZE} height={KOHAI_SIZE} style={{ display: "block" }} dangerouslySetInnerHTML={{ __html: part.body }} />
    </span>
  );
}
