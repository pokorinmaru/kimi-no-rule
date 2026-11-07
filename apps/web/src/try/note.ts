// 「中身を見る」 (指示書 第6.9節, 第6.7節 研究ノート): what the research layer holds and why, read from the session
// machine's state for the adult on the try route. It only reads: every world comes from core (runRule through
// showOn, the correct world through core's verified door), and core's gate decides what may be drawn. Before the
// adult has answered the problem on screen (the prediction and the first "1" placement), the world the sentence
// itself builds is not drawn (gate show_correct_world with interpretationRecorded false), and no prediction is
// marked as that world. The asked value is never in any world here: it stays "？".
import {
  OTHER,
  gate,
  holderName,
  readingCard,
  runRule,
  verifiedCorrectWorld,
  type Hypothesis,
  type ProblemRecord,
  type WorldScene,
} from "@kimi/core";
import type { FlowContext, Outcome, PredictionAnswer, ProblemState } from "../flow/machine.ts";
import { gateContext, showOn } from "../flow/problem.ts";

export interface NotePoolEntry {
  id: string;
  /** The reading in words (core readingCard), or the adult's note when core has no line for it. */
  line: string;
  weight: number;
  status: "hypothesis" | "confirmed";
  splitObservations: number;
}

export interface NotePrediction {
  hypothesisId: string;
  line: string;
  worldClass: number;
  /** "A", "B", … by first appearance in this list, so the label never tells which is the sentence's own world. */
  label: string;
  /** The sentence's own world, said only after the adult has answered this problem. */
  correct: boolean;
  /** The predicted world, drawn small; null while core's gate keeps it back or core refuses it. */
  world: WorldScene | null;
  hiddenReason: "too_early" | "refused" | null;
}

export type NoteChoice =
  | { kind: "first"; problemId: string }
  | { kind: "bank_order"; problemId: string }
  | { kind: "transfer"; problemId: string; fixedProblemId: string; oldReadingLine: string; wording: "same" | "different" }
  | { kind: "chosen"; problemId: string; gain: number; predictions: NotePrediction[] };

export interface NoteObservation {
  problemId: string;
  prediction: PredictionAnswer | null;
  /** The holder the first confirmed "1" was put on (the constructive observation). */
  placedOn: string;
  outcome: Outcome | "open";
}

export interface NoteView {
  pool: NotePoolEntry[];
  other: number;
  unexpressible: boolean;
  readings: number;
  unscored: number;
  choice: NoteChoice | null;
  observations: NoteObservation[];
  junior: { readingId: string; line: string; source: "mirror" | "competitor" | "taught"; sessionMisreadId: string | null; locked: boolean } | null;
  /** The kinds the junior's words' gates rejected, with how many times (never the words). */
  gate: { kind: string; count: number }[];
  scenes: { source: "program" | "claude"; focusId: string } | null;
}

const lineOf = (h: Hypothesis): string => {
  try {
    return readingCard(h, undefined, "ja") ?? (h.note_for_adult !== "" ? h.note_for_adult : h.id);
  } catch {
    return h.id;
  }
};

/** The adult has answered the problem: the prediction is given and the first "1" is confirmed (the interpretation is recorded). */
function answered(p: ProblemState): boolean {
  return p.prediction !== null && p.firstPlacement !== null;
}

function predictionsOf(p: ProblemState, hypotheses: readonly Hypothesis[], classes: readonly { hypothesisId: string; worldClass: number }[]): NotePrediction[] {
  const out: NotePrediction[] = [];
  const record = p.record;
  const done = answered(p);
  const ctx = { ...gateContext(record, "ja"), interpretationRecorded: done, prediction: p.prediction === null ? ("pending" as const) : ("answered" as const) };
  const labels = new Map<number, string>();
  for (const c of classes) {
    const h = hypotheses.find((x) => x.id === c.hypothesisId);
    if (h === undefined) continue;
    if (!labels.has(c.worldClass)) labels.set(c.worldClass, String.fromCharCode(65 + labels.size));
    const label = labels.get(c.worldClass) as string;
    // core's predict puts the sentence's own world first in W (class 0).
    if (c.worldClass === 0) {
      let world: WorldScene | null = null;
      try {
        const w = verifiedCorrectWorld(record.world);
        if (gate({ kind: "show_correct_world", world: w }, ctx).ok) world = w;
      } catch {
        world = null;
      }
      out.push({ hypothesisId: h.id, line: lineOf(h), worldClass: c.worldClass, label, correct: world !== null, world, hiddenReason: world === null ? "too_early" : null });
      continue;
    }
    let world: WorldScene | null;
    try {
      world = showOn(record, runRule(h, record), [], "ja")?.world ?? null;
    } catch {
      world = null;
    }
    out.push({ hypothesisId: h.id, line: lineOf(h), worldClass: c.worldClass, label, correct: false, world, hiddenReason: world === null ? "refused" : null });
  }
  return out;
}

function placedOn(record: ProblemRecord | undefined, quantityId: string | null): string {
  if (record === undefined || quantityId === null) return "";
  const holder = record.world.quantities.find((q) => q.id === quantityId)?.holder;
  if (holder === undefined) return "";
  try {
    return holderName(record.world, holder).text;
  } catch {
    return holder;
  }
}

/** The research note of a session's state, for the adult. `gateKinds` is the device's gate log of this try (kinds only). */
export function researchNote(c: FlowContext, gateKinds: readonly string[]): NoteView {
  const r = c.research;
  const pool = r.pool
    .map((e) => ({ id: e.hypothesis.id, line: lineOf(e.hypothesis), weight: r.weights[e.hypothesis.id] ?? 0, status: e.status, splitObservations: e.splitObservations }))
    .sort((a, b) => b.weight - a.weight);

  const p = c.problem;
  let choice: NoteChoice | null = null;
  if (p !== null) {
    const problemId = p.record.world.problem_id;
    const why = p.pickedBy;
    choice =
      why.kind === "chosen"
        ? { kind: "chosen", problemId, gain: why.choice.gain, predictions: predictionsOf(p, why.hypotheses, why.choice.predictions) }
        : why.kind === "transfer"
          ? { kind: "transfer", problemId, fixedProblemId: why.fixedProblemId, oldReadingLine: lineOf(why.oldReading), wording: why.wording }
          : { kind: why.kind, problemId };
  }

  const observations: NoteObservation[] = c.log
    .filter((l) => l.firstPlacement !== null)
    .map((l) => ({
      problemId: l.problemId,
      prediction: l.prediction,
      placedOn: placedOn(
        c.bank.find((b) => b.world.problem_id === l.problemId),
        l.firstPlacement,
      ),
      outcome: l.outcome,
    }));
  if (p !== null && !p.logged && p.firstPlacement !== null) {
    observations.push({ problemId: p.record.world.problem_id, prediction: p.prediction, placedOn: placedOn(p.record, p.firstPlacement), outcome: "open" });
  }

  const junior =
    p === null
      ? null
      : {
          readingId: p.reading.hypothesis.id,
          line: lineOf(p.reading.hypothesis),
          source: p.reading.source,
          sessionMisreadId: c.session?.id ?? null,
          locked: c.session?.locked ?? false,
        };

  const counts = new Map<string, number>();
  for (const k of gateKinds) counts.set(k, (counts.get(k) ?? 0) + 1);
  const scenes = c.ruleCard?.scenes ?? null;

  return {
    pool,
    other: r.weights[OTHER] ?? 0,
    unexpressible: r.unexpressible,
    readings: r.readings.length,
    unscored: r.unscored,
    choice,
    observations,
    junior,
    gate: [...counts].map(([kind, count]) => ({ kind, count })),
    scenes: scenes === null ? null : { source: scenes.source, focusId: scenes.focus.id },
  };
}
