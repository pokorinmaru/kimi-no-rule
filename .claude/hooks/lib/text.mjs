// Text checks used by pre-write-guard: copy detection against the design folder, and personal-data detection.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const NGRAM = 10;
const SEP = "\u0001";
const segmenter = new Intl.Segmenter("ja", { granularity: "word" });

/**
 * Split text into comparable words. NFKC + lower case; whitespace between non-ASCII characters
 * is removed first so that re-wrapped Japanese sentences segment the same way.
 * @param {string} text
 * @returns {string[]}
 */
export function words(text) {
  const t = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/(?<=\P{ASCII})\s+(?=\P{ASCII})/gu, "");
  const out = [];
  for (const s of segmenter.segment(t)) if (s.isWordLike) out.push(s.segment);
  return out;
}

/** @param {string[]} w @returns {string[]} */
function ngrams(w) {
  const out = [];
  for (let i = 0; i + NGRAM <= w.length; i++) out.push(w.slice(i, i + NGRAM).join(SEP));
  return out;
}

/**
 * Prose inside a JSON Schema: only human-written strings (description, title, $comment).
 * Property names and enum values are structure, which the repo is expected to re-declare in zod.
 * @param {unknown} node
 * @param {string[]} acc
 */
function schemaProse(node, acc) {
  if (Array.isArray(node)) {
    for (const v of node) schemaProse(v, acc);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if ((k === "description" || k === "title" || k === "$comment") && typeof v === "string") acc.push(v);
      else schemaProse(v, acc);
    }
  }
  return acc;
}

/** @param {string} file */
function sourceText(file) {
  const raw = readFileSync(file, "utf8");
  if (file.toLowerCase().endsWith(".json")) {
    try {
      return schemaProse(JSON.parse(raw), []).join("\n");
    } catch {
      return raw;
    }
  }
  return raw;
}

/**
 * Build the n-gram index of every document in the design folder (HANDOFF.md excluded: we write it).
 * @param {string} dir
 * @returns {Map<string, string> | undefined} n-gram -> file name; undefined when the folder is absent
 */
export function buildIndex(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return undefined;
  /** @type {Map<string, string>} */
  const index = new Map();
  for (const name of readdirSync(dir)) {
    if (!/\.(md|json|txt)$/i.test(name) || name.toLowerCase() === "handoff.md") continue;
    const file = path.join(dir, name);
    if (!statSync(file).isFile()) continue;
    for (const g of ngrams(words(sourceText(file)))) if (!index.has(g)) index.set(g, name);
  }
  return index;
}

/**
 * @param {string} text
 * @param {Map<string, string>} index
 * @returns {{ file: string, excerpt: string } | undefined}
 */
export function findCopy(text, index) {
  for (const g of ngrams(words(text))) {
    const file = index.get(g);
    if (file) return { file, excerpt: g.split(SEP).slice(0, 4).join(" ") + " …" };
  }
  return undefined;
}

// ---- personal data -------------------------------------------------------

// Family / assessment terms, kept as escapes so this file passes its own check.
const TERMS = [
  "息子", // son
  "娘", // daughter
  "うちの子", // "my kid"
  "長男", "長女", "次男", "次女", // eldest / second son, daughter
  "偏差値", // deviation score
  "診断", // diagnosis
  "発達障害", // developmental disorder
  "通知表", // report card
];

const EMAIL = /[A-Za-z0-9._%+-]+@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})/g;
const ALLOWED_EMAIL_DOMAIN = /(^|\.)(example\.(com|org|net)|test|invalid|localhost|example|users\.noreply\.github\.com)$/i;
const ALLOWED_EMAIL = new Set(["noreply@anthropic.com"]);
const ALLOWED_EMAIL_LOCAL = new Set(["git"]);

const PHONES = [
  /(?<![\w.+-])0\d{1,4}-\d{1,4}-\d{3,4}(?![\w-])/g, // 03-1234-5678, 090-1234-5678
  /(?<![\w.+-])0[5789]0\d{8}(?!\w)/g, // 09012345678
  /\+81[\s-]?\d{1,4}[\s-]?\d{1,4}[\s-]?\d{3,4}(?!\d)/g, // +81 90 1234 5678
];

/** @param {string} s */
const mask = (s) => (s.length <= 4 ? "****" : s.slice(0, 2) + "*".repeat(s.length - 4) + s.slice(-2));

/**
 * @param {string} text
 * @returns {string[]} human-readable findings (values masked)
 */
export function findPersonalData(text) {
  const found = [];
  const t = text.normalize("NFKC");
  for (const m of t.matchAll(EMAIL)) {
    const addr = m[0].toLowerCase();
    const local = addr.split("@")[0] ?? "";
    const domain = m[1] ?? "";
    if (ALLOWED_EMAIL.has(addr) || ALLOWED_EMAIL_DOMAIN.test(domain) || ALLOWED_EMAIL_LOCAL.has(local)) continue;
    found.push(`メールアドレス (${mask(m[0])})`);
  }
  for (const re of PHONES) {
    for (const m of t.matchAll(re)) {
      const digits = m[0].replace(/\D/g, "");
      if (m[0].startsWith("+81") || digits.length === 10 || digits.length === 11) found.push(`電話番号 (${mask(m[0])})`);
    }
  }
  for (const term of TERMS) if (t.includes(term)) found.push(`個人情報らしき語「${term}」`);
  return found;
}
