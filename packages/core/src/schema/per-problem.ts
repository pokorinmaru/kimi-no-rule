// Per-problem schemas (指示書 第5.1節): the interpretation and explanation shapes with every id field
// narrowed to this problem's ids plus the temporary ids, so the model cannot point at what is not there.
import { z } from "zod";
import { TEMP_IDS, idEnum } from "./common.ts";
import { buildExplanation } from "./explanation.ts";
import { buildInterpretation, type WordCueOp } from "./interpretation.ts";
import type { Statement } from "./problem-record.ts";
import type { WorldScene } from "./world-scene.ts";

export function worldIds(w: WorldScene): string[] {
  return [
    ...w.holders.map((x) => x.id),
    ...w.item_kinds.map((x) => x.id),
    ...w.quantities.map((x) => x.id),
    ...w.relations.map((x) => x.id),
    ...w.events.map((x) => x.id),
  ];
}

/** One word_cue variant per statement: the index is fixed and tokens stay inside that statement. */
function wordCueFor(s: Statement): z.ZodType<WordCueOp> {
  return z.strictObject({
    op: z.literal("word_cue"),
    statement_index: z.literal(s.index),
    tokens: z.array(z.int().min(0).max(s.tokens.length - 1)),
    evidence: z.string(),
  });
}

export function problemScopedSchemas(w: WorldScene, statements: readonly Statement[]) {
  const id = idEnum([...worldIds(w), ...TEMP_IDS]);
  return {
    interpretation: buildInterpretation({
      id,
      atEvent: idEnum([...w.events.map((e) => e.id), ...TEMP_IDS]).nullable(),
      // 指示書 第5.1節 allows null here as well; the base schema does not.
      newId: idEnum(TEMP_IDS).nullable(),
      wordCue: statements.map(wordCueFor),
    }),
    explanation: buildExplanation(id),
  };
}

export type ProblemScopedSchemas = ReturnType<typeof problemScopedSchemas>;
