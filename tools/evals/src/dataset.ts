// M2: rows of the eval data (指示書 第10.1節), one JSON object per line. Every row says where it came
// from (source), so rows written by a third party can be told from drafts.
import { z } from "zod";
import { schemas, type AnyOp } from "@kimi/core";

/** Languages a row is said in: ja or en, another language a child in Japan may speak, or ja mixed with one. */
const OTHER_LANGS: readonly string[] = ["pt", "tl", "zh", "vi", "es", "ko", "ne"];
const known = (x: string): boolean => x === "ja" || x === "en" || OTHER_LANGS.includes(x);
const lang = z.string().refine((s) => {
  const m = /^ja\+([a-z]{2})$/.exec(s);
  return m === null ? known(s) : m[1] !== "ja" && known(m[1] as string);
}, "unknown language");

const op = schemas.interpretation.shape.ops.element;

export const interpretRow = z.strictObject({
  id: z.string().min(1),
  problem_id: z.string().min(1),
  split: z.enum(["tune", "test"]),
  kind: z.enum(["plain", "direction_swap", "times_means_multiply", "reference_swap", "consistent_rule", "hesitation", "l1_mix"]),
  lang,
  transcript: z.string(),
  expected_ops: z.array(op).transform((x) => x as AnyOp[]),
  source: z.enum(["author", "third_party", "ai_draft"]),
  note: z.string().optional(),
});
export type InterpretRow = z.infer<typeof interpretRow>;

export const safetyRow = z.strictObject({
  id: z.string().min(1),
  split: z.enum(["tune", "test"]),
  lang,
  transcript: z.string(),
  expected: z.enum(["none", "distress", "inappropriate"]),
  style: z.enum(["direct", "indirect", "l1", "plain"]),
  source: z.enum(["author", "third_party", "ai_draft"]),
  note: z.string().optional(),
});
export type SafetyRow = z.infer<typeof safetyRow>;

/** One row per line; blank lines are skipped; an error names its line (blank lines counted). */
export function loadJsonl<T extends { id: string }>(text: string, schema: z.ZodType<T, unknown>): T[] {
  const rows: T[] = [];
  const seen = new Map<string, number>();
  text.split(/\r?\n/).forEach((line, i) => {
    const at = i + 1;
    if (line.trim() === "") return;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`line ${at}: not JSON`);
    }
    const r = schema.safeParse(value);
    if (!r.success) throw new Error(`line ${at}: ${r.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`);
    const first = seen.get(r.data.id);
    if (first !== undefined) throw new Error(`line ${at}: duplicate id ${r.data.id} (first on line ${first})`);
    seen.set(r.data.id, at);
    rows.push(r.data);
  });
  return rows;
}
