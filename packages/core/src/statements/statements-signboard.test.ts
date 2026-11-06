// The signboard problem through check_statements (指示書 第11節 M1, 第5.7節, 第5.3節).
// Each reading is given as the ops a child might say; the apply tests show which world each one makes.
import { describe, expect, it } from "vitest";
import { schemas, type AnyOp } from "../schema/index.ts";
import { apply } from "../apply/index.ts";
import { num, op, phrase } from "../apply/test-worlds.ts";
import { signboardCorrect } from "../../fixtures/problems/signboard.ts";
import { signboardRecord } from "../../fixtures/problems/signboard-record.ts";
import { checkStatements, type CheckResult, type StatementCheck } from "./index.ts";

/** Phrases on every element the sentences name (a matching world touches them all: 指示書 第5.4節). */
const allPhrases = () => [...new Set(signboardRecord.statements.flatMap((s) => s.element_ids))].map((id) => phrase(id));

function check(ops: AnyOp[], phrases: ReturnType<typeof allPhrases> = []): CheckResult {
  const correct = structuredClone(signboardRecord.world);
  return checkStatements({
    correct,
    statements: signboardRecord.statements,
    syntaxMarks: signboardRecord.syntax_marks,
    ops,
    child: apply({ correct, ops, phrases }),
  });
}

function checked(res: CheckResult): StatementCheck[] {
  expect(res.kind).toBe("checked");
  if (res.kind !== "checked") throw new Error("not checked");
  return res.statements;
}

const verdicts = (res: CheckResult) => checked(res).map((s) => s.verdict);
const cuesOf = (res: CheckResult, i: number) =>
  [...(checked(res)[i]?.cues ?? [])].sort((a, b) => a.token_start - b.token_start);

const correctReading: AnyOp[] = [op.setReference("r_ratio", "q_otouto")];
const proceduralReading: AnyOp[] = [op.procedure("q_otouto", [{ quantity_id: "q_ani" }, num(3, 4)], "multiply")];
const additiveReading: AnyOp[] = [op.setRelationOperator("r_ratio", "less_by"), op.setRelationAmount("r_ratio", num(3))];
const swappedReading: AnyOp[] = [op.swap("r_ratio")];

describe("signboard record", () => {
  it("passes the problem-record schema and keeps the world of the signboard fixture", () => {
    expect(() => schemas.problemRecord.parse(signboardRecord)).not.toThrow();
    expect(signboardRecord.world).toEqual(signboardCorrect);
  });

  it("each sentence is its tokens joined, found in the problem text, indexed in order", () => {
    signboardRecord.statements.forEach((s, i) => {
      expect(s.index).toBe(i);
      expect(s.tokens.join("")).toBe(s.text);
      expect(signboardRecord.world.problem_text).toContain(s.text);
    });
    expect(signboardRecord.statements.filter((s) => s.is_question).map((s) => s.index)).toEqual([2]);
  });

  it("each mark sits on its word, and the relation marks point to r_ratio", () => {
    for (const m of signboardRecord.syntax_marks) {
      const words = signboardRecord.statements[m.statement_index]?.tokens ?? [];
      expect(words.slice(m.token_start, m.token_end + 1).join("")).toBe(m.word);
    }
    const relationMarks = signboardRecord.syntax_marks.filter(
      (m) => m.kind === "relation_word" || m.kind === "ratio_notation",
    );
    expect(relationMarks.map((m) => [m.kind, m.word, m.element_id])).toEqual([
      ["relation_word", "の", "r_ratio"],
      ["ratio_notation", "3/4", "r_ratio"],
    ]);
  });
});

describe("signboard: read as written", () => {
  it("all three sentences hold, with no cue", () => {
    const res = check(correctReading, allPhrases());
    expect(verdicts(res)).toEqual(["holds", "holds", "holds"]);
    for (const s of checked(res)) expect(s.cues).toEqual([]);
  });

  it("also with the correct answer said", () => {
    expect(verdicts(check([...correctReading, op.answer("q_otouto", num(8))], allPhrases()))).toEqual(["holds", "holds", "holds"]);
  });
});

describe("signboard: multiply what is given (procedure, Q17)", () => {
  it("the 6 stays in the drawing and checking worlds; only the judging world gives it up", () => {
    const correct = structuredClone(signboardRecord.world);
    const res = apply({ correct, ops: proceduralReading });
    expect(res.draw.released).toEqual([]);
    expect(res.judge.released).toEqual(["q_ani"]);
  });

  it("the ratio sentence fails: the procedure value 9/2 does not satisfy it with the given 6", () => {
    expect(verdicts(check(proceduralReading, allPhrases()))).toEqual(["holds", "fails", "holds"]);
  });

  it("the sentence of the 6 is not decided when the child's words did not touch it", () => {
    expect(verdicts(check(proceduralReading))).toEqual(["undetermined", "fails", "holds"]);
  });
});

describe("signboard: the 3 read as a difference (additive)", () => {
  it("the ratio sentence fails and the question sentence holds", () => {
    const res = checked(check(additiveReading));
    expect(res[1]?.verdict).toBe("fails");
    expect(res[2]?.verdict).toBe("holds");
  });

  it("with every element named, only the ratio sentence fails", () => {
    expect(verdicts(check(additiveReading, allPhrases()))).toEqual(["holds", "fails", "holds"]);
  });

  it("the reference is still the younger brother, so there is no cue", () => {
    expect(cuesOf(check(additiveReading), 1)).toEqual([]);
  });
});

describe("signboard: an answer said as a number only", () => {
  it("is not checked", () => {
    expect(check([op.answer("q_otouto", num(8))])).toEqual({ kind: "number_only" });
  });
});

describe("signboard: the direction swapped", () => {
  it("the ratio sentence fails and the question sentence holds", () => {
    const res = checked(check(swappedReading));
    expect(res[1]?.verdict).toBe("fails");
    expect(res[2]?.verdict).toBe("holds");
  });

  it("with every element named, only the ratio sentence fails", () => {
    expect(verdicts(check(swappedReading, allPhrases()))).toEqual(["holds", "fails", "holds"]);
  });

  it("both relation marks are tied to the older brother, who is now the reference", () => {
    expect(cuesOf(check(swappedReading), 1)).toEqual([
      { statement_index: 1, token_start: 8, token_end: 8, word: "の", linked_to: "q_ani" },
      { statement_index: 1, token_start: 9, token_end: 9, word: "3/4", linked_to: "q_ani" },
    ]);
  });

  it("no cue is tied to the younger brother, the reference the sentence names", () => {
    for (const cue of cuesOf(check(swappedReading), 1)) expect(cue.linked_to).not.toBe("q_otouto");
  });
});

describe("signboard: inputs", () => {
  it("check_statements does not change the record or the fixture", () => {
    const before = structuredClone(signboardRecord);
    for (const ops of [correctReading, proceduralReading, additiveReading, swappedReading]) check(ops);
    expect(signboardRecord).toEqual(before);
    expect(signboardCorrect).toEqual(before.world);
  });
});

describe("signboard: sentences the child's words did not touch (指示書 第5.7節)", () => {
  it("the given 6 is not decided yet when only the ratio was touched", () => {
    expect(verdicts(check(correctReading))).toEqual(["undetermined", "holds", "holds"]);
  });

  it("the given 6 holds once the child's words touch it", () => {
    expect(verdicts(check(correctReading, [phrase("q_ani")]))).toEqual(["holds", "holds", "holds"]);
  });
});

describe("signboard: a number with words on the relation is checked", () => {
  it("is not number_only when a phrase touches the ratio", () => {
    const res = check([op.answer("q_otouto", num(8))], [phrase("r_ratio")]);
    expect(res.kind).toBe("checked");
  });
});
