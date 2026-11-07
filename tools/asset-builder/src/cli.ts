// pnpm make:parts -- --parts goldfish,tank [--styles soft_flat,bold_sticker,no_line] [--candidates 2] [--rounds 4]
//   [--concurrency 6] [--refs <dir of chosen part .svg files>] [--run <runId>] [--dry-run]
// Has Claude Opus draw picture parts, checks them, renders them in Chromium, has Opus judge the picture, and revises
// (tools/asset-builder/src/build.ts). Each candidate is written to tools/asset-builder/out/<runId>/<part>/<style>/<n>/
// as it finishes (rounds, scores, the review sheets); a finished candidate is skipped on --run <runId> (resume). A
// gallery (out/<runId>/gallery.html) shows every candidate's best drawing with its scores, for a person to pick.
// Progress lines go to stdout and to evals/results/progress.log, tagged [make:parts]. Needs ANTHROPIC_API_KEY.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_PARTS, type PartId } from "../../../apps/web/src/draw/assets/spec.ts";
import { mapPool } from "../../evals/src/runner/pool.ts";
import { fileSink } from "../../evals/src/runner/progress.ts";
import { buildCandidate, minScore, type CandidateResult } from "./build.ts";
import { claudeDeps } from "./claude.ts";
import { RUBRIC, STYLES, type StyleBrief } from "./prompts.ts";
import { createRenderer } from "./render.ts";
import { kindOf } from "./spec-check.ts";

const OUT = fileURLToPath(new URL("../out/", import.meta.url));
const LOG = fileURLToPath(new URL("../../../evals/results/progress.log", import.meta.url));
const ALL: readonly PartId[] = ALL_PARTS;

const args = process.argv.slice(2).filter((a) => a !== "--");
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? undefined : args[i + 1];
};
const list = (s: string | undefined): string[] => (s === undefined ? [] : s.split(",").map((x) => x.trim()).filter((x) => x !== ""));

const parts = list(opt("parts")) as PartId[];
for (const p of parts) if (!ALL.includes(p)) throw new Error(`unknown part ${p}`);
const styles: StyleBrief[] = (list(opt("styles")).length > 0 ? list(opt("styles")) : STYLES.map((s) => s.id)).map((id) => {
  const s = STYLES.find((x) => x.id === id);
  if (s === undefined) throw new Error(`unknown style ${id}`);
  return s;
});
const candidates = Number(opt("candidates") ?? "2");
const rounds = Number(opt("rounds") ?? "4");
const concurrency = Number(opt("concurrency") ?? "6");
const refsDir = opt("refs");
const now = new Date();
const p2 = (n: number): string => String(n).padStart(2, "0");
const runId = opt("run") ?? `${String(now.getFullYear())}${p2(now.getMonth() + 1)}${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}`;
const runDir = join(OUT, runId);

interface Job {
  part: PartId;
  style: StyleBrief;
  n: number;
  dir: string;
}
const jobs: Job[] = parts.flatMap((part) => styles.flatMap((style) => Array.from({ length: candidates }, (_, n) => ({ part, style, n: n + 1, dir: join(runDir, part, style.id, String(n + 1)) }))));
console.log(`run ${runId}: ${String(jobs.length)} candidate(s) (${parts.join(",")} × ${styles.map((s) => s.id).join(",")} × ${String(candidates)}), up to ${String(rounds)} round(s) each`);
console.log(`Claude calls: at most ${String(jobs.length * rounds * 2)} (Opus, draw + judge per round); out: ${runDir}`);
if (parts.length === 0 || args.includes("--dry-run")) process.exit(0);
if ((process.env.ANTHROPIC_API_KEY ?? "") === "") {
  console.error("make:parts needs ANTHROPIC_API_KEY in the environment.");
  process.exit(2);
}

const sink = fileSink(LOG);
const say = (line: string): void => sink.write(`[make:parts] ${line}`);
mkdirSync(runDir, { recursive: true });
const renderer = await createRenderer();
const references: Uint8Array[] = [];
if (refsDir !== undefined) {
  for (const f of readdirSync(refsDir).filter((x) => x.endsWith(".svg"))) {
    const id = f.replace(/\.svg$/, "") as PartId;
    references.push(await renderer.still(id, readFileSync(join(refsDir, f), "utf8"), kindOf(id) === "item" ? 200 : 320));
  }
  say(`${String(references.length)} reference part(s) from ${refsDir}`);
}
const deps = claudeDeps((part, svg) => renderer.render(part, svg));
let done = 0;
const started = Date.now();
say(`start ${runId}: ${String(jobs.length)} candidate(s), concurrency ${String(concurrency)}`);

const results = await mapPool(jobs, concurrency, async (job) => {
  const label = `${job.part}/${job.style.id}/${String(job.n)}`;
  const finalPath = join(job.dir, "final.json");
  if (existsSync(finalPath)) {
    done++;
    say(`${label}: done before (resumed) ${String(done)}/${String(jobs.length)}`);
    return { job, final: JSON.parse(readFileSync(finalPath, "utf8")) as Final };
  }
  mkdirSync(job.dir, { recursive: true });
  try {
    const r: CandidateResult = await buildCandidate(
      {
        part: job.part,
        style: job.style,
        references,
        maxRounds: rounds,
        onRound: (round, i) => {
          writeFileSync(join(job.dir, `round-${String(i + 1)}.svg`), round.svg);
          if (round.sheet !== null) writeFileSync(join(job.dir, `round-${String(i + 1)}.png`), round.sheet);
          writeFileSync(join(job.dir, `round-${String(i + 1)}.json`), JSON.stringify({ problems: round.problems, scores: round.scores, fixes: round.fixes }, null, 2));
          const s = round.scores === null ? `refused (${round.problems.join(",")})` : `min ${String(minScore(round.scores))} ${RUBRIC.map(([k]) => `${k}=${String(round.scores?.[k])}`).join(" ")}`;
          say(`${label} round ${String(i + 1)}: ${s}`);
        },
      },
      deps,
    );
    const final: Final = { passed: r.passed, round: r.best?.round ?? null, scores: r.best?.scores ?? null, svg: r.best?.svg ?? null };
    writeFileSync(finalPath, JSON.stringify(final, null, 2));
    if (r.best !== null) writeFileSync(join(job.dir, "best.svg"), r.best.svg);
    done++;
    const el = Math.round((Date.now() - started) / 1000);
    say(`${label}: ${r.passed ? "PASSED" : "not passed"} ${String(done)}/${String(jobs.length)} elapsed ${String(el)}s`);
    return { job, final };
  } catch (e) {
    done++;
    say(`${label}: ERROR ${e instanceof Error ? e.message : String(e)} ${String(done)}/${String(jobs.length)}`);
    return { job, final: null };
  }
});
await renderer.close();

interface Final {
  passed: boolean;
  round: number | null;
  scores: Record<string, number> | null;
  svg: string | null;
}

// The gallery: every candidate's best drawing, large and small, with its scores, grouped by part and style.
const cells = (part: PartId) =>
  styles
    .map((s) => {
      const row = results
        .filter((x) => x.job.part === part && x.job.style.id === s.id)
        .map(({ job, final }) => {
          if (final === null || final.svg === null) return `<div class="c"><p>${job.style.id} #${String(job.n)}: none</p></div>`;
          const sc = final.scores === null ? "" : RUBRIC.map(([k]) => `${k} ${String(final.scores?.[k])}`).join(" · ");
          const svg = final.svg.replace(/^<svg\b/, `<svg width="${kindOf(part) === "item" ? "160" : "280"}"`);
          const small = final.svg.replace(/^<svg\b/, `<svg width="${kindOf(part) === "item" ? "44" : "180"}"`);
          return `<div class="c"><div>${svg}</div><div>${small}${kindOf(part) === "item" ? small + small : ""}</div><p><b>${part} / ${s.name} #${String(job.n)}</b> ${final.passed ? "✓" : "✗"}<br>${sc}<br><code>${job.dir}</code></p></div>`;
        })
        .join("");
      return `<h3>${s.name}（${s.id}）</h3><div class="r">${row}</div>`;
    })
    .join("");
const html = `<!doctype html><html lang="ja"><meta charset="utf-8"><title>parts ${runId}</title><style>body{font:14px sans-serif;margin:16px;background:#fff;color:#222}.r{display:flex;flex-wrap:wrap;gap:16px}.c{border:1px solid #ddd;border-radius:8px;padding:8px;max-width:340px}code{font-size:11px;word-break:break-all}</style><body><h1>parts ${runId}</h1>${parts.map((p) => `<h2>${p}</h2>${cells(p)}`).join("")}</body></html>`;
writeFileSync(join(runDir, "gallery.html"), html);
say(`finished ${runId}: ${String(results.filter((r) => r.final?.passed === true).length)}/${String(jobs.length)} passed; gallery ${join(runDir, "gallery.html")}`);
