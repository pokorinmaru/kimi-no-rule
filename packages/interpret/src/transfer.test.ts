// Transfer problems written offline (指示書 第6.7節 手順6; Q33): after a child fixes a reading, a problem on which
// the old reading would fail, either with the wording of the fixed problem or with another known phrasing.
// Opus writes the text; the one build of 第6.6節 turns it into a record; core decides whether it is kept: the
// sentences and problem conditions hold, the old reading builds a world other than the correct one, and the
// wording is the one asked for. Only fake Claude is used; every check runs the real core. Written first.
import { describe, expect, it } from "vitest";
import { COMMON_FRACTION_READINGS, FRACTION_BANK, type Hypothesis, type ProblemRecord } from "@kimi/core";
import type { BuildDeps, BuildInput, BuildOutcome } from "./build.ts";
import { MODELS } from "./client.ts";
import { FakeAgent, FakeClaude, json, stopped, type FakeReply } from "./fake.ts";
import { TRANSFER_SOURCE, TRANSFER_SYSTEM, oldReadingFails, writeTransfer, type TransferInput } from "./transfer.ts";

const common = (id: string): Hypothesis => {
  const h = COMMON_FRACTION_READINGS.find((x) => x.id === id);
  if (h === undefined) throw new Error(id);
  return h;
};
const bank = (id: string): ProblemRecord => {
  const r = FRACTION_BANK.find((x) => x.world.problem_id === id);
  if (r === undefined) throw new Error(id);
  return r;
};
const swap = common("c_swap");
const knownWhole = common("c_known_whole");
// The fixed problem has the plain の; the sticker problem keeps it, the みかん problem says に対して, the flower
// problem says をもとにすると. c_swap fails on all three; c_known_whole reads the みかん problem correctly.
const fixed = bank("p_fraction_c");
const plainOther = bank("p_bank_sticker");
const taishite = bank("p_bank_taishite");
const motoni = bank("p_bank_motoni");

const deps = (writer: FakeReply[]): BuildDeps & { judge: FakeClaude } => ({
  agent: new FakeAgent([{ stopReason: "end_turn", text: "done", toolCalls: [] }]),
  judge: new FakeClaude(writer),
  listen: new FakeClaude([json({})]),
});
const written = (problem_text: string): FakeReply => json({ problem_text, consistency: "consistent", why: "the old reading takes the other holder as 1" });

/** A build that adopts the given record under the asked id, as buildProblem would hand it back. */
const adopting =
  (record: ProblemRecord) =>
  async (_deps: BuildDeps, input: BuildInput): Promise<BuildOutcome> => ({
    status: "adopted",
    record: {
      ...structuredClone(record),
      world: { ...structuredClone(record.world), problem_id: input.problemId },
      source: input.source,
      consistency: input.consistency,
      checks: { double_build_match: true, restate_match: true, misread_pass_rate: 0.6, human_checked: false },
    },
    log: [{ step: "adopt", ok: true, detail: input.problemId }],
  });

const input = (o: Partial<TransferInput> = {}): TransferInput => ({ oldReading: swap, fixed, wording: "same", avoidTexts: [fixed.world.problem_text], ...o });

describe("oldReadingFails", () => {
  it("is core predict: the old reading and the correct one build different worlds", () => {
    expect(oldReadingFails(taishite, swap)).toBe(true);
    expect(oldReadingFails(taishite, knownWhole)).toBe(false);
    expect(oldReadingFails(taishite, common("c_correct"))).toBe(false);
  });
});

describe("writeTransfer", () => {
  it("same wording: asks Opus once with structured output, keeps a built record the old reading fails on, unchecked by a person", async () => {
    const d = deps([written(plainOther.world.problem_text)]);
    const res = await writeTransfer(d, input(), { build: adopting(plainOther), problemId: "p_transfer_test_1" });
    expect(d.judge.requests).toHaveLength(1);
    const req = d.judge.requests[0];
    expect(req?.model).toBe(MODELS.build);
    expect(req?.system).toBe(TRANSFER_SYSTEM);
    expect(req?.schema.type).toBe("object");
    expect(req?.cachedContext).toContain("c_swap");
    expect(req?.cachedContext).toContain(fixed.world.problem_text);
    expect(req?.userText).toMatch(/same/i);
    expect(res.writer).toBe("ok");
    expect(res.item).toMatchObject({ status: "accepted", problemId: "p_transfer_test_1", wording: "same" });
    const rec = res.record as ProblemRecord;
    expect(rec.source).toBe(TRANSFER_SOURCE);
    expect(rec.checks.human_checked).toBe(false);
    // The misread rate is recorded, not a gate (Q44).
    expect(rec.checks.misread_pass_rate).toBe(0.6);
  });

  it("different wording: the request names the other phrasings and not the fixed problem's; a text with one of them is kept", async () => {
    const d = deps([written(taishite.world.problem_text)]);
    const motoniFixed = await writeTransfer(deps([written(taishite.world.problem_text)]), input({ fixed: motoni, wording: "different", avoidTexts: [] }), { build: adopting(taishite) });
    expect(motoniFixed.item?.status).toBe("accepted");
    const res = await writeTransfer(d, input({ wording: "different" }), { build: adopting(taishite) });
    const text = d.judge.requests[0]?.userText ?? "";
    expect(text).toContain("に対して");
    expect(text).toContain("をもとにする");
    expect(res.item).toMatchObject({ status: "accepted", wording: "different" });
  });

  it("refuses a text whose wording is not the one asked for, without building it", async () => {
    let built = 0;
    const build = async (x: BuildDeps, i: BuildInput): Promise<BuildOutcome> => {
      built++;
      return adopting(motoni)(x, i);
    };
    const same = await writeTransfer(deps([written(motoni.world.problem_text)]), input(), { build });
    expect(same.item).toMatchObject({ status: "refused", reason: "wording_mismatch" });
    const diff = await writeTransfer(deps([written(plainOther.world.problem_text)]), input({ wording: "different" }), { build });
    expect(diff.item).toMatchObject({ status: "refused", reason: "wording_mismatch" });
    expect(built).toBe(0);
  });

  it("refuses a record whose built text lost the asked wording", async () => {
    const res = await writeTransfer(deps([written(taishite.world.problem_text)]), input({ wording: "different" }), { build: adopting(plainOther) });
    expect(res.item).toMatchObject({ status: "refused", reason: "wording_mismatch" });
    expect(res.record).toBeNull();
  });

  it("refuses a record on which the old reading builds the correct world", async () => {
    const res = await writeTransfer(deps([written(taishite.world.problem_text)]), input({ oldReading: knownWhole, wording: "different" }), { build: adopting(taishite) });
    expect(res.item).toMatchObject({ status: "refused", reason: "old_reading_holds" });
    expect(res.record).toBeNull();
  });

  it("refuses a text the app already has, without building it", async () => {
    let built = 0;
    const res = await writeTransfer(deps([written(` ${fixed.world.problem_text} `)]), input(), {
      build: async (x: BuildDeps, i: BuildInput) => {
        built++;
        return adopting(plainOther)(x, i);
      },
    });
    expect(built).toBe(0);
    expect(res.item).toMatchObject({ status: "refused", reason: "duplicate_text" });
  });

  it("passes on a build rejection with its reason", async () => {
    const build = async (): Promise<BuildOutcome> => ({ status: "rejected", reason: "double_build_mismatch", log: [{ step: "reject", ok: false, detail: "x" }] });
    const res = await writeTransfer(deps([written(plainOther.world.problem_text)]), input(), { build });
    expect(res.item).toMatchObject({ status: "refused", reason: "build_rejected", buildReason: "double_build_mismatch" });
  });

  it("a refusal or a timeout of the writer gives no text and builds nothing", async () => {
    let built = 0;
    const build = async (x: BuildDeps, i: BuildInput): Promise<BuildOutcome> => {
      built++;
      return adopting(plainOther)(x, i);
    };
    const refused = await writeTransfer(deps([stopped("refusal")]), input(), { build });
    expect(refused).toEqual({ writer: "no_reply", record: null, item: null });
    const late = await writeTransfer(deps([json({ problem_text: "x", consistency: "consistent", why: "w" }, 200)]), input(), { build, timeoutMs: 10 });
    expect(late.writer).toBe("no_reply");
    expect(built).toBe(0);
  });

  it("a reading that cannot run on the built world is refused", async () => {
    const broken: Hypothesis = { ...swap, id: "x_broken", clauses: [{ when: { pred: "true", args: [] }, then: { action: "choose_reference", by: "no_such_way" as never } }] };
    const res = await writeTransfer(deps([written(plainOther.world.problem_text)]), input({ oldReading: broken }), { build: adopting(plainOther) });
    expect(res.item?.status).toBe("refused");
    expect(res.record).toBeNull();
  });
});
