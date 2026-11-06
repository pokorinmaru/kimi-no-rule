// Web Animations helpers (指示書 第8.6節). With reduced motion nothing moves: the final state is drawn
// at once and the meaning stays (a glow stays as a still outline).
import { useEffect, useState, type RefObject } from "react";
import { MOTION, type MotionName } from "./motion-tokens.ts";

const QUERY = "(prefers-reduced-motion: reduce)";

/** The system setting, followed live. Without matchMedia (tests, old browsers) it is off. */
export function usePrefersReducedMotion(): boolean {
  const read = (): boolean => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
  const [reduced, setReduced] = useState(read);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(QUERY);
    const on = (): void => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** An explicit prop wins over the system setting. */
export function useReducedMotion(explicit: boolean | undefined): boolean {
  const system = usePrefersReducedMotion();
  return explicit ?? system;
}

/**
 * Runs one preset on the element while `enabled`; cancels it on change or unmount.
 * `key` restarts the animation when it changes (a tape grown to a new length).
 */
export function useAnimation(
  ref: RefObject<Element | null>,
  name: MotionName,
  keyframes: Keyframe[],
  enabled: boolean,
  key: string,
  repeat = false,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!enabled || el === null || typeof el.animate !== "function") return;
    const preset = MOTION[name];
    const a = el.animate(keyframes, {
      duration: preset.duration,
      easing: preset.easing,
      iterations: repeat ? Infinity : 1,
      fill: repeat ? "none" : "backwards",
    });
    return () => a.cancel();
    // The keyframes are literals at each call site; `key` says when they change.
  }, [enabled, key, name, repeat]);
}
