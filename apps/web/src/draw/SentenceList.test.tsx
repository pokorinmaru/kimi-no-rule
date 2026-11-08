// @vitest-environment jsdom
// The problem's sentences (指示書 第5.7節, 第8.5節 文と世界の結び): a sentence glows only when core's
// check says it fails; the list never judges. Words can be tapped (指の操作).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readingsFor, type StatementCheck } from "@kimi/core";
import { signboardRecord } from "../../../../packages/core/fixtures/problems/signboard-record.ts";
import { SentenceList, splitByHolders } from "./SentenceList.tsx";
import { HOLDER_COLORS, holderColors } from "./holder-colors.ts";
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

  it("tells a screen reader that a glowing sentence does not fit the world, without judging words", () => {
    const { container } = render(<SentenceList statements={statements} checks={checks} reducedMotion />);
    const lit = container.querySelector('[data-glow="true"]');
    expect(lit?.textContent).toContain("合わない");
    expect(container.textContent).not.toMatch(/なりたち|成り立|おこりえ|まちがい|間違|正しい|せいかい|正解/);
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

  it("makes words buttons 44px tall, apart from each other, only when a tap is listened for", () => {
    const { rerender } = render(<SentenceList statements={statements} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    rerender(<SentenceList statements={statements} onTapWord={() => undefined} />);
    for (const b of screen.getAllByRole("button")) {
      expect(parseFloat(b.style.minHeight)).toBeGreaterThanOrEqual(44);
      // A word's target never reaches into its neighbour's (the middle of 「弟」 pressed 「の」, 2026-11-08).
      expect(b.style.margin === "" || parseFloat(b.style.marginLeft || "0") >= 0).toBe(true);
      expect(b.style.margin).not.toMatch(/-/);
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

describe("the holders' names in the stage picture's colours", () => {
  const holders = holderColors(signboardRecord.world.holders);

  it("colours each holder's name, with ruby kept, and leaves the other words as they are", () => {
    const { container } = render(<SentenceList statements={statements} holders={holders} readings={readingsFor("p_signboard")} />);
    const names = [...container.querySelectorAll<HTMLElement>('[data-role="holder-name"]')];
    const base = (n: Element): string => {
      const c = n.cloneNode(true) as Element;
      for (const rt of [...c.querySelectorAll("rt")]) rt.remove();
      return c.textContent ?? "";
    };
    expect(names.map(base)).toEqual(["兄", "弟", "弟"]);
    expect(names[0]?.querySelector("rt")).not.toBeNull();
    const ani = holders.find((h) => h.label === "兄")?.color.ink ?? "";
    const oto = holders.find((h) => h.label === "弟")?.color.ink ?? "";
    expect(ani).not.toBe(oto);
    expect(names[0]?.style.color).not.toBe(names[1]?.style.color);
    expect(container.querySelector("li")?.querySelector("rt")).not.toBeNull();
  });

  it("colours a tappable word that is a holder's name", () => {
    const { container } = render(<SentenceList statements={statements} holders={holders} onTapWord={() => undefined} />);
    const names = [...container.querySelectorAll('button[data-role="holder-name"]')];
    expect(names.map((n) => n.textContent)).toEqual(["兄", "弟", "弟"]);
  });

  it("cuts a text at the names, longest first", () => {
    const h = (label: string) => ({ label, color: HOLDER_COLORS[0] ?? { fill: "", ink: "", tape: "", tapeUnit: "", tapeEdge: "" } });
    expect(splitByHolders("赤い花と白い花", [h("白い花"), h("赤い花")]).map((p) => [p.text, p.holder?.label ?? null])).toEqual([
      ["赤い花", "赤い花"],
      ["と", null],
      ["白い花", "白い花"],
    ]);
  });
});
