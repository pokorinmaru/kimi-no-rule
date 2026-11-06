// Found in the M1 review: names that hold "と", and two quantities that would read the same (指示書 第6.6節).
import { describe, expect, it } from "vitest";
import type { WorldScene } from "../schema/index.ts";
import { num } from "../apply/test-worlds.ts";
import { parseRestated, restate } from "./index.ts";

function sistersWorld(): WorldScene {
  return {
    schema_version: "3",
    problem_id: "p_total",
    problem_type: "combine",
    problem_text: "",
    grade: 2,
    problem_lang: "ja",
    holders: [
      { id: "h_o", label: "おとうと" },
      { id: "h_i", label: "いもうと" },
      { id: "h_t", label: "ふたり" },
    ],
    item_kinds: [{ id: "k_m", noun: "あめ", counter: "こ", asset_key: null, countable: true }],
    quantities: [
      { id: "q_o", holder: "h_o", item_kind: "k_m", at_event: null, value: num(3) },
      { id: "q_i", holder: "h_i", item_kind: "k_m", at_event: null, value: num(4) },
      { id: "q_t", holder: "h_t", item_kind: "k_m", at_event: null, value: null },
    ],
    relations: [
      { id: "r_t", operator: "total_of", subject: "q_t", reference: null, reference_list: ["q_o", "q_i"], amount: null, other_description: null },
    ],
    events: [],
    question: { target_type: "quantity", target_id: "q_t" },
    word_links: [],
  };
}

describe("restate with names that hold と", () => {
  it.each(["ja", "en"] as const)("a total of おとうと and いもうと reads back (%s)", (lang) => {
    const w = sistersWorld();
    expect(parseRestated(restate(w, lang), w, lang)).toEqual(w);
  });
});

describe("two quantities that would have the same name", () => {
  it("are refused instead of being mixed up", () => {
    const w = sistersWorld();
    w.quantities.push({ id: "q_o2", holder: "h_o", item_kind: "k_m", at_event: null, value: num(1) });
    expect(() => restate(w, "ja")).toThrow();
  });
});
