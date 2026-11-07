// The flow's calls into core (原則3・4): which reading the junior uses, its world and the sentences that do
// not fit there, the child's teaching applied to the junior's world, the research observation and the
// fallback pool, the next problem, and the judging of the unit and the total. Nothing here decides a number
// or a world by itself: every value, world and verdict comes from a function of @kimi/core.
import {
  COMMON_FRACTION_READINGS,
  POOL_MAX,
  apply,
  judgeAnswer,
  judgeUnitValue,
  checkStatements,
  chooseNext,
  gate,
  kohaiReading,
  revisePool,
  runRule,
  sameReading,
  verifiedDrawWorld,
  type AnyOp,
  type FirstReading,
  type GateContext,
  type Hypothesis,
  type KohaiReading,
  type Lang,
  type PoolEdit,
  type ProblemRecord,
  type Rational,
  type ResearchState,
  type WorldScene,
} from "@kimi/core";

/** Tries at teaching on one problem before it is held for later (指示書 第7.1節 手順5, without the word book). */
export const MAX_FIXES = 3;

/** A world as shown on screen: checked by core, with the sentences that do not fit there. */
export interface Shown {
  world: WorldScene;
  /** Indices of the sentences that do not hold in this world (lit on screen). */
  failing: number[];
  /** The words of the problem tied to each failing sentence (for the junior's "which" intent). */
  cues: { statement_index: number; words: string[] }[];
}

export interface SessionMisread {
  id: string;
  hypothesis: Hypothesis;
  /** Kept for the rest of the session once the research layer has had its say (or a pool existed). */
  locked: boolean;
}

/** core's gate context of a problem. `prediction` is "pending" while the child's prediction is still open (core then refuses to show the sentences' check). */
export function gateContext(
  record: ProblemRecord,
  lang: Lang,
  saidNumbers: readonly Rational[] = [],
  prediction: GateContext["prediction"] = "disabled",
): GateContext {
  return {
    correct: record.world,
    lang,
    childSaid: { numbers: [...saidNumbers], words: [] },
    grade: record.world.grade,
    interpretationRecorded: true,
    prediction,
  };
}

/** Every element a sentence names, so that core checks every sentence (as core's own conditions do). */
function everyNamed(record: ProblemRecord) {
  return [...new Set(record.statements.flatMap((s) => s.element_ids))].map((element_id) => ({
    phrase: element_id,
    lang: record.world.problem_lang,
    element_id,
  }));
}

/**
 * The world `base` with the ops applied by core, every sentence checked by core, and the drawing world
 * passed through core's verified door and the show_world gate. Null when core refuses any of it.
 */
export function showOn(record: ProblemRecord, base: WorldScene, ops: readonly AnyOp[], lang: Lang): Shown | null {
  try {
    const res = apply({ correct: base, ops, phrases: everyNamed(record) });
    if (res.discarded.length > 0) return null;
    const checked = checkStatements({ correct: record.world, statements: record.statements, syntaxMarks: record.syntax_marks, ops, child: res });
    if (checked.kind !== "checked") return null;
    const world = verifiedDrawWorld(res);
    if (!gate({ kind: "show_world", world, labels: [] }, gateContext(record, lang)).ok) return null;
    const bad = checked.statements.filter((s) => s.verdict !== "holds");
    return {
      world,
      failing: bad.map((s) => s.index),
      cues: bad.map((s) => ({ statement_index: s.index, words: [...new Set(s.cues.map((c) => c.word))] })),
    };
  } catch {
    return null;
  }
}

export interface Junior {
  reading: KohaiReading;
  /** The junior's world as the rule builds it (the base the child's teaching is applied to). */
  base: WorldScene;
  shown: Shown;
  /**
   * The taught reading builds the sentence's own world here: the junior's world is drawn as the length order
   * only (no "1" card, no segment) until the child's own 1 (指示書 第7.1節 手順3; Q29), and no sentence lights.
   */
  orderOnly: boolean;
}

/**
 * The junior's reading of a problem (core kohaiReading) and its world. Without a taught reading: null when the
 * reading builds the correct world there (changesWorld false), or no sentence fails, or core refuses. With the
 * reading the child left on the rule card (指示書 第7.1節 後輩のルールカード): a world it changes is shown as a
 * misreading as before; one it does not change is shown as the length order only (orderOnly).
 */
export function juniorFor(
  record: ProblemRecord,
  state: ResearchState,
  session: SessionMisread | null,
  lang: Lang,
  taught: Hypothesis | null = null,
): Junior | null {
  try {
    const reading = kohaiReading({
      state,
      record,
      sessionMisreadId: session?.id ?? null,
      sessionMisread: session?.hypothesis ?? null,
      taught,
    });
    const base = runRule(reading.hypothesis, record);
    if (!reading.changesWorld || sameReading(base, record.world, true)) {
      if (taught === null || reading.source !== "taught") return null;
      const shown = showOn(record, base, [], lang);
      if (shown === null || shown.failing.length > 0) return null;
      return { reading, base, shown, orderOnly: true };
    }
    const shown = showOn(record, base, [], lang);
    if (shown === null || shown.failing.length === 0) return null;
    return { reading, base, shown, orderOnly: false };
  } catch {
    return null;
  }
}

/** One problem of the rule card's gallery: the world the card's rule builds there, checked by core. */
export interface GalleryItem {
  record: ProblemRecord;
  /** Null when core refuses the world (it is then not drawn, and the card does not fit). */
  shown: Shown | null;
}

/** The gallery of the rule card: each solved problem drawn as the world the rule builds (core runRule, checkStatements). */
export function galleryOf(h: Hypothesis, records: readonly ProblemRecord[], lang: Lang): GalleryItem[] {
  return records.map((record) => {
    try {
      return { record, shown: showOn(record, runRule(h, record), [], lang) };
    } catch {
      return { record, shown: null };
    }
  });
}

export function referenceOp(relationId: string, quantityId: string): AnyOp {
  return { op: "set_relation_reference", target_id: relationId, reference: quantityId, evidence: "" };
}

export function wordCueOp(statementIndex: number, token: number): AnyOp {
  return { op: "word_cue", statement_index: statementIndex, tokens: [token], evidence: "" };
}

/** The child's first reading of the problem: the correct world with only the child's "1" placed (core apply). */
export function firstReading(record: ProblemRecord, relationId: string, quantityId: string): FirstReading | null {
  try {
    const res = apply({ correct: record.world, ops: [referenceOp(relationId, quantityId)] });
    if (res.discarded.length > 0) return null;
    return { record, childWorld: res.judgeWorld, referencePlaced: true, afterFix: false, wordbookOpenedBefore: false };
  } catch {
    return null;
  }
}

/** The edits that turn the pool into the agent's pool; core revisePool then checks every one. */
export function editsTo(state: ResearchState, pool: readonly Hypothesis[]): PoolEdit[] {
  const now = new Map(state.pool.map((e) => [e.hypothesis.id, e.hypothesis]));
  const next = new Set(pool.map((h) => h?.id));
  const edits: PoolEdit[] = [];
  for (const h of pool) {
    const old = typeof h?.id === "string" ? now.get(h.id) : undefined;
    if (old === undefined) edits.push({ kind: "add", hypothesis: h });
    else if (JSON.stringify(old) !== JSON.stringify(h)) edits.push({ kind: "modify", hypothesis: h });
  }
  for (const id of now.keys()) if (!next.has(id)) edits.push({ kind: "delete", id });
  return edits;
}

/** The common readings that build the child's first reading again, as many as the pool has room for. */
export function fallbackEdits(state: ResearchState): PoolEdit[] {
  const first = state.readings[0];
  if (first === undefined) return [];
  const have = new Set(state.pool.map((e) => e.hypothesis.id));
  const room = Math.max(0, POOL_MAX - state.pool.length);
  return COMMON_FRACTION_READINGS.filter((h) => !have.has(h.id))
    .filter((h) => {
      try {
        return sameReading(runRule(h, first.record), first.childWorld, first.referencePlaced);
      } catch {
        return false;
      }
    })
    .slice(0, room)
    .map((h) => ({ kind: "add" as const, hypothesis: structuredClone(h) }));
}

/** The research agent's pool when core accepts it, else the fallback (指示書 第6.7節; HANDOFF §3 F3). */
export function researched(state: ResearchState, pool: readonly Hypothesis[] | null, bank: readonly ProblemRecord[]): ResearchState {
  if (pool !== null && Array.isArray(pool)) {
    try {
      const rev = revisePool(state, editsTo(state, pool), bank);
      if (rev.rejected.length === 0 && rev.state.pool.length > 0) return rev.state;
    } catch {
      // fall back below
    }
  }
  const edits = fallbackEdits(state);
  if (edits.length === 0) return state;
  return revisePool(state, edits, bank).state;
}

/**
 * The session's one misreading after the research layer has spoken: the reading research would pick now
 * when it builds the same world on the first problem as the junior showed there (so the child sees one
 * kind), else the first problem's reading.
 */
export function lockSession(state: ResearchState, first: ProblemRecord, provisional: SessionMisread): SessionMisread {
  try {
    const candidate = kohaiReading({ state, record: first, sessionMisreadId: null, taught: null });
    if (candidate.changesWorld && sameReading(runRule(candidate.hypothesis, first), runRule(provisional.hypothesis, first), true)) {
      return { id: candidate.hypothesis.id, hypothesis: candidate.hypothesis, locked: true };
    }
  } catch {
    // keep the first problem's reading
  }
  return { ...provisional, locked: true };
}

/** The next problem: core chooseNext over the problems the junior can misread (or read with the taught reading), else the first of them. */
export function selectNext(
  bank: readonly ProblemRecord[],
  done: readonly string[],
  state: ResearchState,
  session: SessionMisread | null,
  lang: Lang,
  taught: Hypothesis | null = null,
): { record: ProblemRecord; junior: Junior } | null {
  const seen = new Set(done);
  const all = bank.filter((r) => !seen.has(r.world.problem_id)).flatMap((record) => {
    const junior = juniorFor(record, state, session, lang, taught);
    return junior === null ? [] : [{ record, junior }];
  });
  // With a taught reading, a problem where it changes the world comes first (a transfer problem, 指示書 第6.7節 手順6).
  const changing = all.filter((o) => !o.junior.orderOnly);
  const open = changing.length > 0 ? changing : all;
  if (open.length === 0) return null;
  let choice: string | null = null;
  try {
    choice =
      chooseNext(
        state,
        open.map((o) => o.record),
        seen,
      )?.problemId ?? null;
  } catch {
    choice = null;
  }
  return open.find((o) => o.record.world.problem_id === choice) ?? (open[0] as { record: ProblemRecord; junior: Junior });
}

/** The one relation of a fraction-as-a-multiple problem. */
export function relationOf(record: ProblemRecord): WorldScene["relations"][number] | undefined {
  return record.world.relations[0];
}

/** The end of the relation whose value the problem gives (for the unit's mismatch words). */
export function knownEnd(record: ProblemRecord): WorldScene["quantities"][number] | undefined {
  const rel = relationOf(record);
  return record.world.quantities.find((q) => (q.id === rel?.subject || q.id === rel?.reference) && q.value !== null);
}

/** The size of one segment, judged by core (原則3). */
export function judgeUnit(record: ProblemRecord, value: Rational): boolean {
  try {
    return judgeUnitValue(record, value);
  } catch {
    return false;
  }
}

/** The answer to the question, judged by core (原則3). */
export function judgeTotal(record: ProblemRecord, value: Rational): boolean {
  try {
    return judgeAnswer(record, value);
  } catch {
    return false;
  }
}
