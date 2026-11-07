// Progress lines for pnpm make:discriminating (and make:transfer, with its own tag and unit), in the style of the eval runner: a start line with the planned
// calls, one line per Claude call (counted by model), an error line the first time each error is seen (class,
// status, message; the key is never printed), and one line per finished pair with done/total, eta and failures.
import { MODELS, type AgentClient, type ClaudeClient } from "@kimi/interpret";
import { describeError } from "../../evals/src/runner/errors.ts";
import { errorText, formatDuration, type Sink } from "../../evals/src/runner/progress.ts";


export interface MakeProgress {
  client(c: ClaudeClient): ClaudeClient;
  agent(a: AgentClient): AgentClient;
  pairDone(label: string, kept: number, refused: number): void;
}

/** `pairs` is the number of units (pairs for make:discriminating); `tag` and `unit` default to that tool's. */
export function makeProgress(o: { sink: Sink; pairs: number; plannedCalls: string; now?: () => number; tag?: string; unit?: string }): MakeProgress {
  const TAG = o.tag ?? "[make:discriminating]";
  const unit = o.unit ?? "pair";
  const now = o.now ?? (() => performance.now());
  const started = now();
  let opus = 0;
  let haiku = 0;
  let failures = 0;
  let pairs = 0;
  const seen = new Set<string>();
  o.sink.write(`${TAG} start: ${o.pairs} ${unit}s; planned calls ${o.plannedCalls}`);
  const elapsed = (): string => formatDuration(now() - started);
  const called = (model: string, error: unknown): void => {
    if (model === MODELS.listen) haiku++;
    else opus++;
    if (error !== undefined) {
      failures++;
      const e = describeError(error);
      const k = errorText(e);
      if (!seen.has(k)) {
        seen.add(k);
        o.sink.write(`${TAG} error ${model}: ${k}`);
      }
    }
    o.sink.write(`${TAG} calls ${opus + haiku} (opus ${opus}, haiku ${haiku}) elapsed ${elapsed()} failures ${failures}`);
  };
  return {
    client: (c) => ({
      complete: async (req) => {
        try {
          const r = await c.complete(req);
          called(req.model, undefined);
          return r;
        } catch (e) {
          // A call aborted by its own deadline is handled by the builder; it is counted, not a failure.
          called(req.model, req.signal?.aborted === true ? undefined : e);
          throw e;
        }
      },
    }),
    agent: (a) => ({
      step: async (req) => {
        try {
          const r = await a.step(req);
          called(req.model, undefined);
          return r;
        } catch (e) {
          called(req.model, req.signal?.aborted === true ? undefined : e);
          throw e;
        }
      },
    }),
    pairDone: (label, kept, refused) => {
      pairs++;
      const ms = now() - started;
      const eta = formatDuration((ms / pairs) * (o.pairs - pairs));
      const pct = o.pairs === 0 ? 100 : (pairs / o.pairs) * 100;
      o.sink.write(`${TAG} ${unit} ${pairs}/${o.pairs} (${pct.toFixed(1)}%) ${label}: kept ${kept}, refused ${refused}; elapsed ${elapsed()} eta ${eta} failures ${failures}`);
    },
  };
}
