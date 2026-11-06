// What each screen shows, from a snapshot of the session machine. The screens draw only this, so the
// tests can read every word a child may see (childTexts) on every path.
import type { SnapshotFrom } from "xstate";
import type { Rational, WorldScene } from "@kimi/core";
import type { flowMachine } from "./machine.ts";
import { AI_MARK, BUTTONS, CONSENT_LINES, FINISHED_LINES, HELPLINE, INTRO_LINES, RESEARCH_WAIT_LINE, STUCK, hardLines, restLines } from "./text.ts";

export type FlowSnapshot = SnapshotFrom<typeof flowMachine>;

export type ProblemStep = "reading" | "looking" | "placed" | "rebuilt" | "unit" | "total" | "solved" | "held";

interface Common {
  /** The three always-visible buttons (原則7). */
  buttons: typeof BUTTONS;
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
  /** Numbers the child said on this problem (may be drawn as the child's own). */
  unitValue: Rational | null;
  totalValue: Rational | null;
  /** The child may move the card on these steps; the confirm buttons show on "placed". */
  canPlace: boolean;
}

export type FlowView =
  | (Common & { screen: "intro"; lines: string[] })
  | (Common & { screen: "consent"; lines: string[] })
  | ProblemView
  | (Common & { screen: "research"; lines: string[] })
  | (Common & { screen: "stuck"; lines: string[]; resume: string; hold: string | null })
  | (Common & { screen: "hard"; lines: string[]; helpline: { title: string; pending: string } })
  | (Common & { screen: "rest"; lines: string[]; helpline: { title: string; pending: string } })
  | (Common & { screen: "finished"; lines: string[] })
  | (Common & { screen: "ended" });

const STEPS: readonly ProblemStep[] = ["reading", "looking", "placed", "rebuilt", "unit", "total", "solved", "held"];

export function viewOf(s: FlowSnapshot): FlowView {
  const c = s.context;
  const common: Common = { buttons: BUTTONS, highlightButtons: c.highlight, aiMark: AI_MARK };
  if (s.status === "done" || s.matches("ended")) return { ...common, screen: "ended" };
  if (s.matches("hard")) return { ...common, screen: "hard", lines: hardLines(c.lang), helpline: { ...HELPLINE } };
  if (s.matches("rest")) return { ...common, screen: "rest", lines: restLines(c.lang), helpline: { ...HELPLINE } };
  if (s.matches("stuck")) {
    const open = c.problem !== null && !c.problem.logged;
    const wait = "ゆっくり考えていいですよ。待っています";
    return { ...common, screen: "stuck", lines: [wait], resume: STUCK.resume, hold: open ? STUCK.hold : null };
  }
  if (s.matches({ active: "intro" })) return { ...common, screen: "intro", lines: [...INTRO_LINES] };
  if (s.matches({ active: "consent" })) return { ...common, screen: "consent", lines: [...CONSENT_LINES] };
  if (s.matches({ active: "researching" }) || s.matches({ active: "next" }) || s.matches({ active: "loading" })) {
    return { ...common, screen: "research", lines: [RESEARCH_WAIT_LINE] };
  }
  if (s.matches({ active: "finished" })) return { ...common, screen: "finished", lines: [...FINISHED_LINES] };
  const p = c.problem;
  const step = STEPS.find((x) => s.matches({ active: { problem: x } }));
  if (p === null || step === undefined) return { ...common, screen: "research", lines: [RESEARCH_WAIT_LINE] };
  // Sentences light only once the junior has shown its world and said so (step "reading" lights none).
  const lit = step === "reading" ? new Set<number>() : new Set(p.shown.failing);
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
    unitValue: p.unitValue,
    totalValue: p.totalValue,
    canPlace: step === "looking" || step === "placed",
  };
}

/** Every word the screen shows to the child (the consent lines are for the grown-up but are listed too). */
export function childTexts(v: FlowView): string[] {
  const out: string[] = [v.buttons.stop, v.buttons.dontKnow, v.buttons.hard, v.aiMark];
  switch (v.screen) {
    case "problem":
      out.push(...v.statements.map((s) => s.text));
      if (v.line !== null) out.push(v.line);
      if (v.card !== null) out.push(v.card);
      break;
    case "stuck":
      out.push(...v.lines, v.resume);
      if (v.hold !== null) out.push(v.hold);
      break;
    case "hard":
    case "rest":
      out.push(...v.lines, v.helpline.title, v.helpline.pending);
      break;
    case "ended":
      break;
    default:
      out.push(...v.lines);
  }
  return out;
}
