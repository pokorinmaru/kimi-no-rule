// pnpm check:screens -- [--url http://localhost:5173/] [--run <id>] [--concurrency 8]
// The whole-screen check (2026-11-08): walks the child's flow in Chromium the way a child taps (intro, consent,
// the first guess, the junior's world, the prediction, the lit sentence, placing the "1" card, the restatement,
// the word book, the rebuilt world, the number pad, the solved problem; then the staged help, 「つらい」 and the
// grown-up's screen), at two tablet sizes (1024×768 landscape, 768×1024 portrait). Every screen is shot whole
// and Claude Opus judges it as a children's app designer: layout, readability, focus (nothing distracting from
// what the child must look at or tap), consistency, friendliness. Writes tools/asset-builder/out/screens-<run>/
// (PNG and JSON per screen, report.json, gallery.html); progress lines go to evals/results/progress.log.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { chromium, type Page } from "playwright";
import { z } from "zod";
import { mapPool } from "../../evals/src/runner/pool.ts";
import { fileSink } from "../../evals/src/runner/progress.ts";
import { MODEL } from "./claude.ts";

const args = process.argv.slice(2).filter((a) => a !== "--");
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? undefined : args[i + 1];
};
const url = opt("url") ?? "http://localhost:5173/";
const concurrency = Number(opt("concurrency") ?? "8");
const d = new Date();
const p2 = (n: number): string => String(n).padStart(2, "0");
const runId = opt("run") ?? `${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
const outDir = fileURLToPath(new URL(`../out/screens-${runId}/`, import.meta.url));
mkdirSync(outDir, { recursive: true });
const sink = fileSink(fileURLToPath(new URL("../../../evals/results/progress.log", import.meta.url)));
const say = (l: string): void => sink.write(`[check:screens] ${l}`);

const RUBRIC = [
  ["layout", "Clean, balanced, aligned layout with consistent spacing; nothing cramped, clipped or overlapping; works at this tablet size."],
  ["readable", "Text and controls are easy for a nine-year-old to read and tap (size, contrast, line length); the furigana does not clutter."],
  ["focus", "What the child must look at or tap now is obvious; nothing on the screen distracts from it."],
  ["consistent", "Colours, shapes, buttons and pictures look like one well-made app."],
  ["friendly", "Calm, cute and friendly for a child; never judging the child."],
] as const;
type Key = (typeof RUBRIC)[number][0];
const reply = z.object({ sees: z.string(), scores: z.object(Object.fromEntries(RUBRIC.map(([k]) => [k, z.number().int().min(1).max(5)])) as Record<Key, z.ZodNumber>), fixes: z.array(z.string()) });
const SCHEMA = {
  type: "object",
  properties: {
    sees: { type: "string" },
    scores: { type: "object", properties: Object.fromEntries(RUBRIC.map(([k]) => [k, { type: "integer" }])), required: RUBRIC.map(([k]) => k), additionalProperties: false },
    fixes: { type: "array", items: { type: "string" } },
  },
  required: ["sees", "scores", "fixes"],
  additionalProperties: false,
} as const;
const SYSTEM = [
  "You are a senior designer of apps for Japanese children of about nine, reviewing one full screenshot of a math app on a tablet. The child teaches a 'junior' (an AI shown as a little book character with an AI mark) how to read a word problem; a picture of things and a tape diagram show the junior's world. Some things are intended and must not be marked down: the answer is shown as ？ until the child says it; the three buttons やめる・わからない・つらい stay at the bottom of every screen; furigana sits over kanji; the AI mark sits beside the junior.",
  "Say in one or two sentences what the screen shows and what the child is asked to do (sees). Score 1–5: " + RUBRIC.map(([k, v]) => `${k}: ${v}`).join(" ") + " Be strict: 4 means it could ship in a polished children's app. Then list concrete fixes (at most five), each naming the element and the change. Answer with the JSON object only.",
].join("\n");

const sdk = new Anthropic();
async function judge(png: Uint8Array, name: string): Promise<z.infer<typeof reply>> {
  const msg = await sdk.messages
    .stream({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: Buffer.from(png).toString("base64") } }, { type: "text", text: `Screen: ${name}.` }] }],
      output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
    } as never)
    .finalMessage();
  const t = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return reply.parse(JSON.parse(t));
}

const shots: { name: string; png: Uint8Array }[] = [];
const tap = async (page: Page, id: string): Promise<void> => {
  await page.getByTestId(id).first().click();
  await page.waitForTimeout(500);
};
const shot = async (page: Page, size: string, name: string): Promise<void> => {
  await page.waitForTimeout(700);
  // The whole page as the child sees it scrolled to the end: the window made as tall as the page, so the band fixed
  // to the bottom sits under the last content (a full-page capture would leave it at the first screen's bottom edge).
  const vp = page.viewportSize();
  const h = await page.evaluate<number>("document.documentElement.scrollHeight");
  if (vp !== null) await page.setViewportSize({ width: vp.width, height: Math.max(vp.height, h) });
  await page.waitForTimeout(200);
  shots.push({ name: `${size}/${name}`, png: new Uint8Array(await page.screenshot({ type: "png" })) });
  if (vp !== null) await page.setViewportSize(vp);
  say(`shot ${size}/${name}`);
};

const browser = await chromium.launch();
for (const [size, viewport] of [
  ["1024x768", { width: 1024, height: 768 }],
  ["768x1024", { width: 768, height: 1024 }],
] as const) {
  // The main flow: one problem from the junior's misreading to the answer.
  {
    const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(url);
    await shot(page, size, "01-intro");
    await tap(page, "btn-next");
    await shot(page, size, "02-consent");
    await tap(page, "btn-consent-yes");
    await shot(page, size, "03-guess");
    await tap(page, "btn-guess-unknown");
    await shot(page, size, "04-junior-world");
    await tap(page, "btn-predict-odd");
    await shot(page, size, "05-lit-sentence");
    await page.locator('[data-role="reference_mark"]').first().click();
    await page.locator('[data-drop-target="h_otouto"]').first().click();
    await page.waitForTimeout(800);
    await shot(page, size, "06-restate");
    await tap(page, "btn-confirm-yes");
    await shot(page, size, "07-word-book");
    await tap(page, "btn-book-close");
    await shot(page, size, "08-rebuilt");
    await tap(page, "btn-next");
    await shot(page, size, "09-number-pad");
    await tap(page, "pad-2");
    await tap(page, "pad-ok");
    await tap(page, "pad-8");
    await tap(page, "pad-ok");
    await shot(page, size, "10-solved");
    await ctx.close();
  }
  // The staged help, then 「つらい」.
  {
    const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(url);
    await tap(page, "btn-next");
    await tap(page, "btn-consent-yes");
    await tap(page, "btn-guess-unknown");
    await tap(page, "btn-predict-odd");
    await tap(page, "btn-dont-know");
    await shot(page, size, "11-help-read");
    await tap(page, "btn-hard");
    await shot(page, size, "12-hard");
    await ctx.close();
  }
  // The grown-up's screen (held for two seconds).
  {
    const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(url);
    await page.getByTestId("btn-parent").click({ delay: 2300 });
    await shot(page, size, "13-parent");
    await ctx.close();
  }
}
await browser.close();

let done = 0;
const results = await mapPool(shots, concurrency, async (s) => {
  const file = s.name.replace(/\//g, "__");
  writeFileSync(join(outDir, `${file}.png`), s.png);
  try {
    const j = await judge(s.png, s.name);
    const min = Math.min(...RUBRIC.map(([k]) => j.scores[k]));
    const r = { name: s.name, ...j, min };
    writeFileSync(join(outDir, `${file}.json`), JSON.stringify(r, null, 2));
    done++;
    say(`${s.name}: min ${String(min)} ${RUBRIC.map(([k]) => `${k}=${String(j.scores[k])}`).join(" ")} (${String(done)}/${String(shots.length)})`);
    return r;
  } catch (e) {
    done++;
    say(`${s.name}: ERROR ${e instanceof Error ? e.message : String(e)}`);
    return { name: s.name, sees: "", scores: null, fixes: [], min: 0 };
  }
});
writeFileSync(join(outDir, "report.json"), JSON.stringify(results, null, 2));
writeFileSync(
  join(outDir, "gallery.html"),
  `<!doctype html><meta charset="utf-8"><style>body{font:13px sans-serif;margin:12px}.c{display:inline-block;width:420px;vertical-align:top;margin:6px;border:1px solid #ddd;padding:6px}img{width:100%}</style>${results
    .map((r) => `<div class="c"><img src="${r.name.replace(/\//g, "__")}.png"><p><b>${r.name}</b> min ${String(r.min)}<br>${r.sees}<br><small>${r.fixes.join(" / ")}</small></p></div>`)
    .join("")}`,
);
say(`finished ${runId}: ${String(results.filter((r) => r.min >= 4).length)}/${String(results.length)} screens at 4 or more; ${join(outDir, "gallery.html")}`);
