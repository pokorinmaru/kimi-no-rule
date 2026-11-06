// M1 step (3): solve a world-scene exactly (指示書 第5.2節; order of minimal conflict sets from 第5.3節).
// Pure functions only: the input world is never changed.
import type { WorldScene } from "../schema/world-scene.ts";
import { add, cmp, fromSchema, inv, isInteger, isZero, mul, neg, rat, sub, type Rational } from "../rational/index.ts";

export type ImpossibleReason = "negative" | "non_integer";

export interface ImpossibleMark {
  id: string;
  reason: ImpossibleReason;
}

export type SolveResult =
  | {
      kind: "unique";
      /** Every quantity, every relation amount and every event amount, keyed by element id. */
      values: Map<string, Rational>;
      /** Values that cannot happen in a real world, sorted by id then reason. */
      impossible: ImpossibleMark[];
    }
  | {
      kind: "underdetermined";
      /** Element ids (quantities, relation amounts, event amounts) whose value is not fixed, ascending. */
      undetermined: string[];
      /** The element values that are fixed. */
      values: Map<string, Rational>;
    }
  | {
      kind: "contradiction";
      /** Every minimal conflicting set of constraint ids; ids ascending, sets by size then id list. */
      minimalSets: string[][];
    }
  | {
      kind: "nonlinear";
      /** Relations left as a product of two unknowns, ascending. */
      relations: string[];
    };

/** Above this many constraints the subset search for minimal conflicts is refused. */
export const MAX_CONFLICT_SOURCES = 20;

// ---------------------------------------------------------------------------------------------
// Equations
// ---------------------------------------------------------------------------------------------

/** Σ coef·var = rhs. */
interface Linear {
  coefs: Map<string, Rational>;
  rhs: Rational;
}

type Equation =
  | { source: string | null; kind: "linear"; eq: Linear }
  /** s = a·r with both a and r unknown. */
  | { source: string; kind: "product"; s: string; a: string; r: string };

interface System {
  equations: Equation[];
  /** Variables, ascending. */
  vars: string[];
  /** Constraint ids that own at least one equation, ascending. */
  sources: string[];
  /** Element ids reported to the caller, ascending. */
  elements: string[];
}

const byCodeUnit = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);

function linear(terms: [string, Rational][], rhs: Rational): Linear {
  const coefs = new Map<string, Rational>();
  for (const [v, c] of terms) {
    const next = add(coefs.get(v) ?? rat(0), c);
    if (isZero(next)) coefs.delete(v);
    else coefs.set(v, next);
  }
  return { coefs, rhs };
}

const ONE = rat(1);
const MINUS_ONE = rat(-1);
const ZERO = rat(0);

/** Series point variables cannot clash with element ids, which never contain a space. */
const pointVar = (holder: string, kind: string, index: number): string => `@ ${holder} ${kind} ${String(index)}`;

function buildSystem(world: WorldScene): System {
  const equations: Equation[] = [];
  const elements = new Set<string>();

  // Time series: one per holder and item kind, events applied in (order, id).
  const events = [...world.events].sort((x, y) => x.order - y.order || byCodeUnit(x.id, y.id));
  const rank = new Map(events.map((e, i) => [e.id, i]));
  const seriesEvents = new Map<string, { holder: string; kind: string; steps: { event: string; sign: Rational }[] }>();
  const series = (holder: string, kind: string) => {
    const key = `${holder} ${kind}`;
    let s = seriesEvents.get(key);
    if (s === undefined) {
      s = { holder, kind, steps: [] };
      seriesEvents.set(key, s);
    }
    return s;
  };
  for (const e of events) {
    elements.add(e.id);
    if (e.amount !== null) {
      equations.push({ source: e.id, kind: "linear", eq: linear([[e.id, ONE]], fromSchema(e.amount)) });
    }
    if (e.type === "gain") series(e.holder, e.item_kind).steps.push({ event: e.id, sign: ONE });
    else {
      series(e.holder, e.item_kind).steps.push({ event: e.id, sign: MINUS_ONE });
      if (e.type === "move") {
        if (e.to_holder === null) throw new Error(`move event ${e.id} has no to_holder`);
        series(e.to_holder, e.item_kind).steps.push({ event: e.id, sign: ONE });
      }
    }
  }
  for (const s of seriesEvents.values()) {
    s.steps.forEach((step, i) => {
      // point(i+1) - point(i) - sign·amount = 0
      equations.push({
        source: null,
        kind: "linear",
        eq: linear(
          [
            [pointVar(s.holder, s.kind, i + 1), ONE],
            [pointVar(s.holder, s.kind, i), MINUS_ONE],
            [step.event, neg(step.sign)],
          ],
          ZERO,
        ),
      });
    });
  }

  for (const q of world.quantities) {
    elements.add(q.id);
    let index = 0;
    if (q.at_event !== null) {
      const r = rank.get(q.at_event);
      if (r === undefined) throw new Error(`quantity ${q.id} is at an unknown event ${q.at_event}`);
      const s = seriesEvents.get(`${q.holder} ${q.item_kind}`);
      index = s === undefined ? 0 : s.steps.filter((step) => (rank.get(step.event) ?? Infinity) <= r).length;
    }
    equations.push({
      source: null,
      kind: "linear",
      eq: linear([[q.id, ONE], [pointVar(q.holder, q.item_kind, index), MINUS_ONE]], ZERO),
    });
    if (q.value !== null) {
      equations.push({ source: q.id, kind: "linear", eq: linear([[q.id, ONE]], fromSchema(q.value)) });
    }
  }

  for (const r of world.relations) {
    if (r.operator === "other") continue;
    const s = r.subject;
    if (r.operator === "total_of") {
      if (r.reference_list === null) throw new Error(`total_of relation ${r.id} has no reference_list`);
      const terms: [string, Rational][] = [[s, ONE], ...r.reference_list.map((x): [string, Rational] => [x, MINUS_ONE])];
      equations.push({ source: r.id, kind: "linear", eq: linear(terms, ZERO) });
      continue;
    }
    const ref = r.reference;
    if (ref === null) throw new Error(`relation ${r.id} has no reference`);
    if (r.operator === "same_as") {
      equations.push({ source: r.id, kind: "linear", eq: linear([[s, ONE], [ref, MINUS_ONE]], ZERO) });
      continue;
    }
    elements.add(r.id);
    const amount = r.amount === null ? null : fromSchema(r.amount);
    if (amount !== null) {
      // The amount is also reported as a value, through its own variable.
      equations.push({ source: null, kind: "linear", eq: linear([[r.id, ONE]], amount) });
    }
    switch (r.operator) {
      case "more_by":
      case "less_by": {
        const sign = r.operator === "more_by" ? MINUS_ONE : ONE;
        equations.push({ source: r.id, kind: "linear", eq: linear([[s, ONE], [ref, MINUS_ONE], [r.id, sign]], ZERO) });
        break;
      }
      case "times":
      case "fraction_of":
      case "per":
        if (amount !== null) {
          equations.push({ source: r.id, kind: "linear", eq: linear([[s, ONE], [ref, neg(amount)]], ZERO) });
        } else {
          equations.push({ source: r.id, kind: "product", s, a: r.id, r: ref });
        }
        break;
    }
  }

  const vars = new Set<string>();
  const sources = new Set<string>();
  for (const e of equations) {
    if (e.source !== null) sources.add(e.source);
    if (e.kind === "linear") for (const v of e.eq.coefs.keys()) vars.add(v);
    else for (const v of [e.s, e.a, e.r]) vars.add(v);
  }
  for (const id of elements) vars.add(id);
  return {
    equations,
    vars: [...vars].sort(byCodeUnit),
    sources: [...sources].sort(byCodeUnit),
    elements: [...elements].sort(byCodeUnit),
  };
}

// ---------------------------------------------------------------------------------------------
// Gauss-Jordan elimination over the rationals
// ---------------------------------------------------------------------------------------------

type Elimination = { consistent: false } | { consistent: true; determined: Map<string, Rational> };

function eliminate(eqs: readonly Linear[], vars: readonly string[], column: ReadonlyMap<string, number>): Elimination {
  const n = vars.length;
  const rows: Rational[][] = eqs.map((e) => {
    const row: Rational[] = Array.from({ length: n + 1 }, () => ZERO);
    for (const [v, c] of e.coefs) row[column.get(v) ?? -1] = c;
    row[n] = e.rhs;
    return row;
  });
  const cell = (row: Rational[], c: number): Rational => row[c] ?? ZERO;
  const pivots: number[] = [];
  let top = 0;
  for (let c = 0; c < n && top < rows.length; c++) {
    let p = -1;
    for (let i = top; i < rows.length; i++) {
      const row = rows[i];
      if (row !== undefined && !isZero(cell(row, c))) {
        p = i;
        break;
      }
    }
    if (p < 0) continue;
    const pivotRow = rows[p] as Rational[];
    rows[p] = rows[top] as Rational[];
    const scale = inv(cell(pivotRow, c));
    const normalized = pivotRow.map((x) => mul(x, scale));
    rows[top] = normalized;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (i === top || row === undefined) continue;
      const f = cell(row, c);
      if (isZero(f)) continue;
      rows[i] = row.map((x, j) => sub(x, mul(f, cell(normalized, j))));
    }
    pivots.push(c);
    top++;
  }
  for (let i = top; i < rows.length; i++) {
    const row = rows[i];
    if (row !== undefined && !isZero(cell(row, n))) return { consistent: false };
  }
  const determined = new Map<string, Rational>();
  pivots.forEach((c, i) => {
    const row = rows[i];
    if (row === undefined) return;
    for (let j = 0; j < n; j++) if (j !== c && !isZero(cell(row, j))) return;
    determined.set(vars[c] as string, cell(row, n));
  });
  return { consistent: true, determined };
}

type Analysis =
  | { status: "contradiction" }
  | { status: "nonlinear"; relations: string[] }
  | { status: "solved"; determined: Map<string, Rational> };

/**
 * Solves the equations owned by the active sources (plus the structural ones). A product of two
 * unknowns is made linear as soon as one factor is fixed by the rest, and the whole is solved again.
 */
function analyse(sys: System, active: (source: string | null) => boolean): Analysis {
  const column = new Map(sys.vars.map((v, i) => [v, i]));
  const lin: Linear[] = [];
  let products: Extract<Equation, { kind: "product" }>[] = [];
  for (const e of sys.equations) {
    if (!active(e.source)) continue;
    if (e.kind === "linear") lin.push(e.eq);
    else products.push(e);
  }
  for (;;) {
    const res = eliminate(lin, sys.vars, column);
    if (!res.consistent) return { status: "contradiction" };
    const rest: typeof products = [];
    for (const p of products) {
      const a = res.determined.get(p.a);
      const r = res.determined.get(p.r);
      if (a !== undefined) lin.push(linear([[p.s, ONE], [p.r, neg(a)]], ZERO));
      else if (r !== undefined) lin.push(linear([[p.s, ONE], [p.a, neg(r)]], ZERO));
      else rest.push(p);
    }
    if (rest.length === products.length) {
      if (rest.length > 0) return { status: "nonlinear", relations: rest.map((p) => p.source).sort(byCodeUnit) };
      return { status: "solved", determined: res.determined };
    }
    products = rest;
  }
}

// ---------------------------------------------------------------------------------------------
// Minimal conflicting sets
// ---------------------------------------------------------------------------------------------

/** Every k-subset of 0..n-1 in lexicographic order. */
function* combinations(n: number, k: number): Generator<number[]> {
  const idx = Array.from({ length: k }, (_, i) => i);
  if (k > n) return;
  for (;;) {
    yield [...idx];
    let i = k - 1;
    while (i >= 0 && (idx[i] as number) === n - k + i) i--;
    if (i < 0) return;
    idx[i] = (idx[i] as number) + 1;
    for (let j = i + 1; j < k; j++) idx[j] = (idx[j - 1] as number) + 1;
  }
}

function compareIndexLists(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) return a.length - b.length;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] as number) - (b[i] as number);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Linear case. With the always-present equations substituted out, each constraint is one row
 * [coefficients | rhs], and a subset clashes exactly when (0 … 0 | 1) lies in the span of its rows.
 * A minimal clashing subset is linearly independent, so the search walks only independent subsets,
 * keeps an echelon basis it can push to and pop from, and stops a branch as soon as it clashes.
 */
function minimalConflictsLinear(sys: System): string[][] {
  const column = new Map(sys.vars.map((v, i) => [v, i]));
  const n = sys.vars.length;
  const dense = (e: Linear): Rational[] => {
    const row: Rational[] = Array.from({ length: n + 1 }, () => ZERO);
    for (const [v, c] of e.coefs) row[column.get(v) ?? -1] = c;
    row[n] = e.rhs;
    return row;
  };
  const at = (row: readonly Rational[], c: number): Rational => row[c] ?? ZERO;
  const firstNonZero = (row: readonly Rational[]): number => row.findIndex((x) => !isZero(x));
  /** Reduces row by an echelon basis whose rows were each reduced by the earlier ones. */
  const reduce = (row: Rational[], basis: readonly { pivot: number; row: Rational[] }[]): Rational[] => {
    let out = row;
    for (const b of basis) {
      const f = at(out, b.pivot);
      if (!isZero(f)) out = out.map((x, j) => sub(x, mul(f, at(b.row, j))));
    }
    return out;
  };
  const normalize = (row: Rational[], pivot: number): Rational[] => {
    const s = inv(at(row, pivot));
    return row.map((x) => mul(x, s));
  };

  const structural: { pivot: number; row: Rational[] }[] = [];
  const rows = new Map<string, Rational[]>();
  for (const e of sys.equations) {
    if (e.kind !== "linear") throw new Error("minimalConflictsLinear needs a linear system");
    if (e.source !== null) continue;
    const r = reduce(dense(e.eq), structural);
    const p = firstNonZero(r);
    if (p === n) throw new Error("the equations of the world's structure clash on their own");
    if (p >= 0) structural.push({ pivot: p, row: normalize(r, p) });
  }
  for (const e of sys.equations) {
    if (e.kind !== "linear" || e.source === null) continue;
    rows.set(e.source, reduce(dense(e.eq), structural));
  }
  const sourceRows = sys.sources.map((s) => rows.get(s) ?? dense(linear([], ZERO)));

  const found: number[][] = [];
  const chosen: number[] = [];
  const basis: { pivot: number; row: Rational[] }[] = [];
  const walk = (start: number): void => {
    for (let i = start; i < sourceRows.length; i++) {
      const r = reduce(sourceRows[i] as Rational[], basis);
      const p = firstNonZero(r);
      if (p < 0) continue; // dependent: no subset through here is minimal
      chosen.push(i);
      if (p === n) found.push([...chosen]);
      else {
        basis.push({ pivot: p, row: normalize(r, p) });
        walk(i + 1);
        basis.pop();
      }
      chosen.pop();
    }
  };
  walk(0);

  found.sort(compareIndexLists);
  const minimal: number[][] = [];
  for (const f of found) {
    const set = new Set(f);
    if (!minimal.some((m) => m.every((i) => set.has(i)))) minimal.push(f);
  }
  return minimal.map((m) => m.map((i) => sys.sources[i] as string));
}

/**
 * Finds every minimal clashing subset of the constraints. Sets come out with ids ascending, ordered
 * by size and then by the id list (指示書 第5.3節).
 */
function minimalConflicts(sys: System): string[][] {
  const n = sys.sources.length;
  if (n > MAX_CONFLICT_SOURCES) {
    throw new Error(`too many constraints (${String(n)}) to search for minimal conflicts; the limit is ${String(MAX_CONFLICT_SOURCES)}`);
  }
  if (sys.equations.every((e) => e.kind === "linear")) return minimalConflictsLinear(sys);
  return minimalConflictsBySubsets(sys);
}

/**
 * General case (some products of unknowns): tries the subsets from the smallest up; a clashing
 * subset that contains no smaller clashing one is minimal. Subsets come out in lexicographic order
 * of the ascending ids.
 */
function minimalConflictsBySubsets(sys: System): string[][] {
  const n = sys.sources.length;
  const found: number[] = [];
  const out: string[][] = [];
  for (let k = 1; k <= n; k++) {
    for (const combo of combinations(n, k)) {
      let mask = 0;
      for (const i of combo) mask |= 1 << i;
      if (found.some((m) => (m & mask) === m)) continue;
      const ids = combo.map((i) => sys.sources[i] as string);
      const chosen = new Set(ids);
      if (analyse(sys, (s) => s === null || chosen.has(s)).status === "contradiction") {
        found.push(mask);
        out.push(ids);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

function impossibleMarks(world: WorldScene, values: ReadonlyMap<string, Rational>): ImpossibleMark[] {
  const countable = new Map(world.item_kinds.map((k) => [k.id, k.countable]));
  const counted = new Map<string, boolean>();
  for (const q of world.quantities) counted.set(q.id, countable.get(q.item_kind) ?? false);
  for (const e of world.events) counted.set(e.id, countable.get(e.item_kind) ?? false);
  const marks: ImpossibleMark[] = [];
  for (const [id, v] of [...values].sort(([x], [y]) => byCodeUnit(x, y))) {
    if (cmp(v, ZERO) < 0) marks.push({ id, reason: "negative" });
    if (counted.get(id) === true && !isInteger(v)) marks.push({ id, reason: "non_integer" });
  }
  return marks;
}

/** Solves a world and sorts it into one of four kinds (指示書 第5.2節). */
export function solve(world: WorldScene): SolveResult {
  const sys = buildSystem(world);
  const res = analyse(sys, () => true);
  if (res.status === "contradiction") return { kind: "contradiction", minimalSets: minimalConflicts(sys) };
  if (res.status === "nonlinear") return { kind: "nonlinear", relations: res.relations };
  const values = new Map<string, Rational>();
  const undetermined: string[] = [];
  for (const id of sys.elements) {
    const v = res.determined.get(id);
    if (v === undefined) undetermined.push(id);
    else values.set(id, v);
  }
  if (undetermined.length > 0) return { kind: "underdetermined", undetermined, values };
  return { kind: "unique", values, impossible: impossibleMarks(world, values) };
}

/**
 * A copy of the world without the given constraints: relations are dropped, and given quantity
 * values and event amounts become unknown. Ids that are not constraints are ignored.
 */
export function withoutConstraints(world: WorldScene, ids: readonly string[]): WorldScene {
  const drop = new Set(ids);
  const copy = structuredClone(world);
  return {
    ...copy,
    quantities: copy.quantities.map((q) => (drop.has(q.id) ? { ...q, value: null } : q)),
    relations: copy.relations.filter((r) => !drop.has(r.id)),
    events: copy.events.map((e) => (drop.has(e.id) ? { ...e, amount: null } : e)),
  };
}
