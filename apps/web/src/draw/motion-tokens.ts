// The motion presets (指示書 第8.6節). No other duration or easing is written in the drawing code.
// Every motion is a Web Animations keyframe animation on transform or opacity only.

export interface MotionPreset {
  duration: number;
  easing: string;
}

const DECELERATE = "cubic-bezier(0, 0, 0.2, 1)";
const STANDARD = "cubic-bezier(0.4, 0, 0.2, 1)";
const SMOOTH = "ease-in-out";

export const MOTION = {
  enter: { duration: 300, easing: DECELERATE },
  // A small landing bounce written as linear() keyframe easing, not a spring.
  drop: { duration: 450, easing: "linear(0, 0.55 40%, 0.9 65%, 1.04 80%, 1)" },
  move: { duration: 500, easing: STANDARD },
  grow: { duration: 600, easing: DECELERATE },
  /** One round of the pulse; at least a second, so it never flashes (第8.4節). */
  pulse: { duration: 1200, easing: SMOOTH },
  impossible: { duration: 600, easing: DECELERATE },
  ui: { duration: 250, easing: DECELERATE },
} as const satisfies Record<string, MotionPreset>;

export type MotionName = keyof typeof MOTION;
