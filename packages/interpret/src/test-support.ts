// Test-only inputs built on the signboard problem (packages/core/fixtures). Not used by the package itself.
import type { AnyOp, GateContext, Interpretation, KohaiUtterance, ProblemRecord, WorldScene } from "@kimi/core";
import { signboardCorrect, signboardProcedural } from "../../core/fixtures/problems/signboard.ts";
import { signboardRecord } from "../../core/fixtures/problems/signboard-record.ts";

export { signboardCorrect, signboardProcedural, signboardRecord };

export const record = (): ProblemRecord => structuredClone(signboardRecord);

/** A finger op the program could make from the child's hands: the ratio refers to the younger brother. */
export const fingerReference: AnyOp = {
  op: "set_relation_reference",
  target_id: "r_ratio",
  reference: "q_otouto",
  evidence: "",
};

export function interpretationOf(ops: AnyOp[], extra: Partial<Interpretation> = {}): Interpretation {
  return {
    schema_version: "6",
    utterance_lang: "ja",
    representable: "full",
    ops: ops as Interpretation["ops"],
    unclear: [],
    phrases: [],
    ...extra,
  };
}

/** The junior's world: the procedural reading, with the asked count still unknown. */
export function kohaiWorld(): WorldScene {
  const w = structuredClone(signboardProcedural);
  for (const q of w.quantities) if (q.id === w.question.target_id) q.value = null;
  return w;
}

/** A marker put on the correct world only, to see whether the correct world reaches the generator. */
export const CORRECT_MARKER = "zz_correct_world_marker";

export function gateCtx(lang: "ja" | "en" = "ja"): GateContext {
  const correct = structuredClone(signboardCorrect);
  correct.word_links.push({ phrase: CORRECT_MARKER, lang: "ja", element_id: "q_otouto" });
  return {
    correct,
    lang,
    childSaid: { numbers: [], words: [] },
    grade: 5,
    interpretationRecorded: true,
    prediction: "answered",
  };
}

/** The request as text, without the abort signal. */
export function requestText(req: object): string {
  return JSON.stringify({ ...req, signal: undefined });
}

/** Utterances of the junior that pass every gate on the signboard problem (see kohai-gates.test.ts). */
export const READ_OK: KohaiUtterance = {
  intent: "read",
  utterance: "この読み方だと、弟のテープが兄より短いです。",
  refers_to: ["q_otouto", "q_ani"],
  lang: "ja",
};
export const WHICH_OK: KohaiUtterance = {
  intent: "which",
  utterance: "この世界では弟のテープが短いです。どの文が合わないでしょう？",
  refers_to: ["q_otouto"],
  lang: "ja",
};
export const RESTATE_OK: KohaiUtterance = {
  intent: "restate",
  utterance: "弟が「1」、ですね。合っていますか？",
  refers_to: ["h_otouto"],
  lang: "ja",
};
