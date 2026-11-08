// @vitest-environment jsdom
// Teaching AI-kun in typed words (Q60), beside 「話して教える」: the same way in as the voice (onFinal), offered
// whenever the voice could be offered (canTalk), and also where the browser has no speech recognition or the mic is
// denied. Nothing typed is kept: the box empties when the words are sent.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VoicePanel } from "./VoicePanel.tsx";
import { FakeRecognizer } from "./fake.ts";
import { ui } from "../flow/text.ts";

afterEach(cleanup);
const t = ui("ja").problem;

function panel(o: { supported?: boolean; canTalk?: boolean; off?: boolean }) {
  const onFinal = vi.fn();
  render(
    <VoicePanel
      lang="ja"
      text={t.voice}
      typed={t.typed}
      make={(l) => new FakeRecognizer(l, o.supported ?? true)}
      canTalk={o.canTalk ?? true}
      off={o.off ?? false}
      onFinal={onFinal}
    />,
  );
  return onFinal;
}

describe("teaching by typing", () => {
  it("sends the typed words the way the voice does, and empties the box", async () => {
    const user = userEvent.setup();
    const onFinal = panel({});
    const box = screen.getByTestId("input-teach");
    await user.type(box, "AIくんが1だよ");
    await user.click(screen.getByTestId("btn-teach-send"));
    expect(onFinal).toHaveBeenCalledWith("AIくんが1だよ");
    expect((box as HTMLInputElement).value).toBe("");
  });

  it("sends with the Enter key too, and never sends empty words", async () => {
    const user = userEvent.setup();
    const onFinal = panel({});
    await user.type(screen.getByTestId("input-teach"), "   {Enter}");
    expect(onFinal).not.toHaveBeenCalled();
    await user.type(screen.getByTestId("input-teach"), "そらが1{Enter}");
    expect(onFinal).toHaveBeenCalledWith("そらが1");
  });

  it("is offered without speech recognition, beside the line that says the voice is not there", () => {
    panel({ supported: false });
    expect(screen.getByTestId("voice-note")).toBeTruthy();
    expect(screen.getByTestId("input-teach")).toBeTruthy();
    expect(screen.queryByTestId("btn-talk")).toBeNull();
  });

  it("is not offered when AI-kun cannot listen now, or when the words cannot be sent", () => {
    panel({ canTalk: false });
    expect(screen.queryByTestId("input-teach")).toBeNull();
    cleanup();
    panel({ off: true });
    expect(screen.queryByTestId("input-teach")).toBeNull();
  });

  it("has a name a screen reader says", () => {
    panel({});
    expect(screen.getByLabelText(t.typed.label)).toBe(screen.getByTestId("input-teach"));
  });
});
