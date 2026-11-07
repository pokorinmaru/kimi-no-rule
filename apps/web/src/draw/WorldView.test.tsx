// @vitest-environment jsdom
// The drawn world (指示書 第8.5節, 第8.7節): values counted from SVG elements by their data attributes,
// 「？」 where nothing may show, the 「1」 card as a mark (not a number), whole-tape placement by pointer
// and by keyboard alone (第8.4b節), and motion that turns off under reduced motion (第8.6節).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FRACTION_BANK, solve, toString, type WorldScene } from "@kimi/core";
import { signboard } from "../../../../packages/core/fixtures/problems/signboard.ts";
import { WorldView } from "./WorldView.tsx";
import { MOTION } from "./motion-tokens.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function textNodes(root: Node): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
    const t = (n.textContent ?? "").trim();
    if (t !== "") out.push(t);
  }
  return out;
}

const answerOf = (w: WorldScene): string => {
  const res = solve(w);
  if (res.kind !== "unique") throw new Error("unique expected");
  const v = res.values.get(w.question.target_id);
  if (v === undefined) throw new Error("answer expected");
  return toString(v);
};

const q = <T extends Element>(c: Element, sel: string): T[] => [...c.querySelectorAll<T>(sel)];

describe("values drawn (指示書 第8.7節 値のテスト)", () => {
  it("draws one tape per holder, with the unit tape marked", () => {
    const { container } = render(<WorldView world={signboard.correct} />);
    const tapes = q(container, '[data-role="tape"]');
    expect(tapes.map((t) => t.getAttribute("data-holder")).sort()).toEqual(["h_ani", "h_otouto"]);
    expect(container.querySelector('[data-role="tape"][data-unit="true"]')?.getAttribute("data-holder")).toBe("h_otouto");
  });

  it("draws the asked tape and every segment without a number", () => {
    const { container } = render(<WorldView world={signboard.correct} />);
    const asked = container.querySelector('[data-role="value"][data-holder="h_otouto"]');
    expect(asked?.getAttribute("data-value")).toBe("?");
    expect(asked?.textContent).toBe("？");
    const segments = q(container, '[data-role="segment"]');
    expect(segments).toHaveLength(7);
    for (const s of segments) {
      expect(s.textContent).toBe("");
      expect(s.hasAttribute("data-value")).toBe(false);
    }
  });

  it("never writes the answer as text, on any bank problem, before or after the card", () => {
    for (const record of FRACTION_BANK) {
      for (const cardHolder of [undefined, null]) {
        const { container, unmount } = render(
          <WorldView world={record.world} {...(cardHolder === undefined ? {} : { cardHolder })} />,
        );
        const answer = answerOf(record.world);
        for (const t of textNodes(container)) expect(t.includes(answer), `${record.world.problem_id}: ${t}`).toBe(false);
        unmount();
      }
    }
  });

  it("counts only numbers of the text: the 「1」 card is a mark, not a value", () => {
    const { container } = render(<WorldView world={signboard.correct} cardHolder={null} />);
    const numbers = q(container, '[data-role="value"]')
      .map((e) => e.getAttribute("data-value"))
      .filter((v) => v !== "?");
    expect(numbers).toEqual(["6"]);
    const card = container.querySelector('[data-role="reference_mark"]');
    expect(card?.textContent).toContain("1");
    expect(card?.closest('[data-role="value"]')).toBeNull();
    expect(card?.querySelector('[data-role="value"]')).toBeNull();
  });

  it("puts no number card on a tape with segments", () => {
    const { container } = render(<WorldView world={signboard.correct} />);
    expect(container.querySelector('[data-role="value"][data-holder="h_ani"]')).toBeNull();
    expect(q(container, '[data-role="tape"][data-holder="h_ani"] [data-role="segment"]')).toHaveLength(3);
  });

  it("draws lengths proportional to core's values", () => {
    const { container } = render(<WorldView world={signboard.correct} />);
    const w = (h: string): number => Number(container.querySelector(`[data-role="tape-bar"][data-holder="${h}"]`)?.getAttribute("width"));
    expect(w("h_otouto") / w("h_ani")).toBeCloseTo(4 / 3, 6);
  });

  it("draws no segments when the reading is the correct world", () => {
    const { container } = render(<WorldView world={signboard.correct} correct={signboard.correct} />);
    expect(q(container, '[data-role="segment"]')).toHaveLength(0);
  });

  it("marks a world that cannot happen and keeps its asked tape 「？」", () => {
    const { container } = render(<WorldView world={signboard.procedural} />);
    expect(container.querySelector("[data-impossible-world]")?.getAttribute("data-impossible-world")).toBe("true");
    const younger = container.querySelector('[data-role="tape"][data-holder="h_otouto"]');
    expect(younger?.getAttribute("data-impossible")).toBe("true");
    expect(container.querySelector('[data-role="value"][data-holder="h_otouto"]')?.textContent).toBe("？");
  });

  it("uses the world's holder labels", () => {
    render(<WorldView world={signboard.correct} />);
    expect(screen.getAllByText("兄").length).toBeGreaterThan(0);
    expect(screen.getAllByText("弟").length).toBeGreaterThan(0);
  });
});

describe("placing the 「1」 card on a whole tape (指示書 第8.4b節, 第11節 M4)", () => {
  it("places it by keyboard alone: focus, arrows to choose a tape, Enter", async () => {
    const user = userEvent.setup();
    const onPlaceCard = vi.fn();
    render(<WorldView world={signboard.correct} cardHolder={null} onPlaceCard={onPlaceCard} />);
    await user.tab();
    const card = screen.getByRole("button", { name: /「1」/ });
    expect(document.activeElement).toBe(card);
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");
    expect(onPlaceCard).toHaveBeenCalledTimes(1);
    expect(onPlaceCard).toHaveBeenCalledWith("h_otouto");
  });

  it("goes back with the up arrow, cancels with Escape and places with Space", async () => {
    const user = userEvent.setup();
    const onPlaceCard = vi.fn();
    render(<WorldView world={signboard.correct} cardHolder={null} onPlaceCard={onPlaceCard} />);
    await user.tab();
    await user.keyboard("{ArrowDown}{Escape}{Enter}");
    expect(onPlaceCard).not.toHaveBeenCalled();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowUp} ");
    expect(onPlaceCard).toHaveBeenCalledWith("h_ani");
  });

  it("announces the tape being chosen", async () => {
    const user = userEvent.setup();
    render(<WorldView world={signboard.correct} cardHolder={null} onPlaceCard={() => undefined} />);
    await user.tab();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("status").textContent).toContain("兄");
  });

  it("places it by dragging onto a tape", () => {
    const onPlaceCard = vi.fn();
    const { container } = render(<WorldView world={signboard.correct} cardHolder={null} onPlaceCard={onPlaceCard} />);
    const card = screen.getByRole("button", { name: /「1」/ });
    fireEvent.pointerDown(card, { clientX: 10, clientY: 10, pointerId: 1 });
    const target = container.querySelector('[data-drop-target="h_otouto"]');
    if (target === null) throw new Error("drop target expected");
    fireEvent.pointerMove(target, { clientX: 40, clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(target, { clientX: 40, clientY: 120, pointerId: 1 });
    expect(onPlaceCard).toHaveBeenCalledWith("h_otouto");
  });

  it("places it by tapping the card, then a tape", () => {
    const onPlaceCard = vi.fn();
    const { container } = render(<WorldView world={signboard.correct} cardHolder={null} onPlaceCard={onPlaceCard} />);
    const card = screen.getByRole("button", { name: /「1」/ });
    fireEvent.pointerDown(card, { clientX: 10, clientY: 10, pointerId: 1 });
    const svg = container.querySelector("svg");
    if (svg === null) throw new Error("svg expected");
    fireEvent.pointerUp(svg, { clientX: 10, clientY: 10, pointerId: 1 });
    expect(onPlaceCard).not.toHaveBeenCalled();
    const target = container.querySelector('[data-drop-target="h_ani"]');
    if (target === null) throw new Error("drop target expected");
    fireEvent.click(target);
    expect(onPlaceCard).toHaveBeenCalledWith("h_ani");
  });

  it("offers whole tapes only: one drop target per tape, none on a segment", () => {
    const { container } = render(<WorldView world={signboard.correct} onPlaceCard={() => undefined} />);
    expect(q(container, "[data-drop-target]")).toHaveLength(2);
    expect(q(container, '[data-role="segment"][data-drop-target], [data-role="segment"] [data-drop-target]')).toHaveLength(0);
  });

  it("draws the placed card over the whole tape", () => {
    const { container } = render(<WorldView world={signboard.correct} cardHolder="h_otouto" />);
    const card = container.querySelector('[data-role="reference_mark"]');
    const bar = container.querySelector('[data-role="tape-bar"][data-holder="h_otouto"]');
    expect(card?.getAttribute("data-on")).toBe("h_otouto");
    expect(card?.querySelector("rect")?.getAttribute("width")).toBe(bar?.getAttribute("width"));
  });

  it("is not a button when nobody listens for placement", () => {
    render(<WorldView world={signboard.correct} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("motion (指示書 第8.6節)", () => {
  let animate: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    animate = vi.fn(() => ({ cancel: () => undefined }));
    Object.defineProperty(Element.prototype, "animate", { value: animate, configurable: true, writable: true });
  });
  afterEach(() => {
    delete (Element.prototype as { animate?: unknown }).animate;
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it("grows the tapes with the grow preset and pulses glowing parts no faster than once a second", () => {
    render(<WorldView world={signboard.correct} glowIds={["q_ani"]} />);
    const timings = animate.mock.calls.map((c) => c[1] as KeyframeAnimationOptions);
    expect(timings.some((t) => t.duration === MOTION.grow.duration)).toBe(true);
    const pulses = timings.filter((t) => t.iterations === Infinity);
    expect(pulses.length).toBeGreaterThan(0);
    for (const p of pulses) expect(Number(p.duration)).toBeGreaterThanOrEqual(1000);
  });

  it("turns every animation off with the reducedMotion prop", () => {
    const { container } = render(<WorldView world={signboard.correct} glowIds={["q_ani"]} reducedMotion />);
    expect(animate).not.toHaveBeenCalled();
    expect(container.querySelector('[data-glow="true"]')).not.toBeNull();
  });

  it("turns every animation off when the system asks for reduced motion", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: query.includes("reduce"),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
    render(<WorldView world={signboard.correct} glowIds={["q_ani"]} />);
    expect(animate).not.toHaveBeenCalled();
  });
});

describe("glow (指示書 第8.5節 文と世界の結び)", () => {
  it("says 「合わない」 for a glowing sentence and an impossible world, never a judging word", () => {
    const { container } = render(
      <WorldView world={signboard.procedural} glowIds={["q_otouto"]} failingSentences={["これは、弟の金魚の数の3/4です。"]} reducedMotion />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("合わない");
    expect(text).not.toMatch(/なりたち|成り立|おこりえ|まちがい|間違|正しい|せいかい|正解/);
  });

  it("draws the child's own size of one segment on the 「1」 tape's segments, and nothing before", () => {
    const before = render(<WorldView world={signboard.correct} reducedMotion />);
    expect(q(before.container, '[data-role="segment-value"]')).toHaveLength(0);
    before.unmount();
    const { container } = render(<WorldView world={signboard.correct} unitValue={{ num: 2, den: 1 }} childNumbers={[{ num: 2, den: 1 }]} reducedMotion />);
    const labels = q(container, '[data-role="segment-value"]');
    expect(labels).toHaveLength(4);
    for (const l of labels) {
      expect(l.getAttribute("data-holder")).toBe("h_otouto");
      expect(l.textContent).toBe("2");
    }
  });

  it("glows the tapes of the given element ids only", () => {
    const { container } = render(<WorldView world={signboard.correct} glowIds={["q_ani"]} reducedMotion />);
    expect(container.querySelector('[data-role="tape"][data-holder="h_ani"]')?.getAttribute("data-glow")).toBe("true");
    expect(container.querySelector('[data-role="tape"][data-holder="h_otouto"]')?.getAttribute("data-glow")).toBe("false");
  });
});
