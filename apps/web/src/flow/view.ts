// What each screen shows, from a snapshot of the session machine. The screens draw only this, so the
// tests can read every word a child may see (childTexts) on every path.
import type { SnapshotFrom } from "xstate";
import { gate, render, type GateContext, type Lang, type Rational, type WorldScene } from "@kimi/core";
import type { PredictionAnswer, flowMachine } from "./machine.ts";
import { gateContext } from "./problem.ts";
import { AI_MARK, hardLines, helplineLine, restLines, ui, type HelplineText, type UiText } from "./text.ts";

export type FlowSnapshot = SnapshotFrom<typeof flowMachine>;

export type ProblemStep = "reading" | "looking" | "placed" | "rebuilt" | "unit" | "total" | "solved" | "held";

interface Common {
  /** The screen's language (HANDOFF §7 の4) and every word of the screen in it. */
  lang: Lang;
  text: UiText;
  /** The three always-visible buttons (原則7). */
  buttons: UiText["buttons"];
  /** Gently highlighted after an unchecked safety result (Q26). */
  highlightButtons: boolean;
  /** The always-visible "AI" mark next to the junior (第9節). */
  aiMark: string;
}

export interface ProblemView extends Common {
  screen: "problem";
  step: ProblemStep;
  problemId: string;
  statements: { index: number; text: string; tokens: string[]; isQuestion: boolean; lit: boolean }[];
  /** The world to draw (verified by core). The asked quantity has no value in it. */
  world: WorldScene;
  /** The relation whose "1" card the child moves, and the quantity the card sits on now. */
  relationId: string;
  one: string | null;
  /** Where the child has put the card and not yet confirmed. */
  placement: string | null;
  tappedWords: { statementIndex: number; token: number }[];
  /** The junior's words now (a template or a generated line that passed the gates), or null. */
  line: string | null;
  /** The junior's reading card (from the second problem), or null. */
  card: string | null;
  /**
   * The child's prediction about the junior's world, asked before any sentence lights (指示書 第7.1節 手順4):
   * the question and the buttons in this problem's order ("fits" and "odd" swap on every problem, "unknown"
   * last). Null once answered or skipped. Nothing on screen ever says whether the answer fits.
   */
  predict: { label: string; question: string; choices: { answer: PredictionAnswer; label: string }[] } | null;
  /** On the English screen: a line that the problem is shown as written, in Japanese (the bank is Japanese). */
  note: string | null;
  /** Numbers the child said on this problem (may be drawn as the child's own). */
  unitValue: Rational | null;
  totalValue: Rational | null;
  /** The child may move the card on these steps; the confirm buttons show on "placed". */
  canPlace: boolean;
  /** The ids of the world's parts named by the lit sentences: they glow with them (empty while none is lit). */
  glowIds: string[];
  /** core's gate context of this problem (from its correct world), for the screen's own gate calls. Never drawn. */
  gate: GateContext;
}

export type FlowView =
  | (Common & { screen: "intro"; lines: string[] })
  | (Common & { screen: "consent"; lines: string[] })
  | ProblemView
  | (Common & { screen: "research"; lines: string[] })
  | (Common & { screen: "stuck"; lines: string[]; resume: string; hold: string | null })
  | (Common & { screen: "hard"; lines: string[]; helpline: HelplineText })
  | (Common & { screen: "rest"; lines: string[]; helpline: HelplineText })
  | (Common & { screen: "finished"; lines: string[] })
  | (Common & { screen: "ended" });

const STEPS: readonly ProblemStep[] = ["reading", "looking", "placed", "rebuilt", "unit", "total", "solved", "held"];

/**
 * The screen of a snapshot. The words are in `lang`: the session's language, or the device's choice when the
 * session has ended (an ended session no longer takes a new language, HANDOFF §7 の4).
 */
export function viewOf(s: FlowSnapshot, lang: Lang = s.context.lang): FlowView {
  const c = s.context;
  const t = ui(lang);
  const common: Common = { lang, text: t, buttons: t.buttons, highlightButtons: c.highlight, aiMark: AI_MARK };
  if (s.status === "done" || s.matches("ended")) return { ...common, screen: "ended" };
  if (s.matches("hard")) return { ...common, screen: "hard", lines: hardLines(lang), helpline: t.helpline };
  if (s.matches("rest")) return { ...common, screen: "rest", lines: restLines(lang), helpline: t.helpline };
  if (s.matches("stuck")) {
    const open = c.problem !== null && !c.problem.logged;
    const wait = render("kohai.wait", lang, 0, {}).text;
    return { ...common, screen: "stuck", lines: [wait], resume: t.stuck.resume, hold: open ? t.stuck.hold : null };
  }
  if (s.matches({ active: "intro" })) return { ...common, screen: "intro", lines: [...t.intro.lines] };
  if (s.matches({ active: "consent" })) return { ...common, screen: "consent", lines: [...t.consent.lines] };
  if (s.matches({ active: "researching" }) || s.matches({ active: "next" }) || s.matches({ active: "loading" })) {
    return { ...common, screen: "research", lines: [t.research.wait] };
  }
  if (s.matches({ active: "finished" })) return { ...common, screen: "finished", lines: [...t.finished.lines] };
  const p = c.problem;
  const step = STEPS.find((x) => s.matches({ active: { problem: x } }));
  if (p === null || step === undefined) return { ...common, screen: "research", lines: [t.research.wait] };
  // Sentences light only once the junior has shown its world and the child has answered or skipped the
  // prediction: core's gate refuses the sentences' check while the prediction is pending.
  const shownOk = step !== "reading" && gate({ kind: "show_statements" }, gateContext(p.record, c.lang, [], p.prediction === null ? "pending" : "answered")).ok;
  const lit = shownOk ? new Set(p.shown.failing) : new Set<number>();
  const pt = t.problem.predict;
  const predict =
    step === "reading" && p.prediction === null
      ? {
          label: pt.label,
          question: pt.question,
          choices: [...p.predictionOrder, "unknown" as const].map((answer) => ({ answer, label: pt[answer] })),
        }
      : null;
  const rel = p.shown.world.relations.find((r) => r.id === p.relationId);
  return {
    ...common,
    screen: "problem",
    step,
    problemId: p.record.world.problem_id,
    statements: p.record.statements.map((st) => ({ index: st.index, text: st.text, tokens: [...st.tokens], isQuestion: st.is_question, lit: lit.has(st.index) })),
    world: p.shown.world,
    relationId: p.relationId,
    one: rel?.reference ?? null,
    placement: p.placement,
    tappedWords: [...p.words],
    line: c.line === null || c.line.text === "" ? null : c.line.text,
    card: p.card,
    predict,
    note: t.problem.note,
    unitValue: p.unitValue,
    totalValue: p.totalValue,
    canPlace: step === "looking" || step === "placed",
    glowIds: [...new Set(p.record.statements.filter((st) => lit.has(st.index)).flatMap((st) => st.element_ids))],
    gate: gateContext(p.record, c.lang, [p.unitValue, p.totalValue].filter((x): x is Rational => x !== null)),
  };
}

/** Every word the screen shows to the child (the consent lines are for the grown-up but are listed too). */
export function childTexts(v: FlowView): string[] {
  const t = v.text;
  const out: string[] = [v.buttons.stop, v.buttons.dontKnow, v.buttons.hard, v.aiMark, t.title, t.alwaysLabel];
  switch (v.screen) {
    case "problem": {
      const p = t.problem;
      out.push(...v.statements.map((s) => s.text));
      if (v.line !== null) out.push(v.line);
      if (v.card !== null) out.push(v.card);
      if (v.predict !== null) out.push(v.predict.label, v.predict.question, ...v.predict.choices.map((c) => c.label));
      if (v.note !== null) out.push(v.note);
      out.push(p.label, p.sentences, p.world, p.next, p.looking, p.yes, p.no, p.nextProblem, p.unitPad, p.totalPad, t.pad.clear, t.pad.ok);
      out.push(t.draw.sentences, t.draw.glow, t.draw.world, t.draw.cardAria, t.draw.cardHere, t.draw.odd);
      break;
    }
    case "stuck":
      out.push(t.stuck.label, ...v.lines, v.resume);
      if (v.hold !== null) out.push(v.hold);
      break;
    case "hard":
    case "rest":
      out.push(v.screen === "hard" ? t.hard.label : t.rest.label, ...v.lines, v.helpline.title, v.helpline.pending, t.hard.close);
      if (v.helpline.note !== null) out.push(v.helpline.note);
      out.push(...v.helpline.entries.map((h) => helplineLine(h, v.lang)));
      break;
    case "ended":
      out.push(t.ended.label, t.ended.line);
      break;
    case "intro":
      out.push(t.intro.label, ...v.lines, t.intro.start);
      break;
    case "consent":
      out.push(t.consent.label, ...v.lines, t.consent.yes, t.consent.no);
      break;
    case "research":
      out.push(t.research.label, ...v.lines);
      break;
    case "finished":
      out.push(t.finished.label, ...v.lines, t.finished.end);
      break;
  }
  return out;
}
