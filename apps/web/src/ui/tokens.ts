// The look of the child's screens in one place (whole-screen review, 2026-11-08). The colours come from the picture
// parts' palette (draw/assets/spec.ts PALETTE: a bold dark outline, soft fills), so the buttons and cards look like
// the pictures. Calm: one warm light page, white cards, no decorative pictures behind anything.
import type { CSSProperties } from "react";
import { PALETTE } from "../draw/assets/spec.ts";
import { HOLDER_COLORS } from "../draw/holder-colors.ts";

export const COLOR = {
  /** The page: a warm off-white (never dark, whatever the device's mode). */
  page: "#fdf8ef",
  /** Cards and buttons. */
  surface: PALETTE.white,
  /** A soft panel inside a card (the rule card, the grown-up's details). */
  surfaceSoft: "#f5efe3",
  /** The band of the three buttons at the bottom. */
  bar: "#f7f0e2",
  /** Text. */
  ink: "#2a2540",
  /** Quieter text (notes, hours): still AA on every surface. */
  inkSoft: "#5b5470",
  /** The pictures' outline, for borders. */
  outline: PALETTE.outline,
  /** A thin line between parts of a card. */
  line: "#e3dccd",
  /** The one main action of a screen: a deep blue from the parts' blue, with white text. */
  primary: "#2f63c4",
  primarySoft: PALETTE.blueLight,
  onPrimary: PALETTE.white,
  /** A pressed toggle. */
  pressed: "#e3eefc",
  /** The line being read aloud, and the lit words. */
  highlight: "#ffe9a8",
  /** The three buttons when the flow asks the child to look at them. */
  attention: PALETTE.yellow,
  /** The keyboard focus ring. */
  focus: "#1d4ed8",
  /** The two holders, as in the stage picture and the sentences. */
  holders: HOLDER_COLORS,
} as const;

export const RADIUS = { sm: 10, md: 16, lg: 24, pill: 999 } as const;

export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const TYPE = {
  small: 17,
  body: 20,
  large: 24,
  title: 28,
  lineHeight: 1.7,
  /** Prose lines at most this many Japanese characters (one character is about 1em). */
  proseChars: 32,
  font: "'BIZ UDPGothic', 'Hiragino Maru Gothic ProN', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', system-ui, sans-serif",
} as const;

/** The outline the parts use, for a card or a button: thick, dark, rounded. */
export const BORDER = { width: 3, thin: 2 } as const;

/** A "sticker" shadow: a short solid drop in the outline colour, as the parts sit on the page. */
export const SHADOW = {
  button: `0 4px 0 ${COLOR.outline}`,
  buttonPressed: `0 1px 0 ${COLOR.outline}`,
  card: `0 3px 0 ${COLOR.line}`,
  bar: `0 -3px 0 ${COLOR.line}`,
} as const;

/** The height the bottom band takes (its buttons and padding), so the page leaves room under the last content. */
export const BAR_SPACE = 104;

/** A block of prose: body size, line length kept short. */
export const prose: CSSProperties = {
  maxWidth: `${String(TYPE.proseChars)}em`,
  fontSize: TYPE.body,
  lineHeight: TYPE.lineHeight,
};

/** A white card with the parts' outline. */
export const card: CSSProperties = {
  background: COLOR.surface,
  border: `${String(BORDER.thin)}px solid ${COLOR.line}`,
  borderRadius: RADIUS.lg,
  boxShadow: SHADOW.card,
  padding: `${String(SPACE.lg)}px ${String(SPACE.xl)}px`,
};

/** The pseudo-classes inline styles cannot say: focus rings, the pressed look of buttons. */
export const GLOBAL_CSS = `
html, body { background: ${COLOR.page}; color: ${COLOR.ink}; }
body { margin: 0; font-family: ${TYPE.font}; }
button, a, [tabindex] { -webkit-tap-highlight-color: transparent; }
:focus-visible { outline: 4px solid ${COLOR.focus}; outline-offset: 3px; }
.k-btn { transition: transform 80ms ease, box-shadow 80ms ease; }
.k-btn:active { transform: translateY(3px); box-shadow: ${SHADOW.buttonPressed}; }
@media (prefers-reduced-motion: reduce) { .k-btn { transition: none; } }
rt { font-size: 0.5em; color: ${COLOR.inkSoft}; }
:lang(ja) :is(p, li, h1, h2, h3, figcaption, summary) { word-break: auto-phrase; }

`;
