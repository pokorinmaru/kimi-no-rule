// @vitest-environment jsdom
// The stage picture above the tape (指示書 第8節): things counted from SVG elements by their data attributes.
// A misread world is drawn with its own values, cut pieces included; a value of the correct world the child
// has not said never shows, as text or as a count of things; the correct world keeps the asked holder 「？」.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import {
  COMMON_FRACTION_READINGS,
  FRACTION_BANK,
  UI_READINGS,
  eq,
  fromSchema,
  numbersIn,
  objectScene,
  rat,
  rubySegments,
  runRule,
  type ObjectScene,
  type ProblemRecord,
  type Rational,
  type WorldScene,
} from "@kimi/core";
import { ObjectSceneView } from "./ObjectScene.tsx";
import { MOTION } from "./motion-tokens.ts";
import { groupInner, innerOf, sourceOf } from "./parts.ts";
import { FOOT_SPAN, PART_BOX, PIECE_GAP, PLATE_INNER, THING_FILL, drawnSide, containerInnerOf, heightPx, layoutStage, meetsSizes, pxPerUnit, type StageLayout } from "./stage-layout.ts";
import { CONTAINER_PARTS, MAX_THINGS, PALETTE, VIEWBOX, containerPartFor } from "./assets/spec.ts";
import { ui } from "../flow/text.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const bank = (id: string): ProblemRecord => {
  const r = FRACTION_BANK.find((x) => x.world.problem_id === id);
  if (r === undefined) throw new Error(id);
  return r;
};
const rule = (id: string) => {
  const h = COMMON_FRACTION_READINGS.find((x) => x.id === id);
  if (h === undefined) throw new Error(id);
  return h;
};
const asDrawn = (w: WorldScene): WorldScene => ({
  ...w,
  quantities: w.quantities.map((q) => (q.id === w.question.target_id ? { ...q, value: null } : q)),
});
const sceneOf = (r: ProblemRecord, w: WorldScene, said: Rational[] = []): ObjectScene => {
  const s = objectScene(asDrawn(w), r.world, { values: said });
  if (s === null) throw new Error("scene");
  return s;
};
const q = <T extends Element>(c: ParentNode, sel: string): T[] => [...c.querySelectorAll<T>(sel)];

function textNodes(root: Node): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
    // A <style> is not text anyone sees or hears.
    if (n.parentElement?.tagName.toLowerCase() === "style") continue;
    const t = (n.textContent ?? "").trim();
    if (t !== "") out.push(t);
  }
  return out;
}

describe("the junior's misread signboard (6 goldfish dealt onto 4 dishes)", () => {
  const r = bank("p_signboard");
  const scene = sceneOf(r, runRule(rule("c_known_whole"), r));

  it("draws the older brother's 6 goldfish on 4 dishes, one and a half each, and the younger's 3 dishes", () => {
    const { container } = render(<ObjectSceneView scene={scene} reducedMotion />);
    const ani = q(container, '[data-role="thing"][data-holder="h_ani"]');
    expect(ani).toHaveLength(8);
    expect(ani.filter((t) => t.getAttribute("data-piece") === "1/2")).toHaveLength(4);
    expect(q(container, '[data-role="dish"][data-holder="h_ani"]')).toHaveLength(4);
    expect(q(container, '[data-role="dish"][data-holder="h_otouto"]')).toHaveLength(3);
    const oto = q(container, '[data-role="thing"][data-holder="h_otouto"]');
    expect(oto.filter((t) => t.getAttribute("data-piece") === "")).toHaveLength(3);
    expect(oto.filter((t) => t.getAttribute("data-piece") === "1/2")).toHaveLength(3);
  });

  it("a goldfish is cut like everything else (user decision, 2026-11-08): the half with its head, a straight cut edge", () => {
    const { container } = render(<ObjectSceneView scene={scene} reducedMotion />);
    const piece = container.querySelector('[data-role="thing"][data-piece="1/2"]');
    expect(piece?.getAttribute("data-part")).toBe("goldfish");
    expect(piece?.getAttribute("data-share")).toBe("cut");
    // A fish keeps its head (its right half); a piece of the tail alone would not read as part of a fish.
    expect(piece?.getAttribute("data-keep")).toBe("right");
    // Half of the fish you see: the cut is at the middle of the drawing's own width (PART_BOX), not of the box.
    const box = PART_BOX["goldfish"] ?? { x: 0, w: 100 };
    const mid = box.x + box.w / 2;
    expect(Number(piece?.querySelector("clipPath rect")?.getAttribute("x"))).toBeCloseTo(mid, 6);
    expect(Number(piece?.querySelector("clipPath rect")?.getAttribute("width"))).toBeCloseTo(100 - mid, 6);
    // The same size as a whole goldfish beside it.
    const whole = container.querySelector('[data-role="thing"][data-part="goldfish"][data-piece=""] > svg');
    expect(piece?.querySelector(":scope > svg")?.getAttribute("width")).toBe(whole?.getAttribute("width"));
    const edge = piece?.querySelector('[data-role="cut-edge"]');
    expect(edge?.tagName.toLowerCase()).toBe("line");
    expect(edge?.getAttribute("x1")).toBe(edge?.getAttribute("x2"));
    expect(Number(edge?.getAttribute("x1"))).toBeCloseTo(mid, 6);
    expect(piece?.querySelector('[data-role="ghost"]')).toBeNull();
  });

  it("the ghost half is an outline, not a white thing: no fill, a dashed stroke in the outline colour", () => {
    const { container } = render(<ObjectSceneView scene={scene} reducedMotion />);
    const css = container.querySelector("style")?.textContent ?? "";
    expect(css).toMatch(/\.stage-ghost \*[^}]*fill: none/);
    expect(css).toContain(`stroke: ${PALETTE.outline}`);
    expect(css).toMatch(/stroke-dasharray: \d+ \d+/);
  });

  it("a sticker is cut: clipped from the left, with a visible cut edge", () => {
    const { container } = render(<ObjectSceneView scene={scene} reducedMotion shareStyle={() => "cut"} />);
    const cut = container.querySelector('[data-role="thing"][data-piece="1/2"]');
    expect(cut?.getAttribute("data-share")).toBe("cut");
    const sbox = PART_BOX["goldfish"] ?? { x: 0, w: 100 };
    expect(Number(cut?.querySelector("clipPath rect")?.getAttribute("x"))).toBeCloseTo(sbox.x + sbox.w / 2, 6);
    // Things that are not fish keep their left part.
    const r3 = bank("p_bank_sticker");
    const s3 = render(<ObjectSceneView scene={sceneOf(r3, runRule(rule("c_swap"), r3))} reducedMotion />);
    const left = s3.container.querySelector('[data-role="thing"][data-part="sticker"][data-share="cut"]');
    expect(left?.getAttribute("data-keep")).toBe("left");
    expect(Number(left?.querySelector("clipPath rect")?.getAttribute("x"))).toBe(0);
    const st = PART_BOX["sticker"] ?? { x: 0, w: 100 };
    const keptW = Number(left?.querySelector("clipPath rect")?.getAttribute("width"));
    const share = Number((left?.getAttribute("data-piece") ?? "1/1").split("/")[0]) / Number((left?.getAttribute("data-piece") ?? "1/1").split("/")[1]);
    expect(keptW).toBeCloseTo(st.x + st.w * share, 6);
    s3.unmount();
    expect(cut?.querySelector('[data-role="cut-edge"]')).not.toBeNull();
    const desc = container.querySelector('[data-role="stage-description"]')?.textContent ?? "";
    expect(desc).toContain("はんぶんに きれた 金魚が あります");
    const r2 = bank("p_bank_sticker");
    const s2 = render(<ObjectSceneView scene={sceneOf(r2, runRule(rule("c_swap"), r2))} reducedMotion />);
    const sticker = s2.container.querySelector('[data-role="thing"][data-part="sticker"][data-share="cut"]');
    expect(sticker?.querySelector('[data-role="cut-edge"]')).not.toBeNull();
  });

  it("with the ghost setting (still available), a straight edge parts the solid half from the dashed missing half", () => {
    const { container } = render(<ObjectSceneView scene={scene} reducedMotion shareStyle={() => "ghost"} />);
    const piece = container.querySelector('[data-role="thing"][data-piece="1/2"]');
    expect(piece?.getAttribute("data-share")).toBe("ghost");
    expect(piece?.querySelector('[data-role="ghost"]')).not.toBeNull();
    const edge = piece?.querySelector('[data-role="cut-edge"]');
    expect(edge?.tagName.toLowerCase()).toBe("line");
    expect(edge?.getAttribute("x1")).toBe(edge?.getAttribute("x2"));
  });

  it("says what is drawn: the counts as drawn and a goldfish cut in half; never a verdict", () => {
    const { container } = render(<ObjectSceneView scene={scene} reducedMotion />);
    const desc = container.querySelector('[data-role="stage-description"]')?.textContent ?? "";
    expect(desc).toContain("はんぶんに きれた 金魚が あります");
    expect(desc).toContain("4まいの おさら");
    expect(desc).not.toContain("合わない");
    expect(desc).not.toContain("8");
    const en = render(<ObjectSceneView scene={scene} reducedMotion lang="en" />);
    const d2 = en.container.querySelector('[data-role="stage-description"]')?.textContent ?? "";
    expect(d2).toContain("cut in half");
    expect(d2).not.toContain("does not fit");
  });

  it("names each holder under its container in the holder's colour", () => {
    const { container } = render(<ObjectSceneView scene={scene} reducedMotion />);
    const tags = q(container, '[data-role="name-tag"]');
    expect(tags.map((t) => t.textContent)).toEqual(["兄", "弟"]);
    expect(tags[0]?.getAttribute("fill")).not.toBe(tags[1]?.getAttribute("fill"));
  });
});

describe("the correct world keeps the asked holder 「？」", () => {
  const r = bank("p_signboard");

  it("draws no goldfish for the younger brother and no dish before the child says one segment", () => {
    const { container } = render(<ObjectSceneView scene={sceneOf(r, r.world)} reducedMotion />);
    expect(q(container, '[data-role="thing"][data-holder="h_otouto"]')).toHaveLength(0);
    expect(container.querySelector('[data-role="stage-unknown"][data-holder="h_otouto"]')?.textContent).toBe("？");
    expect(q(container, '[data-role="thing"][data-holder="h_ani"]')).toHaveLength(6);
    expect(q(container, '[data-role="dish"]')).toHaveLength(0);
  });

  it("after the child answers 8, the younger brother's 8 goldfish are drawn", () => {
    const w: WorldScene = { ...r.world, quantities: r.world.quantities.map((x) => (x.id === "q_otouto" ? { ...x, value: { num: 8, den: 1 } } : x)) };
    const s = objectScene(w, r.world, { values: [{ num: 8, den: 1 }] });
    if (s === null) throw new Error("scene");
    const { container } = render(<ObjectSceneView scene={s} reducedMotion />);
    expect(q(container, '[data-role="thing"][data-holder="h_otouto"]')).toHaveLength(8);
  });
});

describe("no hidden correct value appears before the child says it (every bank problem, every common reading)", () => {
  const problems = FRACTION_BANK.filter((r) => r.world.item_kinds.every((k) => k.countable));
  for (const r of problems)
    for (const h of COMMON_FRACTION_READINGS)
      it(`${r.world.problem_id} ${h.id}`, () => {
        const s = sceneOf(r, runRule(h, r));
        const hidden = s.hidden.map(fromSchema);
        const isHidden = (n: number): boolean => hidden.some((x) => eq(x, rat(n)));
        const { container, unmount } = render(<ObjectSceneView scene={s} reducedMotion />);
        // As text: no number in the picture or its description is a hidden value. The number of dishes is a part of
        // the problem's own fraction (its denominator or numerator), so it may be said.
        const dishCounts = s.holders.map((x) => x.dishes).filter((d) => d > 0);
        for (const t of textNodes(container))
          for (const v of numbersIn(t.replace(/(\d+)まいの おさら/g, (m, d: string) => (dishCounts.includes(Number(d)) ? "" : m))))
            expect(hidden.some((x) => eq(x, fromSchema(v))), `${t}`).toBe(false);
        for (const holder of s.holders) {
          const things = q(container, `[data-role="thing"][data-holder="${holder.holderId}"]`);
          const wholes = things.filter((t) => t.getAttribute("data-piece") === "").length;
          if (!holder.given) {
            // As a count: neither all of a holder's things nor its whole things.
            if (things.length > 0) expect(isHidden(wholes), `${holder.label} wholes ${String(wholes)}`).toBe(false);
          }
          for (let d = 0; d < holder.dishes; d++) {
            const onDish = things.filter((t) => t.getAttribute("data-dish") === String(d));
            const w = onDish.filter((t) => t.getAttribute("data-piece") === "").length;
            expect(isHidden(w), `${holder.label} dish ${String(d)}`).toBe(false);
          }
        }
        unmount();
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
  });
  const r = bank("p_signboard");
  const scene = sceneOf(r, runRule(rule("c_known_whole"), r));

  it("deals the things from the container onto the dishes with the move preset, a few at a time, within 1.2 s of start", () => {
    render(<ObjectSceneView scene={scene} reducedMotion={false} />);
    expect(animate).toHaveBeenCalled();
    const opts = animate.mock.calls.map((c) => c[1] as KeyframeAnimationOptions);
    for (const o of opts) {
      expect(o.duration).toBe(MOTION.move.duration);
      expect(o.easing).toBe(MOTION.move.easing);
      expect(Number(o.delay)).toBeLessThanOrEqual(1200);
    }
    const frames = animate.mock.calls.map((c) => c[0] as Keyframe[]);
    for (const f of frames) for (const k of f) expect(Object.keys(k).every((x) => x === "transform" || x === "opacity" || x === "offset")).toBe(true);
  });

  it("does not move with reduced motion; the final picture is the same", () => {
    const a = render(<ObjectSceneView scene={scene} reducedMotion />);
    expect(animate).not.toHaveBeenCalled();
    const ids = (html: string): string => html.replace(/_r_\w+?_/g, "id");
    const still = ids(a.container.innerHTML);
    a.unmount();
    const b = render(<ObjectSceneView scene={scene} reducedMotion={false} />);
    expect(ids(b.container.innerHTML)).toBe(still);
  });
});

describe("the parts loader", () => {
  it("reads the back and front layers of a container, nested groups kept", () => {
    const src = '<svg viewBox="0 0 240 180"><g id="back"><g><rect/></g><circle/></g><g id="front"><path/></g></svg>';
    expect(groupInner(src, "back")).toBe("<g><rect/></g><circle/>");
    expect(groupInner(src, "front")).toBe("<path/>");
    expect(innerOf('<svg viewBox="0 0 1 1"><rect/></svg>')).toBe("<rect/>");
  });

  it("uses a part's file when there is one and a placeholder otherwise", () => {
    expect(sourceOf("goldfish", { "./assets/parts/goldfish.svg": "<svg>real</svg>" })).toBe("<svg>real</svg>");
    expect(sourceOf("goldfish", {})).toContain("<svg");
    // Every container id of the contract has a two-layer placeholder, the cooler too.
    for (const c of CONTAINER_PARTS) {
      expect(groupInner(sourceOf(c, {}), "back"), c).not.toBe("");
      expect(groupInner(sourceOf(c, {}), "front"), c).not.toBe("");
    }
    expect(containerPartFor("fish")).toBe("cooler");
  });

  // Each holder is its own panel, l.width wide in its own units, drawn pxPerUnit(l) px per unit on a 1024 screen
  // (the page is 760 wide with a 16 px gutter). A thing is drawn THING_FILL of its cell.
  const drawnPx = (l: StageLayout, size: number): number => size * THING_FILL * pxPerUnit(l);
  const overlap = (a: { x: number; y: number; size: number }, b: { x: number; y: number; size: number }): boolean =>
    !(a.x + a.size <= b.x + 1e-9 || b.x + b.size <= a.x + 1e-9 || a.y + a.size <= b.y + 1e-9 || b.y + b.size <= a.y + 1e-9);
  const withCounts = (r: ProblemRecord, counts: number[]): ObjectScene => {
    const base = sceneOf(r, r.world);
    return { ...base, share: null, holders: base.holders.map((h, i) => ({ ...h, hidden: false, dishes: 0, count: { wholes: counts[i] ?? 0, piece: null } })) };
  };

  it("sizes things by how many must fit: large for few (about 72 px), never drawn below 26 px up to MAX_THINGS, none overlapping", () => {
    const r = bank("p_bank_card");
    let prev = Infinity;
    for (const count of [1, 6, 9, 18, 54, MAX_THINGS]) {
      const l = layoutStage(withCounts(r, [count, count]));
      if (l === null) throw new Error("layout");
      const h = l.holders[0];
      if (h === undefined) throw new Error("holder");
      expect(h.things).toHaveLength(count);
      const px = drawnPx(l, h.things[0]?.size ?? 0);
      expect(px).toBeLessThanOrEqual(prev + 1e-9);
      prev = px;
      if (count <= 6) expect(px).toBeGreaterThanOrEqual(60);
      for (const t of h.things) expect(drawnSide(l, h.item, t.size)).toBeGreaterThanOrEqual(26);
      for (const a of h.things) for (const b of h.things) if (a !== b) expect(overlap(a, b)).toBe(false);
      const box = h.box;
      if (box === null) throw new Error("kept things have a container");
      for (const t of h.things) {
        expect(t.x).toBeGreaterThanOrEqual(box.x);
        expect(t.x + t.size).toBeLessThanOrEqual(box.x + box.w + 1e-9);
        expect(t.y + t.size).toBeLessThanOrEqual(box.y + box.h + 1e-9);
      }
    }
  });

  it("every thing keeps its least size: in a container 26 px (30 side by side); on a dish of 3 or fewer 56 px, of more 40 px", () => {
    for (const r of FRACTION_BANK.filter((x) => x.world.item_kinds.every((k) => k.countable)))
      for (const h of COMMON_FRACTION_READINGS) {
        const l = layoutStage(sceneOf(r, runRule(h, r)));
        if (l === null) continue;
        for (const x of l.holders) {
          const perDish = x.things.filter((t) => t.place === "dish" && t.dish === 0).length;
          for (const t of x.things) {
            const px = drawnSide(l, x.item, t.size);
            const least = t.place === "dish" ? (perDish <= 3 ? 56 : 40) : l.stacked ? 26 : 30;
            expect(px, `${r.world.problem_id} ${h.id} ${x.label} ${t.place}`).toBeGreaterThanOrEqual(least - 1e-9);
          }
        }
        expect(meetsSizes(l), `${r.world.problem_id} ${h.id}`).toBe(true);
      }
  });

  it("side by side unless it cannot keep the sizes or is taller than stacking the holders", () => {
    for (const r of FRACTION_BANK.filter((x) => x.world.item_kinds.every((k) => k.countable)))
      for (const h of COMMON_FRACTION_READINGS) {
        const scene = sceneOf(r, runRule(h, r));
        const l = layoutStage(scene);
        // A pairing is always one panel, the holders one above the other.
        if (scene.pairing !== null) {
          expect(l?.stacked).toBe(true);
          continue;
        }
        const side = layoutStage(scene, "side");
        const stacked = layoutStage(scene, "stacked");
        if (l === null || side === null || stacked === null) continue;
        const want = !meetsSizes(side) || (meetsSizes(stacked) && heightPx(stacked) < heightPx(side));
        expect(l.stacked, `${r.world.problem_id} ${h.id}`).toBe(want);
      }
    const card = bank("p_bank_card");
    expect(layoutStage(sceneOf(card, runRule(rule("c_swap"), card)))?.stacked).toBe(true);
  });

  it("holders whose things stay in their containers share one grid: the same thing size, rows from the same left edge", () => {
    for (const [id, counts] of [["p_bank_tulip", [10, 4]], ["p_bank_sticker", [17, 20]], ["p_bank_card", [6, 18]], ["p_bank_card", [54, 18]]] as const) {
      const l = layoutStage(withCounts(bank(id), [...counts]));
      if (l === null) throw new Error("layout");
      const [a, b] = l.holders;
      if (a === undefined || b === undefined) throw new Error("holders");
      expect(a.things[0]?.size).toBeCloseTo(b.things[0]?.size ?? -1, 9);
      expect((a.things[0]?.x ?? 0) - (a.box?.x ?? NaN)).toBeCloseTo((b.things[0]?.x ?? 0) - (b.box?.x ?? NaN), 9);
      // Left-aligned rows: every row starts at the first thing's left edge.
      for (const x of [a, b]) {
        const left = x.things[0]?.x ?? 0;
        const rows = new Map<number, number>();
        for (const t of x.things) rows.set(Math.round(t.y * 1000), Math.min(rows.get(Math.round(t.y * 1000)) ?? Infinity, t.x));
        for (const v of rows.values()) expect(v).toBeCloseTo(left, 9);
      }
    }
  });

  it("things on a dish stand on it: the middle of every thing's foot lies in the plate's light inner ellipse", () => {
    for (const r of FRACTION_BANK.filter((x) => x.world.item_kinds.every((k) => k.countable)))
      for (const h of COMMON_FRACTION_READINGS) {
        const l = layoutStage(sceneOf(r, runRule(h, r)));
        for (const x of l?.holders ?? [])
          for (const t of x.things.filter((y) => y.place === "dish")) {
            const pl = x.plates[t.dish];
            if (pl === undefined) throw new Error("plate");
            const cx = pl.x + (pl.w * PLATE_INNER.cx) / VIEWBOX.group.w;
            const cy = pl.y + (pl.h * PLATE_INNER.cy) / VIEWBOX.group.h;
            const a = (pl.w * PLATE_INNER.rx) / VIEWBOX.group.w;
            const b = (pl.h * PLATE_INNER.ry) / VIEWBOX.group.h;
            for (const fx of [t.x + ((1 - FOOT_SPAN) / 2) * t.size, t.x + 0.5 * t.size, t.x + ((1 + FOOT_SPAN) / 2) * t.size]) {
              const e = ((fx - cx) / a) ** 2 + ((t.y + t.size - cy) / b) ** 2;
              expect(e, `${r.world.problem_id} ${h.id} ${x.label}`).toBeLessThanOrEqual(1 + 1e-9);
            }
          }
      }
  });

  it("a piece keeps a clear gap from the whole thing before it, on a dish and in a container", () => {
    const r = bank("p_signboard");
    const l = layoutStage(sceneOf(r, runRule(rule("c_known_whole"), r)));
    const onDish = l?.holders[0]?.things.filter((t) => t.dish === 0) ?? [];
    const piece = onDish.find((t) => t.piece !== null);
    const whole = onDish.find((t) => t.piece === null);
    if (piece === undefined || whole === undefined) throw new Error("things");
    expect(piece.x - (whole.x + whole.size)).toBeGreaterThanOrEqual(PIECE_GAP * piece.size - 1e-9);
    const base = sceneOf(r, r.world);
    const s2: ObjectScene = { ...base, share: null, holders: base.holders.map((h) => ({ ...h, hidden: false, dishes: 0, count: { wholes: 3, piece: { num: 1, den: 2 } } })) };
    const things = layoutStage(s2)?.holders[0]?.things ?? [];
    const p2 = things.find((t) => t.piece !== null);
    if (p2 === undefined) throw new Error("piece");
    const prev = things.filter((t) => t.piece === null && Math.abs(t.y - p2.y) < 1e-9).at(-1);
    if (prev !== undefined) expect(p2.x - (prev.x + prev.size)).toBeGreaterThanOrEqual(PIECE_GAP * p2.size - 1e-9);
  });

  it("things in a container lie in its measured plain inside (CONTAINER_INNER_OF), the grid centred in it", () => {
    for (const r of FRACTION_BANK.filter((x) => x.world.item_kinds.every((k) => k.countable)))
      for (const h of COMMON_FRACTION_READINGS) {
        const l = layoutStage(sceneOf(r, runRule(h, r)));
        for (const x of l?.holders ?? []) {
          const kept = x.things.filter((t) => t.place === "container");
          if (kept.length === 0) continue;
          const box = x.box;
          if (box === null) throw new Error("kept things have a container");
          const k = box.w / VIEWBOX.container.w;
          const own = containerInnerOf(x.container);
          const inner = { x: box.x + own.x * k, y: box.y + own.y * k, w: own.w * k, h: own.h * k };
          for (const t of kept) {
            expect(t.x).toBeGreaterThanOrEqual(inner.x - 1e-9);
            expect(t.y).toBeGreaterThanOrEqual(inner.y - 1e-9);
            expect(t.x + t.size).toBeLessThanOrEqual(inner.x + inner.w + 1e-9);
            expect(t.y + t.size).toBeLessThanOrEqual(inner.y + inner.h + 1e-9);
          }
          const top = Math.min(...kept.map((t) => t.y)) - inner.y;
          const bottom = inner.y + inner.h - Math.max(...kept.map((t) => t.y + t.size));
          expect(Math.abs(top - bottom), `${r.world.problem_id} ${h.id} centred`).toBeLessThanOrEqual(1e-6);
        }
      }
  });

  it("flowers in a flower bed stand in rows on soil: every flower's foot is on a soil band, none floats above the bed", () => {
    for (const counts of [[10, 4], [10, 25], [9, 12]]) {
      for (const id of ["p_bank_tulip", "p_bank_motoni"]) {
        const l = layoutStage(withCounts(bank(id), counts));
        if (l === null) throw new Error("layout");
        for (const x of l.holders) {
          expect(x.soil.length).toBeGreaterThan(0);
          for (const t of x.things) {
            const foot = t.y + t.size;
            expect(x.soil.some((band) => foot >= band.y - 1e-9 && foot <= band.y + band.h + 1e-9), `${id} ${String(foot)}`).toBe(true);
          }
        }
      }
    }
    // Things that are not flowers get no soil.
    const l = layoutStage(withCounts(bank("p_bank_card"), [6, 18]));
    for (const x of l?.holders ?? []) expect(x.soil).toEqual([]);
  });

  it("every container, dish and thing lies inside its own panel; panels are separate, so nothing overlaps across holders", () => {
    for (const r of FRACTION_BANK.filter((x) => x.world.item_kinds.every((k) => k.countable)))
      for (const h of COMMON_FRACTION_READINGS) {
        const l = layoutStage(sceneOf(r, runRule(h, r)));
        if (l === null) continue;
        for (const x of l.holders) {
          const inside = (b: { x: number; y: number; w: number; h: number }): boolean => b.x >= -1e-9 && b.y >= -1e-9 && b.x + b.w <= l.width + 1e-9 && b.y + b.h <= x.height + 1e-9;
          if (x.box !== null) expect(inside(x.box), `${r.world.problem_id} ${h.id} box`).toBe(true);
          for (const d of x.dishes) expect(inside(d), `${r.world.problem_id} ${h.id} dish`).toBe(true);
          for (const t of x.things) expect(inside({ x: t.x, y: t.y, w: t.size, h: t.size })).toBe(true);
          const kept = x.things.filter((t) => t.place === "container");
          for (const a of kept) for (const b of kept) if (a !== b) expect(overlap(a, b)).toBe(false);
          // On a dish, rows of a pile may overlap; things of one row never do.
          const onDish = x.things.filter((t) => t.place === "dish");
          for (const a of onDish) for (const b of onDish) if (a !== b && a.dish === b.dish && Math.abs(a.y - b.y) < 1e-9) expect(overlap(a, b)).toBe(false);
        }
      }
  });

  it("once dealt, no container is drawn: the name tag at the top, then the dishes; a dish is only as wide as its things", () => {
    for (const r of FRACTION_BANK.filter((x) => x.world.item_kinds.every((k) => k.countable)))
      for (const h of COMMON_FRACTION_READINGS) {
        const l = layoutStage(sceneOf(r, runRule(h, r)));
        for (const x of l?.holders ?? []) {
          const dealt = x.things.some((t) => t.place === "dish");
          if (dealt) {
            expect(x.box, `${r.world.problem_id} ${h.id}`).toBeNull();
            for (const d of x.dishes) expect(d.y).toBeGreaterThan(x.tag.y);
          }
          if (x.things.some((t) => t.place === "container")) expect(x.box).not.toBeNull();
        }
      }
    const r = bank("p_signboard");
    const l = layoutStage(sceneOf(r, runRule(rule("c_known_whole"), r)));
    const ani = l?.holders[0];
    if (l === null || ani === undefined) throw new Error("layout");
    expect(ani.dishes).toHaveLength(4);
    const size = ani.things[0]?.size ?? 0;
    // 1 and a half goldfish: the dish about 2.4 things wide, not more than 2.7.
    for (const d of ani.dishes) {
      expect(d.w / size).toBeGreaterThanOrEqual(2.2);
      expect(d.w / size).toBeLessThanOrEqual(2.7);
    }
    expect(drawnSide(l, ani.item, size)).toBeGreaterThanOrEqual(56);
  });

  it("the deal leaves no empty container in the DOM, with or without motion", () => {
    const r = bank("p_signboard");
    const { container } = render(<ObjectSceneView scene={sceneOf(r, runRule(rule("c_known_whole"), r))} reducedMotion />);
    expect(q(container, '[data-role="container"]')).toHaveLength(0);
    const kept = render(<ObjectSceneView scene={sceneOf(r, r.world)} reducedMotion />);
    expect(q(kept.container, '[data-role="container"]').length).toBeGreaterThan(0);
  });

  it("returns no layout for a noun without a part", () => {
    const r = bank("p_signboard");
    const s = sceneOf(r, r.world);
    expect(layoutStage({ ...s, item: { ...s.item, noun: "えんぴつ" } })).toBeNull();
  });
});

describe("words and accessibility", () => {
  it("every kanji of the stage's words has a reading", () => {
    const w = ui("ja").draw;
    const lines = [w.stage, w.stageHolder("A", "B", "C"), w.stageUnknown("A", "B"), w.stageEmpty("A", "B"), w.stageDishes("A", "B", 3), w.stageEach("C"), w.stageCut("B", true, false), w.stageCut("B", false, false), w.stageCut("B", true, true), w.stageCut("B", false, true), w.amount(4, { num: 1, den: 2 }, "C"), w.amount(4, { num: 1, den: 3 }, "C")];
    for (const line of lines) for (const seg of rubySegments(line, UI_READINGS)) if (seg.ruby === null) expect(/[一-鿿]/.test(seg.text), `${seg.text} in ${line}`).toBe(false);
  });

  it("axe-core finds no violation", async () => {
    const r = bank("p_signboard");
    const { container } = render(
      <main>
        <ObjectSceneView scene={sceneOf(r, runRule(rule("c_known_whole"), r))} reducedMotion />
      </main>,
    );
    const res = await axe.run(container, { resultTypes: ["violations"] });
    expect(res.violations.map((v) => v.id)).toEqual([]);
  });
});

describe("an additive reading is drawn as a one-to-one pairing", () => {
  const r = bank("p_signboard");
  const scene = sceneOf(r, runRule(rule("c_additive"), r));

  it("lays both holders in one panel, the same size and columns, thing i above thing i, the 3 unpaired in dashed boxes", () => {
    const l = layoutStage(scene);
    if (l === null || l.pairing === null) throw new Error("pairing");
    const [ani, oto] = l.holders;
    if (ani === undefined || oto === undefined) throw new Error("holders");
    expect(ani.things).toHaveLength(6);
    expect(oto.things).toHaveLength(9);
    expect(ani.things[0]?.size).toBeCloseTo(oto.things[0]?.size ?? -1, 9);
    for (let i = 0; i < 6; i++) expect(ani.things[i]?.x).toBeCloseTo(oto.things[i]?.x ?? NaN, 9);
    // One row per holder when it fits at a roomy size.
    for (const x of [ani, oto]) expect(new Set(x.things.map((t) => Math.round(t.y * 1000))).size).toBe(1);
    expect(l.pairing.lines).toHaveLength(6);
    for (const ln of l.pairing.lines) expect(ln.x1).toBeCloseTo(ln.x2, 9);
    expect(l.pairing.larger).toBe("h_otouto");
    // The boxes hold exactly the younger brother's things 7 to 9 and none of the paired ones.
    const off = l.pairing.offsets[1] ?? 0;
    const inBox = (t: { x: number; y: number; size: number }) =>
      l.pairing?.unpaired.some((b) => t.x >= b.x && t.x + t.size <= b.x + b.w && off + t.y >= b.y && off + t.y + t.size <= b.y + b.h) ?? false;
    expect(oto.things.map(inBox)).toEqual([false, false, false, false, false, false, true, true, true]);
    // Both containers drawn; one panel.
    expect(ani.box).not.toBeNull();
    expect(oto.box).not.toBeNull();
    expect(l.height).toBeCloseTo((l.pairing.offsets[1] ?? 0) + oto.height, 9);
  });

  it("draws one line per pair and a dashed box for the unpaired things; says what is drawn, no verdict", () => {
    const { container } = render(<ObjectSceneView scene={scene} reducedMotion />);
    expect(q(container, '[data-role="pair-line"]')).toHaveLength(6);
    const boxes = q(container, '[data-role="unpaired"]');
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) expect(b.getAttribute("stroke-dasharray")).not.toBeNull();
    expect(q(container, '[data-role="stage-holder"]')).toHaveLength(2);
    const desc = container.querySelector('[data-role="stage-description"]')?.textContent ?? "";
    expect(desc).toContain("弟の 金魚のうち 3匹は、あいてが いません");
    expect(desc).not.toContain("合わない");
    const en = render(<ObjectSceneView scene={scene} reducedMotion lang="en" />);
    expect(en.container.querySelector('[data-role="stage-description"]')?.textContent ?? "").toContain("have no partner");
  });

  it("rows that must wrap wrap the same for both holders, so thing i still sits above thing i", () => {
    const card = bank("p_bank_card");
    const l = layoutStage(sceneOf(card, runRule(rule("c_additive"), card)));
    const [a, b] = l?.holders ?? [];
    if (a === undefined || b === undefined) throw new Error("holders");
    for (let i = 0; i < Math.min(a.things.length, b.things.length); i++) {
      expect(a.things[i]?.x).toBeCloseTo(b.things[i]?.x ?? NaN, 9);
      expect((a.things[i]?.y ?? 0) - (a.box?.y ?? 0)).toBeCloseTo((b.things[i]?.y ?? 0) - (b.box?.y ?? 0) + ((a.things[0]?.y ?? 0) - (a.box?.y ?? 0)) - ((b.things[0]?.y ?? 0) - (b.box?.y ?? 0)), 9);
    }
  });

  it("the additive bank scenes: every bank problem pairs except where the gate hides a holder", () => {
    const fellBack: string[] = [];
    for (const p of FRACTION_BANK.filter((x) => x.world.item_kinds.every((k) => k.countable))) {
      const s = sceneOf(p, runRule(rule("c_additive"), p));
      const l = layoutStage(s);
      if (s.pairing === null) {
        fellBack.push(p.world.problem_id);
        expect(l?.pairing ?? null).toBeNull();
      } else expect(l?.pairing?.lines).toHaveLength(s.pairing.paired);
    }
    expect(fellBack).toEqual(["p_bank_motoni"]);
  });

  it("the pairing's words have readings for every kanji", () => {
    const w = ui("ja").draw;
    for (const line of [w.stagePaired("A", "B", "C"), w.stageUnpaired("A", "B", "3C")])
      for (const seg of rubySegments(line, UI_READINGS)) if (seg.ruby === null) expect(/[一-鿿]/.test(seg.text), `${seg.text} in ${line}`).toBe(false);
  });
});
