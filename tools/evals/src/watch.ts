// pnpm eval:watch [lines]: prints the last lines of evals/results/progress.log and follows it (the eval runner
// and make:discriminating both write there). Stop with Ctrl+C.
import { existsSync, openSync, readFileSync, readSync, statSync, watchFile } from "node:fs";
import { fileURLToPath } from "node:url";

const path = fileURLToPath(new URL("../../../evals/results/progress.log", import.meta.url));
const n = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 20);

let pos = 0;
if (existsSync(path)) {
  const text = readFileSync(path, "utf8");
  process.stdout.write(`${text.trimEnd().split("\n").slice(-n).join("\n")}\n`);
  pos = statSync(path).size;
} else console.log(`waiting for ${path}`);

watchFile(path, { interval: 500 }, (cur) => {
  if (cur.size < pos) pos = 0;
  if (cur.size === pos) return;
  const fd = openSync(path, "r");
  const buf = Buffer.alloc(cur.size - pos);
  readSync(fd, buf, 0, buf.length, pos);
  pos = cur.size;
  process.stdout.write(buf.toString("utf8"));
});
