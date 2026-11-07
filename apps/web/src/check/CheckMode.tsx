// The AI-free check on screen (指示書 第7.3節; HANDOFF §3 F7・F8). Only the problem's sentences and a number
// pad: no junior, no world, no hint. core judges each answer (judgeCheck); the child hears only that the
// answer was kept. The three buttons stay (原則7): "わからない" leaves the problem, "つらい" stops the math.
import { useEffect, useRef, useState } from "react";
import { FRACTION_BANK, type Lang, type ProblemRecord, type Rational } from "@kimi/core";
import { HELPLINE, hardLines } from "../flow/text.ts";
import type { CheckItem, FlowStore } from "../store/store.ts";
import { AlwaysNav, Button, NumberPad } from "../ui/controls.tsx";
import { judgeCheck, pickCheckProblems } from "./check.ts";
import { CHECK_TEXT } from "./text.ts";

export interface CheckModeProps {
  store: FlowStore;
  lang: Lang;
  /** Back to where the child came from. */
  onExit: () => void;
  /** When the session's own hard screen can be reached, "つらい" goes there; otherwise the check shows the
   * same lines with the math stopped. */
  onSessionHard?: () => void;
  bank?: readonly ProblemRecord[];
}

type Phase = "loading" | "answer" | "kept" | "done" | "hard";

export function CheckMode({ store, lang, onExit, onSessionHard, bank = FRACTION_BANK }: CheckModeProps) {
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
  const onHard = () => {
    void save();
    if (onSessionHard !== undefined) {
      onSessionHard();
      return;
    }
    if (phase !== "hard") void store.logSafety("hard_button");
    setPhase("hard");
  };

  const mathOn = phase === "answer" || phase === "kept";
  return (
    <>
      {phase === "hard" ? (
        <section aria-label="つらいとき" data-testid="screen-hard">
          {hardLines(lang).map((l) => (
            <p key={l}>{l}</p>
          ))}
          <h2 style={{ fontSize: 20 }}>{HELPLINE.title}</h2>
          <p>{HELPLINE.pending}</p>
          <Button onClick={onExit}>{CHECK_TEXT.close}</Button>
        </section>
      ) : (
        <section aria-label={CHECK_TEXT.title}>
          <h2 style={{ fontSize: 22 }}>{CHECK_TEXT.title}</h2>
          {phase === "loading" && <p>じゅんびしています…</p>}
          {mathOn && current !== undefined && (
            <>
              <p>{CHECK_TEXT.lead}</p>
              <p>{CHECK_TEXT.progress(index + 1, problems.length)}</p>
              <ol data-testid="check-problem" data-problem-id={current.world.problem_id} aria-label="問題の文" style={{ paddingLeft: 24 }}>
                {current.statements.map((s) => (
                  <li key={s.index}>{s.text}</li>
                ))}
              </ol>
              {phase === "answer" && <NumberPad key={current.world.problem_id} label={CHECK_TEXT.pad} onAnswer={onAnswer} />}
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
      <AlwaysNav onStop={onStop} {...(mathOn && phase === "answer" ? { onDontKnow } : {})} onHard={onHard} />
    </>
  );
}
