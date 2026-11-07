// pnpm score:parts -- [--parts goldfish,tank] [--refs goldfish,apple,tulip,tank] [--run <id>] [--concurrency 8]
// Scores the parts the app uses now (apps/web/src/draw/assets/parts/*.svg) without redrawing them: each part is
// checked (spec-check), rendered in Chromium the way make:parts shows it, and judged by Claude Opus with the same
// rubric (prompts.ts RUBRIC). The reference parts (default goldfish, apple, tulip, tank) are shown to the judge for
// style_match, and are themselves judged against the others. Writes tools/asset-builder/out/score-<run>/
// (<part>.png, <part>.json, report.json); progress lines go to evals/results/progress.log, tagged [score:parts].
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_PARTS, type PartId } from "../../../apps/web/src/draw/assets/spec.ts";
import { mapPool } from "../../evals/src/runner/pool.ts";
import { fileSink } from "../../evals/src/runner/progress.ts";
import { minScore } from "./build.ts";
import { claudeDeps } from "./claude.ts";
import { RUBRIC, STYLES } from "./prompts.ts";
import { createRenderer } from "./render.ts";
import { checkPart, kindOf } from "./spec-check.ts";

const PARTS_DIR = fileURLToPath(new URL("../../../apps/web/src/draw/assets/parts/", import.meta.url));
const args = process.argv.slice(2).filter((a) => a !== "--");
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? undefined : args[i + 1];
};
const list = (s: string | undefined): string[] => (s === undefined ? [] : s.split(",").map((x) => x.trim()).filter((x) => x !== ""));
const parts = (list(opt("parts")).length > 0 ? list(opt("parts")) : [...ALL_PARTS]) as PartId[];
for (const p of parts) if (!ALL_PARTS.includes(p)) throw new Error(`unknown part ${p}`);
const refIds = (list(opt("refs")).length > 0 ? list(opt("refs")) : ["goldfish", "apple", "tulip", "tank"]) as PartId[];
const concurrency = Number(opt("concurrency") ?? "8");
const d = new Date();
const p2 = (n: number): string => String(n).padStart(2, "0");
const runId = opt("run") ?? `${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
const outDir = fileURLToPath(new URL(`../out/score-${runId}/`, import.meta.url));
mkdirSync(outDir, { recursive: true });
const sink = fileSink(fileURLToPath(new URL("../../../evals/results/progress.log", import.meta.url)));
const say = (l: string): void => sink.write(`[score:parts] ${l}`);
const style = STYLES.find((s) => s.id === "bold_sticker");
if (style === undefined) throw new Error("bold_sticker style missing");

const svgOf = (id: PartId): string => readFileSync(join(PARTS_DIR, `${id}.svg`), "utf8").trim();
const renderer = await createRenderer();
const refPng = new Map<PartId, Uint8Array>();
for (const id of refIds) refPng.set(id, await renderer.still(id, svgOf(id), kindOf(id) === "item" ? 200 : 320));
const deps = claudeDeps((part, svg) => renderer.render(part, svg));

let done = 0;
const results = await mapPool(parts, concurrency, async (part) => {
  const svg = svgOf(part);
  const problems = checkPart(part, svg);
  const sheet = await renderer.render(part, svg);
  writeFileSync(join(outDir, `${part}.png`), sheet);
  const references = refIds.filter((r) => r !== part).flatMap((r) => [refPng.get(r)].filter((x): x is Uint8Array => x !== undefined));
  try {
    const review = await deps.critique({ part, style, sheet, references });
    const r = { part, problems, scores: review.scores, fixes: review.fixes, min: minScore(review.scores) };
    writeFileSync(join(outDir, `${part}.json`), JSON.stringify(r, null, 2));
    done++;
    say(`${part}: min ${String(r.min)} ${RUBRIC.map(([k]) => `${k}=${String(review.scores[k])}`).join(" ")}${problems.length > 0 ? ` spec:${problems.join(",")}` : ""} (${String(done)}/${String(parts.length)})`);
    return r;
  } catch (e) {
    done++;
    say(`${part}: ERROR ${e instanceof Error ? e.message : String(e)}`);
    return { part, problems, scores: null, fixes: [], min: 0 };
  }
});
await renderer.close();
writeFileSync(join(outDir, "report.json"), JSON.stringify(results, null, 2));
say(`finished ${runId}: ${String(results.filter((r) => r.min >= 4).length)}/${String(results.length)} parts at 4 or more; ${outDir}`);
