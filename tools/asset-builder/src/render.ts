// Renders a part the way the reviewer sees it, in headless Chromium (Playwright): large, small as in the app on a
// tablet (an item about 44 px; a container about 180 px), and an item cut to its left half, on a white sheet.
import { chromium, type Browser } from "playwright";
import { PALETTE, type PartId } from "../../../apps/web/src/draw/assets/spec.ts";
import { containerInnerOf } from "../../../apps/web/src/draw/stage-layout.ts";
import { kindOf } from "./spec-check.ts";

export interface Renderer {
  render(part: PartId, svg: string): Promise<Uint8Array>;
  /** A plain PNG of the part alone (for references and the gallery). */
  still(part: PartId, svg: string, width: number): Promise<Uint8Array>;
  close(): Promise<void>;
}

const sized = (svg: string, w: number): string => svg.replace(/^<svg\b/, `<svg width="${String(w)}"`);

function sheet(part: PartId, svg: string): string {
  const kind = kindOf(part);
  const big = kind === "item" ? 360 : 480;
  const small = kind === "item" ? 44 : kind === "container" ? 240 : 120;
  const cut =
    kind === "item"
      ? `<div class="cell"><div style="width:${String(big / 2)}px;overflow:hidden;border-right:3px dashed #888">${sized(svg, big)}</div><p>left half</p></div>`
      : "";
  // A container is also shown filled: 40 placeholder things in a grid inside its things area, between the back
  // and the front layer, so the reviewer can see whether every thing stays visible.
  const filled =
    kind === "container"
      ? `<div class="cell">${sized(withThings(svg, part), big)}<p>filled with 40 things</p></div>`
      : "";
  return `<!doctype html><html><body style="margin:0;background:#fff;font:14px sans-serif">
<div id="s" style="display:flex;gap:32px;align-items:flex-end;padding:24px;background:#fff">
<div class="cell">${sized(svg, big)}<p>large</p></div>
<div class="cell">${sized(svg, small)}${sized(svg, small)}${sized(svg, small)}<p>as in the app</p></div>
${cut}${filled}
</div></body></html>`;
}

/** The container with 40 placeholder things drawn between its back and front layers, in the part's own plain inside
 * (CONTAINER_INNER_OF, as the app lays them out; the shared box put things over the rims of some parts). */
export function withThings(svg: string, part: string = ""): string {
  const { x, y, w, h } = containerInnerOf(part);
  const cols = 8;
  const rows = 5;
  const cw = w / cols;
  const rh = h / rows;
  const dots = Array.from({ length: cols * rows }, (_, i) => {
    const cx = x + cw * (i % cols) + cw / 2;
    const cy = y + rh * Math.floor(i / cols) + rh / 2;
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(Math.min(cw, rh) * 0.38).toFixed(1)}" fill="${PALETTE.orange}" stroke="${PALETTE.outline}" stroke-width="2.5"/>`;
  }).join("");
  const at = svg.search(/<g\b[^>]*\bid="front"/);
  return at < 0 ? svg : svg.slice(0, at) + `<g id="things">${dots}</g>` + svg.slice(at);
}

export async function createRenderer(): Promise<Renderer> {
  const browser: Browser = await chromium.launch();
  const page = async (html: string, selector: string): Promise<Uint8Array> => {
    // Wide enough for the whole review sheet (a 1280 px page cut off the right of the filled container).
    const p = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 2000, height: 900 } });
    try {
      await p.setContent(html);
      return new Uint8Array(await p.locator(selector).screenshot({ type: "png" }));
    } finally {
      await p.close();
    }
  };
  return {
    render: (part, svg) => page(sheet(part, svg), "#s"),
    still: (_part, svg, width) => page(`<!doctype html><html><body style="margin:0;background:#fff"><div id="s" style="display:inline-block;padding:8px;background:#fff">${sized(svg, width)}</div></body></html>`, "#s"),
    close: () => browser.close(),
  };
}
