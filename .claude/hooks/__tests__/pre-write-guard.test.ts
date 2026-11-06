import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { denyReason, isAllowed, isDenied, runHook, tempDir, writeFiles } from "./helpers.ts";

const SCRIPT = "pre-write-guard.mjs";

// A made-up design folder. Nothing here comes from the real design documents.
const FAKE_JA =
  "この架空の設計文書では、青いカエルが毎朝七時に池のほとりで新聞を読み、隣のカメと天気について長く話し合うことにしている。";
const FAKE_EN = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima";
const FAKE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "fake",
  type: "object",
  properties: {
    one: { type: "string", description: "the purple giraffe counts every marble twice before lunch on rainy tuesdays only" },
    two: { type: "string" }, three: { type: "string" }, four: { type: "string" }, five: { type: "string" },
    six: { type: "string" }, seven: { type: "string" }, eight: { type: "string" }, nine: { type: "string" },
    ten: { type: "string" }, eleven: { type: "string" },
  },
};

// Personal-data-like strings are assembled at runtime so this file itself passes the guard.
const AT = String.fromCharCode(64);
const PII = {
  email: ["someone.real", AT, "gmail.com"].join(""),
  mobile: ["090", "1234", "5678"].join("-"),
  landline: ["03", "1234", "5678"].join("-"),
  intl: ["+81", "90", "1234", "5678"].join(" "),
  son: String.fromCharCode(0x606f, 0x5b50),
  deviation: String.fromCharCode(0x504f, 0x5dee, 0x5024),
  diagnosis: String.fromCharCode(0x8a3a, 0x65ad),
};

let design: string;
let repo: string;
let env: Record<string, string>;

beforeAll(() => {
  design = tempDir("design");
  repo = tempDir("repo");
  writeFiles(design, {
    "brief.md": `# heading\n\n${FAKE_JA}\n\n${FAKE_EN}\n`,
    "fake.schema.json": JSON.stringify(FAKE_SCHEMA, null, 2),
    "HANDOFF.md": "# handoff\n",
  });
  env = { KIMI_DESIGN_DIR: design };
});

const write = (file: string, content: string) =>
  runHook(SCRIPT, { hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: file, content } }, env);

describe("pre-write-guard: copying from the design folder", () => {
  it("denies writing a design sentence verbatim (the core M0 check)", () => {
    const r = write(path.join(repo, "notes.md"), `メモ：${FAKE_JA}`);
    expect(isDenied(r)).toBe(true);
    expect(denyReason(r)).toContain("brief.md");
  });

  it("denies the same sentence even with line breaks and spacing changed", () => {
    const reflowed = FAKE_JA.replace("、", "、\n  ").replace("。", " 。");
    expect(isDenied(write(path.join(repo, "a.ts"), `// ${reflowed}`))).toBe(true);
  });

  it("denies a 10-word overlap", () => {
    const ten = FAKE_EN.split(" ").slice(0, 10).join(" ");
    expect(isDenied(write(path.join(repo, "a.md"), `x ${ten} y`))).toBe(true);
  });

  it("allows a 9-word overlap", () => {
    const nine = FAKE_EN.split(" ").slice(1, 10).join(" ");
    expect(isAllowed(write(path.join(repo, "a.md"), `x ${nine} y`))).toBe(true);
  });

  it("denies prose copied from a schema description", () => {
    const r = write(path.join(repo, "s.ts"), `/** ${FAKE_SCHEMA.properties.one.description} */`);
    expect(isDenied(r)).toBe(true);
  });

  it("allows re-declaring schema structure (property names in order)", () => {
    const names = Object.keys(FAKE_SCHEMA.properties).map((k) => `  ${k}: z.string(),`).join("\n");
    expect(isAllowed(write(path.join(repo, "s.ts"), `const S = z.object({\n${names}\n});`))).toBe(true);
  });

  it("checks Edit new_string, MultiEdit edits and NotebookEdit new_source", () => {
    const file = path.join(repo, "a.md");
    const inputs = [
      { tool_name: "Edit", tool_input: { file_path: file, old_string: "x", new_string: FAKE_JA } },
      { tool_name: "MultiEdit", tool_input: { file_path: file, edits: [{ old_string: "a", new_string: "ok" }, { old_string: "b", new_string: FAKE_EN }] } },
      { tool_name: "NotebookEdit", tool_input: { notebook_path: path.join(repo, "n.ipynb"), new_source: FAKE_EN } },
    ];
    for (const i of inputs) expect(isDenied(runHook(SCRIPT, { hook_event_name: "PreToolUse", ...i }, env))).toBe(true);
  });

  it("allows ordinary code", () => {
    expect(isAllowed(write(path.join(repo, "a.ts"), "export const add = (a: number, b: number) => a + b;\n"))).toBe(true);
  });
});

describe("pre-write-guard: writing into the design folder", () => {
  it("denies writes to design documents", () => {
    const r = write(path.join(design, "brief.md"), "changed");
    expect(isDenied(r)).toBe(true);
  });

  it("denies writes regardless of path case and separators", () => {
    const p = path.join(design, "new.md").toUpperCase().replaceAll("\\", "/");
    expect(isDenied(write(p, "x"))).toBe(true);
  });

  it("allows HANDOFF.md", () => {
    expect(isAllowed(write(path.join(design, "HANDOFF.md"), "# HANDOFF\n- next: M1\n"))).toBe(true);
  });

  it("still checks HANDOFF.md for personal data", () => {
    expect(isDenied(write(path.join(design, "HANDOFF.md"), `contact ${PII.email}`))).toBe(true);
  });
});

describe("pre-write-guard: personal data", () => {
  for (const [kind, value] of Object.entries(PII)) {
    it(`denies ${kind}`, () => {
      const r = write(path.join(repo, "a.md"), `text ${value} text`);
      expect(isDenied(r)).toBe(true);
    });
  }

  it("allows placeholder and bot addresses, dates and versions", () => {
    const ok = [
      ["noreply", AT, "anthropic.com"].join(""),
      ["user", AT, "example.com"].join(""),
      ["123+bot", AT, "users.noreply.github.com"].join(""),
      "2026-11-06 20:00", "1.2.3", "@kimi/core", "0.5",
    ].join("\n");
    expect(isAllowed(write(path.join(repo, "a.md"), ok))).toBe(true);
  });
});

describe("pre-write-guard: shell commands", () => {
  const sh = (tool: "Bash" | "PowerShell", command: string) =>
    runHook(SCRIPT, { hook_event_name: "PreToolUse", tool_name: tool, tool_input: { command } }, env);

  it("denies a heredoc that writes a design sentence", () => {
    expect(isDenied(sh("Bash", `cat > notes.md <<'EOF'\n${FAKE_JA}\nEOF`))).toBe(true);
  });

  it("denies shell writes into the design folder", () => {
    expect(isDenied(sh("Bash", `echo hi > "${design}/x.md"`))).toBe(true);
    expect(isDenied(sh("PowerShell", `Set-Content -Path "${design}\\x.md" -Value hi`))).toBe(true);
  });

  it("allows reading the design folder", () => {
    expect(isAllowed(sh("Bash", `cat "${design}/brief.md" | head -5`))).toBe(true);
  });

  it("allows reading the design folder with stream redirections that write nothing", () => {
    expect(isAllowed(sh("Bash", `ls "${design}/" ; ls x 2>&1`))).toBe(true);
    expect(isAllowed(sh("Bash", `cat "${design}/brief.md" 2>/dev/null | wc -l`))).toBe(true);
    expect(isAllowed(sh("PowerShell", `Get-Content "${design}\\brief.md" 2>$null`))).toBe(true);
  });

  it("still denies redirecting design content into a file", () => {
    expect(isDenied(sh("Bash", `cat "${design}/brief.md" > notes.md 2>&1`))).toBe(true);
  });

  it("denies personal data in a command", () => {
    expect(isDenied(sh("Bash", `echo ${PII.mobile} >> a.txt`))).toBe(true);
  });

  it("allows ordinary commands", () => {
    expect(isAllowed(sh("Bash", "pnpm test && git status"))).toBe(true);
  });
});

describe("pre-write-guard: other tools and inputs", () => {
  it("ignores tools it does not guard", () => {
    const r = runHook(SCRIPT, { hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: path.join(design, "brief.md") } }, env);
    expect(isAllowed(r)).toBe(true);
  });

  it("skips the copy check when the design folder does not exist", () => {
    const r = runHook(
      SCRIPT,
      { hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: path.join(repo, "a.md"), content: FAKE_EN } },
      { KIMI_DESIGN_DIR: path.join(repo, "no-such-dir") },
    );
    expect(isAllowed(r)).toBe(true);
  });
});

// Runs only on the developer machine, where the real design folder exists. Skipped in CI.
const REAL_DESIGN = "C:\\dev\\hackathon-2026\\学習アプリ";
const REAL_BRIEF = path.join(REAL_DESIGN, "build-brief.md");
describe.skipIf(!existsSync(REAL_BRIEF))("pre-write-guard: the real design folder", () => {
  it("denies a sentence taken from build-brief.md at test time", () => {
    const line = readFileSync(REAL_BRIEF, "utf8")
      .split(/\r?\n/)
      .find((l) => l.length > 80 && !l.startsWith("|") && !l.startsWith("#"));
    expect(line).toBeDefined();
    const r = runHook(
      SCRIPT,
      { hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: "C:\\dev\\hackathon_prod\\x.md", content: line } },
      { KIMI_DESIGN_DIR: "" },
    );
    expect(isDenied(r)).toBe(true);
    expect(denyReason(r)).toContain("build-brief.md");
  });
});
