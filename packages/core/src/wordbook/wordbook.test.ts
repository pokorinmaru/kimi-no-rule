// The word book (ことばの絵本, 指示書 第7.1節 and 第11節 M7): one page per wording, an everyday example whose
// numbers, holders and things never appear in a problem the child may meet, and the help helpers (which
// wordings a problem uses, which words to light). Written before the implementation.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FRACTION_BANK } from "../../fixtures/problems/fraction-bank.ts";
import { signboardRecord } from "../../fixtures/problems/signboard-record.ts";
import type { ProblemRecord } from "../schema/problem-record.ts";
import type { Rational } from "../schema/common.ts";
import { validateWorld } from "../schema/index.ts";
import { solve } from "../solve/index.ts";
import { TEMPLATES } from "../i18n/index.ts";
import { hasOperationName, numbersIn } from "../gates/index.ts";
import { worldValues } from "../scenes/values.ts";
import { eq, fromSchema } from "../rational/index.ts";
import { TEMPLATE_KEYS } from "../i18n/index.ts";
import { rubySegments } from "../i18n/furigana.ts";
import {
  WORDBOOK_PAGE_IDS,
  WORDBOOK_PAGES,
  WORDBOOK_READINGS,
  pageNumbers,
  relationWordTokens,
  wordbookPage,
  wordbookPagesOf,
  wordbookWorld,
  helpSentence,
} from "./index.ts";
import { drawnValues } from "../stage/index.ts";

const contentDir = fileURLToPath(new URL("../../../../content/problems/", import.meta.url));

/** Every problem record under content/problems (any JSON file, at any depth, in any shape that holds records). */
function contentRecords(): ProblemRecord[] {
  const out: ProblemRecord[] = [];
  const visit = (v: unknown): void => {
    if (v === null || typeof v !== "object") return;
    if (Array.isArray(v)) {
      v.forEach(visit);
      return;
    }
    const o = v as Record<string, unknown>;
    if (typeof o.world === "object" && o.world !== null && Array.isArray(o.statements)) {
      out.push(o as unknown as ProblemRecord);
      return;
    }
    Object.values(o).forEach(visit);
  };
  const walk = (dir: string): void => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith(".json")) visit(JSON.parse(readFileSync(p, "utf8")));
    }
  };
  walk(contentDir);
  return out;
}

const ALL: ProblemRecord[] = [...FRACTION_BANK, ...contentRecords()];

/** Every number a problem holds: given, solved on the way (one part included), its answer, and those in its text. */
function problemValues(r: ProblemRecord): Rational[] {
  const out: Rational[] = [...numbersIn(r.world.problem_text)];
  for (const v of worldValues(r.world)) out.push({ num: Number(v.num), den: Number(v.den) });
  if (r.expected_answer !== null) out.push(r.expected_answer);
  return out;
}
const same = (a: Rational, b: Rational): boolean => eq(fromSchema(a), fromSchema(b));

describe("the word book's pages", () => {
  it("has one page for each wording: の, をもとにすると, に対して, を1とみると, 倍", () => {
    expect([...WORDBOOK_PAGE_IDS]).toEqual(["no", "wo_moto", "ni_taishite", "wo_ichi", "bai"]);
    expect(WORDBOOK_PAGES.map((p) => p.id)).toEqual([...WORDBOOK_PAGE_IDS]);
    expect(WORDBOOK_PAGES.map((p) => p.words.ja)).toEqual(["の", "をもとにすると", "に対して", "を1とみると", "倍"]);
  });

  it("reads more than the bank and content folder: the content folder has records to check", () => {
    expect(ALL.length).toBeGreaterThan(FRACTION_BANK.length);
  });

  it.each(WORDBOOK_PAGE_IDS)("%s: a valid world that core solves, with the 1 on the holder the wording takes as 1", (id) => {
    for (const lang of ["ja", "en"] as const) {
      const sets = WORDBOOK_PAGES.find((p) => p.id === id)?.numbers.length ?? 0;
      for (let i = 0; i < sets; i++) {
        const wi = wordbookWorld(id, lang, i);
        expect(validateWorld(wi)).toEqual({ ok: true });
        expect(["unique", "underdetermined"]).toContain(solve(wi).kind);
      }
      const w = wordbookWorld(id, lang);
      const rel = w.relations[0];
      const page = WORDBOOK_PAGES.find((p) => p.id === id);
      const oneHolder = w.quantities.find((q) => q.id === rel?.reference)?.holder;
      expect(w.holders.find((h) => h.id === oneHolder)?.label).toBe(page?.one[lang]);
    }
  });

  it.each(WORDBOOK_PAGE_IDS)("%s: its numbers never appear in a bank, discriminating or transfer problem", (id) => {
    const mine = pageNumbers(id);
    expect(mine.length).toBeGreaterThanOrEqual(3);
    for (const r of ALL) {
      const theirs = problemValues(r);
      const hit = mine.filter((n) => theirs.some((t) => same(n, t)));
      expect(hit, `${id} meets ${r.world.problem_id}`).toEqual([]);
    }
  });

  it.each(WORDBOOK_PAGE_IDS)("%s: its holders and things never appear in a problem", (id) => {
    const page = WORDBOOK_PAGES.find((p) => p.id === id);
    if (page === undefined) throw new Error("no page");
    for (const r of ALL) {
      const labels = r.world.holders.map((h) => h.label);
      const nouns = r.world.item_kinds.map((k) => k.noun);
      for (const word of [page.one.ja, page.other.ja, page.thing.noun]) {
        expect(labels, r.world.problem_id).not.toContain(word);
        expect(nouns, r.world.problem_id).not.toContain(word);
        expect(r.world.problem_text.includes(word), `${word} in ${r.world.problem_id}`).toBe(false);
      }
    }
  });

  it.each(WORDBOOK_PAGE_IDS)("%s: no operation name, in either language", (id) => {
    const page = WORDBOOK_PAGES.find((p) => p.id === id);
    for (const line of [...(page?.lines.ja ?? []), ...(page?.lines.en ?? [])]) expect(hasOperationName(line), line).toBe(false);
  });

  it("every page passes core's gate on every problem of the bank and the content folder, in both languages", () => {
    for (const r of ALL) {
      for (const id of WORDBOOK_PAGE_IDS) {
        for (const lang of ["ja", "en"] as const) {
          const v = wordbookPage(id, r, lang);
          expect(v, `${id} on ${r.world.problem_id}`).not.toBeNull();
          // No holder of the problem on the page.
          for (const h of r.world.holders) expect(v?.lines.join("") ?? "", h.label).not.toContain(h.label);
        }
      }
    }
  });

  it("a problem that meets a page's first numbers gets the page with other numbers, never its own", () => {
    const r = structuredClone(signboardRecord);
    // A problem whose given number is the page's first count (32).
    const q = r.world.quantities.find((x) => x.id === "q_ani");
    if (q === undefined) throw new Error("no q");
    q.value = { num: 32, den: 1 };
    r.world.problem_text = r.world.problem_text.replace("6匹", "32匹");
    const v = wordbookPage("no", r, "ja");
    expect(v).not.toBeNull();
    expect(numbersIn(v?.lines.join("") ?? "").some((n) => n.num === 32 && n.den === 1)).toBe(false);
    expect(v?.world.quantities.map((x) => x.value?.num)).not.toContain(32);
  });

  it.each(WORDBOOK_PAGE_IDS)("%s: at least three sets of numbers, each with other = amount of the one taken as 1", (id) => {
    const page = WORDBOOK_PAGES.find((p) => p.id === id);
    expect(page?.numbers.length).toBeGreaterThanOrEqual(3);
    for (const n of page?.numbers ?? []) expect(n.one * n.amount.num).toBe(n.other * n.amount.den);
  });

  it("the page shows the holder taken as 1 and its lines, with the wording as its title", () => {
    const v = wordbookPage("no", signboardRecord, "ja");
    expect(v?.title).toBe("の");
    expect(v?.lines.length).toBe(3);
    expect(v?.oneHolderId).toBe(v?.world.quantities.find((q) => q.id === v.world.relations[0]?.reference)?.holder);
    const en = wordbookPage("bai", signboardRecord, "en");
    expect(en?.title).toBe("as many as");
    expect(en?.world.holders.map((h) => h.label)).toContain("small pot");
  });
});

describe("which wordings a problem uses", () => {
  const byId = (id: string): ProblemRecord => {
    const r = ALL.find((x) => x.world.problem_id === id);
    if (r === undefined) throw new Error(`no ${id}`);
    return r;
  };

  it("the signboard uses の", () => {
    expect(wordbookPagesOf(signboardRecord)).toEqual(["no"]);
  });

  it("をもとにすると and に対して come before the plain の", () => {
    expect(wordbookPagesOf(byId("p_bank_motoni"))[0]).toBe("wo_moto");
    expect(wordbookPagesOf(byId("p_bank_taishite"))[0]).toBe("ni_taishite");
    expect(wordbookPagesOf(byId("p_disc_c_first_whole_s_motoni_plain_1"))[0]).toBe("wo_moto");
  });

  it("a multiple written with 倍 opens the 倍 page", () => {
    expect(wordbookPagesOf(byId("p_bank_fish_more"))).toEqual(["bai", "no"]);
  });

  it("every bank problem has a page", () => {
    for (const r of FRACTION_BANK) expect(wordbookPagesOf(r).length, r.world.problem_id).toBeGreaterThan(0);
  });
});

describe("the relation words lit in the help (step a)", () => {
  it("lights every の of the sentence with the relation word, at the same strength", () => {
    const toks = relationWordTokens(signboardRecord, 1);
    const st = signboardRecord.statements[1];
    expect(toks.map((t) => st?.tokens[t])).toEqual(["の", "の", "の"]);
    expect(toks).toEqual([4, 6, 8]);
  });

  it("lights を and もとにすると together, whichever of them is marked", () => {
    for (const id of ["p_bank_motoni", "p_disc_c_first_whole_s_motoni_plain_1"]) {
      const r = ALL.find((x) => x.world.problem_id === id) as ProblemRecord;
      const st = r.statements[0];
      const words = relationWordTokens(r, 0).map((t) => st?.tokens[t]);
      expect(words, id).toContain("を");
      expect(words, id).toContain("もとにすると");
      expect(words, id).not.toContain("2/3");
      expect(words, id).not.toContain("3/4");
    }
  });

  it("lights nothing in a sentence without a relation word, and never a number or a holder", () => {
    expect(relationWordTokens(signboardRecord, 0)).toEqual([]);
    for (const r of ALL) {
      for (const st of r.statements) {
        for (const t of relationWordTokens(r, st.index)) {
          const word = st.tokens[t] ?? "";
          expect(numbersIn(word), word).toEqual([]);
          expect(r.world.holders.map((h) => h.label)).not.toContain(word);
        }
      }
    }
  });

  it("the help sentence is a failing sentence with a relation word, else the sentence with one", () => {
    expect(helpSentence(signboardRecord, [1])).toEqual({ statementIndex: 1, tokens: [4, 6, 8] });
    expect(helpSentence(signboardRecord, [2, 1])?.statementIndex).toBe(1);
    expect(helpSentence(signboardRecord, [])?.statementIndex).toBe(1);
  });
});

describe("the help's fixed sentences", () => {
  it("the junior has a line for reading the lit words again and for the length order", () => {
    expect(TEMPLATE_KEYS).toContain("kohai.help_read");
    expect(TEMPLATE_KEYS).toContain("kohai.help_order");
    expect(TEMPLATE_KEYS).toContain("kohai.wordbook");
  });
});

describe("the junior's word-book invitations (safety review, 2026-11-07)", () => {
  // The junior does not talk about itself (指示書 第1節 後輩は教えない; KOHAI_SYSTEM: never talk about yourself):
  // only an invitation to look at the book together, with no "I don't get it" or "hard for me".
  const SELF = /ぼく|わたし|わかりません|むずかし|\bI\b|\bme\b|\bmy\b|hard/;
  it.each([...TEMPLATES["kohai.wordbook"].ja, ...TEMPLATES["kohai.wordbook"].en])("%s", (line) => {
    expect(line).not.toMatch(SELF);
    expect(line).toMatch(/絵本|picture book/);
  });
});

describe("the word book's furigana (run-through, 2026-11-08)", () => {
  // 白, 黒, 左, 右, 金, 銀, 上, 下, 小 and the rest had no reading, so the pages had no furigana with it on.
  const KANJI = /[一-鿿々]/;
  it.each(WORDBOOK_PAGES.map((p) => [p.id, p] as const))("%s: every kanji on the page has a reading", (_id, p) => {
    for (const t of [...p.lines.ja, p.one.ja, p.other.ja, p.words.ja, p.thing.noun, p.thing.counter]) {
      for (const seg of rubySegments(t, WORDBOOK_READINGS)) if (seg.ruby === null) expect(KANJI.test(seg.text), `${p.id}: ${seg.text} in ${t}`).toBe(false);
    }
  });

  it("puts each reading over its kanji only, in hiragana (ビー玉: だま over 玉)", () => {
    expect(rubySegments("ビー玉", WORDBOOK_READINGS)).toEqual([
      { text: "ビー", ruby: null },
      { text: "玉", ruby: "だま" },
    ]);
    for (const kana of Object.values(WORDBOOK_READINGS)) expect(kana).toMatch(/^[ぁ-ゖー|]+$/);
  });
});

describe("the page's contrasting pictures (the wording as written, and the other holder taken as 1)", () => {
  it.each(WORDBOOK_PAGE_IDS)("%s on the signboard: as worded, the 1 is dealt into whole things; with the other as 1 it breaks", (id) => {
    const v = wordbookPage(id, signboardRecord, "ja");
    const c = v?.contrast;
    if (c === undefined || c === null) throw new Error(`${id} contrast`);
    const one = c.asWorded.holders.find((h) => h.holderId === "h_one");
    expect(one?.isOne).toBe(true);
    expect(c.asWorded.share?.piece ?? null).toBeNull();
    expect(c.asWorded.breaks).toBe(false);
    expect(c.asWorded.holders.every((h) => h.dishes > 0 && h.count !== null)).toBe(true);
    const other = c.otherAsOne;
    if (other === null) throw new Error(`${id} other`);
    expect(other.holders.find((h) => h.holderId === "h_other")?.isOne).toBe(true);
    // It breaks: a cut piece, or the count the page says does not come back.
    const pageOne = v?.world.quantities.find((q) => q.id === "q_one")?.value?.num;
    const drawnOne = other.holders.find((h) => h.holderId === "h_one")?.count;
    expect(other.breaks || drawnOne?.piece != null || drawnOne?.wholes !== pageOne).toBe(true);
    expect(c.captions[0]).toBe(`${v?.world.holders.find((h) => h.id === "h_one")?.label ?? ""}を「1」とみると`);
    expect(c.captions[1]).toBe(`${v?.world.holders.find((h) => h.id === "h_other")?.label ?? ""}を「1」とみると`);
    for (const cap of c.captions) if (cap !== null) for (const w of ["正しい", "まちがい", "ただしい"]) expect(cap).not.toContain(w);
  });

  it("no number either picture draws is a value of the problem, on every problem and page, in both languages", () => {
    for (const r of ALL)
      for (const id of WORDBOOK_PAGE_IDS)
        for (const lang of ["ja", "en"] as const) {
          const c = wordbookPage(id, r, lang)?.contrast;
          if (c === undefined || c === null) continue;
          const theirs = [...numbersIn(r.world.problem_text), ...worldValues(r.world).map((x) => ({ num: Number(x.num), den: Number(x.den) })), ...(r.expected_answer === null ? [] : [r.expected_answer])];
          for (const s of [c.asWorded, c.otherAsOne])
            if (s !== null)
              for (const d of drawnValues(s)) expect(theirs.some((t) => eq(fromSchema(t), fromSchema(d))), `${id} ${r.world.problem_id} ${String(d.num)}/${String(d.den)}`).toBe(false);
        }
  });
});
