// The materials of the everyday scenes (指示書 第6.7節 手順5): things a child can picture at once, each with
// the words of its sentences and a common-sense sentence that core judges as a comparison of sizes. The
// sentences are written for this repository.

export const SCENE_MATERIAL_IDS = ["cup_juice", "plate_pizza", "wallet_money", "tank_water"] as const;
export type SceneMaterialId = (typeof SCENE_MATERIAL_IDS)[number];

/**
 * "within": a part and what holds it (the juice and the cup); the sentence says the part fits in it.
 * "cap": the same thing in two holders of the same size (two cups); the sentence says neither overflows.
 */
export type SceneFrame = "within" | "cap";

/** One side of a scene: a holder and how the sentences name its amount. */
export interface SceneSide {
  /** The holder id's tail (h_cup, q_cup). */
  id: string;
  /** The holder's word in the Japanese sentences (marked as the holder), and the tape's label. */
  holder: string;
  label: { ja: string; en: string };
  /** What follows the holder's word when the sentence names its amount (コップ + に入る量). */
  after: string;
  /** The Japanese sentence giving its amount: the holder, then [before the number, after the unit]. */
  known: readonly [string, string];
  en: { amount: string; known: string };
}

export interface SceneMaterial {
  id: SceneMaterialId;
  frames: readonly SceneFrame[];
  /** Every number of the scene is a multiple of this (yen go by ten). */
  scale: number;
  unit: { ja: string; en: string };
  noun: string;
  countable: boolean;
  within: { container: SceneSide; part: SceneSide; commonSense: { ja: string; en: string } };
  cap: {
    a: SceneSide;
    b: SceneSide;
    /** The limit sentence, with {n} for the number and {u} for the unit. */
    limit: { ja: string; en: string };
    limitLabel: { ja: string; en: string };
    commonSense: { ja: string; en: string };
  } | null;
}

const capSides = (thing: string, en: string, kind: "コップ" | "お皿" | "水そう", enKind: string): [SceneSide, SceneSide] =>
  (["red", "blue"] as const).map((c) => ({
    id: c,
    holder: `${c === "red" ? "赤い" : "青い"}${kind}`,
    label: { ja: `${c === "red" ? "赤い" : "青い"}${kind}`, en: `${c} ${enKind}` },
    after: `の${thing}`,
    known: [`の${thing}は`, "です"] as const,
    en: { amount: `the ${en} in the ${c} ${enKind}`, known: `The ${en} in the ${c} ${enKind} is {n} {u}.` },
  })) as [SceneSide, SceneSide];

export const SCENE_MATERIALS: readonly SceneMaterial[] = [
  {
    id: "cup_juice",
    frames: ["within", "cap"],
    scale: 1,
    unit: { ja: "dL", en: "dL" },
    noun: "ジュース",
    countable: false,
    within: {
      container: {
        id: "cup",
        holder: "コップ",
        label: { ja: "コップ", en: "cup" },
        after: "に入る量",
        known: ["には", "入ります"],
        en: { amount: "what the cup holds", known: "The cup holds {n} {u}." },
      },
      part: {
        id: "juice",
        holder: "ジュース",
        label: { ja: "ジュース", en: "juice" },
        after: "",
        known: ["は", "です"],
        en: { amount: "the juice", known: "The juice is {n} {u}." },
      },
      commonSense: { ja: "ジュースは、コップからあふれない。", en: "The juice does not overflow the cup." },
    },
    cap: (() => {
      const [a, b] = capSides("ジュース", "juice", "コップ", "cup");
      return {
        a,
        b,
        limit: { ja: "どちらのコップにも、{n}{u}まで入ります。", en: "Each cup holds up to {n} {u}." },
        limitLabel: { ja: "コップに入る量", en: "what a cup holds" },
        commonSense: { ja: "どちらのジュースも、コップからあふれない。", en: "Neither cup's juice overflows." },
      };
    })(),
  },
  {
    id: "plate_pizza",
    frames: ["within", "cap"],
    scale: 1,
    unit: { ja: "切れ", en: "pieces" },
    noun: "ピザ",
    countable: true,
    within: {
      container: {
        id: "plate",
        holder: "お皿",
        label: { ja: "お皿", en: "plate" },
        after: "にのる量",
        known: ["には", "のります"],
        en: { amount: "what the plate holds", known: "The plate holds {n} {u}." },
      },
      part: {
        id: "pizza",
        holder: "ピザ",
        label: { ja: "ピザ", en: "pizza" },
        after: "",
        known: ["は", "です"],
        en: { amount: "the pizza", known: "The pizza is {n} {u}." },
      },
      commonSense: { ja: "ピザは、お皿からはみ出さない。", en: "The pizza does not spill off the plate." },
    },
    cap: (() => {
      const [a, b] = capSides("ピザ", "pizza", "お皿", "plate");
      return {
        a,
        b,
        limit: { ja: "どちらのお皿にも、{n}{u}までのります。", en: "Each plate holds up to {n} {u}." },
        limitLabel: { ja: "お皿にのる量", en: "what a plate holds" },
        commonSense: { ja: "どちらのピザも、お皿からはみ出さない。", en: "Neither plate's pizza spills off." },
      };
    })(),
  },
  {
    id: "wallet_money",
    frames: ["within"],
    scale: 10,
    unit: { ja: "円", en: "yen" },
    noun: "お金",
    countable: true,
    within: {
      container: {
        id: "wallet",
        holder: "財布",
        label: { ja: "財布のお金", en: "money in the wallet" },
        after: "のお金",
        known: ["には", "入っています"],
        en: { amount: "the money in the wallet", known: "The wallet has {n} {u}." },
      },
      part: {
        id: "snack",
        holder: "おかし",
        label: { ja: "おかしの値段", en: "snack's price" },
        after: "の値段",
        known: ["の値段は", "です"],
        en: { amount: "the snack's price", known: "The snack's price is {n} {u}." },
      },
      commonSense: { ja: "財布のお金で、おかしが買える。", en: "The money in the wallet is enough for the snack." },
    },
    cap: null,
  },
  {
    id: "tank_water",
    frames: ["within", "cap"],
    scale: 1,
    unit: { ja: "L", en: "L" },
    noun: "水",
    countable: false,
    within: {
      container: {
        id: "tank",
        holder: "水そう",
        label: { ja: "水そう", en: "tank" },
        after: "に入る量",
        known: ["には", "入ります"],
        en: { amount: "what the tank holds", known: "The tank holds {n} {u}." },
      },
      part: {
        id: "water",
        holder: "水",
        label: { ja: "水", en: "water" },
        after: "",
        known: ["は", "です"],
        en: { amount: "the water", known: "The water is {n} {u}." },
      },
      commonSense: { ja: "水は、水そうからあふれない。", en: "The water does not overflow the tank." },
    },
    cap: (() => {
      const [a, b] = capSides("水", "water", "水そう", "tank");
      return {
        a,
        b,
        limit: { ja: "どちらの水そうにも、{n}{u}まで入ります。", en: "Each tank holds up to {n} {u}." },
        limitLabel: { ja: "水そうに入る量", en: "what a tank holds" },
        commonSense: { ja: "どちらの水も、水そうからあふれない。", en: "Neither tank's water overflows." },
      };
    })(),
  },
];
