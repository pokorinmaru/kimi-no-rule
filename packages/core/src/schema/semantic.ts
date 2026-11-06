// Meaning checks that the shape schemas cannot express (指示書 第5.1節, the second layer).
// Pure functions: they never change their input and return every problem they find.
import { PREFIX, type ElementKind, type Rational } from "./common.ts";
import type { Op } from "./interpretation.ts";
import type { WorldScene } from "./world-scene.ts";

export type SemanticCode =
  | "duplicate_id"
  | "bad_prefix"
  | "missing_ref"
  | "bad_denominator"
  | "missing_field"
  | "self_relation";

export interface SemanticError {
  code: SemanticCode;
  /** Where the problem is, e.g. `relations[0].subject` or `ops[2].new_id`. */
  path: string;
  message: string;
}

export type SemanticResult = { ok: true } | { ok: false; errors: SemanticError[] };

/** An op as the base schema or the per-problem schema gives it (new_id may be null in the latter). */
export type AnyOp = Op extends infer T
  ? T extends { new_id: string }
    ? Omit<T, "new_id"> & { new_id: string | null }
    : T
  : never;

const ALL_KINDS: readonly ElementKind[] = ["holder", "item_kind", "quantity", "relation", "event"];
const QUESTION_KIND = { quantity: "quantity", relation_amount: "relation", event_amount: "event" } as const;
const TEMP_ID = /^n_[1-5]$/;
const TEMP_LIKE = /^n_/;

function result(errors: SemanticError[]): SemanticResult {
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function hasPrefix(id: string, kind: ElementKind): boolean {
  const p = PREFIX[kind];
  return id.startsWith(p) && id.length > p.length;
}

function checkDen(errors: SemanticError[], path: string, r: Rational | null): void {
  if (r === null) return;
  if (!Number.isInteger(r.den) || r.den <= 0) {
    errors.push({ code: "bad_denominator", path: `${path}.den`, message: `denominator ${r.den} is not a positive integer` });
  }
}

/** Every element of the world with its kind and where it sits. */
function elementsOf(w: WorldScene): { kind: ElementKind; id: string; path: string }[] {
  const lists: [ElementKind, string, readonly { id: string }[]][] = [
    ["holder", "holders", w.holders],
    ["item_kind", "item_kinds", w.item_kinds],
    ["quantity", "quantities", w.quantities],
    ["relation", "relations", w.relations],
    ["event", "events", w.events],
  ];
  return lists.flatMap(([kind, name, list]) => list.map((el, i) => ({ kind, id: el.id, path: `${name}[${i}].id` })));
}

/** Map id -> kind (first occurrence wins; later ones are duplicates). */
function kindIndex(w: WorldScene): Map<string, ElementKind> {
  const index = new Map<string, ElementKind>();
  for (const el of elementsOf(w)) if (!index.has(el.id)) index.set(el.id, el.kind);
  return index;
}

function describeKinds(kinds: readonly ElementKind[]): string {
  return kinds.length === ALL_KINDS.length ? "any element" : kinds.join(" or ");
}

/** Check that `id` names an element of one of `kinds`, given a lookup of known ids. */
function checkRef(
  errors: SemanticError[],
  path: string,
  id: string,
  kinds: readonly ElementKind[],
  lookup: (id: string) => ElementKind | undefined,
): void {
  const kind = lookup(id);
  if (kind === undefined) {
    errors.push({ code: "missing_ref", path, message: `${id} does not exist` });
  } else if (!kinds.includes(kind)) {
    errors.push({ code: "bad_prefix", path, message: `${id} is a ${kind}, expected ${describeKinds(kinds)}` });
  }
}

export function validateWorld(w: WorldScene): SemanticResult {
  const errors: SemanticError[] = [];

  const seen = new Set<string>();
  for (const el of elementsOf(w)) {
    if (seen.has(el.id)) errors.push({ code: "duplicate_id", path: el.path, message: `${el.id} is used twice` });
    seen.add(el.id);
    if (!hasPrefix(el.id, el.kind)) {
      errors.push({ code: "bad_prefix", path: el.path, message: `${el.id} should start with ${PREFIX[el.kind]}` });
    }
  }

  const index = kindIndex(w);
  const lookup = (id: string): ElementKind | undefined => index.get(id);
  const ref = (path: string, id: string, kinds: readonly ElementKind[]): void =>
    checkRef(errors, path, id, kinds, lookup);

  w.quantities.forEach((q, i) => {
    const p = `quantities[${i}]`;
    ref(`${p}.holder`, q.holder, ["holder"]);
    ref(`${p}.item_kind`, q.item_kind, ["item_kind"]);
    if (q.at_event !== null) ref(`${p}.at_event`, q.at_event, ["event"]);
    checkDen(errors, `${p}.value`, q.value);
  });

  w.relations.forEach((r, i) => {
    const p = `relations[${i}]`;
    ref(`${p}.subject`, r.subject, ["quantity"]);
    if (r.reference !== null) ref(`${p}.reference`, r.reference, ["quantity"]);
    r.reference_list?.forEach((id, j) => ref(`${p}.reference_list[${j}]`, id, ["quantity"]));
    checkDen(errors, `${p}.amount`, r.amount);
    if (r.reference === r.subject || (r.reference_list ?? []).includes(r.subject)) {
      errors.push({ code: "self_relation", path: `${p}.subject`, message: `${r.subject} is related to itself` });
    }
  });

  w.events.forEach((e, i) => {
    const p = `events[${i}]`;
    ref(`${p}.holder`, e.holder, ["holder"]);
    ref(`${p}.item_kind`, e.item_kind, ["item_kind"]);
    if (e.to_holder !== null) ref(`${p}.to_holder`, e.to_holder, ["holder"]);
    checkDen(errors, `${p}.amount`, e.amount);
  });

  ref("question.target_id", w.question.target_id, [QUESTION_KIND[w.question.target_type]]);
  w.word_links.forEach((l, i) => ref(`word_links[${i}].element_id`, l.element_id, ALL_KINDS));

  return result(errors);
}

/**
 * Check a list of ops against the world it edits. Temporary ids (n_1..n_5) introduced by an add_* op
 * can be used by later ops of the same list, never by earlier ones.
 */
export function validateOps(w: WorldScene, ops: readonly AnyOp[]): SemanticResult {
  const errors: SemanticError[] = [];
  const index = kindIndex(w);
  const temp = new Map<string, ElementKind>();
  let questionKind: ElementKind = QUESTION_KIND[w.question.target_type];

  const lookup = (id: string): ElementKind | undefined => {
    if (temp.has(id)) return temp.get(id);
    if (TEMP_LIKE.test(id)) return undefined; // a temporary id not introduced (yet)
    return index.get(id);
  };

  ops.forEach((op, i) => {
    const p = `ops[${i}]`;
    const ref = (field: string, id: string, kinds: readonly ElementKind[]): void =>
      checkRef(errors, `${p}.${field}`, id, kinds, lookup);
    const den = (field: string, r: Rational | null): void => checkDen(errors, `${p}.${field}`, r);
    const need = (field: string, present: boolean, why: string): void => {
      if (!present) errors.push({ code: "missing_field", path: `${p}.${field}`, message: why });
    };
    let introduces: ElementKind | undefined;

    switch (op.op) {
      case "set_quantity":
        ref("target_id", op.target_id, ["quantity"]);
        den("number", op.number);
        break;
      case "set_relation_amount":
      case "set_unit_value":
        ref("target_id", op.target_id, ["relation"]);
        den("number", op.number);
        break;
      case "set_event_amount":
        ref("target_id", op.target_id, ["event"]);
        den("number", op.number);
        break;
      case "set_relation_operator":
      case "swap_relation_direction":
        ref("target_id", op.target_id, ["relation"]);
        break;
      case "set_relation_reference":
        ref("target_id", op.target_id, ["relation"]);
        ref("reference", op.reference, ["quantity"]);
        break;
      case "add_relation": {
        introduces = "relation";
        ref("subject", op.subject, ["quantity"]);
        if (op.reference !== null) ref("reference", op.reference, ["quantity"]);
        op.reference_list?.forEach((id, j) => ref(`reference_list[${j}]`, id, ["quantity"]));
        if (op.operator === "total_of") {
          need("reference_list", op.reference_list !== null, "total_of needs a reference_list");
        } else {
          need("reference", op.reference !== null, `${op.operator} needs a reference`);
        }
        den("number", op.number);
        if (op.reference === op.subject || (op.reference_list ?? []).includes(op.subject)) {
          errors.push({ code: "self_relation", path: `${p}.subject`, message: `${op.subject} is related to itself` });
        }
        break;
      }
      case "add_event":
        introduces = "event";
        ref("holder", op.holder, ["holder"]);
        ref("item_kind", op.item_kind, ["item_kind"]);
        if (op.to_holder !== null) ref("to_holder", op.to_holder, ["holder"]);
        den("number", op.number);
        if (op.event_type === "move") {
          need("to_holder", op.to_holder !== null, "a move needs a to_holder");
        } else if (op.to_holder !== null) {
          // The field table allows to_holder only on a move.
          errors.push({ code: "missing_field", path: `${p}.to_holder`, message: `${op.event_type} takes no to_holder` });
        }
        break;
      case "set_event_type":
        ref("target_id", op.target_id, ["event"]);
        break;
      case "set_event_to_holder":
        ref("target_id", op.target_id, ["event"]);
        ref("to_holder", op.to_holder, ["holder"]);
        break;
      case "set_question_target":
        ref("target_id", op.target_id, [QUESTION_KIND[op.question_type]]);
        questionKind = QUESTION_KIND[op.question_type];
        break;
      case "rename_item_kind":
        ref("target_id", op.target_id, ["item_kind"]);
        break;
      case "add_holder":
        introduces = "holder";
        break;
      case "add_item_kind":
        introduces = "item_kind";
        break;
      case "add_quantity":
        introduces = "quantity";
        ref("holder", op.holder, ["holder"]);
        ref("item_kind", op.item_kind, ["item_kind"]);
        if (op.at_event !== null) ref("at_event", op.at_event, ["event"]);
        den("number", op.number);
        break;
      case "remove_element":
        ref("target_id", op.target_id, ALL_KINDS);
        break;
      case "state_answer":
        ref("target_id", op.target_id, [questionKind]);
        den("number", op.number);
        break;
      case "state_procedure":
        ref("target_id", op.target_id, ["quantity", "relation", "event"]);
        op.operands.forEach((o, j) => {
          if ("quantity_id" in o) ref(`operands[${j}].quantity_id`, o.quantity_id, ["quantity"]);
          else den(`operands[${j}]`, o);
        });
        break;
      case "word_cue":
        // Bounds of statement_index and tokens are enforced by the per-problem schema.
        break;
    }

    if (introduces !== undefined && "new_id" in op && op.new_id !== null) {
      const id = op.new_id;
      if (!TEMP_ID.test(id)) {
        errors.push({ code: "bad_prefix", path: `${p}.new_id`, message: `${id} is not one of n_1..n_5` });
      } else if (temp.has(id) || index.has(id)) {
        errors.push({ code: "duplicate_id", path: `${p}.new_id`, message: `${id} is introduced twice` });
      } else {
        temp.set(id, introduces);
      }
    }
  });

  return result(errors);
}
