// What each screen shows, from a snapshot of the session machine. The screens draw only this, so the
// tests can read every word a child may see (childTexts) on every path.
import { stepsView, type StepsView } from "../steps/view.ts";
import { stepsText } from "../steps/text.ts";
import type { SnapshotFrom } from "xstate";
import { CARD_RULES, apply, cardSlot, checkScene, fromSchema, gate, objectScene, type ObjectScene, sceneAvoidValues, readingCard, render, toString, verifiedDrawWorld, viewScene, wordbookPage, type GateContext, type Hypothesis, type Lang, type ProblemRecord, type Rational, type Scene, type WordbookPageView, type WorldScene } from "@kimi/core";
import type { CardScenes } from "./machine.ts";
import { MAX_VOICE_TURNS, bookPageId, guessHolders, helpHolders, type PredictionAnswer, type ProblemState, type flowMachine } from "./machine.ts";
import { gateContext } from "./problem.ts";
import { kohaiPose, type KohaiPose } from "./pose.ts";
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
  /** What the junior is doing now, for its picture beside its line (flow/pose.ts); never a feeling. */
  pose: KohaiPose;
}

export interface ProblemView extends Common {
  screen: "problem";
  step: ProblemStep;
  problemId: string;
  statements: { index: number; text: string; tokens: string[]; isQuestion: boolean; lit: boolean }[];
  /** The world to draw (verified by core). The asked quantity has no value in it. */
  world: WorldScene;
  /**
   * The stage picture above the tape (指示書 第8節): core's objectScene of `world` against the correct world and
   * the numbers the child said; null when core draws no things (not countable things).
   */
  stage: ObjectScene | null;
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
  /** The junior's world is the sentence's own world: draw the length order only, wherever the card is put. */
  orderOnly: boolean;
  /** The ids of the world's parts named by the lit sentences: they glow with them (empty while none is lit). */
  glowIds: string[];
  /** core's gate context of this problem (from its correct world), for the screen's own gate calls. Never drawn. */
  gate: GateContext;
  /**
   * The child's voice (指示書 第7.1節 手順5): whether the mic may be offered now (looking or placed, turns left, not
   * waiting), whether the junior is waiting for the words heard, and whether the voice is off for this session.
   * The screen also needs the browser's speech recognition; without it the card stays the only way.
   */
  voice: { canTalk: boolean; listening: boolean; off: boolean };
}

/** One solved problem on the rule card: its sentences (lit where core says they do not fit) and the rule's world. */
export interface GalleryView {
  problemId: string;
  statements: { index: number; text: string; tokens: string[]; lit: boolean }[];
  /** The world the card's rule builds there (verified by core; the asked quantity has no value), or null when core refused it. */
  world: WorldScene | null;
  /** The stage picture of that world (core's objectScene against the problem's correct world), or null. */
  stage: ObjectScene | null;
  glowIds: string[];
}

/** One everyday scene on the rule card, drawn as the world of the rule on the card now (core viewScene). */
export interface SceneItemView {
  key: string;
  /** The scene's sentences (its own numbers only) and the common-sense sentence, lit where it does not hold. */
  lines: string[];
  commonSense: string;
  lit: boolean;
  /** The tapes: lengths against the longest thing drawn, and parts where the rule's world has a multiple to draw in parts. */
  tapes: { quantityId: string; holderId: string; label: string; length: number; segments: number | null }[];
  /** Where the limit falls (the cap scenes), with its label, or null. */
  limit: { at: number; label: string } | null;
}

/**
 * The junior's rule card (指示書 第7.1節 後輩のルールカード): the junior's card line, the options for who is taken
 * as 1 (core's CARD_RULES, in core's order), and the gallery. Nothing on it says right or wrong.
 */
export interface CardScreenView extends Common {
  screen: "card";
  lines: string[];
  /** The card's line now (core readingCard), or null when core has no line for the reading. */
  card: string | null;
  slotLabel: string;
  options: { ruleId: string; label: string; chosen: boolean }[];
  galleryLabel: string;
  gallery: GalleryView[];
  /** 「身近な場面で見てみる」 (指示書 第6.7節 手順5), or null when there is nothing to show. */
  scenes: { label: string; note: string; drawing: string; items: SceneItemView[] } | null;
  next: string;
}

/**
 * The junior's staged questions for a child who is stuck (指示書 第7.1節 手順4・5): (a) "read" lights the relation
 * words of one sentence; (b) "order" asks which is longer, with the two holders as buttons (never judged); (c)
 * "offer" offers the word book. No world is drawn, no answer, no operation, no judging word.
 */
export interface HelpView extends Common {
  screen: "help";
  stage: "read" | "order" | "offer";
  problemId: string;
  statements: { index: number; text: string; tokens: string[]; isQuestion: boolean }[];
  /** The sentence and its lit relation words (step a), or null. */
  lit: { statementIndex: number; tokens: number[] } | null;
  line: string | null;
  /** Step b: the two holders of the relation, in the problem's order. */
  choices: { holderId: string; label: string }[];
}

/**
 * The child's own first prediction, before the junior's world (指示書 第7.1節 手順2): the problem's sentences, one plain
 * outline per holder of the relation, all of one length with no segment (only the problem's own number or "？" on
 * them, passed by core's show_world gate), the optional "1" card, and "who has more?" with the holders and "not yet".
 * Nothing on it says whether an answer fits.
 */
export interface GuessView extends Common {
  screen: "guess";
  problemId: string;
  statements: { index: number; text: string; tokens: string[]; isQuestion: boolean }[];
  label: string;
  question: string;
  cardLine: string;
  optional: string;
  /** The outlines (empty when core's gate refuses to show them; the question stays). */
  tapes: { holderId: string; label: string; value: string }[];
  /** The holder the child put the "1" card on, or null. */
  one: string | null;
  /** The holders (their order flips with the problem's number, guessHolders), then null for "not yet". */
  choices: { holderId: string | null; label: string }[];
  /** No junior's line on this step: the junior has not read yet. */
  line: null;
  note: string | null;
  /** core's gate context, for placing the card through core as the problem screen does. */
  gate: GateContext;
}

/**
 * The outlines' labels: the problem's own number for a holder the problem gives a number to, "？" for any other. Shown
 * only when core's gate passes them as a world drawing (no hidden value, the asked one "？").
 */
function guessTapes(p: ProblemState, lang: Lang): GuessView["tapes"] {
  try {
    const w = p.record.world;
    const rel = w.relations.find((r) => r.id === p.relationId);
    const rows = guessHolders(p).flatMap((holderId) => {
      const q = w.quantities.find((x) => x.holder === holderId && (x.id === rel?.subject || x.id === rel?.reference));
      return q === undefined ? [] : [{ holderId, q }];
    });
    const res = apply({ correct: w, ops: [] });
    const labels = rows.map(({ q }) => ({ element_id: q.id, value: q.value === null || q.id === w.question.target_id ? ("?" as const) : q.value }));
    if (!gate({ kind: "show_world", world: verifiedDrawWorld(res), labels }, gateContext(p.record, lang)).ok) return [];
    return rows.map(({ holderId, q }, i) => {
      const l = labels[i]?.value;
      const counter = w.item_kinds.find((k) => k.id === q.item_kind)?.counter ?? "";
      return {
        holderId,
        label: w.holders.find((h) => h.id === holderId)?.label ?? "",
        // "？" as the drawing writes it in each language (the problem's own number keeps the problem's counter).
        value: l === undefined || l === "?" ? (lang === "ja" ? "？" : "?") : `${toString(fromSchema(l))}${counter}`,
      };
    });
  } catch {
    return [];
  }
}

/** ことばの絵本 (指示書 第7.1節): the page core lets be shown on this problem, drawn with the "1" card on the holder it takes as 1. */
export interface WordbookView extends Common {
  screen: "wordbook";
  problemId: string;
  page: WordbookPageView | null;
  line: string | null;
}

export type FlowView =
  | (Common & { screen: "intro"; lines: string[] })
  | GuessView
  | HelpView
  | WordbookView
  | (Common & { screen: "consent"; lines: string[] })
  | ProblemView
  | (Common & StepsView)
  | CardScreenView
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
const rotate = <T,>(xs: readonly T[], k: number): T[] => xs.map((_, i) => xs[(i + k) % xs.length] as T);

export function viewOf(s: FlowSnapshot, lang: Lang = s.context.lang): FlowView {
  const c = s.context;
  const t = ui(lang);
  const stepNow = STEPS.find((x) => s.matches({ active: { problem: x } })) ?? null;
  const screenNow = s.matches({ active: { problem: "help" } }) ? "help" : s.matches({ active: { problem: "wordbook" } }) ? "wordbook" : s.matches({ active: "card" }) ? "card" : "problem";
  const pose = kohaiPose({ screen: screenNow, step: stepNow, intent: c.line?.intent ?? null, listening: c.problem?.listening === true || (c.problem?.heard ?? null) !== null });
  const common: Common = { lang, text: t, buttons: t.buttons, highlightButtons: c.highlight, aiMark: AI_MARK, pose };
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
  if (s.matches({ active: "card" }) && c.ruleCard !== null) {
    const rc = c.ruleCard;
    const rt = t.ruleCard;
    return {
      ...common,
      screen: "card",
      lines: [...rt.lines],
      card: readingCard(rc.rule, undefined, lang, { forEdit: true }) ?? readingCard(rc.rule, undefined, lang),
      slotLabel: rt.slot,
      // The options' order turns with every card screen, so none of them is found by its place (safety review).
      options: rotate(CARD_RULES, c.cardLog.length).map((h) => ({ ruleId: h.id, label: cardSlot(h, lang) ?? "", chosen: h.id === rc.rule.id })),
      galleryLabel: rt.gallery,
      scenes: scenesView(rc.scenes, rc.rule, c.bank, lang),
      gallery: rc.gallery.map((g) => {
        const lit = new Set(g.shown?.failing ?? []);
        return {
          problemId: g.record.world.problem_id,
          statements: g.record.statements.map((st) => ({ index: st.index, text: st.text, tokens: [...st.tokens], lit: lit.has(st.index) })),
          world: g.shown?.world ?? null,
          stage: g.shown === null || g.shown === undefined ? null : objectScene(g.shown.world, g.record.world, { values: [] }),
          glowIds: [...new Set(g.record.statements.filter((st) => lit.has(st.index)).flatMap((st) => st.element_ids))],
        };
      }),
      next: rt.next,
    };
  }
  const p = c.problem;
  const juniorLine = c.line === null || c.line.text === "" ? null : c.line.text;
  if (p !== null && s.matches({ active: { problem: "help" } })) {
    const stage = (["read", "order", "offer"] as const).find((x) => s.matches({ active: { problem: { help: x } } })) ?? "read";
    return {
      ...common,
      screen: "help",
      stage,
      problemId: p.record.world.problem_id,
      statements: p.record.statements.map((st) => ({ index: st.index, text: st.text, tokens: [...st.tokens], isQuestion: st.is_question })),
      lit: stage === "read" ? p.help : null,
      line: juniorLine,
      choices:
        stage === "order"
          ? helpHolders(p).map((h) => ({ holderId: h, label: p.record.world.holders.find((x) => x.id === h)?.label ?? "" }))
          : [],
    };
  }
  if (p !== null && s.matches({ active: { problem: "guess" } })) {
    const gt = t.problem.guess;
    const name = (id: string): string => p.record.world.holders.find((h) => h.id === id)?.label ?? "";
    return {
      ...common,
      screen: "guess",
      problemId: p.record.world.problem_id,
      statements: p.record.statements.map((st) => ({ index: st.index, text: st.text, tokens: [...st.tokens], isQuestion: st.is_question })),
      label: gt.label,
      question: gt.question,
      cardLine: gt.card,
      optional: gt.optional,
      tapes: guessTapes(p, c.lang),
      one: p.guessOne,
      choices: [...guessHolders(p).map((h) => ({ holderId: h as string | null, label: name(h) })), { holderId: null, label: gt.unknown }],
      line: null,
      note: t.problem.note,
      gate: gateContext(p.record, c.lang),
    };
  }
  if (p !== null && s.matches({ active: { problem: "wordbook" } })) {
    const id = bookPageId({ ...c, lang });
    return { ...common, screen: "wordbook", problemId: p.record.world.problem_id, page: id === null ? null : wordbookPage(id, p.record, lang), line: juniorLine };
  }
  // The problem one sentence at a time (Q62), with its own end screens.
  if (p !== null && p.steps !== null) {
    const outcome = s.matches({ active: { problem: "steps" } }) ? "steps" : s.matches({ active: { problem: "solved" } }) ? "solved" : s.matches({ active: { problem: "held" } }) ? "held" : null;
    const v = outcome === null ? null : stepsView(p, lang, outcome);
    if (v !== null) return { ...common, ...v };
  }
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
  // A taught reading that builds the sentence's own world is drawn as the length order only (no "1" card, no
  // segment) until the child's own 1 is confirmed (指示書 第7.1節 手順3; Q29).
  const orderOnly = p.orderOnly && p.taughtOps.length === 0;
  return {
    ...common,
    screen: "problem",
    step,
    problemId: p.record.world.problem_id,
    statements: p.record.statements.map((st) => ({ index: st.index, text: st.text, tokens: [...st.tokens], isQuestion: st.is_question, lit: lit.has(st.index) })),
    world: p.shown.world,
    stage: objectScene(p.shown.world, p.record.world, { values: [p.unitValue, p.totalValue].filter((x): x is Rational => x !== null) }),
    relationId: p.relationId,
    one: orderOnly ? null : (rel?.reference ?? null),
    orderOnly,
    placement: p.placement,
    tappedWords: [...p.words],
    line: juniorLine,
    card: p.card,
    predict,
    note: t.problem.note,
    unitValue: p.unitValue,
    totalValue: p.totalValue,
    canPlace: step === "looking" || step === "placed",
    glowIds: [...new Set(p.record.statements.filter((st) => lit.has(st.index)).flatMap((st) => st.element_ids))],
    gate: gateContext(p.record, c.lang, [p.unitValue, p.totalValue].filter((x): x is Rational => x !== null)),
    voice: {
      canTalk: (step === "looking" || step === "placed") && !c.voiceOff && !p.listening && p.voiceTurns < MAX_VOICE_TURNS,
      listening: p.listening,
      off: c.voiceOff,
    },
  };
}

/** The scene drawn under a rule, or null when core's gate refuses it against any problem of the bank. */
function sceneItem(scene: Scene, rule: Hypothesis, focus: Hypothesis, bank: readonly ProblemRecord[], lang: Lang): SceneItemView | null {
  for (const record of bank) if (!gate({ kind: "show_scene", scene, lang }, gateContext(record, lang)).ok) return null;
  // Drawn with a rule other than the one core checked the scene for: core checks it again for this rule (a valid,
  // solvable world with positive amounts, nothing to avoid reached) or it is not drawn (safety review).
  if (rule.id !== focus.id && !checkScene(rule, scene.spec, scene.numbers, sceneAvoidValues(bank)).ok) return null;
  const v = viewScene(rule, scene);
  const labels = scene.labels[lang];
  return {
    key: scene.key,
    lines: [...scene.lines[lang]],
    commonSense: scene.commonSense[lang],
    lit: !v.holds,
    tapes: v.shape.tapes.map((t) => ({ quantityId: t.quantityId, holderId: t.holderId, label: labels[t.holderId] ?? "", length: t.length, segments: t.segments })),
    limit: v.shape.limit === null || scene.limitLabel === null ? null : { at: v.shape.limit, label: scene.limitLabel[lang] },
  };
}

/** Both scenes, or nothing: a scene core's gate refuses takes its pair off the screen. */
function scenesView(s: CardScenes | null, rule: Hypothesis, bank: readonly ProblemRecord[], lang: Lang): CardScreenView["scenes"] {
  if (s === null) return null;
  const t = ui(lang).ruleCard;
  try {
    const items = [s.pair.breaks.scene, s.pair.keeps.scene].map((sc) => sceneItem(sc, rule, s.focus, bank, lang));
    if (items.some((x) => x === null)) return null;
    return { label: t.scenes, note: t.scenesNote, drawing: t.sceneDrawing, items: items as SceneItemView[] };
  } catch {
    return null;
  }
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
      out.push(p.voice.talk, p.voice.stop, p.voice.listening, p.voice.unsupported, p.voice.denied, p.voice.off);
      out.push(t.draw.sentences, t.draw.glow, t.draw.world, t.draw.cardAria, t.draw.cardHere, t.draw.jagged(""));
      break;
    }
    case "steps": {
      // The problem one sentence at a time (Q62): every word the step screen shows (safety review S2).
      const st = stepsText(v.lang);
      out.push(st.label, st.progress(v.at, v.count), st.pad, st.nextProblem, t.pad.clear, t.pad.ok, t.reading.aloud, t.reading.stop, t.reading.furigana);
      out.push(...v.statements.map((s) => s.text), ...v.holders.map((h) => h.label));
      for (const x of [v.lead, v.question, v.again]) if (x !== null) out.push(x);
      if (v.choices !== null) out.push(...v.choices.map((c) => c.label));
      break;
    }
    case "help":
      out.push(t.help.label, t.help.read, t.help.orderLabel, t.help.open, t.help.later, t.problem.sentences);
      out.push(...v.statements.map((s) => s.text), ...v.choices.map((c) => c.label));
      if (v.line !== null) out.push(v.line);
      out.push(t.reading.aloud, t.reading.stop, t.reading.furigana);
      break;
    case "guess":
      out.push(v.label, v.question, v.cardLine, v.optional, t.problem.sentences, t.draw.world, t.draw.cardHere, t.draw.unknown);
      out.push(...v.statements.map((s) => s.text), ...v.tapes.flatMap((x) => [x.label, x.value, t.draw.tape(x.label)]), ...v.choices.map((c) => c.label));
      if (v.note !== null) out.push(v.note);
      out.push(t.reading.aloud, t.reading.stop, t.reading.furigana);
      break;
    case "wordbook":
      out.push(t.wordbook.label, t.wordbook.one, t.wordbook.close, t.draw.world, t.draw.cardHere);
      if (v.page !== null) out.push(v.page.title, ...v.page.lines, ...v.page.world.holders.map((h) => h.label));
      if (v.line !== null) out.push(v.line);
      out.push(t.reading.aloud, t.reading.stop, t.reading.furigana);
      break;
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
      out.push(t.consent.label, t.consent.child, ...v.lines, t.consent.yes, t.consent.no);
      break;
    case "research":
      out.push(t.research.label, ...v.lines);
      break;
    case "card":
      out.push(t.ruleCard.label, ...v.lines, v.slotLabel, ...v.options.map((o) => o.label), v.galleryLabel, v.next);
      if (v.card !== null) out.push(v.card);
      out.push(...v.gallery.flatMap((g) => g.statements.map((s) => s.text)));
      out.push(t.problem.sentences, t.problem.world, t.draw.sentences, t.draw.glow, t.draw.world, t.draw.jagged(""));
      if (v.scenes !== null) {
        out.push(v.scenes.label, v.scenes.note, v.scenes.drawing);
        for (const item of v.scenes.items) {
          out.push(...item.lines, item.commonSense, ...item.tapes.map((x) => x.label));
          if (item.limit !== null) out.push(item.limit.label);
        }
      }
      break;
    case "finished":
      out.push(t.finished.label, ...v.lines, t.finished.end);
      break;
  }
  return out;
}
