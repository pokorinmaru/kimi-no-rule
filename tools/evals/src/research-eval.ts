// The research eval (指示書 第10.2節, cut to the submission's one type): simulated children with a fixed
// reading meet a researcher problem after problem; we count whether the reading the researcher confirms
// builds the child's worlds on every bank problem (recovered), how many problems it took, and how often it
// confirmed a wrong reading. Researchers: Claude writing the pool (core's research layer), and baselines
// that use no Claude: every rule of a small enumeration, or only the common list, weighed the same way.
import {
  CONFIRM_OBSERVATIONS,
  COMMON_FRACTION_READINGS,
  OTHER,
  chooseNext,
  constructiveLikelihoods,
  groupHypotheses,
  infoGain,
  initialState,
  misreadCandidates,
  observe,
  predict,
  runRule,
  sameReading,
  status,
  update,
  type Hypothesis,
  type ProblemRecord,
  type ResearchState,
  type Weights,
  type WorldScene,
} from "@kimi/core";
import type { ChildKind, SimChild } from "./research-children.ts";

export const FIRST_PROBLEM = "p_signboard";
export const MAX_PROBLEMS = 9;
/** The chance a child's first world is a slip: one of the other worlds of W, chosen evenly. 【仮】 */
export const SLIP = 0.1;
/** Every baseline meets each child once per seed; Claude once (its cost). */
export const RESEARCH_SEEDS: readonly number[] = [1, 2, 3, 4, 5];
export const RESEARCH_SEEDS_CLAUDE: readonly number[] = [1];

/** A deterministic random number generator (mulberry32), so every run of the eval gives the same numbers. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What the child builds first: its reading's world, or now and then a slip to another world a child could build. */
export function firstWorld(child: SimChild, record: ProblemRecord, n: number, random: () => number): WorldScene {
  const own = child.world(record, n);
  if (random() >= SLIP) return own;
  const others: WorldScene[] = [];
  for (const w of [record.world, ...misreadCandidates(record.world).map((c) => c.world)]) {
    if (!sameReading(w, own, true) && !others.some((o) => sameReading(o, w, true))) others.push(w);
  }
  return others.length === 0 ? own : (others[Math.floor(random() * others.length)] as WorldScene);
}

export interface Seen {
  record: ProblemRecord;
  world: WorldScene;
  words: string[];
}

/** A researcher: told each first reading, it answers with a confirmed reading (or none) and the next problem. */
export interface Researcher {
  name: string;
  start(): Promise<ResearcherRun>;
}
export interface ResearcherRun {
  see(seen: Seen): Promise<void>;
  confirmed(): Hypothesis | null;
  next(done: ReadonlySet<string>): string | null;
}

/** core's research layer with a pool written by `revise` (Claude in the live eval). */
export function poolResearcher(
  name: string,
  bank: readonly ProblemRecord[],
  /** The state after the pool was revised (Claude goes through core's revisePool itself). */
  revise: (state: ResearchState, seen: readonly Seen[]) => Promise<ResearchState>,
): Researcher {
  return {
    name,
    start: async () => {
      let state = initialState();
      const seen: Seen[] = [];
      return {
        see: async (s) => {
          seen.push(s);
          state = observe(state, { record: s.record, childWorld: s.world, referencePlaced: true, afterFix: false, wordbookOpenedBefore: false });
          state = await revise(state, seen);
        },
        confirmed: () => state.pool.find((e) => e.status === "confirmed")?.hypothesis ?? null,
        next: (done) => chooseNext(state, bank, done)?.problemId ?? bank.find((r) => !done.has(r.world.problem_id))?.world.problem_id ?? null,
      };
    },
  };
}

/**
 * Weighs every given rule at once, with the same likelihoods and the same confirmation as core, and picks
 * the next problem by information gain (or, with fixedOrder, in bank order). No Claude.
 */
export function weighedResearcher(name: string, rules: readonly Hypothesis[], bank: readonly ProblemRecord[], fixedOrder = false): Researcher {
  // Rules that build the same worlds on every bank problem are one reading.
  const reps = groupHypotheses(rules, bank).map((g) => g[0] as Hypothesis);
  return {
    name,
    start: async () => {
      let weights: Weights = Object.fromEntries([...reps.map((h) => [h.id, 1 / (reps.length + 1)]), [OTHER, 1 / (reps.length + 1)]]);
      let splits = 0;
      const statuses = new Map<string, "hypothesis" | "confirmed">(reps.map((h) => [h.id, "hypothesis"]));
      return {
        see: async (s) => {
          const pred = predict(reps, s.record, true);
          weights = update(weights, constructiveLikelihoods(pred, s.world, true));
          if (new Set(pred.predictions.map((p) => p.worldClass)).size > 1) splits++;
          for (const h of reps) statuses.set(h.id, status(weights[h.id] ?? 0, splits, statuses.get(h.id) ?? "hypothesis"));
        },
        confirmed: () => {
          if ((weights[OTHER] ?? 0) >= Math.max(...Object.values(weights))) return null;
          return reps.find((h) => statuses.get(h.id) === "confirmed") ?? null;
        },
        next: (done) => {
          const open = bank.filter((r) => !done.has(r.world.problem_id));
          if (fixedOrder) return open[0]?.world.problem_id ?? null;
          let best: { id: string; gain: number } | null = null;
          for (const r of open) {
            const gain = infoGain(weights, predict(reps, r, true));
            if (best === null || gain > best.gain) best = { id: r.world.problem_id, gain };
          }
          return best?.id ?? null;
        },
      };
    },
  };
}

type Action = Hypothesis["clauses"][number]["then"];
type Expr = Hypothesis["clauses"][number]["when"];

const ACTIONS: Action[] = [
  { action: "no_change" },
  { action: "swap_reference" },
  ...(["first_mentioned", "second_mentioned", "known_value", "asked", "larger_number", "smaller_number"] as const).map(
    (by): Action => ({ action: "choose_reference", by }),
  ),
  { action: "set_relation_type_additive", amount: "numerator" },
  { action: "set_relation_type_additive", amount: "ratio_value" },
  ...(["divide_large_by_small", "multiply_always", "divide_always"] as const).map((mode): Action => ({ action: "number_op", mode })),
  { action: "invert_ratio" },
  { action: "misread_question", target: "other_holder" },
];

const CONDITIONS: Expr[] = [
  { pred: "ratio_kind_is", args: ["gt1"] },
  { pred: "ratio_kind_is", args: ["lt1"] },
  { pred: "ratio_is_unit_fraction", args: [] },
  { pred: "consistency_is", args: ["consistent"] },
  { pred: "consistency_is", args: ["inconsistent"] },
  { pred: "word_in_statement", args: ["に対して"] },
  { pred: "word_in_statement", args: ["倍"] },
];

/**
 * The enumeration baseline's rules: every action alone, and every "when one condition, this action, else
 * that one". Nested conditions and the words not listed are left out on purpose (指示書 第10.2節).
 */
export function enumerateRules(): Hypothesis[] {
  const out: Hypothesis[] = ACTIONS.map((then, i) => ({ id: `e_${i}`, origin: "math", clauses: [{ when: { pred: "true", args: [] }, then }], word_cues: [], note_for_adult: "" }));
  CONDITIONS.forEach((when, c) => {
    ACTIONS.forEach((a, i) => {
      ACTIONS.forEach((b, j) => {
        if (i === j) return;
        out.push({
          id: `e_${c}_${i}_${j}`,
          origin: "math",
          clauses: [
            { when, then: a },
            { when: { pred: "true", args: [] }, then: b },
          ],
          word_cues: [],
          note_for_adult: "",
        });
      });
    });
  });
  return out;
}

export interface Episode {
  child: string;
  kind: ChildKind;
  seed: number;
  /** Problems seen when a reading was first confirmed, or null. */
  confirmedAfter: number | null;
  recovered: boolean;
  falseConfirmation: boolean;
}

/** Whether a rule builds the child's own worlds (no slips) on every bank problem. */
export function recovers(h: Hypothesis, child: SimChild, bank: readonly ProblemRecord[]): boolean {
  return bank.every((r, n) => sameReading(runRule(h, r), child.world(r, n), true));
}

export async function runEpisode(researcher: Researcher, child: SimChild, bank: readonly ProblemRecord[], seed: number): Promise<Episode> {
  const random = rng(seed);
  const run = await researcher.start();
  const done = new Set<string>();
  let id: string | null = FIRST_PROBLEM;
  let confirmedAfter: number | null = null;
  let confirmed: Hypothesis | null = null;
  for (let n = 0; n < MAX_PROBLEMS && id !== null; n++) {
    const record = bank.find((r) => r.world.problem_id === id);
    if (record === undefined) throw new Error(`no problem ${id}`);
    done.add(id);
    await run.see({ record, world: firstWorld(child, record, n, random), words: [child.words[n % child.words.length] as string] });
    confirmed = run.confirmed();
    if (confirmed !== null) {
      confirmedAfter = n + 1;
      break;
    }
    id = run.next(done);
  }
  // A correct reader confirmed as reading correctly opens no chapter, and counts as recovered.
  const recovered = confirmed !== null && child.rule !== null && recovers(confirmed, child, bank);
  const falseConfirmation = confirmed !== null && !recovered;
  return { child: child.id, kind: child.kind, seed, confirmedAfter, recovered, falseConfirmation };
}

export interface ResearchResult {
  name: string;
  byKind: Record<ChildKind, { episodes: number; recovered: number; falseConfirmations: number; confirmedAfter: number[] }>;
}

export async function runResearchEval(
  researchers: readonly Researcher[],
  children: readonly SimChild[],
  bank: readonly ProblemRecord[],
  seeds: readonly number[],
): Promise<ResearchResult[]> {
  const out: ResearchResult[] = [];
  for (const r of researchers) {
    const byKind = Object.fromEntries(
      (["listed", "inside", "outside", "inexpressible"] as const).map((k) => [k, { episodes: 0, recovered: 0, falseConfirmations: 0, confirmedAfter: [] as number[] }]),
    ) as ResearchResult["byKind"];
    for (const child of children) {
      for (const seed of seeds) {
        const e = await runEpisode(r, child, bank, seed);
        const row = byKind[child.kind];
        row.episodes++;
        if (e.recovered) row.recovered++;
        if (e.falseConfirmation) row.falseConfirmations++;
        if (e.confirmedAfter !== null && e.recovered) row.confirmedAfter.push(e.confirmedAfter);
      }
    }
    out.push({ name: r.name, byKind });
  }
  return out;
}

/** The baselines that need no Claude: the enumeration, the same in fixed order, and the common list alone. */
export function baselineResearchers(bank: readonly ProblemRecord[]): Researcher[] {
  const all = enumerateRules();
  return [
    weighedResearcher("列挙＋情報利得（Claude なし）", all, bank),
    weighedResearcher("列挙＋決まった順（Claude なし）", all, bank, true),
    weighedResearcher("よくある読み違いの一覧だけ（Claude なし）", COMMON_FRACTION_READINGS, bank),
  ];
}

export { CONFIRM_OBSERVATIONS };
