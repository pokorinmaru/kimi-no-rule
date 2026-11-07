// pnpm check:scenes -- [--url http://localhost:5173/#/stages] [--run <id>] [--concurrency 8] [--only <scene id prefix>]
// The scene check of the premise harness (2026-11-08): opens the adults' page of every stage picture the app can
// show (apps/web/src/stages), and for each scene (a) checks in the browser that no two things overlap, every thing is
// at least MIN_THING_PX and inside the picture, and (b) has Claude Opus look at the rendered scene with the problem's
// sentences and judge whether it fits the problem naturally, can be counted, shows the intended oddity of a misread
// world (and nothing else odd), and is cute and clean. Writes tools/asset-builder/out/scenes-<run>/ (one PNG and
// one JSON per scene, report.json, gallery.html). Progress lines go to evals/results/progress.log [check:scenes].
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { chromium } from "playwright";
import { z } from "zod";
import { mapPool } from "../../evals/src/runner/pool.ts";
import { fileSink } from "../../evals/src/runner/progress.ts";
import { MODEL } from "./claude.ts";
import { judgeLayout, type Box } from "./scene-layout.ts";

const args = process.argv.slice(2).filter((a) => a !== "--");
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? undefined : args[i + 1];
};
const url = opt("url") ?? "http://localhost:5173/#/stages";
const only = opt("only") ?? "";
const concurrency = Number(opt("concurrency") ?? "8");
const d = new Date();
const p2 = (n: number): string => String(n).padStart(2, "0");
const runId = opt("run") ?? `${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
const outDir = fileURLToPath(new URL(`../out/scenes-${runId}/`, import.meta.url));
mkdirSync(outDir, { recursive: true });
const sink = fileSink(fileURLToPath(new URL("../../../evals/results/progress.log", import.meta.url)));
const say = (l: string): void => sink.write(`[check:scenes] ${l}`);

const RUBRIC = [
  ["fits_story", "The picture fits the problem's sentences naturally: the right things, in places that make sense for them and for who holds them."],
  ["countable", "A child of nine can count every thing on the picture without guessing (nothing hidden, overlapping or too small)."],
  ["oddity", "For a misread world: the impossibility or mismatch is visible in the things themselves (a thing that cannot be there, too many, too few) and nothing else looks odd. For the correct world: nothing looks odd."],
  ["cute_clean", "It is cute, friendly and cleanly laid out: balanced, aligned, nothing cramped or cut off."],
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
  "You review one picture of a math app for Japanese children of about nine. The picture shows the things of a word problem: each holder's container with a name tag, and dishes onto which one holder's things are dealt (the number of dishes comes from the problem's fraction). A thing drawn as a faint dashed outline is a part of a thing that cannot exist (a living thing cannot be split). In a misread world the numbers are those of a wrong reading on purpose; that oddity should be visible. A holder shown as ？ is not known yet.",
  "The app's rules, which are intended and must not be marked down: in the correct world, the asked holder stays ？ and no dishes are drawn until the child has said the values (the child works them out); once the child has answered, the correct things are shown. In a misread world, a value that happens to equal a hidden correct value is not drawn (shown ？ or not dealt) so the answer never leaks. Judge everything else.",
  "First say in one or two sentences what a child sees (sees). Then score from 1 to 5: " + RUBRIC.map(([k, v]) => `${k}: ${v}`).join(" ") + " Be strict: 4 means it could ship in a polished children's app. Then list concrete fixes for every score below 5 (at most five). Answer with the JSON object only.",
].join("\n");

const sdk = new Anthropic();
async function judge(png: Uint8Array, text: string, world: string): Promise<z.infer<typeof reply>> {
  const msg = await sdk.messages
    .stream({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: Buffer.from(png).toString("base64") } },
            { type: "text", text: `Problem (Japanese): ${text}\nThis picture: ${world}.` },
          ],
        },
      ],
      output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
    } as never)
    .finalMessage();
  const t = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return reply.parse(JSON.parse(t));
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, reducedMotion: "reduce" });
await page.goto(url);
await page.waitForSelector("[data-scene]");
const ids = (await page.locator("[data-scene]").evaluateAll((els) => els.map((e) => e.getAttribute("data-scene") ?? ""))).filter((x) => x.startsWith(only));
say(`start ${runId}: ${String(ids.length)} scene(s) from ${url}`);
const shots: { id: string; png: Uint8Array; text: string; world: string; layout: ReturnType<typeof judgeLayout> }[] = [];
for (const id of ids) {
  const sec = page.locator(`[data-scene="${id}"]`);
  await sec.scrollIntoViewIfNeeded();
  const info = await sec.evaluate((el) => {
    const pic = el.querySelector("[data-scene-picture]");
    const r = (e: { getBoundingClientRect(): { x: number; y: number; width: number; height: number } }) => {
      const b = e.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    };
    return {
      text: el.querySelectorAll("p")[1]?.textContent ?? "",
      world: el.querySelectorAll("p")[2]?.textContent ?? "",
      picture: pic === null ? null : r(pic),
      things: [...el.querySelectorAll('[data-role="thing"]')].map((t) => ({ ...r(t), ghost: t.getAttribute("data-piece") === "ghost" })),
    };
  });
  const png = new Uint8Array(await sec.locator("[data-scene-picture]").screenshot({ type: "png" }));
  const layout = judgeLayout(info.things as Box[], info.picture);
  shots.push({ id, png, text: info.text, world: info.world, layout });
}
await browser.close();

let done = 0;
const results = await mapPool(shots, concurrency, async (s) => {
  const file = s.id.replace(/\//g, "__");
  writeFileSync(join(outDir, `${file}.png`), s.png);
  try {
    const j = await judge(s.png, s.text, s.world);
    const min = Math.min(...RUBRIC.map(([k]) => j.scores[k]));
    const r = { id: s.id, layout: s.layout, ...j, min };
    writeFileSync(join(outDir, `${file}.json`), JSON.stringify(r, null, 2));
    done++;
    say(`${s.id}: layout ${s.layout.problems.length === 0 ? "ok" : s.layout.problems.join(",")}; min ${String(min)} ${RUBRIC.map(([k]) => `${k}=${String(j.scores[k])}`).join(" ")} (${String(done)}/${String(shots.length)})`);
    return r;
  } catch (e) {
    done++;
    say(`${s.id}: ERROR ${e instanceof Error ? e.message : String(e)} (${String(done)}/${String(shots.length)})`);
    return { id: s.id, layout: s.layout, sees: "", scores: null, fixes: [], min: 0 };
  }
});
writeFileSync(join(outDir, "report.json"), JSON.stringify(results, null, 2));
const rows = results
  .map((r) => `<div class="c"><img src="${r.id.replace(/\//g, "__")}.png"><p><b>${r.id}</b> min ${String(r.min)} · layout ${r.layout.problems.join(",") || "ok"}<br>${r.sees}<br><small>${r.fixes.join(" / ")}</small></p></div>`)
  .join("");
writeFileSync(join(outDir, "gallery.html"), `<!doctype html><meta charset="utf-8"><style>body{font:13px sans-serif;margin:12px}.c{display:inline-block;width:480px;vertical-align:top;margin:6px;border:1px solid #ddd;padding:6px}img{width:100%}</style>${rows}`);
const pass = results.filter((r) => r.min >= 4 && r.layout.problems.length === 0).length;
say(`finished ${runId}: ${String(pass)}/${String(results.length)} scenes pass (layout ok and every score ≥ 4); ${join(outDir, "gallery.html")}`);
