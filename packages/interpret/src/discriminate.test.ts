// Discriminating problems written offline (指示書 第6.7節 手順3, Q33): Opus writes problem texts for a pair of
// readings, each text goes through the one build of 第6.6節, and core decides whether the record is kept: it must
// pass the build, the sentence check and the problem conditions, and the two readings must build different
// worlds on it. Only fake Claude is used here; every check runs the real core. Written before the implementation.
import { describe, expect, it } from "vitest";
import { COMMON_FRACTION_READINGS, FRACTION_BANK, predict, type Hypothesis, type ProblemRecord } from "@kimi/core";
import type { BuildDeps, BuildInput, BuildOutcome } from "./build.ts";
import { DISCRIMINATE_SYSTEM, splitsPair, writeDiscriminating, type DiscriminateOptions } from "./discriminate.ts";
import { MODELS } from "./client.ts";
import { FakeAgent, FakeClaude, json, stopped, type FakeReply } from "./fake.ts";

const common = (id: string): Hypothesis => {
  const h = COMMON_FRACTION_READINGS.find((x) => x.id === id);
  if (h === undefined) throw new Error(id);
  return h;
};
/** A reading the common list does not hold: a unit fraction read as a difference (as in the research eval). */
const unitAdditive: Hypothesis = {
  id: "s_unit_additive",
  origin: "math",
  clauses: [
    { when: { pred: "ratio_is_unit_fraction", args: [] }, then: { action: "set_relation_type_additive", amount: "numerator" } },
    { when: { pred: "true", args: [] }, then: { action: "no_change" } },
  ],
  word_cues: [],
  note_for_adult: "reads a unit fraction as a difference",
};
const correct = common("c_correct");

const splitsIt = (r: ProblemRecord): boolean => new Set(predict([correct, unitAdditive], r, true).predictions.map((p) => p.worldClass)).size > 1;
const splitting = FRACTION_BANK.find(splitsIt) as ProblemRecord;
const notSplitting = FRACTION_BANK.find((r) => !splitsIt(r)) as ProblemRecord;

const deps = (writer: FakeReply[]): BuildDeps & { judge: FakeClaude } => ({
  agent: new FakeAgent([{ stopReason: "end_turn", text: "done", toolCalls: [] }]),
  judge: new FakeClaude(writer),
  listen: new FakeClaude([json({})]),
});

const written = (...texts: string[]): FakeReply => json({ problems: texts.map((problem_text) => ({ problem_text, consistency: "consistent", why: "the readings take different holders as 1" })) });

/** A build that adopts the given record under the asked id and text, as buildProblem would hand it back. */
const adopting =
  (record: ProblemRecord) =>
  async (_deps: BuildDeps, input: BuildInput): Promise<BuildOutcome> => ({
    status: "adopted",
    record: {
      ...structuredClone(record),
      world: { ...structuredClone(record.world), problem_id: input.problemId },
      source: input.source,
      consistency: input.consistency,
      checks: { double_build_match: true, restate_match: true, misread_pass_rate: 0.95, human_checked: false },
    },
    log: [{ step: "adopt", ok: true, detail: input.problemId }],
  });

const base = { readingA: correct, readingB: unitAdditive, bank: FRACTION_BANK, avoidTexts: [] as string[] };

describe("splitsPair", () => {
  it("is core predict: different world classes for the two readings", () => {
    expect(splitsPair(splitting, correct, unitAdditive)).toBe(true);
    expect(splitsPair(notSplitting, correct, unitAdditive)).toBe(false);
    expect(splitsPair(splitting, correct, correct)).toBe(false);
  });
});

describe("writeDiscriminating", () => {
  it("asks Opus once, with structured output, for at most two texts; keeps a built record that splits the pair, unchecked by a person", async () => {
    const d = deps([written(splitting.world.problem_text)]);
    const opts: DiscriminateOptions = { build: adopting(splitting), idPrefix: "p_disc_test" };
    const res = await writeDiscriminating(d, base, opts);
    expect(d.judge.requests).toHaveLength(1);
    const req = d.judge.requests[0];
    expect(req?.model).toBe(MODELS.build);
    expect(req?.system).toBe(DISCRIMINATE_SYSTEM);
    expect(req?.schema.type).toBe("object");
    // Both readings, and the problems the app has with whether they split there, are in the cached part.
    expect(req?.cachedContext).toContain("c_correct");
    expect(req?.cachedContext).toContain("s_unit_additive");
    expect(req?.cachedContext).toContain(splitting.world.problem_text);
    expect(res.writer).toBe("ok");
    expect(res.accepted).toHaveLength(1);
    const rec = res.accepted[0] as ProblemRecord;
    expect(rec.world.problem_id).toBe("p_disc_test_1");
    expect(rec.source).toBe("discriminating_bank");
    expect(rec.checks.human_checked).toBe(false);
    expect(res.results[0]?.status).toBe("accepted");
  });

  it("refuses a text whose built world the two readings read alike", async () => {
    const d = deps([written(notSplitting.world.problem_text)]);
    const res = await writeDiscriminating(d, base, { build: adopting(notSplitting) });
    expect(res.accepted).toEqual([]);
    expect(res.results[0]).toMatchObject({ status: "refused", reason: "not_split" });
  });

  it("refuses a text the two independent builds disagree on (the real buildProblem)", async () => {
    const other = FRACTION_BANK.find((r) => r.world.problem_id !== splitting.world.problem_id) as ProblemRecord;
    const submit = (w: unknown, id: string) => ({ stopReason: "tool_use" as const, text: "", toolCalls: [{ id, name: "submit_world", input: { world_json: JSON.stringify(w) } }] });
    const done = { stopReason: "end_turn" as const, text: "done", toolCalls: [] };
    const d: BuildDeps & { judge: FakeClaude } = {
      agent: new FakeAgent([submit(splitting.world, "t1"), done, submit(other.world, "t2"), done]),
      judge: new FakeClaude([written("ためしに書いた問題の文")]),
      listen: new FakeClaude([json({})]),
    };
    const res = await writeDiscriminating(d, base);
    expect(res.accepted).toEqual([]);
    expect(res.results[0]).toMatchObject({ status: "refused", reason: "build_rejected", buildReason: "double_build_mismatch" });
    // Only the writer call reached the judge: the restate check never ran.
    expect(d.judge.requests).toHaveLength(1);
  });

  it("refuses a text the app already has, without building it", async () => {
    let built = 0;
    const d = deps([written(` ${splitting.world.problem_text} `)]);
    const res = await writeDiscriminating(d, { ...base, avoidTexts: [splitting.world.problem_text] }, {
      build: async (x: BuildDeps, i: BuildInput) => {
        built++;
        return adopting(splitting)(x, i);
      },
    });
    expect(built).toBe(0);
    expect(res.results[0]).toMatchObject({ status: "refused", reason: "duplicate_text" });
  });

  it("a refusal or a timeout of the writer gives no texts and builds nothing", async () => {
    let built = 0;
    const build = async (x: BuildDeps, i: BuildInput): Promise<BuildOutcome> => {
      built++;
      return adopting(splitting)(x, i);
    };
    const refused = await writeDiscriminating(deps([stopped("refusal")]), base, { build });
    expect(refused.writer).toBe("no_reply");
    expect(refused.accepted).toEqual([]);
    const late = await writeDiscriminating(deps([json({ problems: [] }, 200)]), base, { build, timeoutMs: 10 });
    expect(late.writer).toBe("no_reply");
    expect(built).toBe(0);
  });

  it("takes at most the asked count of texts and refuses a reply with more", async () => {
    const d = deps([written("一つ目の文", "二つ目の文", "三つ目の文")]);
    const res = await writeDiscriminating(d, base, { build: adopting(splitting), count: 2 });
    // Asked twice (one retry), both replies too long.
    expect(d.judge.requests).toHaveLength(2);
    expect(res.writer).toBe("no_reply");
  });

  it("keeps a reading pair that cannot run on the built world out", async () => {
    const broken: Hypothesis = { ...unitAdditive, id: "x_broken", clauses: [{ when: { pred: "true", args: [] }, then: { action: "choose_reference", by: "no_such_way" as never } }] };
    const res = await writeDiscriminating(deps([written(splitting.world.problem_text)]), { ...base, readingB: broken }, { build: adopting(splitting) });
    expect(res.accepted).toEqual([]);
    expect(res.results[0]?.status).toBe("refused");
  });
});
