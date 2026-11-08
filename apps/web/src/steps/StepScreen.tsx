// One step of the problem on the screen (Q62): the sentences so far (this one lit, the later ones not yet shown),
// the picture of this step, and one question with its answers. No tape diagram, no "1" card, no word book here.
import { useState, type CSSProperties } from "react";
import { UI_READINGS, readingsFor, spokenText, type Lang, type StatementCheck } from "@kimi/core";
import { KohaiBeside } from "../draw/Kohai.tsx";
import { ObjectSceneView } from "../draw/ObjectScene.tsx";
import { SentenceList } from "../draw/SentenceList.tsx";
import { holderColors } from "../draw/holder-colors.ts";
import type { Session } from "../flow/session.ts";
import type { StepsView } from "./view.ts";
import { stepsText } from "./text.ts";
import { Button, NumberPad } from "../ui/controls.tsx";
import { ReadingTools, type ReadLine } from "../ui/ReadAloud.tsx";
import { RubyText } from "../ui/Ruby.tsx";
import { BORDER, COLOR, RADIUS, SPACE, TYPE, card, prose } from "../ui/tokens.ts";
import type { Speaker } from "../voice/speaker.ts";

const actions: CSSProperties = { display: "flex", gap: SPACE.md, flexWrap: "wrap", alignItems: "center", marginTop: SPACE.lg };

export function StepScreen({
  view,
  lang,
  send,
  speaker,
  furigana,
  onFurigana,
  stagePx,
}: {
  view: StepsView;
  lang: Lang;
  send: Session["send"];
  speaker: Speaker;
  furigana: boolean;
  onFurigana: (on: boolean) => void;
  stagePx: number;
}) {
  const t = stepsText(lang);
  const [readingIndex, setReadingIndex] = useState<number | null>(null);
  const problemReadings = readingsFor(view.problemId);
  const rubyUi = furigana && lang === "ja";
  // The step's own words read with the problem's readings too (the holders' names, the thing's noun).
  const readings = { ...UI_READINGS, ...problemReadings };
  const readLines: ReadLine[] = [
    ...view.statements.map((s) => ({ text: spokenText(s.text, problemReadings), lang: "ja-JP" })),
    ...[view.lead, view.question].filter((x): x is string => x !== null).map((x) => ({ text: lang === "ja" ? spokenText(x, problemReadings) : x, lang: lang === "ja" ? "ja-JP" : "en-US" })),
  ];
  // The current sentence is lit by the reading outline; the others are plain.
  const checks: StatementCheck[] = view.statements.map((s) => ({ index: s.index, verdict: "holds", cues: [] }) as StatementCheck);
  const lineIndex = readingIndex ?? view.current;
  return (
    <section aria-label={t.label} data-testid="screen-steps" data-step={view.kind} data-problem-id={view.problemId}>
      <p data-testid="steps-progress" style={{ margin: `0 0 ${String(SPACE.sm)}px`, color: COLOR.inkSoft, fontSize: TYPE.small }}>
        {t.progress(view.at, view.count)}
      </p>
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
