// The screens (指示書 第7.1節, HANDOFF §3 F1・F8・F9). Each screen draws only viewOf(snapshot); every number
// and world comes from core through the flow, and every tap goes back to the flow as an event.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CHILD_FIRST_PROBLEM_ID, CHILD_ROUTE, UI_READINGS, WORDBOOK_READINGS, gate, readingsFor, spokenText, type Lang, type ProblemRecord, type Rational, type Readings, type StatementCheck } from "@kimi/core";
import { AiBadge } from "./draw/AiBadge.tsx";
import { Kohai, KohaiBeside, KohaiSays } from "./draw/Kohai.tsx";
import type { KohaiPose } from "./flow/pose.ts";
import { SceneView } from "./draw/SceneView.tsx";
import { SentenceList, splitByHolders } from "./draw/SentenceList.tsx";
import { WorldView } from "./draw/WorldView.tsx";
import { ObjectSceneView } from "./draw/ObjectScene.tsx";
import { layoutStage, meetsSizes } from "./draw/stage-layout.ts";
import { holderColors } from "./draw/holder-colors.ts";
import { startSession, type Session } from "./flow/session.ts";
import { TRANSFER_LINKS, bankFor } from "./flow/bank.ts";
import { viewOf, type CardScreenView, type FlowSnapshot, type FlowView, type GuessView, type HelpView, type ProblemView, type WordbookView } from "./flow/view.ts";
import { ui, type UiText } from "./flow/text.ts";
import { cleanName, namedView, unnamed } from "./flow/name.ts";
import { openStore, type CheckRow, type FlowStore } from "./store/store.ts";
import { CheckMode } from "./check/CheckMode.tsx";
import { ParentNote, parentCard } from "./parent/ParentNote.tsx";
import { scoreOf } from "./check/check.ts";
import { checkText } from "./check/text.ts";
import { AlwaysNav, Button, HoldButton, NumberPad, Toggle } from "./ui/controls.tsx";
import { VoicePanel, type RecognizerFactory } from "./voice/VoicePanel.tsx";
import { createRecognizer } from "./voice/recognizer.ts";
import { createSpeaker, type Speaker } from "./voice/speaker.ts";
import { ReadingTools, type ReadLine } from "./ui/ReadAloud.tsx";
import { JuniorText, RubyText } from "./ui/Ruby.tsx";
import { Helplines } from "./ui/Helplines.tsx";
import { StepScreen } from "./steps/StepScreen.tsx";
import { StepsNote } from "./steps/StepsNote.tsx";
import { ParentWishes, WishScreen } from "./wish/Wish.tsx";
import { createHttpApi } from "./flow/api.ts";
import { BAR_SPACE, BORDER, COLOR, GLOBAL_CSS, PAGE, RADIUS, SPACE, TYPE, card, prose } from "./ui/tokens.ts";

/** The browser's own speech recognition, in the screen's language (the user chose the Web Speech API). */
const browserSpeech: RecognizerFactory = (lang) => createRecognizer(lang);

/** The browser's own speech synthesis for 「読み上げ」 (指示書 第8.4b節). */
const browserSpeaker: Speaker = createSpeaker();

/** Reading support on the problem screen and the check: read aloud and the furigana switch (kept on the device). */
interface ReadingHooks {
  speaker: Speaker;
  furigana: boolean;
  onFurigana: (on: boolean) => void;
}

/** What the problem screen needs for the child's voice: the recognizer, whether the session can hear, and where the final words go. */
interface VoiceHooks {
  make: RecognizerFactory;
  canHear: boolean;
  hear: (text: string) => void;
}

/** The heading the child sees in Japanese (ui(lang).title in the screen's language). The work's name is not
 * shown to the child: it would attribute the reading to the child (原則10, 指示書 第11節 M7). */
export const APP_TITLE = ui("ja").title;

// The page column: 760 px of content (the stage picture is laid out for 728 px inside the world's card), and room at
// the bottom for the band of the always-there buttons, so it never covers the last content.
const page: CSSProperties = {
  margin: "0 auto",
  padding: `${String(SPACE.lg)}px ${String(SPACE.lg)}px ${String(BAR_SPACE + SPACE.xl)}px`,
  boxSizing: "border-box",
  fontFamily: TYPE.font,
  fontSize: TYPE.body,
  lineHeight: TYPE.lineHeight,
  color: COLOR.ink,
};
/** The stage picture's width on the problem screen (px): the world's column on a landscape tablet, less its card's padding; else the page's. */
export const STAGE_PX = { split: 516, single: 728 } as const;

/**
 * Whether the app may use the two-column layout at all: false on the adults' try route, where the research note
 * beside the app leaves its column far narrower than the window (the split would crush the words' column).
 */
const SplitAllowed = createContext(true);

/** Whether the screen is wide enough for the two-column layout (ui/tokens.ts PAGE.splitAt); false where it cannot be told or is not allowed. */
function useSplit(): boolean {
  const allowed = useContext(SplitAllowed);
  const query = `(min-width: ${String(PAGE.splitAt)}px)`;
  const get = (): boolean => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  const [on, setOn] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const m = window.matchMedia(query);
    const f = (): void => setOn(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, [query]);
  return allowed && on;
}
/** The card around the junior's world: the stage picture and the tapes together. */
const worldCard: CSSProperties = { ...card, padding: `${String(SPACE.md)}px 14px`, margin: `${String(SPACE.md)}px 0` };
/** A screen's heading. */
const h2: CSSProperties = { fontSize: TYPE.large, lineHeight: 1.5, margin: `${String(SPACE.sm)}px 0 ${String(SPACE.md)}px` };
/** A short note in quieter text. */
const note: CSSProperties = { fontSize: TYPE.small, color: COLOR.inkSoft, margin: `0 0 ${String(SPACE.sm)}px` };
/** A row of buttons. */
const actions: CSSProperties = { display: "flex", gap: SPACE.md, flexWrap: "wrap", alignItems: "center", marginTop: SPACE.lg };
/** The line being read aloud: a fixed outline and a light ground (no motion). */
const readingStyle: CSSProperties = { outline: `4px solid ${COLOR.ink}`, outlineOffset: 2, background: COLOR.highlight };
/** The buttons every screen keeps (原則7): stop and don't know (no 「つらい」 button, Q64). */
function Always({ view, send }: { view: FlowView; send: Session["send"] }) {
  return (
    <AlwaysNav
      lang={view.lang}
      buttons={view.buttons}
      highlight={view.highlightButtons}
      onStop={() => send({ type: "STOP" })}
      // The math has stopped on these screens: "don't know" would do nothing there (Q30).
      {...(view.screen !== "hard" && view.screen !== "rest" ? { onDontKnow: () => send({ type: "DONT_KNOW" }) } : {})}
    />
  );
}

/** Fixed lines as prose, with furigana when it is on (the app's own words: UI_READINGS). */
function Lines({ lines, ruby }: { lines: readonly string[]; ruby: boolean }) {
  return (
    <>
      {lines.map((l) => (
        <p key={l} style={{ ...prose, margin: `0 0 ${String(SPACE.md)}px` }}>
          <RubyText text={l} on={ruby} />
        </p>
      ))}
    </>
  );
}

function ProblemScreen({ view, send, voice, reading }: { view: ProblemView; send: Session["send"]; voice: VoiceHooks | null; reading: ReadingHooks }) {
  const t = view.text.problem;
  const [readingIndex, setReadingIndex] = useState<number | null>(null);
  // The problem is written in Japanese on both screens; its readings are data next to the problem (core).
  const problemReadings = readingsFor(view.problemId);
  const ruby = reading.furigana;
  const rubyUi = reading.furigana && view.lang === "ja";
  // Read aloud: the problem's sentences, then the junior's line already on the screen (it has passed the gates).
  const readLines: ReadLine[] = [
    ...view.statements.map((s) => ({ text: spokenText(s.text, problemReadings), lang: "ja-JP" })),
    ...(view.line === null ? [] : [{ text: view.lang === "ja" ? spokenText(view.line, {}) : view.line, lang: view.lang === "ja" ? "ja-JP" : "en-US" }]),
  ];
  const checks: StatementCheck[] = view.statements.map((s) => ({ index: s.index, verdict: s.lit ? "fails" : "holds", cues: [] }) as StatementCheck);
  const rel = view.world.relations.find((r) => r.id === view.relationId);
  const ends = rel === undefined ? [] : [rel.subject, rel.reference].filter((x): x is string => x !== null);
  const holderOf = (q: string) => view.world.quantities.find((x) => x.id === q)?.holder;
  const placeOn = (holderId: string) => {
    const q = ends.find((e) => holderOf(e) === holderId);
    // The card covers a whole tape only; core's gate decides (指示書 第5.5節).
    if (q !== undefined && gate({ kind: "place_card", covers: "whole_tape" }, view.gate).ok) send({ type: "PLACE_ONE", quantityId: q });
  };
  const cardHolder = view.placement !== null ? holderOf(view.placement) ?? null : view.one !== null ? holderOf(view.one) ?? null : null;
  const answered: Record<string, Rational> = {};
  if (view.totalValue !== null) answered[view.world.question.target_id] = view.totalValue;
  const childNumbers = [view.unitValue, view.totalValue].filter((x): x is Rational => x !== null);
  const failing = view.statements.filter((s) => s.lit).map((s) => s.text);
  const stagePx = useSplit() ? STAGE_PX.split : STAGE_PX.single;

  return (
    <section aria-label={t.label} data-problem-id={view.problemId}>
      {view.note !== null && (
        <p data-testid="problem-note" style={note}>
          {view.note}
        </p>
      )}
      {view.card !== null && (
        <p
          data-testid="reading-card"
          style={{ display: "inline-block", padding: `${String(SPACE.xs)}px ${String(SPACE.lg)}px`, border: `${String(BORDER.thin)}px dashed ${COLOR.inkSoft}`, borderRadius: RADIUS.md, background: COLOR.surfaceSoft, margin: `0 0 ${String(SPACE.md)}px` }}
        >
          <RubyText text={view.card} on={rubyUi} />
        </p>
      )}
      {/* On a landscape tablet the words and the answers sit on the left, the junior's world on the right, so one
          screen holds all of it; narrower, the world comes between the words and the answers (screen check, 2026-11-08). */}
      <div className="k-split">
      <div className="k-text">
      <ReadingTools lang={view.lang} lines={readLines} speaker={reading.speaker} onReading={setReadingIndex} furigana={reading.furigana} onFurigana={reading.onFurigana} />
      <div style={{ ...card, padding: `${String(SPACE.sm)}px ${String(SPACE.lg)}px` }}>
        <SentenceList
          statements={view.statements}
          readings={ruby ? problemReadings : null}
          readingIndex={readingIndex}
          holders={holderColors(view.world.holders)}
          checks={view.step === "reading" ? null : checks}
          {...(view.canPlace ? { onTapWord: (i: number, t: number) => send({ type: "TAP_WORD", statementIndex: i, token: t }) } : {})}
          label={t.sentences}
          lang={view.lang}
        />
      </div>
      {/* No line, no row: a "…" would look like the junior thinking where it says nothing (Q30; run-through, 2026-11-08). */}
      {view.line !== null ? (
        <KohaiSays pose={view.pose} reading={readingIndex !== null && readingIndex === view.statements.length}>
          <JuniorText text={view.line} on={rubyUi} lang={view.lang} readings={problemReadings} />
        </KohaiSays>
      ) : (
        <KohaiBeside pose={view.pose} />
      )}
      </div>
      <div data-role="world-card" className="k-world" style={worldCard}>
        {view.stage !== null && (
          <div style={{ maxWidth: stagePx, margin: "0 auto" }}>
            <ObjectSceneView scene={view.stage} lang={view.lang} pagePx={stagePx} />
          </div>
        )}
        <WorldView
          {...(view.orderOnly ? { correct: view.world } : {})}
          world={view.world}
          cardHolder={cardHolder}
          childNumbers={childNumbers}
          unitValue={view.unitValue}
          answered={answered}
          glowIds={view.glowIds}
          failingSentences={view.step === "reading" ? [] : failing}
          label={t.world}
          lang={view.lang}
          {...(view.canPlace ? { onPlaceCard: placeOn } : {})}
        />
      </div>
      <div className="k-act">
      <div style={actions}>
        {view.predict !== null && (
          // The child's prediction about the junior's world, before any sentence lights (指示書 第7.1節 手順4).
          // The buttons look alike and none is chosen beforehand; their order changes on every problem.
          <div role="group" aria-label={view.predict.label} data-testid="predict" style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
            <p style={{ margin: 0, fontSize: TYPE.large, fontWeight: 700 }} data-testid="predict-question">
              <RubyText text={view.predict.question} on={rubyUi} />
            </p>
            <div style={{ display: "flex", gap: SPACE.md, flexWrap: "wrap" }}>
              {view.predict.choices.map((c) => (
                <Button key={c.answer} kind="choice" onClick={() => send({ type: "PREDICT", answer: c.answer })} testId={`btn-predict-${c.answer}`}>
                  {c.label}
                </Button>
              ))}
            </div>
          </div>
        )}
        {view.step === "looking" && (
          <p data-testid="looking-line" style={{ ...prose, margin: 0, fontWeight: 700 }}>
            <RubyText text={t.looking} on={rubyUi} />
          </p>
        )}
        {view.step === "placed" && (
          <>
            {/* Yes and no look alike: a filled "yes" would nudge the child to agree with the junior (screen check, 2026-11-08). */}
            <Button kind="choice" onClick={() => send({ type: "CONFIRM_YES" })} testId="btn-confirm-yes">
              {t.yes}
            </Button>
            <Button kind="choice" onClick={() => send({ type: "CONFIRM_NO" })} testId="btn-confirm-no">
              {t.no}
            </Button>
          </>
        )}
        {view.step === "rebuilt" && (
          <Button kind="primary" onClick={() => send({ type: "NEXT" })} testId="btn-next">
            {t.next}
          </Button>
        )}
        {(view.step === "solved" || view.step === "held") && (
          <Button kind="primary" onClick={() => send({ type: "NEXT" })} testId="btn-next">
            {t.nextProblem}
          </Button>
        )}
      </div>
      {view.step === "unit" && <NumberPad lang={view.lang} label={t.unitPad} labelNode={<RubyText text={t.unitPad} on={rubyUi} />} onAnswer={(v) => send({ type: "ANSWER_UNIT", value: v })} />}
      {view.step === "total" && <NumberPad lang={view.lang} label={t.totalPad} labelNode={<RubyText text={t.totalPad} on={rubyUi} />} onAnswer={(v) => send({ type: "ANSWER_TOTAL", value: v })} />}
      {voice !== null && voice.canHear && (
        // The child may tell the junior by talking (指示書 第7.1節 手順5), another way beside the answers; the card always stays.
        <div style={{ marginTop: SPACE.lg }}>
          <VoicePanel lang={view.lang} text={t.voice} typed={t.typed} make={voice.make} canTalk={view.voice.canTalk} off={view.voice.off} onFinal={voice.hear} />
        </div>
      )}
      </div>
      </div>
    </section>
  );
}

/**
 * The child's own first prediction, before the junior shows its world (指示書 第7.1節 手順2). The problem's sentences
 * (read aloud, with furigana), one plain outline per holder, all of one length with no segment, the optional "1" card
 * (tap a tape to put it there, tap it again to take it off), and one tap on who has more. The buttons look alike, none
 * is chosen beforehand, and nothing says whether an answer fits.
 */
const srOnly: CSSProperties = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" };

function GuessScreen({ view, send, reading }: { view: GuessView; send: Session["send"]; reading: ReadingHooks }) {
  const [readingIndex, setReadingIndex] = useState<number | null>(null);
  const problemReadings = readingsFor(view.problemId);
  const rubyUi = reading.furigana && view.lang === "ja";
  // Read aloud: the problem, then this step's own lines in the screen's language and each button's name, so a
  // child who listens knows what is asked and which button is whom (safety review, 2026-11-07).
  const uiVoice = view.lang === "ja" ? "ja-JP" : "en-US";
  const readLines: ReadLine[] = [
    ...view.statements.map((s) => ({ text: spokenText(s.text, problemReadings), lang: "ja-JP" as const })),
    ...(view.tapes.length > 0 ? [{ text: `${view.cardLine} ${view.optional}`, lang: uiVoice }] : []),
    { text: view.question, lang: uiVoice },
    ...view.choices.map((c) => (c.holderId === null ? { text: c.label, lang: uiVoice } : { text: spokenText(c.label, problemReadings), lang: "ja-JP" as const })),
  ];
  const draw = view.text.draw;
  const name = (label: string) => <RubyText text={label} on={reading.furigana} readings={problemReadings} />;
  const placeOne = (holderId: string | null) => {
    if (holderId === null || gate({ kind: "place_card", covers: "whole_tape" }, view.gate).ok) send({ type: "GUESS_ONE", holderId });
  };
  return (
    <section aria-label={view.label} data-testid="screen-guess" data-problem-id={view.problemId}>
      {view.note !== null && (
        <p data-testid="problem-note" style={note}>
          {view.note}
        </p>
      )}
      <h2 style={h2}>
        <RubyText text={view.label} on={rubyUi} />
      </h2>
      <div className="k-split">
      <div className="k-text">
      <ReadingTools lang={view.lang} lines={readLines} speaker={reading.speaker} onReading={setReadingIndex} furigana={reading.furigana} onFurigana={reading.onFurigana} />
      <div style={{ ...card, padding: `${String(SPACE.sm)}px ${String(SPACE.lg)}px` }}>
        <SentenceList statements={view.statements.map((s) => ({ ...s, lit: false }))} readings={reading.furigana ? problemReadings : null} readingIndex={readingIndex} checks={null} label={view.text.problem.sentences} lang={view.lang} />
      </div>
      </div>
      {view.tapes.length > 0 && (
        <div role="group" aria-label={draw.world} data-testid="guess-tapes" className="k-world" style={{ ...worldCard, display: "grid", gap: SPACE.md }}>
          <p style={{ margin: 0 }}>
            <RubyText text={view.cardLine} on={rubyUi} /> <RubyText text={view.optional} on={rubyUi} />
          </p>
          {view.tapes.map((t) => {
            const on = view.one === t.holderId;
            return (
              <div key={t.holderId} style={{ display: "flex", alignItems: "center", gap: SPACE.md }}>
                <span style={{ minWidth: 72, textAlign: "right", fontWeight: 700 }}>{name(t.label)}</span>
                {/* Every outline has the same length and no segment: nothing in the drawing leans to an answer. */}
                <button
                  type="button"
                  data-testid={`guess-tape-${t.holderId}`}
                  aria-pressed={on}
                  onClick={() => placeOne(on ? null : t.holderId)}
                  style={{
                    flex: "1 1 auto",
                    maxWidth: 420,
                    minHeight: 56,
                    border: `${String(BORDER.width)}px solid ${COLOR.outline}`,
                    borderRadius: RADIUS.sm,
                    background: COLOR.surface,
                    color: COLOR.ink,
                    fontFamily: "inherit",
                    fontSize: TYPE.body,
                    fontWeight: 700,
                    position: "relative",
                    cursor: "pointer",
                  }}
                >
                  {/* The accessible name holds the visible text (the tape's name, its label and the card). */}
                  <span style={srOnly}>{draw.tape(t.label)} </span>
                  {t.value}
                  {on && <span style={srOnly}> {draw.cardHere}</span>}
                  {on && (
                    <span data-role="reference_mark" style={{ position: "absolute", left: 6, top: 8, padding: "0 10px", borderRadius: RADIUS.sm, background: COLOR.ink, color: COLOR.surface, fontWeight: 700 }}>
                      1
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div role="group" aria-label={view.label} data-testid="guess" className="k-act" style={{ display: "flex", flexDirection: "column", gap: SPACE.md, marginTop: SPACE.lg }}>
        {/* The junior listens for the child's own guess (it has not read the problem yet). */}
        <KohaiBeside pose="listen">
          <p style={{ margin: 0, fontSize: TYPE.large, fontWeight: 700 }} data-testid="guess-question">
            <RubyText text={view.question} on={rubyUi} />
          </p>
        </KohaiBeside>
        <div style={{ display: "flex", gap: SPACE.md, flexWrap: "wrap" }}>
          {view.choices.map((c) => (
            <Button key={c.holderId ?? "unknown"} kind="choice" onClick={() => send({ type: "GUESS", larger: c.holderId })} testId={`btn-guess-${c.holderId ?? "unknown"}`}>
              {c.holderId === null ? <RubyText text={c.label} on={rubyUi} /> : name(c.label)}
            </Button>
          ))}
        </div>
      </div>
      </div>
    </section>
  );
}

/**
 * The junior's rule card (指示書 第7.1節 後輩のルールカード, 第2節 自分で直す). The child chooses who is taken as 1
 * in the card's slot; each choice goes to the flow, core builds every gallery world again and WorldView draws
 * the new worlds (the tapes grow again unless motion is reduced). Nothing here says right or wrong: the
 * sentences' light is the only feedback, and the asked value stays "？".
 */
function CardScreen({ view, send, ruby }: { view: CardScreenView; send: Session["send"]; ruby: boolean }) {
  const t = view.text;
  return (
    <section aria-label={t.ruleCard.label} data-testid="screen-card">
      <h2 style={h2}>
        <RubyText text={t.ruleCard.label} on={ruby} />
      </h2>
      <KohaiSays pose={view.pose} live={false} testId="card-lines">
        {view.lines.map((l) => (
          <p key={l} style={{ margin: 0 }}>
            <RubyText text={l} on={ruby} />
          </p>
        ))}
      </KohaiSays>
      <div style={{ margin: `${String(SPACE.md)}px 0`, padding: `${String(SPACE.md)}px ${String(SPACE.lg)}px`, border: `${String(BORDER.thin)}px dashed ${COLOR.inkSoft}`, borderRadius: RADIUS.md, background: COLOR.surfaceSoft }}>
        <p data-testid="rule-card" aria-live="polite" style={{ margin: `0 0 ${String(SPACE.sm)}px`, fontWeight: 700 }}>
          <RubyText text={view.card ?? ""} on={ruby} />
        </p>
        <div role="group" aria-label={view.slotLabel} data-testid="card-slot" style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
          {view.options.map((o) => (
            // The chosen option looks pressed only; no option is marked as better than another.
            <Toggle key={o.ruleId} dataRule={o.ruleId} testId={`card-option-${o.ruleId}`} pressed={o.chosen} onClick={() => send({ type: "CARD_PICK", ruleId: o.ruleId })}>
              {o.label}
            </Toggle>
          ))}
        </div>
      </div>
      <h3 style={{ fontSize: TYPE.body, margin: `${String(SPACE.lg)}px 0 ${String(SPACE.sm)}px` }}>
        <RubyText text={view.galleryLabel} on={ruby} />
      </h3>
      <ul data-testid="gallery" style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: SPACE.lg }}>
        {view.gallery.map((g) => {
          const checks: StatementCheck[] = g.statements.map((s) => ({ index: s.index, verdict: s.lit ? "fails" : "holds", cues: [] }) as StatementCheck);
          return (
            <li key={g.problemId} data-testid="gallery-item" data-problem-id={g.problemId} style={worldCard}>
              <SentenceList statements={g.statements} checks={checks} label={t.problem.sentences} lang={view.lang} {...(g.world !== null ? { holders: holderColors(g.world.holders) } : {})} />
              {g.stage !== null && <ObjectSceneView scene={g.stage} lang={view.lang} />}
              {g.world !== null && (
                <WorldView
                  world={g.world}
                  glowIds={g.glowIds}
                  failingSentences={g.statements.filter((s) => s.lit).map((s) => s.text)}
                  label={t.problem.world}
                  lang={view.lang}
                />
              )}
            </li>
          );
        })}
      </ul>
      {view.scenes !== null && (
        // 身近な場面で見てみる (指示書 第6.7節 手順5): two everyday scenes read with the card's rule; only the lit sentence says where it stops fitting.
        <section aria-label={view.scenes.label} data-testid="scenes" style={{ marginTop: SPACE.lg }}>
          <h3 style={{ fontSize: TYPE.body, margin: `0 0 ${String(SPACE.sm)}px` }}>
            <RubyText text={view.scenes.label} on={ruby} />
          </h3>
          <p style={{ ...prose, margin: `0 0 ${String(SPACE.sm)}px` }}>
            <RubyText text={view.scenes.note} on={ruby} />
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: SPACE.lg }}>
            {view.scenes.items.map((item) => (
              <li key={item.key} style={worldCard}>
                <SceneView item={item} drawing={view.scenes?.drawing ?? ""} lang={view.lang} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <p style={actions}>
        <Button kind="primary" onClick={() => send({ type: "NEXT" })} testId="btn-card-next">
          {view.next}
        </Button>
      </p>
    </section>
  );
}

/** The junior's line in its bubble with the AI mark, as on the problem screen. */
function JuniorLine({ line, reading, pose, ruby, lang, readings }: { line: string | null; reading: boolean; pose: KohaiPose; ruby: boolean; lang: Lang; readings: Readings }) {
  if (line === null) return <KohaiBeside pose={pose} />;
  return (
    <KohaiSays pose={pose} reading={reading}>
      <JuniorText text={line} on={ruby} lang={lang} readings={readings} />
    </KohaiSays>
  );
}

/**
 * The junior's staged questions for a child who is stuck (指示書 第7.1節 手順4・5). (a) The relation words of one
 * sentence are lit, all at the same strength, and the child may hear the sentence read; (b) "which is longer?"
 * with the two holders as buttons: the answer is kept and never judged; (c) the word book is offered. No world is
 * drawn here, and nothing names an answer or an operation.
 */
function HelpScreen({ view, send, reading }: { view: HelpView; send: Session["send"]; reading: ReadingHooks }) {
  const t = view.text.help;
  const [readingIndex, setReadingIndex] = useState<number | null>(null);
  const problemReadings = readingsFor(view.problemId);
  const sentence = view.lit === null ? null : (view.statements.find((s) => s.index === view.lit?.statementIndex) ?? null);
  const shown = sentence === null ? view.statements : [sentence];
  const readLines: ReadLine[] = [
    ...shown.map((s) => ({ text: spokenText(s.text, problemReadings), lang: "ja-JP" })),
    ...(view.line === null ? [] : [{ text: view.lang === "ja" ? spokenText(view.line, {}) : view.line, lang: view.lang === "ja" ? "ja-JP" : "en-US" }]),
  ];
  const lit = new Set(view.lit?.tokens ?? []);
  // Furigana on the sentences, the holders' names and the buttons, as on the problem screen (safety review, 2026-11-07).
  const rubyUi = reading.furigana && view.lang === "ja";
  const word = (text: string) => <RubyText text={text} on={reading.furigana} readings={problemReadings} />;
  return (
    <section aria-label={t.label} data-testid="screen-help" data-stage={view.stage}>
      <ReadingTools lang={view.lang} lines={readLines} speaker={reading.speaker} onReading={setReadingIndex} furigana={reading.furigana} onFurigana={reading.onFurigana} />
      <ol aria-label={view.text.problem.sentences} style={{ ...card, margin: 0, listStyle: "none" }}>
        {shown.map((s, i) => (
          <li key={s.index} data-statement={s.index} style={{ listStyle: "none", fontSize: TYPE.large, padding: `${String(SPACE.xs)}px ${String(SPACE.sm)}px`, borderRadius: RADIUS.sm, ...(readingIndex === i ? readingStyle : {}) }}>
            {s.tokens.map((tok, k) =>
              view.lit !== null && s.index === view.lit.statementIndex && lit.has(k) ? (
                // Every relation word of the sentence is lit the same way (no one of them stands out).
                <mark key={k} data-role="lit-word" style={{ background: COLOR.attention, borderRadius: 6, padding: "0 4px", margin: "0 2px", color: COLOR.ink }}>
                  {word(tok)}
                </mark>
              ) : (
                <span key={k}>{word(tok)}</span>
              ),
            )}
          </li>
        ))}
      </ol>
      <JuniorLine line={view.line} reading={readingIndex !== null && readingIndex === shown.length} pose={view.pose} ruby={rubyUi} lang={view.lang} readings={problemReadings} />
      <div style={actions}>
        {view.stage === "read" && (
          <Button kind="primary" onClick={() => send({ type: "NEXT" })} testId="btn-help-read">
            <RubyText text={t.read} on={rubyUi} />
          </Button>
        )}
        {view.stage === "order" && (
          // The two holders look alike; neither is chosen beforehand and nothing says which fits.
          <div role="group" aria-label={t.orderLabel} data-testid="help-order" style={{ display: "flex", gap: SPACE.md, flexWrap: "wrap" }}>
            {view.choices.map((c) => (
              <Button key={c.holderId} kind="choice" onClick={() => send({ type: "ORDER_GUESS", holderId: c.holderId })} testId={`btn-order-${c.holderId}`}>
                {word(c.label)}
              </Button>
            ))}
          </div>
        )}
        {view.stage === "offer" && (
          <>
            <Button kind="primary" onClick={() => send({ type: "OPEN_BOOK" })} testId="btn-open-book">
              <RubyText text={t.open} on={rubyUi} />
            </Button>
            <Button onClick={() => send({ type: "NEXT" })} testId="btn-help-later">
              <RubyText text={t.later} on={rubyUi} />
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * ことばの絵本 (指示書 第7.1節): one page for the problem's wording, an everyday example drawn as tapes with the "1"
 * card on the holder the wording takes as 1. Its numbers and holders are never the problem's (core decides).
 */
/** The word book's furigana: the app's own words and the pages' kanji (core's readings; run-through, 2026-11-08). */
const bookReadings = { ...UI_READINGS, ...WORDBOOK_READINGS };

/** The word book's two contrasting pictures side by side: each half of the page's 728 px less the gap. */
const CONTRAST_GAP = 16;
const CONTRAST_PX = (708 - CONTRAST_GAP) / 2;
/** One above the other, each picture stays this wide at most (a full-width picture drew plates larger than the page; screen check, 2026-11-08). */
const CONTRAST_STACKED_PX = 480;

function WordbookScreen({ view, send, reading }: { view: WordbookView; send: Session["send"]; reading: ReadingHooks }) {
  const t = view.text.wordbook;
  const [readingIndex, setReadingIndex] = useState<number | null>(null);
  const page = view.page;
  const sayLang = view.lang === "ja" ? "ja-JP" : "en-US";
  const say = (l: string): ReadLine => ({ text: view.lang === "ja" ? spokenText(l, bookReadings) : l, lang: sayLang });
  const readLines: ReadLine[] = [...(view.line === null ? [] : [say(view.line)]), ...(page === null ? [] : page.lines.map(say))];
  const oneLabel = page?.world.holders.find((h) => h.id === page.oneHolderId)?.label ?? "";
  const bookHolders = page === null ? [] : holderColors(page.world.holders);
  // The two contrasting pictures side by side when both keep the size rules at half the page, else one above the other.
  const contrastScenes = page?.contrast == null ? [] : [page.contrast.asWorded, ...(page.contrast.otherAsOne === null ? [] : [page.contrast.otherAsOne])];
  const contrastSide = contrastScenes.length === 2 && contrastScenes.every((sc) => {
    const l = layoutStage(sc, undefined, { counters: true, compact: true, pagePx: CONTRAST_PX });
    return l !== null && meetsSizes(l);
  });
  const oneColor = bookHolders.find((h) => h.id === page?.oneHolderId)?.color;
  const off = view.line === null ? 0 : 1;
  const title = page === null ? "" : view.lang === "ja" ? "「" + page.title + "」" : ' "' + page.title + '"';
  return (
    <section aria-label={t.label} data-testid="screen-wordbook" data-page={page?.id ?? ""}>
      <h2 style={h2}>
        <RubyText text={t.label} on={reading.furigana && view.lang === "ja"} readings={bookReadings} />
        <span data-testid="wordbook-title">{title}</span>
      </h2>
      <ReadingTools lang={view.lang} lines={readLines} speaker={reading.speaker} onReading={setReadingIndex} furigana={reading.furigana} onFurigana={reading.onFurigana} />
      <JuniorLine line={view.line} reading={readingIndex === 0 && off === 1} pose={view.pose} ruby={reading.furigana && view.lang === "ja"} lang={view.lang} readings={bookReadings} />
      {page !== null && (
        <>
          {page.lines.map((l, i) => (
            <p key={l} data-testid="wordbook-line" style={{ ...prose, margin: `${String(SPACE.xs)}px 0`, ...(readingIndex === i + off ? readingStyle : {}) }}>
              {/* The holders' names in the stage picture's colours, as on the problem screen. */}
              {splitByHolders(l, bookHolders).map((part, k) =>
                part.holder === null ? (
                  <RubyText key={k} text={part.text} on={reading.furigana && view.lang === "ja"} readings={bookReadings} />
                ) : (
                  <span key={k} data-role="holder-name" style={{ color: part.holder.color.ink, borderBottom: `3px solid ${part.holder.color.fill}` }}>
                    <RubyText text={part.text} on={reading.furigana && view.lang === "ja"} readings={bookReadings} />
                  </span>
                ),
              )}
            </p>
          ))}
          <p data-testid="wordbook-one" style={{ fontWeight: 700, margin: `${String(SPACE.md)}px 0` }}>
            {t.one} <span style={{ color: oneColor?.ink, borderBottom: oneColor === undefined ? undefined : `3px solid ${oneColor.fill}` }}>{oneLabel}</span>
          </p>
          {page.contrast !== null && (
            // Contrasting cases (指示書 第7.1節 ことばの絵本): the page's example read as the wording says, and read with the
            // other holder as 1. Each is captioned by which holder is taken as 1, never by a verdict.
            <div data-testid="wordbook-contrasts" data-side-by-side={contrastSide ? "true" : "false"} style={{ ...worldCard, display: "flex", flexWrap: "wrap", gap: CONTRAST_GAP }}>
              {[
                { scene: page.contrast.asWorded, caption: page.contrast.captions[0] },
                ...(page.contrast.otherAsOne === null ? [] : [{ scene: page.contrast.otherAsOne, caption: page.contrast.captions[1] ?? "" }]),
              ].map((c) => (
                <figure key={c.caption} data-testid="wordbook-contrast" style={{ flex: contrastSide ? `1 1 ${String(CONTRAST_PX - 4)}px` : "1 1 100%", minWidth: 0, margin: "0 auto", maxWidth: CONTRAST_STACKED_PX }}>
                  <figcaption data-testid="wordbook-caption" style={{ fontWeight: 700, margin: "0 0 4px" }}>
                    <RubyText text={c.caption} on={reading.furigana && view.lang === "ja"} readings={bookReadings} />
                  </figcaption>
                  <ObjectSceneView scene={c.scene} lang={view.lang} counters compact label={c.caption} pagePx={contrastSide ? CONTRAST_PX : CONTRAST_STACKED_PX} />
                </figure>
              ))}
            </div>
          )}
          <div style={worldCard}>
            <WorldView world={page.world} cardHolder={page.oneHolderId} label={view.text.draw.world} lang={view.lang} />
          </div>
        </>
      )}
      <p style={actions}>
        <Button kind="primary" onClick={() => send({ type: "NEXT" })} testId="btn-book-close">
          {t.close}
        </Button>
      </p>
    </section>
  );
}

/** The date and time of a check, for the grown-up (this device's clock). */
export function checkDate(at: string): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(d.getFullYear())}/${String(d.getMonth() + 1)}/${String(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The language switch (HANDOFF §7 の4): each language in its own words; the choice is kept on the device. */
function LangSwitch({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  const t = ui(lang).langSwitch;
  return (
    <div role="group" aria-label={t.label} style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap", margin: `${String(SPACE.sm)}px 0 ${String(SPACE.lg)}px` }}>
      {(["ja", "en"] as const).map((l) => (
        <Toggle key={l} lang={l} pressed={lang === l} testId={`lang-${l}`} onClick={() => onChange(l)}>
          {t[l]}
        </Toggle>
      ))}
    </div>
  );
}

/** The AI-free checks (指示書 第7.3節・第7.4節): per check, how many of the problems given were answered right. */
function CheckResults({ rows, text }: { rows: readonly CheckRow[]; text: UiText["parent"] }) {
  return (
    <div data-testid="check-results" style={parentCard}>
      <h3 style={{ fontSize: TYPE.large, margin: `0 0 ${String(SPACE.sm)}px` }}>{text.checksTitle}</h3>
      {rows.length === 0 ? (
        <p style={{ margin: 0, color: COLOR.inkSoft, fontWeight: 700 }}>{text.checksNone}</p>
      ) : (
        <ul>
          {rows.map((r) => {
            const { right, total } = scoreOf(r.items);
            return <li key={r.id ?? r.at}>{text.checkRow(checkDate(r.at), right, total)}</li>;
          })}
        </ul>
      )}
      <p style={{ ...prose, fontSize: TYPE.small, margin: `${String(SPACE.sm)}px 0 0` }}>{text.checksNote}</p>
    </div>
  );
}

const DANGER = COLOR.danger;

/** The grown-up's screen (F9): the language, the AI-free checks, the research note and its trend, and deleting every record on this device. */
function ParentScreen({
  store,
  lang,
  onLang,
  onDelete,
  onClose,
}: {
  store: FlowStore;
  lang: Lang;
  onLang: (l: Lang) => void;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const t = ui(lang).parent;
  const [asked, setAsked] = useState(false);
  const [done, setDone] = useState(false);
  const [checks, setChecks] = useState<CheckRow[]>([]);
  useEffect(() => {
    let live = true;
    void store.listChecks().then((rows) => {
      if (live) setChecks(rows);
    });
    return () => {
      live = false;
    };
  }, [store, done]);
  return (
    <section aria-label={t.label}>
      {/* もどる at the top too, so nobody has to scroll past everything to leave (screen check, 2026-11-08). */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SPACE.md, flexWrap: "wrap" }}>
        <h2 style={h2}>{t.label}</h2>
        <Button onClick={onClose} testId="btn-parent-back">{t.back}</Button>
      </div>
      <LangSwitch lang={lang} onChange={onLang} />
      <div style={parentCard}>
        {t.lines.map((l) => (
          <p key={l} style={{ ...prose, maxWidth: "44em", margin: `0 0 ${String(SPACE.sm)}px` }}>
            {l}
          </p>
        ))}
      </div>
      <StepsNote store={store} lang={lang} reload={done} />
      <ParentWishes store={store} t={t} />
      <CheckResults rows={checks} text={t} />
      <ParentNote store={store} lang={lang} reload={done} />
      {/* Deleting every record stands apart, in its own outlined area, and always asks first. */}
      <div data-role="danger-zone" style={{ margin: `${String(SPACE.xl)}px 0`, padding: `${String(SPACE.md)}px ${String(SPACE.lg)}px`, border: `${String(BORDER.thin)}px dashed ${DANGER}`, borderRadius: RADIUS.md }}>
      {!asked && (
        <Button kind="quiet" onClick={() => setAsked(true)} style={{ color: DANGER, borderColor: DANGER }}>
          {t.deleteAsk}
        </Button>
      )}
      {asked && !done && (
        <>
          <p>{t.deleteWarn}</p>
          <Button
            kind="primary"
            style={{ background: DANGER }}
            testId="btn-delete-all"
            onClick={() => {
              void onDelete().then(() => setDone(true));
            }}
          >
            {t.deleteYes}
          </Button>
          <Button onClick={() => setAsked(false)}>{t.deleteNo}</Button>
        </>
      )}
      {done && <p data-testid="deleted">{t.deleted}</p>}
      </div>
      <p>
        <a href="#/try" data-testid="link-try" style={{ color: COLOR.ink, fontSize: TYPE.small, textDecorationColor: COLOR.inkSoft, textUnderlineOffset: 4 }}>
          {t.tryLink}
        </a>
      </p>
    </section>
  );
}

function Screen({
  view,
  send,
  onLang,
  voice,
  reading,
}: {
  view: FlowView;
  send: Session["send"];
  onLang: (l: Lang) => void;
  voice: VoiceHooks | null;
  reading: ReadingHooks;
}) {
  const t = view.text;
  // The app's own fixed lines get furigana in Japanese while the switch is on (whole-screen review, 2026-11-08).
  const ruby = reading.furigana && view.lang === "ja";
  switch (view.screen) {
    case "intro":
      // The AI and privacy disclosure (原則10, 第9節) as a few short cards for the child, every fact kept; the same
      // facts in fuller words for the grown-up behind 「おうちの人へ」 on this screen. はじめる is the one main action.
      return (
        <section aria-label={t.intro.label} data-testid="screen-intro">
          <LangSwitch lang={view.lang} onChange={onLang} />
          <ol data-testid="intro-cards" style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: SPACE.lg }}>
            {t.intro.cards.map((c, i) => (
              <li key={c.title} data-role="intro-card" style={{ ...card, margin: 0 }}>
                <h2 style={{ display: "flex", alignItems: "center", gap: SPACE.md, fontSize: TYPE.large, lineHeight: 1.5, margin: `0 0 ${String(SPACE.sm)}px` }}>
                  <span aria-hidden="true" style={{ display: "inline-grid", placeItems: "center", width: 36, height: 36, flex: "none", borderRadius: RADIUS.pill, background: COLOR.surfaceSoft, border: `${String(BORDER.thin)}px solid ${COLOR.outline}`, fontSize: TYPE.small }}>
                    {String(i + 1)}
                  </span>
                  <span>
                    <RubyText text={c.title} on={ruby} />
                  </span>
                </h2>
                {i === 0 && (
                  // The first card is about the junior: it is shown here with its AI mark, as on every screen.
                  <span style={{ float: "right", display: "flex", flexDirection: "column", alignItems: "center", gap: SPACE.xs, margin: `0 0 ${String(SPACE.sm)}px ${String(SPACE.md)}px` }}>
                    <Kohai pose="read" />
                    <AiBadge />
                  </span>
                )}
                {c.lines.map((l) => (
                  <p key={l} style={{ ...prose, margin: `0 0 ${String(SPACE.sm)}px` }}>
                    <RubyText text={l} on={ruby} />
                  </p>
                ))}
              </li>
            ))}
          </ol>
          <p style={{ ...actions, justifyContent: "center", marginTop: SPACE.xl }}>
            <Button kind="primary" onClick={() => send({ type: "NEXT" })} testId="btn-next" style={{ minWidth: 280, minHeight: 68 }}>
              {t.intro.start}
            </Button>
          </p>
        </section>
      );
    case "consent":
      return (
        <section aria-label={t.consent.label} data-testid="screen-consent">
          {/* For the child: this part is the grown-up's (a line of the app, not the junior's). */}
          <p data-testid="consent-child" style={{ ...prose, maxWidth: "none", margin: `0 0 ${String(SPACE.md)}px`, padding: `${String(SPACE.sm)}px ${String(SPACE.lg)}px`, borderRadius: RADIUS.md, background: COLOR.highlight, fontWeight: 700 }}>
            <RubyText text={t.consent.child} on={ruby} />
          </p>
          <div style={card}>
            {view.lines.map((l, i) =>
              i === 0 ? (
                <h2 key={l} style={h2}>
                  {l}
                </h2>
              ) : (
                <p key={l} style={{ ...prose, maxWidth: "40em", fontSize: TYPE.small, lineHeight: 1.9, margin: `0 0 ${String(SPACE.md)}px` }}>
                  {l}
                </p>
              ),
            )}
          </div>
          <p style={actions}>
            {/* The two answers look alike: nothing nudges the grown-up to agree. */}
            <Button kind="choice" onClick={() => send({ type: "CONSENT_YES" })} testId="btn-consent-yes">
              {t.consent.yes}
            </Button>
            <Button kind="choice" onClick={() => send({ type: "CONSENT_NO" })}>{t.consent.no}</Button>
          </p>
        </section>
      );
    case "guess":
      return <GuessScreen view={view} send={send} reading={reading} />;
    case "problem":
      return <ProblemScreen view={view} send={send} voice={voice} reading={reading} />;
    case "steps":
      // The problem one sentence at a time (Q62): one column, so the picture stays under its sentence.
      return <StepScreen view={view} lang={view.lang} send={send} speaker={reading.speaker} furigana={reading.furigana} onFurigana={reading.onFurigana} stagePx={STAGE_PX.single} voice={voice} />;
    case "card":
      return <CardScreen view={view} send={send} ruby={ruby} />;
    case "help":
      return <HelpScreen view={view} send={send} reading={reading} />;
    case "wordbook":
      return <WordbookScreen view={view} send={send} reading={reading} />;
    case "research":
    case "finished":
      return (
        <section aria-label={view.screen === "research" ? t.research.label : t.finished.label}>
          <Lines lines={view.lines} ruby={ruby} />
          {view.screen === "finished" && (
            <p style={actions}>
              <Button kind="primary" onClick={() => send({ type: "NEXT" })} testId="btn-next">
                {t.finished.end}
              </Button>
            </p>
          )}
        </section>
      );
    case "stuck":
      return (
        <section aria-label={t.stuck.label}>
          <Lines lines={view.lines} ruby={ruby} />
          <p style={actions}>
            <Button kind="primary" onClick={() => send({ type: "RESUME" })} testId="btn-resume">
              {view.resume}
            </Button>
            {view.hold !== null && (
              <Button onClick={() => send({ type: "HOLD" })}>
                <RubyText text={view.hold} on={ruby} />
              </Button>
            )}
          </p>
        </section>
      );
    case "hard":
    case "rest":
      return (
        <section aria-label={view.screen === "hard" ? t.hard.label : t.rest.label} data-testid={`screen-${view.screen}`}>
          {/* A calm heading of its own: the app's title would not belong here (screen check, 2026-11-08). */}
          <h2 style={h2}>
            <RubyText text={view.screen === "hard" ? t.hard.label : t.rest.label} on={ruby} />
          </h2>
          <Lines lines={view.lines} ruby={ruby} />
          <Helplines helpline={view.helpline} lang={view.lang} furigana={reading.furigana} />
          <p style={actions}>
            <Button onClick={() => send({ type: "CLOSE" })}>{t.hard.close}</Button>
          </p>
        </section>
      );
    case "ended":
      return (
        <section aria-label={t.ended.label} data-testid="screen-ended">
          <p style={prose}>{t.ended.line}</p>
        </section>
      );
  }
}

/**
 * The top page (Q60): what the app is in two lines, the child's name (shown on the screen only, kept on this device),
 * and where to start: 「はじめる」, or 「つづきから」 and 「さいしょから」 while a session is under way. On the child's
 * route (Q64) 「はじめる」 is a list of the route's problems, since children are at different steps: the first card
 * keeps the start's test id; while a session is under way the list offers another problem to start from.
 */
function HomeScreen(props: {
  t: UiText;
  ruby: boolean;
  name: string;
  onName: (raw: string) => void;
  underWay: boolean;
  onStart: () => void;
  onResume: () => void;
  onRestart: () => void;
  /** 「AIくんに おねがいを いう」 (Q61). */
  onWish: () => void;
  /** The route's problems to start from (Q64), or null on the adults' old flow. */
  picks: readonly { id: string; title: string; note: string }[] | null;
  onPick: (id: string) => void;
}) {
  const { t } = props;
  const bad = props.name.trim() !== "" && cleanName(props.name) === null;
  return (
    <section aria-label={t.home.label} data-testid="screen-home">
      <KohaiBeside pose="read">
        <div>
          {t.home.lead.map((l) => (
            <p key={l} style={{ ...prose, fontSize: TYPE.large, margin: `0 0 ${String(SPACE.sm)}px` }}>
              <RubyText text={l} on={props.ruby} />
            </p>
          ))}
        </div>
      </KohaiBeside>
      <div style={{ margin: `${String(SPACE.lg)}px 0`, maxWidth: 420 }}>
        <label htmlFor="child-name" style={{ display: "block", fontWeight: 700, marginBottom: SPACE.sm }}>
          {t.home.nameLabel}
        </label>
        <input
          id="child-name"
          data-testid="input-name"
          type="text"
          value={props.name}
          maxLength={20}
          autoComplete="off"
          placeholder={t.home.nameHint}
          aria-invalid={bad}
          {...(bad ? { "aria-describedby": "child-name-bad" } : {})}
          onChange={(e) => props.onName(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", minHeight: 56, fontSize: TYPE.large, padding: "8px 14px", border: `2px solid ${bad ? COLOR.danger : COLOR.line}`, borderRadius: RADIUS.md, color: COLOR.ink, background: COLOR.surface }}
        />
        {bad && (
          <p id="child-name-bad" data-testid="name-bad" style={{ ...note, color: COLOR.danger, marginTop: SPACE.sm }}>
            {t.home.nameBad}
          </p>
        )}
      </div>
      {(props.underWay || props.picks === null) && (
        <p style={actions}>
          {props.underWay ? (
            <>
              <Button kind="primary" onClick={props.onResume} testId="btn-home-resume">
                {t.home.resume}
              </Button>
              <Button onClick={props.onRestart} testId="btn-home-restart">
                {t.home.restart}
              </Button>
            </>
          ) : (
            <Button kind="primary" onClick={props.onStart} testId="btn-home-start">
              {t.home.start}
            </Button>
          )}
        </p>
      )}
      {props.picks !== null && (
        <section data-testid="home-picks" aria-labelledby="home-picks-title" style={{ marginTop: SPACE.lg }}>
          <h2 id="home-picks-title" style={{ fontSize: TYPE.large, margin: `0 0 ${String(SPACE.md)}px` }}>
            <RubyText text={props.underWay ? t.home.pickOther : t.home.pickTitle} on={props.ruby} />
          </h2>
          <div style={{ display: "grid", gap: SPACE.md, gridTemplateColumns: "minmax(0, 1fr)", maxWidth: 560 }}>
            {props.picks.map((p, i) => (
              <Button
                key={p.id}
                kind={!props.underWay && i === 0 ? "primary" : "choice"}
                onClick={() => props.onPick(p.id)}
                testId={!props.underWay && i === 0 ? "btn-home-start" : `btn-pick-${p.id}`}
                problemId={p.id}
                style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", textAlign: "left", gap: SPACE.xs, minHeight: 88, width: "100%" }}
              >
                <span style={{ fontSize: TYPE.large, fontWeight: 800 }}>
                  <RubyText text={p.title} on={props.ruby} />
                </span>
                <span style={{ fontSize: TYPE.body, fontWeight: 400 }}>
                  <RubyText text={p.note} on={props.ruby} />
                </span>
              </Button>
            ))}
          </div>
        </section>
      )}
      {/* The child's own voice to the app's makers (Q61): quiet, apart from the start. */}
      <p style={{ ...actions, marginTop: SPACE.xl }}>
        <Button kind="quiet" onClick={props.onWish} testId="btn-wish">
          <RubyText text={t.wish.entry} on={props.ruby} />
        </Button>
      </p>
    </section>
  );
}

/** The screens with a problem open, where 「この問題をさいしょから」 is offered (Q60). */
const PROBLEM_SCREENS: ReadonlySet<string> = new Set(["guess", "problem", "help", "wordbook"]);

/** The screens that draw the junior with its AI mark (its line, or the junior beside the child). */
const JUNIOR_SCREENS: ReadonlySet<string> = new Set(["guess", "problem", "help", "wordbook", "card"]);

/** The screens laid out in two columns on a landscape tablet (the words and answers, and the world). */
const SPLIT_SCREENS: ReadonlySet<string> = new Set(["guess", "problem"]);

/** How long the grown-up holds 「おうちの人へ」 to open the parent screen (Q31). */
export const PARENT_HOLD_MS = 2000;

/** The child's bank: the prepared problems and the stored (discriminating and transfer) problems a person has checked (Q33・Q48). */
const CHILD_BANK = bankFor({ includeUnchecked: false });

/** The running session and its store, handed to the adults' try route (never drawn on the child's screens). */
export interface SessionHandle {
  session: Session;
  store: FlowStore;
}

export function App({
  storeName = "kimi-no-rule",
  api,
  parentHoldMs = PARENT_HOLD_MS,
  onSession,
  bank = CHILD_BANK,
  speech = browserSpeech,
  speaker = browserSpeaker,
  home: startAtHome = true,
  firstProblemId = CHILD_FIRST_PROBLEM_ID,
  stepFlow = true,
  split = true,
}: {
  storeName?: string;
  api?: Parameters<typeof startSession>[0]["api"];
  parentHoldMs?: number;
  /** The try route watches the same session for 「中身を見る」 and the simulated child; null when it stops. */
  onSession?: (h: SessionHandle | null) => void;
  /** The problems the flow chooses from; only the adults' try route passes one (with unchecked problems behind its toggle). */
  bank?: readonly ProblemRecord[];
  /** The speech recognizer for the child's voice (the browser's own; a fake in the tests). */
  speech?: RecognizerFactory;
  /** The speech synthesis for 「読み上げ」 (the browser's own; a fake in the tests). */
  speaker?: Speaker;
  /** Open on the top page (Q60); the tests of a single screen may start the session straight away. */
  home?: boolean;
  /** The problem the session opens with: the festival story on the child's route (Q60), when the bank has it. */
  firstProblemId?: string;
  /** The problem one sentence at a time (Q62): on for the child; the adults' try route keeps the old steps. */
  stepFlow?: boolean;
  /** The two-column layout on a wide window; off on the adults' try route, whose app column sits beside the note. */
  split?: boolean;
}) {
  const onSessionRef = useRef(onSession);
  onSessionRef.current = onSession;
  const [store, setStore] = useState<FlowStore | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [snap, setSnap] = useState<FlowSnapshot | null>(null);
  const [lang, setLang] = useState<Lang>("ja");
  const [parent, setParent] = useState(false);
  const [restart, setRestart] = useState(0);
  const [check, setCheck] = useState(false);
  const [furigana, setFurigana] = useState(true);
  const [home, setHome] = useState(startAtHome);
  // The problem the session opens with: the route's first unless the child picks another on the top page (Q64).
  const [startId, setStartId] = useState(firstProblemId);
  useEffect(() => setStartId(firstProblemId), [firstProblemId]);
  // A wish to AI-kun (Q61), opened from the top page. It talks to the server as the session does: the local server
  // when no api is given (the real app), the given one in the tests and the try route, none when null.
  const [wish, setWish] = useState(false);
  const wishApi = useMemo(() => (api === undefined ? createHttpApi() : api), [api]);
  // Whether the child has gone from the top page into the session in this run (「つづきから」 is offered only then).
  const [entered, setEntered] = useState(!startAtHome);
  // The name as typed on the top page; only a clean name is kept (on this device) and shown in the problem.
  const [nameDraft, setNameDraft] = useState("");
  const name = cleanName(nameDraft);

  useEffect(() => {
    let live = true;
    let s: Session | null = null;
    void (async () => {
      const st = await openStore(storeName);
      const settings = await st.getSettings();
      const furiganaOn = await st.getFurigana();
      // A transfer problem is offered only when it is in the bank (on the child's route: once a person has checked it).
      const first = bank.some((r) => r.world.problem_id === startId) ? { firstProblemId: startId } : {};
      const started = await startSession({ store: st, input: { bank, transfers: TRANSFER_LINKS, stepFlow, ...first }, ...(api === undefined ? {} : { api }) });
      if (!live) {
        started.stop();
        return;
      }
      s = started;
      setStore(st);
      setLang(settings.lang);
      setFurigana(furiganaOn);
      const kept = await st.getName();
      // A newer session may have been asked for while the name was read: this one is not handed out then.
      if (!live) {
        started.stop();
        return;
      }
      if (kept !== null) setNameDraft((d) => (d === "" ? kept : d));
      setSession(started);
      setSnap(started.actor.getSnapshot());
      started.actor.subscribe((x) => setSnap(x));
      onSessionRef.current?.({ session: started, store: st });
    })();
    return () => {
      live = false;
      if (s !== null) onSessionRef.current?.(null);
      s?.stop();
    };
  }, [storeName, api, restart, bank, startId, stepFlow]);

  const send = useMemo<Session["send"]>(() => (e) => session?.send(e), [session]);
  // The words heard go to the session only (in memory); nothing here keeps them.
  const voice = useMemo<VoiceHooks | null>(
    // The child's name in the words heard or typed goes back to the problem's placeholder before they are sent (Q60).
    () => (session === null ? null : { make: speech, canHear: session.canHear, hear: (text) => void session.hear(text, (t) => unnamed(t, name)) }),
    [session, speech, name],
  );
  // The screen's words follow the device's choice; the session takes it while no problem is open.
  const view = useMemo(() => (snap === null ? null : viewOf(snap, lang)), [snap, lang]);
  // The child's name goes into what is drawn only (Q60): the session, and so every request, keeps core's placeholder.
  const shown = useMemo(() => (view === null ? null : namedView(view, name)), [view, name]);
  const onName = (raw: string): void => {
    setNameDraft(raw);
    const clean = cleanName(raw);
    if (clean !== null || raw.trim() === "") void store?.setName(clean);
  };
  // A session is under way once it has left the intro and consent and has not ended.
  const underWay = entered && view !== null && !["intro", "consent", "ended"].includes(view.screen);
  const enter = (): void => {
    setEntered(true);
    setHome(false);
    setWish(false);
  };
  const startOver = (): void => {
    // The old session's screen goes at once, so nothing pressed meanwhile reaches it (the new one opens on its intro).
    setSnap(null);
    setSession(null);
    setRestart((n) => n + 1);
    enter();
  };
  const t = ui(lang);
  // The route's problems the top page offers (Q64): on the child's route only, those in the bank.
  const picks = stepFlow
    ? CHILD_ROUTE.flatMap((id) => {
        const label = t.home.picks[id];
        return label !== undefined && bank.some((r) => r.world.problem_id === id) ? [{ id, ...label }] : [];
      })
    : null;
  const pick = (id: string): void => {
    // The session already open on this problem and not yet begun: just go in; otherwise a new session from it.
    if (id === startId && !underWay && view?.screen !== "ended") {
      enter();
      return;
    }
    setStartId(id);
    startOver();
  };
  const reading = useMemo<ReadingHooks>(
    () => ({
      speaker,
      furigana,
      onFurigana: (on) => {
        setFurigana(on);
        void store?.setFurigana(on);
      },
    }),
    [speaker, furigana, store],
  );
  const changeLang = (l: Lang): void => {
    setLang(l);
    session?.send({ type: "SET_LANG", lang: l });
    void store?.setLang(l);
  };

  return (
    <SplitAllowed.Provider value={split}>
    <main className={!split ? "k-page k-nosplit" : view !== null && !parent && !check && SPLIT_SCREENS.has(view.screen) ? "k-page k-wide" : "k-page"} style={page} lang={lang}>
      <style>{GLOBAL_CSS}</style>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: SPACE.md, margin: `0 0 ${String(SPACE.md)}px` }}>
        {/* On a landscape tablet the junior's screens give the title's row to the problem and its world (it stays for screen readers). */}
        <h1 className={view !== null && !home && !parent && !check && JUNIOR_SCREENS.has(view.screen) ? "k-title-wide-hide" : undefined} style={{ fontSize: TYPE.title, lineHeight: 1.5, margin: 0, ...(view !== null && !parent && !check && (view.screen === "hard" || view.screen === "rest") ? srOnly : {}) }}>
          <RubyText text={t.title} on={furigana && lang === "ja"} />
        </h1>
        {/* The way back (Q60): the top page from every screen of the session, and the open problem from its start. */}
        {!home && !parent && !check && view !== null && (
          <nav aria-label={t.home.label} style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap", marginLeft: "auto" }}>
            {PROBLEM_SCREENS.has(view.screen) && !(view.screen === "problem" && (view.step === "solved" || view.step === "held")) && (
              <Button kind="quiet" onClick={() => send({ type: "RESTART_PROBLEM" })} testId="btn-problem-restart">
                {t.nav.restartProblem}
              </Button>
            )}
            <Button kind="quiet" onClick={() => setHome(true)} testId="btn-home">
              {t.nav.home}
            </Button>
          </nav>
        )}
        {/* The AI mark sits beside the junior where it is drawn; elsewhere it stays here, so every screen has it. */}
        {(home || !(view !== null && !parent && !check && JUNIOR_SCREENS.has(view.screen))) && <AiBadge />}
      </header>
      {view === null && <p>{t.preparing}</p>}
      {view !== null && store !== null && parent && (
        <ParentScreen
          store={store}
          lang={lang}
          onLang={changeLang}
          onClose={() => setParent(false)}
          onDelete={async () => {
            // Stop the session and let its last writes land first, so nothing is written back after the delete.
            session?.stop();
            await session?.settle();
            await store.deleteAll();
            // The name is gone from the device: it goes from the screen too (Q60); so is the picked problem (Q64).
            setNameDraft("");
            setStartId(firstProblemId);
            setRestart((n) => n + 1);
          }}
        />
      )}
      {view !== null && store !== null && check && !parent && (
        <CheckMode
          store={store}
          lang={lang}
          // The AI-free check takes the bank's problems of the type, not the route's story problems (Q60, Q64).
          bank={bank.filter((r) => !CHILD_ROUTE.includes(r.world.problem_id))}
          speaker={reading.speaker}
          furigana={reading.furigana}
          onFurigana={reading.onFurigana}
          onExit={() => setCheck(false)}
        />
      )}
      {view !== null && store !== null && home && wish && !parent && !check && (
        <WishScreen
          t={t}
          lang={lang}
          ruby={furigana && lang === "ja"}
          furigana={furigana}
          store={store}
          api={wishApi}
          outbound={(text) => unnamed(text, name)}
          onBack={() => setWish(false)}
        />
      )}
      {view !== null && home && !wish && !parent && !check && (
        <HomeScreen
          t={t}
          ruby={furigana && lang === "ja"}
          name={nameDraft}
          onName={onName}
          underWay={underWay}
          onStart={() => (view.screen === "ended" ? startOver() : enter())}
          onResume={enter}
          onRestart={startOver}
          onWish={() => setWish(true)}
          picks={picks !== null && picks.length > 0 ? picks : null}
          onPick={pick}
        />
      )}
      {shown !== null && !home && !parent && !check && (
        // Only the screens laid out in two columns use the landscape page's full width; the others keep one column.
        <Screen view={shown} send={send} onLang={changeLang} voice={voice} reading={reading} />
      )}
      {/* The grown-ups' doors: quiet, under the child's screen, apart from its one main action. */}
      {!parent && !check && !wish && view !== null && (home || view.screen === "intro" || view.screen === "consent" || view.screen === "ended") && (
        <section data-role="adult-doors" aria-label={t.parent.label} style={{ marginTop: SPACE.xxxl, padding: `${String(SPACE.md)}px ${String(SPACE.lg)}px`, border: `${String(BORDER.thin)}px solid ${COLOR.line}`, borderRadius: RADIUS.md, background: COLOR.surfaceSoft }}>
          {!home && view.screen === "intro" && (
            <details data-testid="intro-adult">
              <summary style={{ cursor: "pointer", fontSize: TYPE.small, fontWeight: 700, minHeight: 44, lineHeight: "44px" }}>{view.text.intro.adultTitle}</summary>
              {view.text.intro.adultLines.map((l) => (
                <p key={l} style={{ ...prose, fontSize: TYPE.small, margin: `${String(SPACE.sm)}px 0` }}>
                  {l}
                </p>
              ))}
            </details>
          )}
          <p style={{ display: "flex", gap: SPACE.md, flexWrap: "wrap", margin: `${String(SPACE.sm)}px 0 0` }}>
            {(home || view.screen === "intro" || view.screen === "ended") && (
              <Button kind="quiet" onClick={() => setCheck(true)} testId="btn-check">
                {checkText(lang).entry}
              </Button>
            )}
            <HoldButton onHold={() => setParent(true)} holdMs={parentHoldMs} testId="btn-parent">
              {t.parentDoor}
            </HoldButton>
          </p>
        </section>
      )}
      {/* The buttons are on the top page too (原則7・8): from there they go into the session first (Q60). */}
      {view !== null && !check && view.screen !== "ended" && (
        <Always
          view={view}
          send={
            home
              ? (e) => {
                  enter();
                  send(e);
                }
              : send
          }
        />
      )}
    </main>
    </SplitAllowed.Provider>
  );
}
