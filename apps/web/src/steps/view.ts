// What one step of the problem shows (Q62): the sentences up to this one (this one lit), the picture core draws for the
// step, one question, and the answers it takes. Every number and picture comes from core (stepsOf, stepScene,
// objectScene); this file only picks the words. A question's numbers are the problem's own (the given count, the
// parts of p/q), never the answer or one part before the child has said them.
import { objectScene, stepScene, type Lang, type ObjectScene, type Rational, type Step } from "@kimi/core";
import type { ProblemState } from "../flow/machine.ts";
import { firstReading } from "../flow/problem.ts";
import { stepsText } from "./text.ts";

export interface StepsView {
  screen: "steps";
  problemId: string;
  /** Which step (1-based) of how many. */
  at: number;
  count: number;
  kind: Step["kind"] | "solved" | "held";
  /** The sentences shown so far; the step's own sentence is `current`. */
  statements: { index: number; text: string; tokens: string[] }[];
  current: number | null;
  /** The tokens lit in the current sentence: its number (a fact's hint) or its holder words and ratio (the relation's hint). */
  lit: { statementIndex: number; tokens: number[] } | null;
  /** A line above the question (what p/q means, or the other reading's world), or null. */
  lead: string | null;
  question: string | null;
  /** At the relation sentence: the holders to choose from, in this problem's order, then わからない. */
  choices: { holderId: string | null; label: string }[] | null;
  /** The number pad's label, when the step takes a number. */
  pad: string | null;
  /** After the world of another reading: the button back to the question. */
  again: string | null;
  scene: ObjectScene | null;
  /** The junior's reading card is not on this screen; the AI mark is beside the junior as everywhere. */
  holders: { id: string; label: string }[];
}

const frac = (r: Rational): string => (r.den === 1 ? String(r.num) : `${String(r.num)}/${String(r.den)}`);

/** The tokens of a sentence that hold a number (the fact's hint). */
function numberTokens(tokens: readonly string[]): number[] {
  return tokens.flatMap((t, i) => (/[0-9０-９]/.test(t) ? [i] : []));
}

/** The relation sentence's 「の」 and ratio tokens (the relation's hint): the words to look for, not the answer. */
function ratioTokens(tokens: readonly string[], ratio: string): number[] {
  const at = tokens.indexOf(ratio);
  if (at < 0) return [];
  return [at - 1, at].filter((i) => i >= 0 && (i === at || tokens[i] === "の"));
}

export function stepsView(p: ProblemState, lang: Lang, outcome: "steps" | "solved" | "held"): StepsView | null {
  const s = p.steps;
  if (s === null) return null;
  const t = stepsText(lang);
  const w = p.record.world;
  const label = (holderId: string): string => w.holders.find((h) => h.id === holderId)?.label ?? "";
  const item = w.item_kinds[0];
  const noun = item?.noun ?? "";
  const counter = item?.counter ?? "";
  const statementsUpTo = (k: number) =>
    p.record.statements.filter((st) => st.index <= k).map((st) => ({ index: st.index, text: st.text, tokens: [...st.tokens] }));
  const all = p.record.statements.length - 1;
  const base = { screen: "steps" as const, problemId: w.problem_id, count: s.steps.length, holders: w.holders.map((h) => ({ id: h.id, label: h.label })) };
  if (outcome !== "steps") {
    const last = s.steps.at(-1);
    return {
      ...base,
      at: s.steps.length,
      kind: outcome,
      statements: statementsUpTo(all),
      current: null,
      lit: null,
      lead: outcome === "solved" ? t.solved : t.held,
      question: null,
      choices: null,
      pad: null,
      again: null,
      scene: last === undefined ? null : stepScene(p.record, last, s.said),
    };
  }
  const step = s.steps[s.index];
  if (step === undefined) return null;
  const common = { ...base, at: s.index + 1, kind: step.kind, again: null, choices: null, pad: null };
  const relation = s.steps.find((x) => x.kind === "relation");
  const ratio = relation?.kind === "relation" ? frac(relation.amount) : "";
  switch (step.kind) {
    case "fact": {
      const st = p.record.statements[step.statementIndex];
      return {
        ...common,
        statements: statementsUpTo(step.statementIndex),
        current: step.statementIndex,
        lit: s.hint && st !== undefined ? { statementIndex: st.index, tokens: numberTokens(st.tokens) } : null,
        lead: s.hint ? t.factHint : null,
        question: t.fact(label(step.holderId), noun, counter),
        pad: t.pad,
        scene: stepScene(p.record, step, s.said),
      };
    }
    case "relation": {
      const st = p.record.statements[step.statementIndex];
      const holders = [step.subjectHolderId, step.referenceHolderId];
      // The order of the holders changes from problem to problem, so no answer keeps one place (safety review).
      const ordered = p.record.world.problem_id.length % 2 === 0 ? holders : [...holders].reverse();
      if (s.misread !== null) {
        const reading = firstReading(p.record, step.relationId, s.misread);
        const chosen = w.quantities.find((q) => q.id === s.misread)?.holder ?? "";
        const scene = reading === null ? null : objectScene(reading.childWorld, p.record.world, { values: s.said });
        // The other reading's count of the asked holder, as drawn (core hides it when it is a hidden value).
        const asked = scene?.holders.find((h) => h.quantityId === w.question.target_id);
        const count = asked?.count != null && !asked.hidden ? t.misreadCount(label(asked.holderId), noun, asked.count.wholes, counter, asked.count.piece !== null) : "";
        return {
          ...common,
          statements: statementsUpTo(step.statementIndex),
          current: step.statementIndex,
          lit: null,
          lead: count + t.misread(label(chosen), noun),
          question: null,
          again: t.again,
          scene,
        };
      }
      return {
        ...common,
        statements: statementsUpTo(step.statementIndex),
        current: step.statementIndex,
        lit: s.hint && st !== undefined ? { statementIndex: st.index, tokens: ratioTokens(st.tokens, ratio) } : null,
        lead: s.hint ? t.relationHint(ratio) : null,
        question: t.relation(label(step.subjectHolderId), noun),
        choices: [...ordered.map((h) => ({ holderId: h, label: label(h) })), { holderId: null, label: t.unknown }],
        scene: stepScene(p.record, step, s.said),
      };
    }
    case "unit": {
      const fact = s.steps.find((x) => x.kind === "fact");
      const n = fact?.kind === "fact" ? frac(fact.value) : "";
      const amount = relation?.kind === "relation" ? relation.amount : null;
      const whole = relation?.kind === "relation" && relation.referenceHolderId === step.knownHolderId;
      const question = s.help ? t.unitHelp(counter) : whole ? t.unitWhole(label(step.knownHolderId), n, counter, step.parts) : t.unitPart(label(step.knownHolderId), n, counter, step.parts);
      return {
        ...common,
        statements: statementsUpTo(all),
        current: relation?.kind === "relation" ? relation.statementIndex : null,
        lit: null,
        lead: amount === null ? null : t.explain(amount.num, amount.den),
        question,
        pad: t.pad,
        // The smaller step draws the dealing so the child can count one part (Q62: a smaller step is allowed).
        scene: stepScene(p.record, step, s.help ? [...s.said, step.value] : s.said),
      };
    }
    case "total":
      return {
        ...common,
        statements: statementsUpTo(all),
        current: step.statementIndex,
        lit: null,
        lead: s.help ? t.totalHelp(step.parts) : null,
        question: t.total(label(step.targetHolderId), step.parts, counter),
        pad: t.pad,
        scene: stepScene(p.record, step, s.said),
      };
  }
}
