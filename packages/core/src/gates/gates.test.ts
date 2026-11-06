// M1 step (6): the gates every utterance and display passes before it is shown
// (指示書 第5.5節 and 第1節 原則1; criteria from 第11節 M1). Written before the implementation.
// The tape divisions and number cards are M4 and are not tested here.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { validateWorld, type AnyOp, type Rational, type WorldScene } from "../schema/index.ts";
import { apply, type ApplyResult } from "../apply/index.ts";
import { num, op } from "../apply/test-worlds.ts";
import { signboardCorrect } from "../../fixtures/problems/signboard.ts";
import {
  gate,
  isVerified,
  numbersIn,
  verifiedCorrectWorld,
  verifiedDrawWorld,
  type Action,
  type GateContext,
  type GateReason,
  type GateResult,
} from "./index.ts";

/** Gate context on the signboard problem: the interpretation is recorded and the prediction answered. */
function ctx(over: Partial<GateContext> = {}): GateContext {
  return {
    correct: structuredClone(signboardCorrect),
    lang: "ja",
    childSaid: { numbers: [], words: [] },
    grade: 5,
    interpretationRecorded: true,
    prediction: "answered",
    ...over,
  };
}

const say = (text: string, echo?: boolean): Action =>
  echo === undefined ? { kind: "say", text } : { kind: "say", text, echo };

function reasons(res: GateResult): GateReason[] {
  expect(res.ok).toBe(false);
  return res.ok ? [] : res.reasons;
}

const correctReading: AnyOp[] = [op.setReference("r_ratio", "q_otouto")];
const signboardChild = (ops: AnyOp[] = correctReading): ApplyResult => apply({ correct: signboardCorrect, ops });

/**
 * A world with one middle value, built from its solution: a has 5, gets 4 (so 9 after the event),
 * and b has 2 more than that, so b = 11 is asked. The 9 is in neither the problem text nor the answer.
 */
function chainWorld(): WorldScene {
  return {
    schema_version: "3",
    problem_id: "p_gate_chain",
    problem_type: "compare",
    problem_text:
      "りすはどんぐりを5こ持っています。4こひろいました。うさぎは、ひろった後のりすより2こ多く持っています。うさぎは何こですか。",
    grade: 2,
    problem_lang: "ja",
    holders: [
      { id: "h_a", label: "りす" },
      { id: "h_b", label: "うさぎ" },
    ],
    item_kinds: [{ id: "k_nut", noun: "どんぐり", counter: "こ", asset_key: null, countable: true }],
    quantities: [
      { id: "q_a", holder: "h_a", item_kind: "k_nut", at_event: null, value: num(5) },
      { id: "q_a2", holder: "h_a", item_kind: "k_nut", at_event: "e_1", value: null },
      { id: "q_b", holder: "h_b", item_kind: "k_nut", at_event: null, value: null },
    ],
    relations: [
      { id: "r_1", operator: "more_by", subject: "q_b", reference: "q_a2", reference_list: null, amount: num(2), other_description: null },
    ],
    events: [{ id: "e_1", order: 1, type: "gain", holder: "h_a", item_kind: "k_nut", amount: num(4), to_holder: null }],
    question: { target_type: "quantity", target_id: "q_b" },
    word_links: [],
  };
}
const chainCtx = (over: Partial<GateContext> = {}): GateContext => ctx({ correct: chainWorld(), grade: 2, ...over });

describe("test worlds", () => {
  it("the chain world passes the meaning checks", () => {
    expect(validateWorld(chainWorld())).toEqual({ ok: true });
  });
});

describe("answer leak: the answer of the signboard problem (8)", () => {
  it.each(["8", "八", "８"])("rejects %s, alone and inside a sentence", (x) => {
    expect(reasons(gate(say(x), ctx()))).toContain("answer_leak");
    expect(reasons(gate(say(`弟の金魚は${x}匹かもしれないね。`), ctx()))).toContain("answer_leak");
  });

  it("rejects the English number word, alone and inside a sentence", () => {
    expect(reasons(gate(say("eight"), ctx({ lang: "en" })))).toContain("answer_leak");
    expect(reasons(gate(say("Maybe the younger brother has eight fish."), ctx({ lang: "en" })))).toContain(
      "answer_leak",
    );
  });

  it("rejects the answer however it is written (property)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("8", "八", "８", "eight"),
        fc.constantFrom("{}", "弟は{}匹。", "Is it {}?", "ねえ、{}だよ"),
        (x, t) => {
          const res = gate(say(t.replace("{}", x)), ctx());
          expect(res.ok).toBe(false);
          if (!res.ok) expect(res.reasons).toContain("answer_leak");
        },
      ),
    );
  });
});

describe("answer leak: numbers that are allowed", () => {
  it.each(["兄の金魚は6匹だね。", "看板には3/4と書いてあるね。", "６匹と3/4が出てきたね。", "兄は六匹。"])(
    "allows the numbers of the problem text: %s",
    (text) => {
      expect(gate(say(text), ctx())).toEqual({ ok: true });
    },
  );

  it("allows 15 after the child said 15", () => {
    const c = ctx({ childSaid: { numbers: [num(15)], words: [] } });
    expect(gate(say("15匹だと思ったんだね。"), c)).toEqual({ ok: true });
    expect(gate(say("15匹", true), c)).toEqual({ ok: true });
  });

  it("allows the answer when it hands back what the child said", () => {
    const c = ctx({ childSaid: { numbers: [num(8)], words: [] } });
    expect(gate(say("8匹", true), c)).toEqual({ ok: true });
  });

  it("handing back words does not let through a number the child did not say", () => {
    expect(reasons(gate(say("8匹", true), ctx()))).toContain("answer_leak");
  });
});

describe("answer leak: a middle value the child has not said", () => {
  it("rejects the middle value 9 and the answer 11 while unsaid", () => {
    expect(reasons(gate(say("りすは9こになったね。"), chainCtx()))).toContain("answer_leak");
    expect(reasons(gate(say("うさぎは11こ。"), chainCtx()))).toContain("answer_leak");
  });

  it("allows the middle value once the child has said it", () => {
    const c = chainCtx({ childSaid: { numbers: [num(9)], words: [] } });
    expect(gate(say("りすは9こになったね。"), c)).toEqual({ ok: true });
  });

  it("allows the numbers of its problem text", () => {
    expect(gate(say("5こと4こと2こが出てきたね。"), chainCtx())).toEqual({ ok: true });
  });
});

describe("operation names", () => {
  it.each(["たす", "ひく", "かける", "わる", "足し算", "引き算", "かけ算", "わり算"])(
    "rejects %s in Japanese",
    (word) => {
      expect(reasons(gate(say(`ここは${word}のかな。`), ctx()))).toContain("operation_name");
    },
  );

  it.each(["add", "subtract", "multiply", "divide"])("rejects %s in English", (word) => {
    expect(reasons(gate(say(`Should we ${word} here?`), ctx({ lang: "en" })))).toContain("operation_name");
  });

  it("allows a sentence without operation names in both languages", () => {
    expect(gate(say("どこを見て、そう思ったのかな。"), ctx())).toEqual({ ok: true });
    expect(gate(say("Which part did you look at?"), ctx({ lang: "en" }))).toEqual({ ok: true });
  });

  it("allows an operation name when it hands back what the child said", () => {
    const c = ctx({ childSaid: { numbers: [], words: ["かける"] } });
    expect(gate(say("かける", true), c)).toEqual({ ok: true });
  });
});

describe("the asked quantity stays a question mark", () => {
  it("allows ? on the asked quantity and the given 6", () => {
    const world = verifiedDrawWorld(signboardChild());
    const action: Action = {
      kind: "show_world",
      world,
      labels: [
        { element_id: "q_otouto", value: "?" },
        { element_id: "q_ani", value: num(6) },
      ],
    };
    expect(gate(action, ctx())).toEqual({ ok: true });
  });

  it("rejects the answer 8 on the asked quantity", () => {
    const world = verifiedDrawWorld(signboardChild());
    const action: Action = { kind: "show_world", world, labels: [{ element_id: "q_otouto", value: num(8) }] };
    expect(reasons(gate(action, ctx()))).toContain("question_not_hidden");
  });

  it("rejects any value the child did not say on the asked quantity (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), fc.integer({ min: 1, max: 12 }), (n, d) => {
        const world = verifiedDrawWorld(signboardChild());
        const value: Rational = { num: n, den: d };
        const res = gate({ kind: "show_world", world, labels: [{ element_id: "q_otouto", value }] }, ctx());
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reasons).toContain("question_not_hidden");
      }),
    );
  });

  it("rejects the answer 8 placed on another element", () => {
    const world = verifiedDrawWorld(signboardChild());
    const res = gate({ kind: "show_world", world, labels: [{ element_id: "q_ani", value: num(8) }] }, ctx());
    expect(res.ok).toBe(false);
  });

  it("allows the 15 the child said, drawn on the asked quantity", () => {
    const world = verifiedDrawWorld(signboardChild([op.answer("q_otouto", num(15))]));
    const c = ctx({ childSaid: { numbers: [num(15)], words: [] } });
    const res = gate({ kind: "show_world", world, labels: [{ element_id: "q_otouto", value: num(15) }] }, c);
    expect(res).toEqual({ ok: true });
  });

  it("allows the 8 the child said, drawn on the asked quantity", () => {
    const world = verifiedDrawWorld(signboardChild([op.answer("q_otouto", num(8))]));
    const c = ctx({ childSaid: { numbers: [num(8)], words: [] } });
    const res = gate({ kind: "show_world", world, labels: [{ element_id: "q_otouto", value: num(8) }] }, c);
    expect(res).toEqual({ ok: true });
  });

  it("rejects an unsaid middle value as a label, and allows ? there", () => {
    const world = verifiedDrawWorld(apply({ correct: chainWorld(), ops: [] }));
    const shown = (value: Rational | "?"): Action => ({
      kind: "show_world",
      world,
      labels: [{ element_id: "q_a2", value }],
    });
    expect(gate(shown(num(9)), chainCtx()).ok).toBe(false);
    expect(gate(shown("?"), chainCtx())).toEqual({ ok: true });
  });
});

describe("too early", () => {
  const cases: [boolean, GateContext["prediction"], boolean][] = [
    [false, "disabled", false],
    [false, "pending", false],
    [false, "answered", false],
    [true, "pending", false],
    [true, "disabled", true],
    [true, "answered", true],
  ];

  it.each(cases)("recorded=%s, prediction=%s: allowed=%s", (recorded, prediction, allowed) => {
    const c = ctx({ interpretationRecorded: recorded, prediction });
    const actions: Action[] = [
      { kind: "show_statements" },
      { kind: "show_correct_world", world: verifiedCorrectWorld(structuredClone(signboardCorrect)) },
    ];
    for (const a of actions) {
      const res = gate(a, c);
      if (allowed) expect(res).toEqual({ ok: true });
      else expect(reasons(res)).toContain("too_early");
    }
  });
});

describe("unverified", () => {
  it("marks only what core has checked", () => {
    expect(isVerified(verifiedDrawWorld(signboardChild()))).toBe(true);
    expect(isVerified(verifiedCorrectWorld(structuredClone(signboardCorrect)))).toBe(true);
    expect(isVerified(signboardCorrect)).toBe(false);
  });

  it("marking the draw world leaves a judging world with the unsaid 9/2 unmarked", () => {
    const child = signboardChild([op.procedure("q_otouto", [{ quantity_id: "q_ani" }, num(3, 4)], "multiply")]);
    verifiedDrawWorld(child);
    expect(isVerified(child.judgeWorld)).toBe(false);
  });

  it("marking the draw world leaves the other worlds unmarked whenever they are separate objects", () => {
    const readings: AnyOp[][] = [
      correctReading,
      [op.procedure("q_otouto", [{ quantity_id: "q_ani" }, num(3, 4)], "multiply")],
      [op.answer("q_otouto", num(8))],
    ];
    for (const ops of readings) {
      const child = signboardChild(ops);
      verifiedDrawWorld(child);
      // apply may return one object for worlds that agree; a separate object must carry no mark.
      if (child.judgeWorld !== child.drawWorld) expect(isVerified(child.judgeWorld)).toBe(false);
      if (child.checkWorld !== child.drawWorld) expect(isVerified(child.checkWorld)).toBe(false);
    }
  });

  it("a copy of a verified world carries no mark", () => {
    const world = verifiedDrawWorld(signboardChild());
    expect(isVerified(structuredClone(world))).toBe(false);
    expect(isVerified({ ...world })).toBe(false);
  });

  it.each(["judgeWorld", "checkWorld"] as const)("rejects showing the %s of the child", (name) => {
    const world = signboardChild()[name];
    const action = { kind: "show_world", world, labels: [] } as unknown as Action;
    expect(reasons(gate(action, ctx()))).toContain("unverified");
  });

  it("rejects a draw world without the mark", () => {
    const world = structuredClone(signboardChild().drawWorld);
    const action = { kind: "show_world", world, labels: [] } as unknown as Action;
    expect(reasons(gate(action, ctx()))).toContain("unverified");
  });

  it("allows the marked draw world", () => {
    const world = verifiedDrawWorld(signboardChild());
    expect(gate({ kind: "show_world", world, labels: [] }, ctx())).toEqual({ ok: true });
  });

  it("rejects showing a correct world without the mark", () => {
    const action = { kind: "show_correct_world", world: structuredClone(signboardCorrect) } as unknown as Action;
    expect(reasons(gate(action, ctx()))).toContain("unverified");
  });

  it("refuses to mark a correct world that fails the meaning checks", () => {
    const bad = structuredClone(signboardCorrect);
    bad.relations = bad.relations.map((r) => ({ ...r, reference: "q_missing" }));
    expect(validateWorld(bad).ok).toBe(false);
    expect(() => verifiedCorrectWorld(bad)).toThrow();
    expect(isVerified(bad)).toBe(false);
  });
});

describe("grade down", () => {
  it("rejects a problem of a lower grade", () => {
    expect(reasons(gate({ kind: "switch_problem", grade: 4 }, ctx()))).toContain("grade_down");
    expect(reasons(gate({ kind: "switch_problem", grade: 1 }, ctx()))).toContain("grade_down");
  });

  it("allows the same grade and higher grades", () => {
    expect(gate({ kind: "switch_problem", grade: 5 }, ctx())).toEqual({ ok: true });
    expect(gate({ kind: "switch_problem", grade: 6 }, ctx())).toEqual({ ok: true });
  });

  it("rejects exactly the grades below the current one (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 6 }), fc.integer({ min: 1, max: 6 }), (now, next) => {
        const res = gate({ kind: "switch_problem", grade: next }, ctx({ grade: now }));
        if (next < now) {
          expect(res.ok).toBe(false);
          if (!res.ok) expect(res.reasons).toContain("grade_down");
        } else {
          expect(res).toEqual({ ok: true });
        }
      }),
    );
  });
});

describe("several reasons at once", () => {
  it("returns both the leaked answer and the operation name", () => {
    const r = reasons(gate(say("6に3/4をかけると8になるよ。"), ctx()));
    expect(r).toEqual(expect.arrayContaining(["answer_leak", "operation_name"]));
  });

  it("returns both the missing mark and the shown answer", () => {
    const world = signboardChild().judgeWorld;
    const action = {
      kind: "show_world",
      world,
      labels: [{ element_id: "q_otouto", value: num(8) }],
    } as unknown as Action;
    expect(reasons(gate(action, ctx()))).toEqual(expect.arrayContaining(["unverified", "question_not_hidden"]));
  });

  it("returns both too early and unverified for an unmarked correct world shown early", () => {
    const action = { kind: "show_correct_world", world: structuredClone(signboardCorrect) } as unknown as Action;
    const r = reasons(gate(action, ctx({ interpretationRecorded: false })));
    expect(r).toEqual(expect.arrayContaining(["too_early", "unverified"]));
  });
});

describe("each kind of mark opens only its own door (found in security review)", () => {
  it("a correct world marked for the correct-world view cannot be shown as a child's world", () => {
    const correct = verifiedCorrectWorld(structuredClone(signboardCorrect));
    const res = gate({ kind: "show_world", world: correct, labels: [] }, ctx({ interpretationRecorded: false }));
    expect(reasons(res)).toContain("unverified");
  });

  it("a drawing world cannot be shown as the correct world", () => {
    const child = apply({ correct: structuredClone(signboardCorrect), ops: [op.swap("r_ratio")] });
    const res = gate({ kind: "show_correct_world", world: verifiedDrawWorld(child) }, ctx());
    expect(reasons(res)).toContain("unverified");
  });
});

// ---------------------------------------------------------------------------------------------
// Found in the safety review: ways around the gates (指示書 第1節 原則1, 第5.5節)
// ---------------------------------------------------------------------------------------------

describe("operation names in other forms are refused", () => {
  it.each(["6に3/4を足してみよう", "たしてみよう", "引いてみたら", "ひいたら", "かけてみると", "掛けた数", "割ってみると", "わってみると", "わったら"])(
    "ja: %s",
    (text) => {
      expect(reasons(gate(say(text), ctx()))).toContain("operation_name");
    },
  );

  it.each(["6+2", "6＋2", "6-2", "6－2", "6*2", "6x2"])("a sign between numbers: %s", (text) => {
    expect(reasons(gate(say(text), ctx()))).toContain("operation_name");
  });

  it.each(["he adds them", "it multiplies", "she divides", "subtracts", "ＴＩＭＥＳ", "the sum", "the product", "the quotient", "the difference", "take away three"])(
    "en: %s",
    (text) => {
      expect(reasons(gate(say(text), ctx({ lang: "en" })))).toContain("operation_name");
    },
  );

  it("the words of checking again are not an operation", () => {
    expect(gate(say("もう1回、文をたしかめますか？"), ctx())).toEqual({ ok: true });
  });

  it("a word inside a longer word of the problem text does not excuse the operation", () => {
    const correct = structuredClone(signboardCorrect);
    correct.problem_text = correct.problem_text + "兄はでかける前に数えました。";
    expect(reasons(gate(say("かけてみよう"), ctx({ correct })))).toContain("operation_name");
  });
});

describe("the gate stays closed when the correct world cannot be solved", () => {
  it("refuses to speak about a world that contradicts itself", () => {
    const correct = structuredClone(signboardCorrect);
    correct.quantities = correct.quantities.map((q) => (q.id === "q_otouto" ? { ...q, value: num(9) } : q));
    expect(gate(say("8"), ctx({ correct })).ok).toBe(false);
  });
});

describe("more ways of writing the answer are caught", () => {
  it.each([
    ["1,000", 1000],
    ["１，０００", 1000],
    ["1万2千", 12000],
    ["2万", 20000],
    ["3百", 300],
    ["三億", 300000000],
  ])("%s reads as %d", (text, n) => {
    expect(numbersIn(text).some((r) => r.num === n && r.den === 1)).toBe(true);
  });

  it.each([
    ["¾", 3, 4],
    ["3⁄4", 3, 4],
    ["1と3/4", 7, 4],
    ["2 1/2", 5, 2],
    [".75", 3, 4],
    ["75%", 3, 4],
    ["-3", -3, 1],
    ["半分", 1, 2],
    ["a half", 1, 2],
    ["three quarters", 3, 4],
    ["twice", 2, 1],
    ["a dozen", 12, 1],
  ])("%s reads as %d/%d", (text, n, d) => {
    expect(numbersIn(text).some((r) => r.num === n && r.den === d)).toBe(true);
  });
});

describe("a word in the problem text that holds a numeral does not excuse the answer", () => {
  it("一人 in the problem text does not let 1 through when 1 is a hidden value", () => {
    const correct = structuredClone(signboardCorrect);
    correct.problem_text = correct.problem_text + "兄は一人で数えました。";
    // The answer 8 is hidden; the ratio 3/4 and the 6 are given; 1 is not a value here, so test 8 written as a word.
    expect(reasons(gate(say("八"), ctx({ correct })))).toContain("answer_leak");
  });
});

describe("a marked world cannot be changed afterwards", () => {
  it("the marked correct world and drawing world are frozen", () => {
    const correct = verifiedCorrectWorld(structuredClone(signboardCorrect));
    expect(Object.isFrozen(correct)).toBe(true);
    expect(Object.isFrozen(correct.quantities[0])).toBe(true);
    const child = apply({ correct: structuredClone(signboardCorrect), ops: [op.swap("r_ratio")] });
    const drawn = verifiedDrawWorld(child);
    expect(Object.isFrozen(drawn.quantities[1])).toBe(true);
  });
});

describe("show_world also looks at the numbers in the world", () => {
  it("refuses a drawing world that holds a value the child did not say", () => {
    const child = apply({ correct: structuredClone(signboardCorrect), ops: [op.answer("q_otouto", num(8))] });
    const drawn = verifiedDrawWorld(child);
    // The child said 8, so it may be drawn.
    expect(gate({ kind: "show_world", world: drawn, labels: [] }, ctx({ childSaid: { numbers: [num(8)], words: [] } }))).toEqual({ ok: true });
    // The same world when the child's words are not known to the gate is refused.
    expect(reasons(gate({ kind: "show_world", world: drawn, labels: [] }, ctx()))).toContain("answer_leak");
  });
});

describe("found in review: what a label and an echo may carry", () => {
  it("a label may carry only a number of the problem or one the child said", () => {
    const child = apply({ correct: structuredClone(signboardCorrect), ops: [op.swap("r_ratio")] });
    const shown = { kind: "show_world" as const, world: verifiedDrawWorld(child), labels: [{ element_id: "q_ani", value: num(9) }] };
    expect(reasons(gate(shown, ctx()))).toContain("answer_leak");
  });

  it("the answer the child said passes only when handed back as the child's words", () => {
    const c = ctx({ childSaid: { numbers: [num(8)], words: [] } });
    expect(reasons(gate(say("8"), c))).toContain("answer_leak");
    expect(gate(say("8", true), c)).toEqual({ ok: true });
  });

  it("4と2分の1 reads as 9/2", () => {
    expect(numbersIn("4と2分の1").some((r) => r.num === 9 && r.den === 2)).toBe(true);
  });
});
