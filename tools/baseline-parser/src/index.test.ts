// The keyword baseline for the interpretation eval (指示書 第10.1節, 第11節 M2).
// It picks the operation from cue words only, so it is right where the words point to the needed
// operation and wrong where they point the other way. Every result must still be a valid interpretation.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  apply,
  eq,
  fromSchema,
  schemas,
  validateOps,
  type AnyOp,
  type ProblemRecord,
  type Rational,
} from "@kimi/core";
import { PROVISIONAL } from "../../../packages/core/fixtures/problems/provisional.ts";
import { signboardRecord } from "../../../packages/core/fixtures/problems/signboard-record.ts";
import { parseKeywords } from "./index.ts";

const r = (num: number, den = 1): Rational => ({ num, den });
const qid = (quantity_id: string) => ({ quantity_id });

function record(id: string): ProblemRecord {
  const found = PROVISIONAL.find((p) => p.record.world.problem_id === id);
  if (found === undefined) throw new Error(`no provisional problem ${id}`);
  return found.record;
}

type Procedure = Extract<AnyOp, { op: "state_procedure" }>;

function onlyProcedure(rec: ProblemRecord, transcript: string): Procedure {
  const res = parseKeywords(rec, transcript);
  expect(res.ops).toHaveLength(1);
  const op = res.ops[0];
  expect(op?.op).toBe("state_procedure");
  return op as Procedure;
}

describe("cue word families", () => {
  // Each transcript holds "6" (the older brother's given count) before "2", so operands are [q_ani, 2].
  const families: [string, Procedure["operation"]][] = [
    ["6と2をかける", "multiply"],
    ["6の2倍", "multiply"],
    ["6の2ばい", "multiply"],
    ["6を2でわる", "divide"],
    ["6を2でわった", "divide"],
    ["6と2でわりざん", "divide"],
    ["6を2で割る", "divide"],
    ["6と2をたす", "add"],
    ["6と2をたした", "add"],
    ["6と2をあわせる", "add"],
    ["6と2を合わせる", "add"],
    ["6より2多い", "add"],
    ["6より2おおい", "add"],
    ["6から2ふえる", "add"],
    ["6から2をひく", "subtract"],
    ["6から2をひいた", "subtract"],
    ["6より2少ない", "subtract"],
    ["6より2すくない", "subtract"],
    ["6から2へった", "subtract"],
    ["6と2のちがい", "subtract"],
    ["6 times 2", "multiply"],
    ["divide 6 by 2", "divide"],
    ["6 plus 2", "add"],
    ["add 6 and 2", "add"],
    ["6 minus 2", "subtract"],
  ];
  for (const [text, operation] of families) {
    it(`"${text}" -> ${operation}`, () => {
      const op = onlyProcedure(signboardRecord, text);
      expect(op.operation).toBe(operation);
      expect(op.target_id).toBe("q_otouto");
      expect(op.operands).toEqual([qid("q_ani"), r(2)]);
    });
  }

  it("operands keep text order (English of and more than put the other number first)", () => {
    expect(onlyProcedure(signboardRecord, "3/4 of 6")).toMatchObject({ operation: "multiply", operands: [r(3, 4), qid("q_ani")] });
    expect(onlyProcedure(signboardRecord, "2 more than 6")).toMatchObject({ operation: "add", operands: [r(2), qid("q_ani")] });
    expect(onlyProcedure(signboardRecord, "2 less than 6")).toMatchObject({ operation: "subtract", operands: [r(2), qid("q_ani")] });
  });

  it("the first cue word in the text wins", () => {
    expect(onlyProcedure(signboardRecord, "6に2をかけて、たす").operation).toBe("multiply");
    expect(onlyProcedure(signboardRecord, "6に2をたして、かける").operation).toBe("add");
    expect(onlyProcedure(signboardRecord, "6から2をひいて、わる").operation).toBe("subtract");
  });
});

describe("numbers", () => {
  it("reads a fraction a/b", () => {
    expect(onlyProcedure(signboardRecord, "6に3/4をかける").operands).toEqual([qid("q_ani"), r(3, 4)]);
  });

  it("reads b分のa as a/b", () => {
    expect(onlyProcedure(signboardRecord, "6に4分の3をかける").operands).toEqual([qid("q_ani"), r(3, 4)]);
  });

  it("reads kanji numerals, also inside 分の", () => {
    expect(onlyProcedure(signboardRecord, "六に四分の三をかける").operands).toEqual([qid("q_ani"), r(3, 4)]);
    expect(onlyProcedure(signboardRecord, "十を二でわる").operands).toEqual([r(10), r(2)]);
  });

  it("reads full-width digits", () => {
    expect(onlyProcedure(signboardRecord, "６に２をかける").operands).toEqual([qid("q_ani"), r(2)]);
  });

  it("maps a number to a quantity id only when it equals a given quantity value, not a relation amount", () => {
    // p_rate_c: the box count 4 is a given quantity; 6 is the per-box amount of a relation.
    const op = onlyProcedure(record("p_rate_c"), "6と4をかける");
    expect(op.target_id).toBe("q_cookie");
    expect(op.operands).toEqual([r(6), qid("q_box")]);
  });

  it("with one number, the other operand is the first given quantity", () => {
    const op = onlyProcedure(signboardRecord, "3/4をかける");
    // The order of the two operands in this case is left open by the design.
    expect(op.operands).toHaveLength(2);
    expect(op.operands).toEqual(expect.arrayContaining([qid("q_ani"), r(3, 4)]));
  });
});

describe("answers without a cue word", () => {
  const answers = ["答えは8", "答え8", "8匹", "8匹です", "答えは八"];
  for (const text of answers) {
    it(`"${text}" -> state_answer 8 on the question target`, () => {
      const res = parseKeywords(signboardRecord, text);
      expect(res.representable).toBe("full");
      expect(res.ops).toEqual([{ op: "state_answer", target_id: "q_otouto", number: r(8), evidence: expect.any(String) }]);
    });
  }
});

describe("no cue word", () => {
  for (const text of ["", "わからない", "6と3/4", "えっと、うーん"]) {
    it(`"${text}" -> representable none, no ops`, () => {
      const res = parseKeywords(signboardRecord, text);
      expect(res.representable).toBe("none");
      expect(res.ops).toEqual([]);
    });
  }
});

describe("the interpretation it returns", () => {
  it("has the fixed fields of interpretation v6", () => {
    const res = parseKeywords(signboardRecord, "6に3/4をかける");
    expect(res.schema_version).toBe("6");
    expect(res.representable).toBe("full");
    expect(res.unclear).toEqual([]);
    expect(res.phrases).toEqual([]);
  });

  it("utterance_lang is en for latin letters only, else ja", () => {
    expect(parseKeywords(signboardRecord, "6 times 2").utterance_lang).toBe("en");
    expect(parseKeywords(signboardRecord, "6に2をかける").utterance_lang).toBe("ja");
    expect(parseKeywords(signboardRecord, "6 timesかける2").utterance_lang).toBe("ja");
  });

  // Fragments that reach every branch: cue words, number forms, answers and filler.
  const fragment = fc.constantFrom(
    "6", "8", "4", "2", "0", "3/4", "4分の3", "四分の三", "六", "十", "６", "２４", "12", "36", "60", "20",
    "かける", "倍", "わる", "割", "たす", "あわせ", "多い", "ひく", "少ない", "ちがい",
    "times", "of", "divide", "plus", "minus", "more", "less", "add",
    "答えは", "匹", "です", "に", "を", "で", "と", "から", "より", "、", " ", "えっと", "?",
  );
  const transcript = fc.oneof(
    fc.array(fragment, { maxLength: 8 }).map((xs) => xs.join("")),
    fc.string({ unit: "grapheme", maxLength: 30 }),
  );
  const records = fc.constantFrom(...PROVISIONAL.map((p) => p.record));

  it("always passes the zod interpretation schema and validateOps on the world", () => {
    fc.assert(
      fc.property(records, transcript, (rec, text) => {
        const res = parseKeywords(rec, text);
        expect(schemas.interpretation.safeParse(res).success).toBe(true);
        expect(validateOps(rec.world, res.ops)).toEqual({ ok: true });
        expect(res.representable).toBe(res.ops.length > 0 ? "full" : "none");
        expect(res.ops.length).toBeLessThanOrEqual(1);
        for (const op of res.ops) {
          expect(["state_procedure", "state_answer"]).toContain(op.op);
          if (op.op === "state_procedure" || op.op === "state_answer") expect(op.target_id).toBe(rec.world.question.target_id);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("is deterministic and does not change the record", () => {
    fc.assert(
      fc.property(records, transcript, (rec, text) => {
        const before = structuredClone(rec);
        expect(parseKeywords(rec, text)).toEqual(parseKeywords(rec, text));
        expect(rec).toEqual(before);
      }),
      { numRuns: 300 },
    );
  });
});

describe("the keyword strategy fails exactly on the inconsistent problems", () => {
  // Each pair is read by its words: in the consistent problem they point to the needed operation, in the
  // inconsistent one they point the other way, so one strategy gets the first right and the second wrong.
  const pairs: { consistent: [string, string]; inconsistent: [string, string] }[] = [
    { consistent: ["p_fraction_c", "8に3/4をかける"], inconsistent: ["p_signboard", "6に3/4をかける"] },
    { consistent: ["p_percent_c", "60に4分の1をかける"], inconsistent: ["p_percent_i", "15に4分の1をかける"] },
    { consistent: ["p_ratio_c", "20に5分の3をかける"], inconsistent: ["p_ratio_i", "12に5分の3をかける"] },
    { consistent: ["p_rate_c", "6に4をかける"], inconsistent: ["p_rate_i", "24に6をかける"] },
    { consistent: ["p_speed_c", "12に3をかける"], inconsistent: ["p_speed_i", "36に12をかける"] },
  ];

  function askedValue(rec: ProblemRecord, text: string): Rational | null {
    const res = parseKeywords(rec, text);
    expect(res.ops).toHaveLength(1);
    const judged = apply({ correct: rec.world, ops: res.ops }).judgeWorld;
    return judged.quantities.find((q) => q.id === rec.world.question.target_id)?.value ?? null;
  }

  const same = (a: Rational | null, b: Rational | null) => a !== null && b !== null && eq(fromSchema(a), fromSchema(b));

  for (const { consistent, inconsistent } of pairs) {
    it(`${consistent[0]} right, ${inconsistent[0]} wrong`, () => {
      const c = record(consistent[0]);
      const i = record(inconsistent[0]);
      expect(c.consistency).toBe("consistent");
      expect(i.consistency).toBe("inconsistent");
      expect(same(askedValue(c, consistent[1]), c.expected_answer)).toBe(true);
      expect(same(askedValue(i, inconsistent[1]), i.expected_answer)).toBe(false);
    });
  }

  it("gives the signboard the procedure reading: multiply 6 and 3/4 on the asked quantity", () => {
    const res = parseKeywords(signboardRecord, "6に3/4をかける");
    expect(res.ops).toEqual([
      {
        op: "state_procedure",
        target_id: "q_otouto",
        operands: [qid("q_ani"), r(3, 4)],
        operation: "multiply",
        evidence: expect.any(String),
      },
    ]);
    const judged = apply({ correct: signboardRecord.world, ops: res.ops }).judgeWorld;
    expect(judged.quantities.find((q) => q.id === "q_otouto")?.value).toEqual(r(9, 2));
  });
});
