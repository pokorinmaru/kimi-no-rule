// The two holders' colours, shared by the stage picture and the problem's sentences so a holder's name in the
// words and its things in the picture are linked (指示書 第8.4節: colour is never the only link; the name tag
// under each container and the underline in the sentences carry it too).
import { PALETTE } from "./assets/spec.ts";

export interface HolderColor {
  /** For shapes (a tag's band). */
  fill: string;
  /** For text: dark enough to read on white (contrast above 4.5). */
  ink: string;
  /** The holder's tape: a soft tint, a deeper one for the unit tape, and its edge (the tapes match the picture's frames). */
  tape: string;
  tapeUnit: string;
  tapeEdge: string;
}

export const HOLDER_COLORS: readonly HolderColor[] = [
  { fill: PALETTE.blue, ink: "#1f5fae", tape: "#cfe3f5", tapeUnit: "#a9cdee", tapeEdge: "#2b5f8a" },
  { fill: PALETTE.orange, ink: "#a14a05", tape: "#ffe6cc", tapeUnit: PALETTE.orangeLight, tapeEdge: "#a14a05" },
];

/** A colour per holder, in the world's order of holders; a third holder and more get none. */
export function holderColors(holders: readonly { id: string; label: string }[]): { id: string; label: string; color: HolderColor }[] {
  return holders.flatMap((h, i) => {
    const color = HOLDER_COLORS[i];
    return color === undefined ? [] : [{ id: h.id, label: h.label, color }];
  });
}
