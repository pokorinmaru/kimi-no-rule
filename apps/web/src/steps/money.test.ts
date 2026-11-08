// The sale problem on the step flow (Q63): money is drawn as 100円 coins while the questions and answers stay in 円.
// The step words say what one coin is worth, never read a coin count as yen, and ask about 定価 and 代金 as things,
// not as people.
import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import { PREPARED_BANK } from "@kimi/core";
import { flowMachine } from "../flow/machine.ts";
import { viewOf } from "../flow/view.ts";

const r = (n: number) => ({ num: n, den: 1 });
function sale(lang: "ja" | "en" = "ja") {
  const a = createActor(flowMachine, { input: { introSeen: true, consented: true, bank: PREPARED_BANK, firstProblemId: "p_sale", stepFlow: true, lang } });
  a.start();
  return a;
}
const v = (a: ReturnType<typeof sale>) => viewOf(a.getSnapshot()) as unknown as { kind: string; lead: string | null; question: string | null };

describe("the sale problem's step words", () => {
  it("asks 定価 and 代金 as things, and says what one coin is worth wherever coins are drawn", () => {
    const a = sale();
    expect(v(a).question).toBe("定価は、なん円？");
    expect(v(a).lead).toBe("絵の 100円玉 1枚は 100円。");
    a.send({ type: "STEP_NUMBER", value: r(500) });
    expect(v(a).question).toBe("代金は、どちらと くらべている？");
    expect(v(a).lead).toBe("絵の 100円玉 1枚は 100円。");
  });

  it("says the other reading's world in coins, never a coin count read as yen", () => {
    const a = sale();
    a.send({ type: "STEP_NUMBER", value: r(500) });
    a.send({ type: "STEP_CHOOSE", holderId: "h_pay" });
    const lead = v(a).lead ?? "";
    expect(lead).toContain("代金は 100円玉 6枚と、1枚に たりない 100円玉。");
    expect(lead).toContain("AIくんが 代金と くらべて 読むと");
    expect(lead).not.toMatch(/6円|1円に/);
  });

  it("keeps the questions in 円 with the coin note on the parts", () => {
    const a = sale();
    a.send({ type: "STEP_NUMBER", value: r(500) });
    a.send({ type: "STEP_CHOOSE", holderId: "h_list" });
    expect(v(a).kind).toBe("unit");
    expect(v(a).question).toBe("定価の 500円を 5つに わけると、1つぶんは なん円？");
    expect(v(a).lead).toContain("絵の 100円玉 1枚は 100円。");
  });

  it("in English too", () => {
    const a = sale("en");
    expect(v(a).lead).toBe("In the picture, one 100円玉 is 100円.");
  });

  it("comes third on the child's route, after the two festival stories", () => {
    const a = createActor(flowMachine, { input: { introSeen: true, consented: true, bank: PREPARED_BANK, firstProblemId: "p_festival_whole", stepFlow: true } });
    a.start();
    const id = () => a.getSnapshot().context.problem?.record.world.problem_id;
    const solve = (fact: number, ref: string, unit: number, total: number) => {
      a.send({ type: "STEP_NUMBER", value: r(fact) });
      a.send({ type: "STEP_CHOOSE", holderId: ref });
      a.send({ type: "STEP_NUMBER", value: r(unit) });
      a.send({ type: "STEP_NUMBER", value: r(total) });
      a.send({ type: "NEXT" });
      // The research request after a problem is answered as the session does without Claude.
      a.send({ type: "RESEARCH_RESULT", pool: null });
    };
    expect(id()).toBe("p_festival_whole");
    solve(8, "h_me", 2, 6);
    expect(id()).toBe("p_festival");
    solve(6, "h_ai", 2, 8);
    expect(id()).toBe("p_sale");
  });

  it("leaves the goldfish problems' words as they were", () => {
    const a = createActor(flowMachine, { input: { introSeen: true, consented: true, bank: PREPARED_BANK, firstProblemId: "p_festival_whole", stepFlow: true } });
    a.start();
    expect((viewOf(a.getSnapshot()) as unknown as { question: string }).question).toBe("そらの 金魚は、なん匹？");
  });
});
