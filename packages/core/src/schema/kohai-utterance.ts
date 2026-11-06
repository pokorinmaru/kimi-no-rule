// Kohai utterance, version 1 (指示書 第5.1節; original: kohai-utterance.schema.json).
// Only the generated intents are allowed here; the fixed-text intents never come from the model.
import { z } from "zod";
import { LANG } from "./common.ts";

export const kohaiUtterance = z.strictObject({
  intent: z.enum(["read", "which", "restate"]),
  utterance: z.string().min(1).max(40),
  refers_to: z.array(z.string().regex(/^(h_|k_|q_|r_|e_|s_)[A-Za-z0-9_]+$/)).max(4),
  lang: z.enum(LANG),
});

export type KohaiUtterance = z.infer<typeof kohaiUtterance>;
