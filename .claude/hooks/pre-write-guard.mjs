#!/usr/bin/env node
// PreToolUse (Write|Edit|MultiEdit|NotebookEdit|Bash|PowerShell)
// Denies: text copied from the design folder (10+ consecutive words), personal-data-like strings,
// and any write into the design folder except HANDOFF.md. See CLAUDE.md "フック".
import path from "node:path";
import { deny, designDir, isInside, normPath, projectDir, readInput } from "./lib/common.mjs";
import { NGRAM, buildIndex, findCopy, findPersonalData } from "./lib/text.mjs";

const FILE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);
const SHELL_WRITE =
  /(>|\btee\b|\bcp\b|\bmv\b|\brm\b|\bsed\s+-i|\btouch\b|\bmkdir\b|\bdel\b|set-content|add-content|out-file|new-item|remove-item|copy-item|move-item|rename-item|writefile)/i;
const FOOTER = "回避せず、自分の言葉で書き直すか「指示書 第◯節」の参照にしてください。誤検知なら QUESTIONS.md に書いてください。";

/** @param {Record<string, unknown>} ti @returns {string[]} */
function writtenTexts(ti) {
  const texts = [];
  for (const k of ["content", "new_string", "new_source"]) if (typeof ti[k] === "string") texts.push(ti[k]);
  if (Array.isArray(ti["edits"])) {
    for (const e of ti["edits"]) if (e && typeof e.new_string === "string") texts.push(e.new_string);
  }
  return texts;
}

/** Does a shell command write into the design folder (other than HANDOFF.md)? @param {string} command @param {string} dir */
function shellWritesDesign(command, dir) {
  const cmd = command.replace(/["']/g, " ").replace(/\\+/g, "/").toLowerCase();
  const d = normPath(dir);
  const bashForm = d.replace(/^([a-z]):\//, "/$1/");
  const hits = [];
  for (const form of new Set([d, bashForm])) {
    let i = cmd.indexOf(form);
    while (i >= 0) {
      hits.push(cmd.slice(i + form.length).replace(/^\/+/, ""));
      i = cmd.indexOf(form, i + form.length);
    }
  }
  // Redirections that only merge or discard streams write no file. Only whole tokens are stripped;
  // any other ">" left over still counts as a write.
  const END = String.raw`(?=\s|$|[;|&)])`;
  const writes = command
    .replace(new RegExp(String.raw`(^|\s)\d?>&(\d+|-)${END}`, "g"), " ")
    .replace(new RegExp(String.raw`(^|\s)\d?>\s*["']?(\/dev\/null|\$null|nul)["']?${END}`, "gi"), " ");
  if (hits.length === 0 || !SHELL_WRITE.test(writes)) return false;
  return !hits.every((rest) => /^handoff\.md(?=$|[\s;|&)<>])/.test(rest));
}

async function main() {
  const input = await readInput();
  const tool = String(input["tool_name"] ?? "");
  const ti = /** @type {Record<string, unknown>} */ (input["tool_input"] ?? {});
  const dir = designDir();

  /** @type {string[]} */
  let texts;
  let target;
  let intoDesign = false;

  if (FILE_TOOLS.has(tool)) {
    const raw = String(ti["file_path"] ?? ti["notebook_path"] ?? "");
    target = path.isAbsolute(raw) || /^[a-zA-Z]:[\\/]/.test(raw) ? raw : path.join(projectDir(input), raw);
    texts = writtenTexts(ti);
    if (isInside(target, dir)) {
      if (path.basename(target).toLowerCase() !== "handoff.md") {
        deny(`設計フォルダ（${dir}）への書き込みは禁止です（例外は HANDOFF.md だけ）。対象: ${target}`);
      }
      intoDesign = true;
    }
  } else if (SHELL_TOOLS.has(tool)) {
    const command = String(ti["command"] ?? "");
    if (shellWritesDesign(command, dir)) {
      deny(`シェルから設計フォルダ（${dir}）へ書き込む・設計フォルダの中身をコピーするコマンドは禁止です（例外は HANDOFF.md だけ）。`);
    }
    texts = [command];
  } else {
    return; // not guarded
  }

  const text = texts.join("\n");
  if (!text) return;

  const pd = findPersonalData(text);
  if (pd.length > 0) {
    deny(`個人情報らしき文字列が含まれています: ${pd.join(", ")}。リポジトリと設計フォルダに個人情報を書かないでください。${FOOTER}`);
  }

  if (intoDesign) return; // HANDOFF.md: personal-data check only
  // The copy rule protects the repository. Files outside it (e.g. Claude Code plan files) are not checked.
  if (target !== undefined && !isInside(target, projectDir(input))) return;

  const index = buildIndex(dir);
  if (!index) return; // design folder absent (e.g. CI): nothing to compare with
  const hit = findCopy(text, index);
  if (hit) {
    deny(`設計フォルダの ${hit.file} と ${NGRAM} 語以上が連続して一致しました（「${hit.excerpt}」）。設計文書の書き写し・引用は禁止です。${FOOTER}`);
  }
}

main().catch((/** @type {unknown} */ e) => {
  // Fail closed: an unchecked write is worse than a retry.
  deny(`pre-write-guard の内部エラーのため止めました: ${e instanceof Error ? e.message : String(e)}`);
});
