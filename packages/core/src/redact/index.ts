// M1 step (8): remove the child's words before anything is stored (指示書 第9節). The structure stays:
// kinds of ops, ids and numbers. Pure functions only.
import type { Explanation } from "../schema/explanation.ts";
import type { Interpretation } from "../schema/interpretation.ts";

/** Ops that carry a name the child made up; the name is the child's words too (Q23). */
const NAMING = new Set(["add_holder", "add_item_kind", "rename_item_kind"]);

export function redactInterpretation(x: Interpretation): Interpretation {
  const copy = structuredClone(x);
  return {
    ...copy,
    ops: copy.ops.map((o) => (NAMING.has(o.op) ? { ...o, evidence: "", label: "" } : { ...o, evidence: "" })) as Interpretation["ops"],
    phrases: copy.phrases.map((p) => ({ ...p, phrase: "" })),
  };
}

export function redactExplanation(x: Explanation): Explanation {
  return { ...structuredClone(x), evidence: "" };
}

/** Whether any of the child's words are still in the record. */
export function hasChildText(x: Interpretation | Explanation): boolean {
  if ("ops" in x) {
    return (
      x.ops.some((o) => o.evidence !== "" || (NAMING.has(o.op) && "label" in o && o.label !== "")) ||
      x.phrases.some((p) => p.phrase !== "")
    );
  }
  return x.evidence !== "";
}
