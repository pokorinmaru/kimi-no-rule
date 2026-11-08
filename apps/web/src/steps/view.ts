// What one step of the problem shows (Q62): the sentences up to this one (this one lit), the picture core draws for the
// step, one question, and the answers it takes. Every number and picture comes from core (stepsOf, stepScene,
// objectScene); this file only picks the words. A question's numbers are the problem's own (the given count, the
// parts of p/q), never the answer or one part before the child has said them.
import { dealAttempt, dealLine, objectScene, percentOff, stepScene, type DealAttempt, type Lang, type ObjectScene, type Rational, type Step } from "@kimi/core";
import { MAX_VOICE_TURNS, type ProblemState } from "../flow/machine.ts";
import { firstReading } from "../flow/problem.ts";
import { ui } from "../flow/text.ts";
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
  /** The picture's description must not say what one dish gets (the child is counting one part). */
  hideShare: boolean;
  /** The junior's reading card is not on this screen; the AI mark is beside the junior as everywhere. */
  holders: { id: string; label: string }[];
  /** On the English screen: the problem is written in Japanese (as on the old problem screen); null in Japanese. */
  note: string | null;
  /** What was understood from the child's words at the relation step, on top of the screen after it; or null. */
  heard: string | null;
  /**
   * The child's words at the relation step (only there, and not on the other reading's world): the lead line,
   * whether the mic and the typing box may be offered now, whether the words are being worked on, whether the voice
   * is off for the session, and the fixed line when nothing usable came back. Null on every other screen.
   */
  voice: { lead: string; canTalk: boolean; listening: boolean; off: boolean; missed: string | null } | null;
  /** One part, after a wrong number: the dealing at the child's number (core), which the child may rearrange; null otherwise. */
  deal: { attempt: DealAttempt; key: string } | null;
  /** The solved screen: 「せいかい！」 and the child's answer (the number the child said); null elsewhere. */
  cheer: { title: string; line: string } | null;
}

const frac = (r: Rational): string => (r.den === 1 ? String(r.num) : `${String(r.num)}/${String(r.den)}`);

/** The tokens of a sentence that hold a number (the fact's hint). */
function numberTokens(tokens: readonly string[]): number[] {
  return tokens.flatMap((t, i) => (/[0-9０-９]/.test(t) ? [i] : []));
}

/** The relation sentence's ratio, and the 「の」 just before it when there is one (the relation's hint): never the holder. */
function ratioTokens(tokens: readonly string[], ratio: string): number[] {
  const at = tokens.indexOf(ratio);
  if (at < 0) return [];
  return [at - 1, at].filter((i) => i >= 0 && (i === at || tokens[i] === "の"));
}

export function stepsView(p: ProblemState, lang: Lang, outcome: "steps" | "solved" | "held", voiceOff = false): StepsView | null {
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
  // The sentences read so far stay: up to the furthest sentence of the steps passed and this one (a relation may come first).
  const reached = Math.max(
    ...s.steps.slice(0, s.index + 1).map((x) => ("statementIndex" in x ? x.statementIndex : -1)),
    0,
  );
  const base = {
    screen: "steps" as const,
    problemId: w.problem_id,
    count: s.steps.length,
    holders: w.holders.map((h) => ({ id: h.id, label: h.label })),
    note: ui(lang).problem.note,
    heard: null,
    voice: null,
    deal: null,
    cheer: null,
  };
  if (outcome !== "steps") {
    const last = s.steps.at(-1);
    return {
      ...base,
      at: s.steps.length,
      kind: outcome,
      statements: statementsUpTo(all),
      current: null,
      lit: null,
      lead: outcome === "solved" ? null : t.held,
      cheer:
        outcome === "solved" && last?.kind === "total"
          ? { title: t.cheer.title, line: t.cheer.line(s.steps[0] !== undefined && stepScene(p.record, s.steps[0], [])?.item.coin !== undefined ? label(last.targetHolderId) : lang === "ja" ? `${label(last.targetHolderId)}の ${noun}` : `${label(last.targetHolderId)}'s ${noun}`, `${frac(last.value)}${counter}`) }
          : null,
      question: null,
      choices: null,
      pad: null,
      again: null,
      scene: last === undefined ? null : stepScene(p.record, last, s.said),
      hideShare: false,
    };
  }
  const step = s.steps[s.index];
  if (step === undefined) return null;
  // Money drawn as coins (Q63): the holders are things, the questions stay in the problem's unit, and the coins' worth
  // is said wherever they are drawn.
  const firstScene = s.steps[0] === undefined ? null : stepScene(p.record, s.steps[0], []);
  const money = firstScene?.item.coin !== undefined;
  const coinNote = (sc: ObjectScene | null): string | null =>
    sc?.item.coin === undefined ? null : t.money.note(sc.item.noun, sc.item.counter, sc.item.coin, counter);
  const join = (...xs: (string | null)[]): string | null => {
    const kept = xs.filter((x): x is string => x !== null && x !== "");
    return kept.length === 0 ? null : kept.join(lang === "ja" ? "" : " ");
  };
  // The child's words restated (a holder and the noun only), on the screen right after the words chose.
  const heard = s.heardFrom === null ? null : money ? t.money.heard(label(s.heardFrom)) : t.heard(label(s.heardFrom), noun);
  const common = { ...base, heard, at: s.index + 1, kind: step.kind, again: null, choices: null, pad: null, hideShare: false };
  const relation = s.steps.find((x) => x.kind === "relation");
  // A percent off (20%引き) is what the sentence writes: the hint names it and lights it, not the 4/5 core keeps.
  const pct = relation?.kind === "relation" ? percentOff(p.record, relation) : null;
  const ratio = relation?.kind === "relation" ? (pct === null ? frac(relation.amount) : `${String(pct.percent)}%引き`) : "";
  switch (step.kind) {
    case "fact": {
      const st = p.record.statements[step.statementIndex];
      const scene = stepScene(p.record, step, s.said);
      return {
        ...common,
        statements: statementsUpTo(reached),
        current: step.statementIndex,
        lit: s.hint && st !== undefined ? { statementIndex: st.index, tokens: numberTokens(st.tokens) } : null,
        lead: join(coinNote(scene), s.hint ? t.factHint : null),
        question: money ? t.money.fact(label(step.holderId), counter) : t.fact(label(step.holderId), noun, counter),
        pad: t.pad,
        scene,
      };
    }
    case "relation": {
      const st = p.record.statements[step.statementIndex];
      const holders = [step.subjectHolderId, step.referenceHolderId];
      // The order of the holders changes from problem to problem, so no answer keeps one place (safety review).
      const ordered = s.flip ? [...holders].reverse() : holders;
      if (s.misread !== null) {
        const reading = firstReading(p.record, step.relationId, s.misread);
        const chosen = w.quantities.find((q) => q.id === s.misread)?.holder ?? "";
        const scene = reading === null ? null : objectScene(reading.childWorld, p.record.world, { values: s.said });
        // The other reading's count of the asked holder, as drawn (core hides it when it is a hidden value).
        const asked = scene?.holders.find((h) => h.quantityId === w.question.target_id);
        const coins = scene?.item.coin !== undefined;
        const count =
          asked?.count != null && !asked.hidden
            ? coins && scene !== null
              ? t.money.misreadCount(label(asked.holderId), scene.item.noun, asked.count.wholes, scene.item.counter, asked.count.piece !== null)
              : t.misreadCount(label(asked.holderId), noun, asked.count.wholes, counter, asked.count.piece !== null)
            : "";
        return {
          ...common,
          statements: statementsUpTo(reached),
          current: step.statementIndex,
          lit: null,
          lead: join(coinNote(scene), count, money ? t.money.misread(label(chosen)) : t.misread(label(chosen), noun)),
          question: null,
          again: t.again,
          scene,
        };
      }
      const relScene = stepScene(p.record, step, s.said);
      return {
        ...common,
        statements: statementsUpTo(reached),
        current: step.statementIndex,
        lit:
          s.hint && st !== undefined
            ? { statementIndex: st.index, tokens: pct === null ? ratioTokens(st.tokens, ratio) : st.tokens.flatMap((x, i) => (/^[0-9]+%$/.test(x) || (x === "引き" && /%$/.test(st.tokens[i - 1] ?? "")) ? [i] : [])) }
            : null,
        lead: join(coinNote(relScene), s.hint ? t.relationHint(ratio) : null),
        question: money ? t.money.relation(label(step.subjectHolderId)) : t.relation(label(step.subjectHolderId), noun),
        choices: [...ordered.map((h) => ({ holderId: h, label: label(h) })), { holderId: null, label: t.unknown }],
        scene: relScene,
        voice: {
          lead: t.voiceLead,
          canTalk: !voiceOff && !p.listening && p.voiceTurns < MAX_VOICE_TURNS,
          listening: p.listening,
          off: voiceOff,
          missed: s.missed ? t.voiceMiss : null,
        },
      };
    }
    case "unit": {
      const fact = s.steps.find((x) => x.kind === "fact");
      const n = fact?.kind === "fact" ? frac(fact.value) : "";
      const amount = relation?.kind === "relation" ? relation.amount : null;
      const whole = relation?.kind === "relation" && relation.referenceHolderId === step.knownHolderId;
      const question = s.help ? t.unitHelp(counter) : whole ? t.unitWhole(label(step.knownHolderId), n, counter, step.parts) : t.unitPart(label(step.knownHolderId), n, counter, step.parts);
      // The child's wrong number dealt as it is (user request, 2026-11-08): the plates run out or things are left over,
      // AI-kun says so in fixed words (core's numbers, never one part), and the child may move the things.
      const attempt = s.tried !== null && fact?.kind === "fact" ? dealAttempt(p.record, step, fact, s.tried) : null;
      if (attempt !== null && s.tried !== null) {
        return {
          ...common,
          statements: statementsUpTo(all),
          current: relation?.kind === "relation" ? relation.statementIndex : null,
          lit: null,
          lead: dealLine(p.record, attempt, s.tried, lang),
          question,
          pad: t.pad,
          scene: null,
          deal: { attempt, key: `${String(s.tries)}-${String(s.tried.num)}/${String(s.tried.den)}` },
        };
      }
      // The smaller step draws the dealing so the child can count one part (Q62: a smaller step is allowed);
      // its description says the dishes, never what one dish gets (safety review S1).
      const unitScene = stepScene(p.record, step, s.help ? [...s.said, step.value] : s.said);
      return {
        ...common,
        statements: statementsUpTo(all),
        current: relation?.kind === "relation" ? relation.statementIndex : null,
        lit: null,
        // A percent off (20%引き) is said as the fraction kept (4/5) first; elsewhere what p/q means.
        lead: join(
          relation?.kind === "relation" && percentOff(p.record, relation) !== null
            ? (() => {
                const pc = percentOff(p.record, relation);
                return pc === null ? null : t.percent(pc.percent, pc.parts, pc.kept);
              })()
            : amount === null
              ? null
              : t.explain(amount.num, amount.den),
          coinNote(unitScene),
        ),
        question,
        pad: t.pad,
        scene: unitScene,
        hideShare: s.help,
      };
    }
    case "total": {
      const totalScene = stepScene(p.record, step, s.said);
      return {
        ...common,
        statements: statementsUpTo(all),
        current: step.statementIndex,
        lit: null,
        lead: join(coinNote(totalScene), s.help ? t.totalHelp(step.parts) : null),
        question: t.total(label(step.targetHolderId), step.parts, counter),
        pad: t.pad,
        scene: totalScene,
      };
    }
  }
}
