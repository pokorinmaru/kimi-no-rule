// The share of its 100×100 box that each item part's drawing fills on its shorter side, measured in a real browser
// (jsdom cannot measure SVG), against PART_NARROW in src/draw/stage-layout.ts, which the layout uses to keep every
// thing at least 26 px. A part redrawn without updating the table fails here (2026-11-08: the ribbon was replaced
// right after the table was measured). To update: run this spec, then copy the measured values it prints.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { CONTAINER_INNER, CONTAINER_PARTS, ITEM_PARTS } from "../src/draw/assets/spec.ts";
import { CONTAINER_INNER_OF, PART_BOX, PART_NARROW } from "../src/draw/stage-layout.ts";

const partFile = (id: string): string => fileURLToPath(new URL(`../src/draw/assets/parts/${id}.svg`, import.meta.url));

test("PART_NARROW matches every item part's drawing", async ({ page }) => {
  await page.setContent("<!doctype html><body></body>");
  const measured: Record<string, number> = {};
  for (const id of ITEM_PARTS) {
    let svg: string;
    try {
      svg = readFileSync(partFile(id), "utf8");
    } catch {
      continue; // a part not drawn yet uses the placeholder and the default share
    }
    measured[id] = await page.evaluate((text) => {
      document.body.innerHTML = text.replace(/^<svg\b/, '<svg width="100" height="100"');
      const root = document.body.querySelector("svg") as SVGSVGElement;
      const b = root.getBBox();
      const vb = root.viewBox.baseVal;
      return Math.round((Math.min(Math.min(b.width, vb.width) / vb.width, Math.min(b.height, vb.height) / vb.height)) * 100) / 100;
    }, svg);
  }
  console.log(`measured PART_NARROW: ${JSON.stringify(measured)}`);
  for (const [id, v] of Object.entries(measured)) expect(PART_NARROW[id] ?? 0.5, `${id}: measured ${String(v)}`).toBeGreaterThanOrEqual(v - 0.04);
  for (const [id, v] of Object.entries(measured)) expect(PART_NARROW[id] ?? 0.5, `${id}: measured ${String(v)}`).toBeLessThanOrEqual(v + 0.04);
});

/**
 * The plain inside of each container part, measured from the real SVG drawn on a canvas: the largest rectangle
 * whose pixels are all (within a small tolerance) the colour at the middle of the contract's CONTAINER_INNER,
 * on a grid of 4-unit cells. CONTAINER_INNER_OF (src/draw/stage-layout.ts) must lie inside it and cover most of
 * it, so things are drawn on the container's plain inside, never over its rim (scene check, 2026-11-08). To update:
 * run this spec, then copy the measured rectangles it prints.
 */
test("CONTAINER_INNER_OF lies inside every container part's plain inside", async ({ page }) => {
  await page.setContent("<!doctype html><body></body>");
  const measured: Record<string, { x: number; y: number; w: number; h: number }> = {};
  for (const id of CONTAINER_PARTS) {
    let svg: string;
    try {
      svg = readFileSync(partFile(id), "utf8");
    } catch {
      continue;
    }
    measured[id] = await page.evaluate(
      async ({ text, centre }) => {
        const S = 2; // canvas pixels per viewBox unit
        const W = 360 * S;
        const H = 240 * S;
        const img = new Image();
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text.replace(/^<svg\b/, `<svg width="${String(W)}" height="${String(H)}"`))}`;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = W;
        c.height = H;
        const g = c.getContext("2d") as CanvasRenderingContext2D;
        g.drawImage(img, 0, 0);
        const px = g.getImageData(0, 0, W, H).data;
        const at = (x: number, y: number): number[] => {
          const i = (Math.round(y) * W + Math.round(x)) * 4;
          return [px[i] ?? 0, px[i + 1] ?? 0, px[i + 2] ?? 0];
        };
        const ref = at(centre.x * S, centre.y * S);
        const plain = (x: number, y: number): boolean => at(x, y).every((v, k) => Math.abs(v - (ref[k] ?? 0)) <= 28);
        const CELL = 4; // viewBox units
        const cols = 360 / CELL;
        const rows = 240 / CELL;
        const ok: boolean[][] = [];
        for (let r = 0; r < rows; r++) {
          const row: boolean[] = [];
          for (let q = 0; q < cols; q++) {
            let good = 0;
            let all = 0;
            for (let y = r * CELL * S; y < (r + 1) * CELL * S; y++)
              for (let x = q * CELL * S; x < (q + 1) * CELL * S; x++) {
                all++;
                if (plain(x, y)) good++;
              }
            row.push(good / all >= 0.97);
          }
          ok.push(row);
        }
        // The largest rectangle of plain cells (histogram method).
        const hgt = new Array<number>(cols).fill(0);
        let best = { x: 0, y: 0, w: 0, h: 0 };
        for (let r = 0; r < rows; r++) {
          for (let q = 0; q < cols; q++) hgt[q] = ok[r]?.[q] ? (hgt[q] ?? 0) + 1 : 0;
          for (let q = 0; q < cols; q++) {
            let h = Infinity;
            for (let e = q; e < cols; e++) {
              h = Math.min(h, hgt[e] ?? 0);
              if (h === 0) break;
              const area = (e - q + 1) * h;
              if (area > best.w * best.h) best = { x: q, y: r - h + 1, w: e - q + 1, h };
            }
          }
        }
        return { x: best.x * CELL, y: best.y * CELL, w: best.w * CELL, h: best.h * CELL };
      },
      { text: svg, centre: { x: CONTAINER_INNER.x + CONTAINER_INNER.w / 2, y: CONTAINER_INNER.y + CONTAINER_INNER.h / 2 } },
    );
  }
  console.log(`measured CONTAINER_INNER_OF: ${JSON.stringify(measured)}`);
  for (const [id, m] of Object.entries(measured)) {
    const t = CONTAINER_INNER_OF[id as keyof typeof CONTAINER_INNER_OF];
    expect(t, `${id} has an inner area`).toBeDefined();
    if (t === undefined) continue;
    const tol = 4;
    expect(t.x, `${id} left`).toBeGreaterThanOrEqual(m.x - tol);
    expect(t.y, `${id} top`).toBeGreaterThanOrEqual(m.y - tol);
    expect(t.x + t.w, `${id} right`).toBeLessThanOrEqual(m.x + m.w + tol);
    expect(t.y + t.h, `${id} bottom`).toBeLessThanOrEqual(m.y + m.h + tol);
    expect((t.w * t.h) / (m.w * m.h), `${id} covers most of the plain inside`).toBeGreaterThanOrEqual(0.8);
  }
});

/**
 * Where each item part's drawing lies across its 100-unit box (getBBox, in viewBox units), against PART_BOX in
 * src/draw/stage-layout.ts: a piece is cut to its share of the drawing's own width, so half a fish is half of the
 * fish you see (scene check, 2026-11-08). To update: run this spec, then copy the measured values it prints.
 */
test("PART_BOX matches where every item part's drawing lies across its box", async ({ page }) => {
  await page.setContent("<!doctype html><body></body>");
  const measured: Record<string, { x: number; w: number }> = {};
  for (const id of ITEM_PARTS) {
    let svg: string;
    try {
      svg = readFileSync(partFile(id), "utf8");
    } catch {
      continue;
    }
    measured[id] = await page.evaluate((text) => {
      document.body.innerHTML = text.replace(/^<svg\b/, '<svg width="100" height="100"');
      const root = document.body.querySelector("svg") as SVGSVGElement;
      const b = root.getBBox();
      const x = Math.max(0, b.x);
      const right = Math.min(100, b.x + b.width);
      return { x: Math.round(x * 10) / 10, w: Math.round((right - x) * 10) / 10 };
    }, svg);
  }
  console.log(`measured PART_BOX: ${JSON.stringify(measured)}`);
  for (const [id, m] of Object.entries(measured)) {
    const t = PART_BOX[id];
    expect(t, `${id} has a box`).toBeDefined();
    if (t === undefined) continue;
    expect(Math.abs(t.x - m.x), `${id} x: measured ${String(m.x)}`).toBeLessThanOrEqual(3);
    expect(Math.abs(t.w - m.w), `${id} w: measured ${String(m.w)}`).toBeLessThanOrEqual(3);
  }
});
