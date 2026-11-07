// 指示書 第7.1節 手順4・5 and 第11節 M7: the junior's staged questions for a child who is stuck, and the word book
// (ことばの絵本). The two openings the criteria require, what every help screen never shows, the three buttons,
// research that does not count a reading after the book, and the junior that never names who is taken as 1.
import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import { FRACTION_BANK, hasOperationName, numbersIn, solve, toSchema, wordbookPagesOf, type ProblemRecord, type Rational } from "@kimi/core";
import { flowMachine, type FlowInput } from "./machine.ts";
import { childTexts, viewOf, type FlowView } from "./view.ts";
import { hasForbiddenPhrase, ui } from "./text.ts";

const byId = (id: string): ProblemRecord => {
  const r = FRACTION_BANK.find((x) => x.world.problem_id === id);
  if (r === undefined) throw new Error(`no ${id}`);
  return r;
};

/** Problems that all use the plain の, so the second one's wording is not new in the session. */
const NO_BANK: ProblemRecord[] = FRACTION_BANK.filter((r) => wordbookPagesOf(r)[0] === "no");

function run(input: FlowInput = {}) {
  const actor = createActor(flowMachine, { input: { introSeen: true, consented: true, ...input } });
  actor.start();
  return actor;
}
type Actor = ReturnType<typeof run>;

const view = (a: Actor): FlowView => viewOf(a.getSnapshot());

function ends(a: Actor): { subject: string; reference: string } {
  const p = a.getSnapshot().context.problem;
  const rel = p?.record.world.relations.find((x) => x.id === p.relationId);
  if (rel === undefined || rel.reference === null) throw new Error("no relation");
  return { subject: rel.subject, reference: rel.reference };
}

/** One fix: the "1" card on the reference (every sentence fits) or on the other end (a sentence stays lit). */
function fix(a: Actor, right: boolean): void {
  const e = ends(a);
  a.send({ type: "PLACE_ONE", quantityId: right ? e.reference : e.subject });
  a.send({ type: "CONFIRM_YES" });
}

/** The values a help screen must never show: the problem's answer and every value on the way it does not give. */
function hidden(r: ProblemRecord): Rational[] {
  const res = solve(r.world);
  if (res.kind !== "unique") return [];
  const given = numbersIn(r.world.problem_text);
  return [...res.values.values()].map(toSchema).filter((v) => !given.some((g) => g.num * v.den === v.num * g.den));
}

function holderLabels(r: ProblemRecord): { reference: string; all: string[] } {
  const rel = r.world.relations[0];
  const refHolder = r.world.quantities.find((q) => q.id === rel?.reference)?.holder;
  return { reference: r.world.holders.find((h) => h.id === refHolder)?.label ?? "?", all: r.world.holders.map((h) => h.label) };
}

/** What every help and word book screen keeps (in the screen's language): no answer, no operation, no judging word, the junior names no holder. */
function checkHelpScreen(a: Actor, lang: "ja" | "en" = "ja"): void {
  const s = a.getSnapshot();
  const v = viewOf(s, lang);
  expect(["help", "wordbook"]).toContain(v.screen);
  const p = s.context.problem as NonNullable<typeof s.context.problem>;
  const texts = childTexts(v);
  const secret = hidden(p.record);
  for (const t of texts) {
    expect(hasForbiddenPhrase(t), t).toBe(false);
    expect(hasOperationName(t), t).toBe(false);
    for (const n of numbersIn(t)) expect(secret.some((h) => h.num * n.den === n.num * h.den), `${t} shows a hidden value`).toBe(false);
  }
  // The three buttons are on every help screen (原則7).
  expect(v.buttons).toEqual(ui(lang).buttons);
  // The junior's own words never name who is taken as 1 (nor any holder of the problem).
  const line = (v.screen === "help" || v.screen === "wordbook" ? v.line : null) ?? "";
  for (const label of holderLabels(p.record).all) expect(line.includes(label), `${line} names ${label}`).toBe(false);
  if (v.screen === "wordbook" && v.page !== null) {
    // The page shows none of the problem's holders and none of its numbers.
    const pageText = [v.page.title, ...v.page.lines, ...v.page.world.holders.map((h) => h.label)].join(" ");
    for (const label of holderLabels(p.record).all) expect(pageText.includes(label)).toBe(false);
    const theirs = numbersIn(p.record.world.problem_text);
    for (const n of numbersIn(pageText.replace(/「1」|"1"/g, ""))) expect(theirs.some((g) => g.num * n.den === n.num * g.den), `${pageText}`).toBe(false);
  }
}

describe("the word book opens by itself where the criteria require (指示書 第11節 M7)", () => {
  it("on a wording new in the session, after the first fix, even when every sentence fits; closing goes on", () => {
    const a = run();
    a.send({ type: "PREDICT", answer: "odd" });
    fix(a, true);
    const v = view(a);
    expect(v.screen).toBe("wordbook");
    expect(v.screen === "wordbook" && v.page?.id).toBe("no");
    expect(a.getSnapshot().context.line?.key).toBe("kohai.wordbook");
    checkHelpScreen(a);
    checkHelpScreen(a, "en");
    a.send({ type: "NEXT" });
    expect(a.getSnapshot().matches({ active: { problem: "rebuilt" } })).toBe(true);
    expect(a.getSnapshot().context.wordbookOpened).toEqual(["no"]);
  });

  it("after the second failed fix, every time; one more fix after it, then the problem is held", () => {
    const a = run();
    a.send({ type: "PREDICT", answer: "fits" });
    fix(a, false);
    // First fix on a new wording: the book.
    expect(view(a).screen).toBe("wordbook");
    a.send({ type: "NEXT" });
    expect(a.getSnapshot().matches({ active: { problem: "looking" } })).toBe(true);
    fix(a, false);
    expect(view(a).screen).toBe("wordbook");
    expect(a.getSnapshot().context.problem?.fixes).toBe(2);
    checkHelpScreen(a);
    a.send({ type: "NEXT" });
    fix(a, false);
    expect(a.getSnapshot().matches({ active: { problem: "held" } })).toBe(true);
    expect(a.getSnapshot().context.log.at(-1)?.bookOpens).toBe(2);
  });

  it("a wording seen earlier in the session: no book after the first fix, the staged questions instead; the book after the second", () => {
    const a = run({ bank: NO_BANK, maxProblems: 2 });
    a.send({ type: "PREDICT", answer: "fits" });
    fix(a, true);
    a.send({ type: "NEXT" }); // close the book
    a.send({ type: "NEXT" }); // to the unit
    // Hold the first problem from the waiting screen and go on to the second.
    a.send({ type: "DONT_KNOW" });
    a.send({ type: "HOLD" });
    // The research agent's reply (none): the fallback is used and the next problem opens.
    a.send({ type: "RESEARCH_RESULT", pool: null });
    const s = a.getSnapshot();
    expect(s.context.problem?.newWording).toBe(false);
    a.send({ type: "PREDICT", answer: "fits" });
    fix(a, false);
    expect(view(a).screen).toBe("help");
    // Through the staged questions to the junior's world again, then a second failed fix opens the book.
    a.send({ type: "NEXT" });
    a.send({ type: "DONT_KNOW" });
    a.send({ type: "NEXT" });
    expect(a.getSnapshot().matches({ active: { problem: "looking" } })).toBe(true);
    fix(a, false);
    expect(view(a).screen).toBe("wordbook");
  });
});

describe("the staged questions (a) read again, (b) which is longer, (c) the word book", () => {
  it("「わからない」 while looking opens them in order, each a fixed line; the length answer is kept and never judged", () => {
    const a = run();
    a.send({ type: "PREDICT", answer: "odd" });
    a.send({ type: "DONT_KNOW" });
    let v = view(a);
    expect(v.screen === "help" && v.stage).toBe("read");
    expect(a.getSnapshot().context.line?.key).toBe("kohai.help_read");
    // (a) only the relation words of the failing sentence are lit: every の of it, the same way.
    if (v.screen !== "help" || v.lit === null) throw new Error("no lit sentence");
    const lit = v.lit;
    const st = v.statements.find((x) => x.index === lit.statementIndex);
    expect(lit.tokens.map((t) => st?.tokens[t])).toEqual(["の", "の", "の"]);
    expect(a.getSnapshot().context.problem?.shown.failing).toContain(lit.statementIndex);
    checkHelpScreen(a);
    a.send({ type: "NEXT" });
    v = view(a);
    expect(v.screen === "help" && v.stage).toBe("order");
    expect(a.getSnapshot().context.line?.key).toBe("kohai.help_order");
    expect(v.screen === "help" && v.choices.map((c) => c.label).sort()).toEqual(["兄", "弟"]);
    checkHelpScreen(a);
    checkHelpScreen(a, "en");
    const before = JSON.stringify(a.getSnapshot().context.research);
    a.send({ type: "ORDER_GUESS", holderId: "h_ani" });
    v = view(a);
    expect(v.screen === "help" && v.stage).toBe("offer");
    expect(a.getSnapshot().context.problem?.orderGuesses).toEqual(["h_ani"]);
    // Recorded only: the research state and the junior's world do not move, and the line names no one.
    expect(JSON.stringify(a.getSnapshot().context.research)).toBe(before);
    expect(a.getSnapshot().context.line?.key).toBe("kohai.wordbook");
    checkHelpScreen(a);
    a.send({ type: "OPEN_BOOK" });
    expect(view(a).screen).toBe("wordbook");
    checkHelpScreen(a);
    a.send({ type: "NEXT" });
    expect(a.getSnapshot().matches({ active: { problem: "looking" } })).toBe(true);
  });

  it("「わからない」 on each step moves to the next; on the offer and the book it opens the waiting screen, and 「つづける」 comes back", () => {
    const a = run();
    a.send({ type: "PREDICT", answer: "odd" });
    const e = ends(a);
    a.send({ type: "PLACE_ONE", quantityId: e.subject });
    a.send({ type: "DONT_KNOW" });
    expect(view(a).screen).toBe("help");
    expect(a.getSnapshot().context.problem?.placement).toBeNull();
    a.send({ type: "DONT_KNOW" });
    a.send({ type: "DONT_KNOW" });
    expect(a.getSnapshot().matches({ active: { problem: { help: "offer" } } })).toBe(true);
    a.send({ type: "DONT_KNOW" });
    expect(view(a).screen).toBe("stuck");
    a.send({ type: "RESUME" });
    expect(a.getSnapshot().matches({ active: { problem: { help: "offer" } } })).toBe(true);
    a.send({ type: "OPEN_BOOK" });
    a.send({ type: "DONT_KNOW" });
    expect(view(a).screen).toBe("stuck");
    a.send({ type: "RESUME" });
    expect(view(a).screen).toBe("wordbook");
  });

  it("「あとで」 on the offer goes back to the junior's world without the book", () => {
    const a = run();
    a.send({ type: "PREDICT", answer: "odd" });
    a.send({ type: "DONT_KNOW" });
    a.send({ type: "NEXT" });
    a.send({ type: "DONT_KNOW" });
    a.send({ type: "NEXT" });
    expect(a.getSnapshot().matches({ active: { problem: "looking" } })).toBe(true);
    expect(a.getSnapshot().context.wordbookOpened).toEqual([]);
  });

  it("stop and つらい work on every help screen and on the book", () => {
    const paths: ((a: Actor) => void)[] = [
      (a) => a.send({ type: "DONT_KNOW" }),
      (a) => {
        a.send({ type: "DONT_KNOW" });
        a.send({ type: "NEXT" });
      },
      (a) => {
        a.send({ type: "DONT_KNOW" });
        a.send({ type: "NEXT" });
        a.send({ type: "DONT_KNOW" });
      },
      (a) => {
        a.send({ type: "DONT_KNOW" });
        a.send({ type: "NEXT" });
        a.send({ type: "DONT_KNOW" });
        a.send({ type: "OPEN_BOOK" });
      },
    ];
    for (const go of paths) {
      for (const ev of [{ type: "STOP" }, { type: "HARD" }] as const) {
        const a = run();
        a.send({ type: "PREDICT", answer: "odd" });
        go(a);
        expect(["help", "wordbook"]).toContain(view(a).screen);
        a.send(ev);
        if (ev.type === "STOP") expect(a.getSnapshot().status).toBe("done");
        else expect(a.getSnapshot().matches("hard")).toBe(true);
      }
    }
  });
});

describe("research does not count a reading made after the word book showed its wording", () => {
  it("the book opened before the first placement: the first reading is not observed and no research request is built", () => {
    const a = run();
    a.send({ type: "PREDICT", answer: "odd" });
    a.send({ type: "DONT_KNOW" });
    a.send({ type: "NEXT" });
    a.send({ type: "DONT_KNOW" });
    a.send({ type: "OPEN_BOOK" });
    a.send({ type: "NEXT" });
    fix(a, false);
    const c = a.getSnapshot().context;
    expect(c.problem?.firstPlacement).not.toBeNull();
    expect(c.research.readings).toHaveLength(0);
    expect(c.researchRequest).toBeNull();
  });

  it("without the book the same first reading is observed", () => {
    const a = run();
    a.send({ type: "PREDICT", answer: "odd" });
    fix(a, false);
    expect(a.getSnapshot().context.research.readings).toHaveLength(1);
    expect(a.getSnapshot().context.research.readings[0]?.wordbookOpenedBefore).toBe(false);
  });

  it("a later problem with a wording whose page was opened is not observed; one with another wording is", () => {
    const motoni = byId("p_bank_motoni");
    const a = run({ bank: [...NO_BANK.slice(0, 1), motoni, ...NO_BANK.slice(1)], maxProblems: 3 });
    a.send({ type: "PREDICT", answer: "fits" });
    fix(a, true);
    expect(view(a).screen).toBe("wordbook");
    a.send({ type: "NEXT" });
    a.send({ type: "DONT_KNOW" });
    a.send({ type: "HOLD" });
    // The research agent's reply (none): the fallback is used and the next problem opens.
    a.send({ type: "RESEARCH_RESULT", pool: null });
    const n = a.getSnapshot().context.research.readings.length;
    const p = a.getSnapshot().context.problem;
    if (p === null) return;
    const opened = p.pages.some((pg) => a.getSnapshot().context.wordbookOpened.includes(pg));
    a.send({ type: "PREDICT", answer: "fits" });
    fix(a, false);
    expect(a.getSnapshot().context.research.readings.length).toBe(opened ? n : n + 1);
  });
});
