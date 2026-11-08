// The AI-free check on screen (指示書 第7.3節; HANDOFF §3 F7・F8). Only the problem's sentences and a number
// pad: no junior, no world, no hint. core judges each answer (judgeCheck); the child hears only that the
// answer was kept. The buttons stay (原則7): "やめる" leaves the check, "わからない" leaves the problem (no 「つらい」, Q64).
import { useEffect, useRef, useState } from "react";
import { FRACTION_BANK, readingsFor, spokenText, type Lang, type ProblemRecord, type Rational } from "@kimi/core";
import { ui } from "../flow/text.ts";
import type { CheckItem, FlowStore } from "../store/store.ts";
import { AlwaysNav, Button, NumberPad } from "../ui/controls.tsx";
import { judgeCheck, pickCheckProblems } from "./check.ts";
import { checkText } from "./text.ts";
import { ReadingTools } from "../ui/ReadAloud.tsx";
import { RubyText } from "../ui/Ruby.tsx";
import { COLOR, SPACE, TYPE, prose } from "../ui/tokens.ts";
import { createSpeaker, type Speaker } from "../voice/speaker.ts";

const browserSpeaker: Speaker = createSpeaker();

export interface CheckModeProps {
  store: FlowStore;
  lang: Lang;
  /** Back to where the child came from. */
  onExit: () => void;
  bank?: readonly ProblemRecord[];
  /** 「読み上げ」 (指示書 第8.4b節): the browser's speech synthesis; a fake in the tests. */
  speaker?: Speaker;
  /** Ruby over the problem's kanji, and its switch (the app keeps the choice on the device). */
  furigana?: boolean;
  onFurigana?: (on: boolean) => void;
}

type Phase = "loading" | "answer" | "kept" | "done";

export function CheckMode({ store, lang, onExit, bank = FRACTION_BANK, speaker = browserSpeaker, furigana = true, onFurigana }: CheckModeProps) {
  const [readingIndex, setReadingIndex] = useState<number | null>(null);
  const [localFurigana, setLocalFurigana] = useState(furigana);
  const rubyOn = onFurigana === undefined ? localFurigana : furigana;
  const [problems, setProblems] = useState<ProblemRecord[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const items = useRef<CheckItem[]>([]);
  const saved = useRef(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [attempts, checks] = await Promise.all([store.listAttempts(), store.listChecks()]);
      const picked = pickCheckProblems(bank, {
        flow: attempts.map((a) => a.problemId),
        check: checks.flatMap((c) => c.items.map((i) => i.problemId)),
      });
      if (!live) return;
      setProblems(picked);
      setPhase(picked.length === 0 ? "done" : "answer");
    })();
    return () => {
      live = false;
    };
  }, [store, bank]);

  /** Saves what was given so far, once per check; nothing when no problem was answered or left. */
  const save = (): Promise<void> => {
    if (saved.current || items.current.length === 0) return Promise.resolve();
    saved.current = true;
    return store.addCheck(items.current);
  };

  const current = problems[index];
  const record = (outcome: CheckItem["outcome"]) => {
    if (current === undefined) return;
    items.current = [...items.current, { problemId: current.world.problem_id, consistency: current.consistency, outcome }];
  };
  const advance = () => {
    if (index + 1 >= problems.length) {
      setPhase("done");
      void save();
    } else {
      setIndex(index + 1);
      setPhase("answer");
    }
  };

  const onAnswer = (v: Rational) => {
    if (phase !== "answer" || current === undefined) return;
    record(judgeCheck(current, v) ? "right" : "not_right");
    setPhase("kept");
  };
  const onDontKnow = () => {
    if (phase !== "answer") return;
    record("skipped");
    advance();
  };
  const onStop = () => {
    void save();
    onExit();
  };

  const mathOn = phase === "answer" || phase === "kept";
  const t = ui(lang);
  const CHECK_TEXT = checkText(lang);
  return (
    <>
      {(
        <section aria-label={CHECK_TEXT.title}>
          <h2 style={{ fontSize: TYPE.large, margin: `0 0 ${String(SPACE.sm)}px` }}>{CHECK_TEXT.title}</h2>
          {phase === "loading" && <p>{t.preparing}</p>}
          {mathOn && current !== undefined && (
            <>
              <p style={prose}>
                <RubyText text={CHECK_TEXT.lead} on={rubyOn && lang === "ja"} />
              </p>
              <p style={{ color: COLOR.inkSoft, fontSize: TYPE.small }}>
                <RubyText text={CHECK_TEXT.progress(index + 1, problems.length)} on={rubyOn && lang === "ja"} />
              </p>
              {t.problem.note !== null && <p data-testid="problem-note">{t.problem.note}</p>}
              <ReadingTools
                lang={lang}
                // Only the problem's sentences: the check has no junior and no hint.
                lines={current.statements.map((s) => ({ text: spokenText(s.text, readingsFor(current.world.problem_id)), lang: "ja-JP" }))}
                speaker={speaker}
                onReading={setReadingIndex}
                furigana={rubyOn}
                onFurigana={onFurigana ?? setLocalFurigana}
              />
              <ol data-testid="check-problem" data-problem-id={current.world.problem_id} aria-label={t.problem.sentences} style={{ paddingLeft: 24 }}>
                {current.statements.map((s) => (
                  <li
                    key={s.index}
                    data-reading={readingIndex === s.index ? "true" : "false"}
                    style={readingIndex === s.index ? { outline: `4px solid ${COLOR.ink}`, outlineOffset: 2, background: COLOR.highlight } : {}}
                  >
                    <RubyText text={s.text} on={rubyOn} readings={readingsFor(current.world.problem_id)} />
                  </li>
                ))}
              </ol>
              {phase === "answer" && <NumberPad key={current.world.problem_id} label={CHECK_TEXT.pad} labelNode={<RubyText text={CHECK_TEXT.pad} on={rubyOn && lang === "ja"} />} onAnswer={onAnswer} lang={lang} />}
              {phase === "kept" && (
                <>
                  <p data-testid="check-line" aria-live="polite">
                    {CHECK_TEXT.kept}
                  </p>
                  <Button kind="primary" onClick={advance} testId="btn-check-next">
                    {CHECK_TEXT.next}
                  </Button>
                </>
              )}
            </>
          )}
          {phase === "done" && (
            <div data-testid="check-done">
              {CHECK_TEXT.done.map((l) => (
                <p key={l}>{l}</p>
              ))}
              <Button kind="primary" onClick={onExit} testId="btn-check-back">
                {CHECK_TEXT.back}
              </Button>
            </div>
          )}
        </section>
      )}
      {/* "Don't know" skips a problem, so it shows only while an answer can be given. */}
      <AlwaysNav lang={lang} onStop={onStop} {...(mathOn && phase === "answer" ? { onDontKnow } : {})} />
    </>
  );
}
