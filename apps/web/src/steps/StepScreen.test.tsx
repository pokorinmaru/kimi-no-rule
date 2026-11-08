// @vitest-environment jsdom
// The step screen (Q62): on the English screen the one line that the problem is written in Japanese, as the old
// problem screen has; at the relation step (and only there, without the other reading's world) the voice and typing
// panel with its lead line; the fixed line when nothing could be used; and what was understood on top of the next
// screen. Written before the code.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createActor } from "xstate";
import { CHILD_FIRST_PROBLEM_ID, PREPARED_BANK, type Lang } from "@kimi/core";
import { flowMachine, type FlowEvent } from "../flow/machine.ts";
import { viewOf } from "../flow/view.ts";
import { FakeRecognizer, FakeSpeaker } from "../voice/fake.ts";
import { StepScreen } from "./StepScreen.tsx";

afterEach(cleanup);

const r = (num: number, den = 1) => ({ num, den });
const toAi = { op: "set_relation_reference", target_id: "r_ratio", reference: "q_ai", evidence: "" } as const;

function screenAfter(events: FlowEvent[], lang: Lang = "ja", canHear = true) {
  const a = createActor(flowMachine, { input: { introSeen: true, consented: true, bank: PREPARED_BANK, firstProblemId: CHILD_FIRST_PROBLEM_ID, stepFlow: true, lang } });
  a.start();
  for (const e of events) a.send(e);
  const v = viewOf(a.getSnapshot(), lang);
  if (v.screen !== "steps") throw new Error(`not the step screen: ${v.screen}`);
  const hear = vi.fn();
  const send = vi.fn();
  render(
    <StepScreen
      view={v}
      lang={lang}
      send={send}
      speaker={new FakeSpeaker()}
      furigana={false}
      onFurigana={() => undefined}
      stagePx={728}
      voice={{ make: (l) => new FakeRecognizer(l), canHear, hear }}
    />,
  );
  return { hear, send };
}

describe("the step screen", () => {
  it("says on the English screen that the problem is written in Japanese, and nothing of it on the Japanese one", () => {
    screenAfter([], "en");
    expect(screen.getByTestId("problem-note").textContent).toBe("The problem is written in Japanese.");
    cleanup();
    screenAfter([], "ja");
    expect(screen.queryByTestId("problem-note")).toBeNull();
  });

  it("offers words at the relation step with its lead line, and the typed words go to the session", () => {
    const { hear } = screenAfter([{ type: "STEP_NUMBER", value: r(8) }]);
    expect(screen.getByTestId("steps-voice-lead").textContent).toBe("ことばで こたえても いいよ");
    expect(screen.getByTestId("btn-talk")).toBeTruthy();
    fireEvent.change(screen.getByTestId("input-teach"), { target: { value: "AIくんの 3/4 だから" } });
    fireEvent.click(screen.getByTestId("btn-teach-send"));
    expect(hear).toHaveBeenCalledWith("AIくんの 3/4 だから");
  });

  it("offers no words on a number step, on the other reading's world, or without the worker", () => {
    screenAfter([]);
    expect(screen.queryByTestId("steps-voice")).toBeNull();
    cleanup();
    screenAfter([{ type: "STEP_NUMBER", value: r(8) }, { type: "STEP_CHOOSE", holderId: "h_ai" }]);
    expect(screen.queryByTestId("steps-voice")).toBeNull();
    cleanup();
    screenAfter([{ type: "STEP_NUMBER", value: r(8) }], "ja", false);
    expect(screen.queryByTestId("steps-voice")).toBeNull();
  });

  it("shows the fixed line when nothing could be used, and the buttons stay", () => {
    screenAfter([{ type: "STEP_NUMBER", value: r(8) }, { type: "VOICE_HEARD", transcript: "えーと" }, { type: "VOICE_OPS", ops: null }]);
    expect(screen.getByTestId("steps-voice-miss").textContent).toBe("うまく 聞きとれなかったよ。ボタンでも えらべるよ");
    expect(screen.getByTestId("btn-step-h_me")).toBeTruthy();
  });

  it("restates what was heard on top of the next screen (here the other reading's world), in English too", () => {
    const heardAi: FlowEvent[] = [{ type: "STEP_NUMBER", value: r(8) }, { type: "VOICE_HEARD", transcript: "AIくんの 3/4" }, { type: "VOICE_OPS", ops: [toAi] }];
    screenAfter(heardAi);
    expect(screen.getByTestId("steps-heard").textContent).toBe("AIくんは、「AIくんの 金魚と くらべる」と うけとったよ。");
    cleanup();
    screenAfter(heardAi, "en");
    expect(screen.getByTestId("steps-heard").textContent).toBe("AI-kun took it as: compared with AIくん's 金魚.");
  });
});
