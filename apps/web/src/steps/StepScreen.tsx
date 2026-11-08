// One step of the problem on the screen (Q62): the sentences so far (this one lit, the later ones not yet shown),
// the picture of this step, and one question with its answers. No tape diagram, no "1" card, no word book here.
// At the relation step the child may also answer in words (voice or typing): the words go to the session, which
// sends them to /safety and /interpret; what comes back is checked by core before it chooses anything.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { UI_READINGS, readingsFor, spokenText, type Lang, type StatementCheck } from "@kimi/core";
import { KohaiBeside } from "../draw/Kohai.tsx";
import { ObjectSceneView } from "../draw/ObjectScene.tsx";
import { SentenceList } from "../draw/SentenceList.tsx";
import { holderColors } from "../draw/holder-colors.ts";
import type { Session } from "../flow/session.ts";
import { ui } from "../flow/text.ts";
import type { StepsView } from "./view.ts";
import { stepsText } from "./text.ts";
import { DealBoard } from "./DealBoard.tsx";
import { Button, NumberPad } from "../ui/controls.tsx";
import { ReadingTools, type ReadLine } from "../ui/ReadAloud.tsx";
import { RubyText } from "../ui/Ruby.tsx";
import { BORDER, COLOR, RADIUS, SPACE, TYPE, card, prose } from "../ui/tokens.ts";
import type { Speaker } from "../voice/speaker.ts";
import { VoicePanel, type RecognizerFactory } from "../voice/VoicePanel.tsx";

const actions: CSSProperties = { display: "flex", gap: SPACE.md, flexWrap: "wrap", alignItems: "center", marginTop: SPACE.lg };
const quiet: CSSProperties = { fontSize: TYPE.small, color: COLOR.inkSoft, margin: `0 0 ${String(SPACE.sm)}px` };

/** The child's voice and typing for the relation step: the recognizer, whether the session can hear, and where the words go. */
export interface StepVoiceHooks {
  make: RecognizerFactory;
  canHear: boolean;
  hear: (text: string) => void;
}

export function StepScreen({
  view,
  lang,
  send,
  speaker,
  furigana,
  onFurigana,
  stagePx,
  voice = null,
}: {
  view: StepsView;
  lang: Lang;
  send: Session["send"];
  speaker: Speaker;
  furigana: boolean;
  onFurigana: (on: boolean) => void;
  stagePx: number;
  /** Null when the session cannot hear (no worker): the buttons are the only way. */
  voice?: StepVoiceHooks | null;
}) {
  const t = stepsText(lang);
  const uiText = ui(lang);
  // The panel's notes on this screen point to the buttons (there is no card here).
  const voiceText = { ...uiText.problem.voice, ...t.voiceNotes };
  const [readingIndex, setReadingIndex] = useState<number | null>(null);
  // The child's own dealing came out the same on every plate: the answer pad is lit and the child is sent to it.
  const [dealEqual, setDealEqual] = useState(false);
  // AI-kun's line for the plates as the child moves the things (null: the step's own line).
  const [dealTalk, setDealTalk] = useState<string | null>(null);
  const dealKey = view.deal?.key ?? null;
  useEffect(() => {
    setDealEqual(false);
    setDealTalk(null);
  }, [dealKey]);
  const problemReadings = readingsFor(view.problemId);
  const rubyUi = furigana && lang === "ja";
  // The step's own words read with the problem's readings too (the holders' names, the thing's noun).
  const readings = { ...UI_READINGS, ...problemReadings };
  const readLines: ReadLine[] = [
    ...view.statements.map((s) => ({ text: spokenText(s.text, problemReadings), lang: "ja-JP" })),
    ...[view.heard, view.lead, view.question].filter((x): x is string => x !== null).map((x) => ({ text: lang === "ja" ? spokenText(x, problemReadings) : x, lang: lang === "ja" ? "ja-JP" : "en-US" })),
  ];
  // The current sentence is lit by the reading outline; the others are plain.
  const checks: StatementCheck[] = view.statements.map((s) => ({ index: s.index, verdict: "holds", cues: [] }) as StatementCheck);
  const lineIndex = readingIndex ?? view.current;
  const wide = useWide();
  // The 「せいかい！」 is brought into view: the child has just pressed the pad at the bottom of the page.
  const cheerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (view.cheer !== null) cheerRef.current?.scrollIntoView?.({ block: "center" });
  }, [view.cheer]);
  // One part after a wrong number (user request, 2026-11-08): the problem, AI-kun's words, the answer and the child's own
  // dealing on one screen, with no scrolling (two columns on a landscape tablet).
  if (view.deal !== null) {
    return (
      <section aria-label={t.label} data-testid="screen-steps" data-step={view.kind} data-deal="true" data-problem-id={view.problemId}>
        {view.note !== null && (
          <p data-testid="problem-note" style={quiet}>
            {view.note}
          </p>
        )}
        <div style={{ display: "grid", gridTemplateColumns: wide ? "minmax(0, 5fr) minmax(0, 6fr)" : "minmax(0, 1fr)", gap: SPACE.md, alignItems: "start" }}>
          <div>
            <KohaiBeside pose="look">
              <div>
                {(dealTalk ?? view.lead) !== null && (
                  <p data-testid="steps-lead" data-talk={dealTalk !== null ? "plates" : "step"} role="status" style={{ ...prose, fontSize: TYPE.small, lineHeight: 1.6, margin: `0 0 ${String(SPACE.xs)}px`, padding: `${String(SPACE.xs)}px ${String(SPACE.sm)}px`, border: `${String(BORDER.thin)}px solid ${COLOR.line}`, borderRadius: RADIUS.md, background: COLOR.surfaceSoft }}>
                    <RubyText text={dealTalk ?? view.lead ?? ""} on={rubyUi} readings={readings} />
                  </p>
                )}
                {/* Once the plates are the same, the question becomes the call to type one part (one screen: no new row). */}
                {dealEqual ? (
                  <p data-testid="deal-to-pad" style={{ ...prose, margin: 0, padding: `${String(SPACE.xs)}px ${String(SPACE.sm)}px`, borderRadius: RADIUS.md, background: COLOR.attention, fontWeight: 800, lineHeight: 1.5 }}>
                    <RubyText text={t.deal.toPad(view.deal.attempt.unitCounter)} on={rubyUi} readings={readings} />
                    <span aria-hidden="true"> 👇</span>
                  </p>
                ) : (
                  view.question !== null && (
                    <p data-testid="steps-question" style={{ ...prose, margin: 0, fontWeight: 700 }}>
                      <RubyText text={view.question} on={rubyUi} readings={readings} />
                    </p>
                  )
                )}
              </div>
            </KohaiBeside>
            {view.pad !== null && (
              <div
                data-testid="deal-pad"
                data-lit={dealEqual ? "true" : "false"}
                className={dealEqual ? "k-deal-glow" : undefined}
                style={{ marginTop: SPACE.xs, borderRadius: RADIUS.md, ...(dealEqual ? { outline: `4px solid ${COLOR.attention}`, outlineOffset: 2 } : {}) }}
              >
                <NumberPad key={`deal-${view.deal.key}`} lang={lang} label={view.pad} labelNode={<RubyText text={view.pad} on={rubyUi} />} onAnswer={(v) => send({ type: "STEP_NUMBER", value: v })} />
              </div>
            )}
          </div>
          <div>
            {/* The step's progress and the reading tools, as on every step (code review, 2026-11-08): in the plates' column,
                which has room, so the answer pad keeps one screen. */}
            <div style={{ display: "flex", alignItems: "center", gap: SPACE.md, flexWrap: "wrap", marginBottom: SPACE.xs }}>
              <p data-testid="steps-progress" style={{ margin: 0, color: COLOR.inkSoft, fontSize: TYPE.small }}>
                {t.progress(view.at, view.count)}
              </p>
              <ReadingTools lang={lang} lines={readLines} speaker={speaker} onReading={setReadingIndex} furigana={furigana} onFurigana={onFurigana} />
            </div>
            <div className="k-deal-sentences" style={{ ...card, padding: `0 ${String(SPACE.sm)}px`, marginBottom: SPACE.sm }}>
              <SentenceList statements={view.statements} readings={furigana ? problemReadings : null} readingIndex={lineIndex} holders={holderColors(view.holders)} checks={checks} label={t.label} lang={lang} />
            </div>
            <DealBoard key={view.deal.key} attempt={view.deal.attempt} lang={lang} holderLabel={view.holders[0]?.label ?? ""} mode={view.kind === "total" ? "total" : "unit"} onEqual={setDealEqual} onTalk={setDealTalk} ruby={rubyUi} readings={readings} />
          </div>
        </div>
      </section>
    );
  }
  return (
    <section aria-label={t.label} data-testid="screen-steps" data-step={view.kind} data-problem-id={view.problemId}>
      {view.note !== null && (
        <p data-testid="problem-note" style={quiet}>
          {view.note}
        </p>
      )}
      <p data-testid="steps-progress" style={{ margin: `0 0 ${String(SPACE.sm)}px`, color: COLOR.inkSoft, fontSize: TYPE.small }}>
        {t.progress(view.at, view.count)}
      </p>
      {view.heard !== null && (
        // What was understood from the child's words, restated (never judged).
        <p data-testid="steps-heard" style={{ ...prose, margin: `0 0 ${String(SPACE.sm)}px`, fontWeight: 700 }}>
          <RubyText text={view.heard} on={rubyUi} readings={readings} />
        </p>
      )}
      <ReadingTools lang={lang} lines={readLines} speaker={speaker} onReading={setReadingIndex} furigana={furigana} onFurigana={onFurigana} />
      <div style={{ ...card, padding: `${String(SPACE.sm)}px ${String(SPACE.lg)}px` }}>
        <SentenceList
          statements={view.statements}
          readings={furigana ? problemReadings : null}
          readingIndex={lineIndex}
          holders={holderColors(view.holders)}
          checks={checks}
          label={t.label}
          lang={lang}
          {...(view.lit === null ? {} : { litWords: view.lit })}
        />
      </div>
      {view.scene !== null && (
        <div data-role="world-card" style={{ ...card, marginTop: SPACE.lg, padding: SPACE.md }}>
          <div style={{ maxWidth: stagePx, margin: "0 auto" }}>
            <ObjectSceneView scene={view.scene} lang={lang} pagePx={stagePx} hideShare={view.hideShare} />
          </div>
        </div>
      )}
      <KohaiBeside pose={view.choices !== null ? "listen" : "look"}>
        <div>
          {view.lead !== null && (
            <p data-testid="steps-lead" style={{ ...prose, margin: `0 0 ${String(SPACE.sm)}px`, padding: `${String(SPACE.xs)}px ${String(SPACE.md)}px`, border: `${String(BORDER.thin)}px solid ${COLOR.line}`, borderRadius: RADIUS.md, background: COLOR.surfaceSoft }}>
              <RubyText text={view.lead} on={rubyUi} readings={readings} />
            </p>
          )}
          {view.question !== null && (
            <p data-testid="steps-question" style={{ ...prose, margin: 0, fontSize: TYPE.large, fontWeight: 700 }}>
              <RubyText text={view.question} on={rubyUi} readings={readings} />
            </p>
          )}
        </div>
      </KohaiBeside>
      {view.choices !== null && (
        <div role="group" aria-label={view.question ?? t.label} style={actions}>
          {view.choices.map((c) => (
            <Button key={c.holderId ?? "unknown"} kind="choice" onClick={() => send({ type: "STEP_CHOOSE", holderId: c.holderId })} testId={`btn-step-${c.holderId ?? "unknown"}`}>
              <RubyText text={c.label} on={rubyUi} readings={readings} />
            </Button>
          ))}
        </div>
      )}
      {view.voice !== null && voice !== null && voice.canHear && (
        <div data-testid="steps-voice" style={{ marginTop: SPACE.lg }}>
          <p data-testid="steps-voice-lead" style={{ ...prose, margin: 0 }}>
            <RubyText text={view.voice.lead} on={rubyUi} readings={readings} />
          </p>
          {view.voice.missed !== null && (
            <p data-testid="steps-voice-miss" role="status" style={{ ...prose, margin: `${String(SPACE.sm)}px 0 0` }}>
              <RubyText text={view.voice.missed} on={rubyUi} readings={readings} />
            </p>
          )}
          {view.voice.listening && (
            <p data-testid="steps-voice-listening" aria-live="polite" style={{ ...quiet, margin: `${String(SPACE.sm)}px 0 0` }}>
              <RubyText text={voiceText.listening} on={rubyUi} readings={readings} />
            </p>
          )}
          <VoicePanel lang={lang} text={voiceText} typed={uiText.problem.typed} make={voice.make} canTalk={view.voice.canTalk} off={view.voice.off} onFinal={voice.hear} />
        </div>
      )}
      {view.again !== null && (
        <p style={actions}>
          <Button kind="primary" onClick={() => send({ type: "STEP_AGAIN" })} testId="btn-step-again">
            <RubyText text={view.again} on={rubyUi} readings={readings} />
          </Button>
        </p>
      )}
      {view.pad !== null && (
        <div style={{ marginTop: SPACE.lg }}>
          <NumberPad key={`${view.kind}-${String(view.at)}`} lang={lang} label={view.pad} labelNode={<RubyText text={view.pad} on={rubyUi} />} onAnswer={(v) => send({ type: "STEP_NUMBER", value: v })} />
        </div>
      )}
      {view.cheer !== null && (
        // The solved screen (user request, 2026-11-08): a clear, happy 「せいかい！」 and the child's own answer.
        <div ref={cheerRef} data-testid="steps-cheer" role="status" className="k-cheer" style={{ ...card, textAlign: "center", padding: `${String(SPACE.md)}px ${String(SPACE.lg)}px`, marginTop: SPACE.lg, background: "#fff6d6", borderColor: "#f2c94c" }}>
          <p style={{ margin: 0, fontSize: 44, fontWeight: 800, letterSpacing: "0.08em", color: "#c0392b", lineHeight: 1.2 }}>
            <span aria-hidden="true" className="k-cheer-star">★</span> <RubyText text={view.cheer.title} on={rubyUi} readings={readings} /> <span aria-hidden="true" className="k-cheer-star">★</span>
          </p>
          <p style={{ ...prose, margin: `${String(SPACE.xs)}px 0 0`, fontSize: TYPE.large, fontWeight: 700 }}>
            <RubyText text={view.cheer.line} on={rubyUi} readings={readings} />
          </p>
        </div>
      )}
      {(view.kind === "solved" || view.kind === "held") && (
        <p style={actions}>
          <Button kind="primary" onClick={() => send({ type: "NEXT" })} testId="btn-next">
            <RubyText text={t.nextProblem} on={rubyUi} />
          </Button>
        </p>
      )}
    </section>
  );
}

/** A landscape tablet or wider: the child's dealing beside the problem, so nothing needs scrolling. */
function useWide(): boolean {
  const query = "(min-width: 900px)";
  const [wide, setWide] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const m = window.matchMedia(query);
    const on = (): void => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}
