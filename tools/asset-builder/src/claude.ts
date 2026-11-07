// The Claude Opus calls that draw and judge a part. Request shapes follow the Claude API docs (vision: image blocks
// with a base64 PNG source before the text; structured outputs in output_config.format; effort in output_config;
// thinking always on for Opus 5.5, so it is omitted; streaming with finalMessage() for long outputs). The key comes
// from the environment. Nothing of a request or a reply is logged here.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { BuildDeps, DrawRequest, Scores } from "./build.ts";
import { CRITIQUE_SCHEMA, DRAW_SCHEMA, RUBRIC, critiqueSystem, critiqueUser, drawSystem, drawUser } from "./prompts.ts";

export const MODEL = "claude-opus-5-5";

const image = (png: Uint8Array) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/png" as const, data: Buffer.from(png).toString("base64") } });

const drawReply = z.object({ svg: z.string().min(20), notes: z.string() });
const critiqueReply = z.object({
  scores: z.object(Object.fromEntries(RUBRIC.map(([k]) => [k, z.number().int().min(1).max(5)])) as Record<(typeof RUBRIC)[number][0], z.ZodNumber>),
  fixes: z.array(z.string()),
});

interface Sdk {
  messages: { stream(params: unknown, options?: unknown): { finalMessage(): Promise<{ stop_reason: string | null; content: { type: string; text?: string }[] }> } };
}

async function ask(sdk: Sdk, o: { system: string; content: unknown[]; schema: object; effort: "medium" | "high" | "xhigh"; maxTokens: number; signal?: AbortSignal }): Promise<unknown> {
  const msg = await sdk.messages
    .stream(
      {
        model: MODEL,
        max_tokens: o.maxTokens,
        system: o.system,
        messages: [{ role: "user", content: o.content }],
        output_config: { effort: o.effort, format: { type: "json_schema", schema: o.schema } },
      },
      o.signal === undefined ? undefined : { signal: o.signal },
    )
    .finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("refusal");
  if (msg.stop_reason === "max_tokens") throw new Error("max_tokens");
  const text = msg.content.flatMap((b) => (b.type === "text" && typeof b.text === "string" ? [b.text] : [])).join("");
  return JSON.parse(text) as unknown;
}

/** draw and critique over the SDK; render is given by the caller (a browser). */
export function claudeDeps(render: BuildDeps["render"], o: { sdk?: Sdk; effort?: "medium" | "high" | "xhigh" } = {}): BuildDeps {
  const sdk = o.sdk ?? (new Anthropic() as unknown as Sdk);
  const effort = o.effort ?? "high";
  return {
    render,
    async draw(req: DrawRequest) {
      const content = [...req.references.map(image), { type: "text", text: drawUser(req.part, req.style, { references: req.references.length, ...(req.problems === undefined ? {} : { problems: req.problems }), ...(req.fixes === undefined ? {} : { fixes: req.fixes }), ...(req.previous === undefined ? {} : { previous: req.previous }) }) }];
      return drawReply.parse(await ask(sdk, { system: drawSystem(), content, schema: DRAW_SCHEMA, effort, maxTokens: 32_000 }));
    },
    async critique(req) {
      const content = [...req.references.map(image), image(req.sheet), { type: "text", text: critiqueUser(req.part, req.style, req.references.length) }];
      const r = critiqueReply.parse(await ask(sdk, { system: critiqueSystem(), content, schema: CRITIQUE_SCHEMA, effort, maxTokens: 16_000 }));
      return { scores: r.scores as Scores, fixes: r.fixes };
    },
  };
}
