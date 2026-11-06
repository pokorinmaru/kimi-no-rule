// A calm palette: ink on paper, two neutral tape tones and one accent for the glow (指示書 第8.4節).
// Meaning never rests on colour alone: a glow also gets a thick dashed outline and a wavy underline.
export const COLORS = {
  ink: "#1f2a37",
  muted: "#4b5563",
  paper: "#ffffff",
  tape: "#cfe3f5",
  tapeUnit: "#a9cdee",
  tapeEdge: "#2b5f8a",
  card: "#fff4d6",
  cardEdge: "#8a6414",
  /** The one accent: a deep orange that reads apart from the blues for most colour visions. */
  accent: "#c2410c",
  accentSoft: "#fde7d9",
  focus: "#1d4ed8",
} as const;

export const FONT = "system-ui, 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif";
