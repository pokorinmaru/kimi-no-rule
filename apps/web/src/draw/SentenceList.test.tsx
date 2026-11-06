// @vitest-environment jsdom
// The problem's sentences (指示書 第5.7節, 第8.5節 文と世界の結び): a sentence glows only when core's
// check says it fails; the list never judges. Words can be tapped (指の操作).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StatementCheck } from "@kimi/core";
import { signboardRecord } from "../../../../packages/core/fixtures/problems/signboard-record.ts";
import { SentenceList } from "./SentenceList.tsx";
import { AiBadge } from "./AiBadge.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const statements = signboardRecord.statements;
const checks: StatementCheck[] = [
  { index: 0, verdict: "holds", cues: [] },
  { index: 1, verdict: "fails", cues: [] },
  { index: 2, verdict: "undetermined", cues: [] },
];

describe("SentenceList", () => {
  it("shows every sentence with a number card", () => {
    const { container } = render(<SentenceList statements={statements} />);
    const items = [...container.querySelectorAll("li")];
    expect(items).toHaveLength(3);
    expect(items.map((li) => li.querySelector('[data-role="sentence-number"]')?.textContent)).toEqual(["1", "2", "3"]);
    expect(items[1]?.textContent).toContain("3/4");
  });

  it("glows only a sentence whose verdict from core is fails", () => {
    const { container } = render(<SentenceList statements={statements} checks={checks} reducedMotion />);
    const glow = [...container.querySelectorAll("li")].map((li) => li.getAttribute("data-glow"));
    expect(glow).toEqual(["false", "true", "false"]);
  });

  it("glows nothing without checks: it does not judge on its own", () => {
    const { container } = render(<SentenceList statements={statements} reducedMotion />);
    expect(container.querySelector('[data-glow="true"]')).toBeNull();
  });

  it("does not show judging words", () => {
    const { container } = render(<SentenceList statements={statements} checks={checks} reducedMotion />);
    expect(container.textContent).not.toMatch(/まちがい|間違い|ずれ|正しい|ただしい/);
  });

  it("emits the sentence and token index of a tapped word", async () => {
    const user = userEvent.setup();
    const onTapWord = vi.fn();
    render(<SentenceList statements={statements} onTapWord={onTapWord} />);
    const fraction = screen.getAllByRole("button").find((b) => b.textContent === "3/4");
    if (fraction === undefined) throw new Error("the 3/4 word expected");
    await user.click(fraction);
    expect(onTapWord).toHaveBeenCalledWith(1, 9);
  });

  it("makes words buttons of at least 44px only when a tap is listened for", () => {
    const { rerender } = render(<SentenceList statements={statements} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    rerender(<SentenceList statements={statements} onTapWord={() => undefined} />);
    for (const b of screen.getAllByRole("button")) {
      expect(parseFloat(b.style.minHeight)).toBeGreaterThanOrEqual(44);
      expect(parseFloat(b.style.minWidth)).toBeGreaterThanOrEqual(44);
    }
  });

  describe("motion", () => {
    let animate: ReturnType<typeof vi.fn>;
    beforeEach(() => {
      animate = vi.fn(() => ({ cancel: () => undefined }));
      Object.defineProperty(Element.prototype, "animate", { value: animate, configurable: true, writable: true });
    });
    afterEach(() => {
      delete (Element.prototype as { animate?: unknown }).animate;
    });

    it("pulses a failing sentence slowly, and not at all with reduced motion", () => {
      const { unmount } = render(<SentenceList statements={statements} checks={checks} />);
      const pulses = animate.mock.calls.map((c) => c[1] as KeyframeAnimationOptions);
      expect(pulses).toHaveLength(1);
      expect(Number(pulses[0]?.duration)).toBeGreaterThanOrEqual(1000);
      unmount();
      animate.mockClear();
      render(<SentenceList statements={statements} checks={checks} reducedMotion />);
      expect(animate).not.toHaveBeenCalled();
    });
  });
});

describe("AiBadge", () => {
  it("always shows 「AI」", () => {
    render(<AiBadge />);
    expect(screen.getByText("AI")).toBeTruthy();
  });
});
