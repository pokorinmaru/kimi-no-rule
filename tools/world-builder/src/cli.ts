// pnpm build:problems <inputs.json> [out dir]: prepares problems with the real Claude (needs
// ANTHROPIC_API_KEY in the environment; BLOCKED B3). Output goes to content/problems/prepared by default.
import { readFileSync } from "node:fs";
import { anthropicAgentClient, anthropicClient } from "@kimi/interpret";
import { parseInputs, prepareProblems, writePrepared } from "./index.ts";

const [inputPath, outDir = new URL("../../../content/problems/prepared/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1")] = process.argv.slice(2);
if (inputPath === undefined) {
  console.error("usage: pnpm build:problems <inputs.json> [out dir]");
  process.exit(2);
}
if ((process.env.ANTHROPIC_API_KEY ?? "") === "") {
  console.error("build:problems needs ANTHROPIC_API_KEY in the environment (BLOCKED B3).");
  process.exit(2);
}
const inputs = parseInputs(readFileSync(inputPath, "utf8"));
const client = anthropicClient();
const prepared = await prepareProblems({ agent: anthropicAgentClient(), judge: client, listen: client }, inputs);
writePrepared(outDir, prepared);
console.log(`${prepared.adopted.length} adopted, ${prepared.rejected.length} rejected; written to ${outDir}`);
