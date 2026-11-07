// The words of the screens (指示書 第8.4b節). Written from the run-through with the real Claude.
import { describe, expect, it } from "vitest";
import { ui } from "./text.ts";

describe("the session's last screen", () => {
  // Run-through, 2026-11-08: the line said to press 「やめる」 while the screen's own button is 「おわる」.
  it.each(["ja", "en"] as const)("names the button the screen shows (%s)", (lang) => {
    const t = ui(lang);
    expect(t.finished.lines.join(" ")).toContain(t.finished.end);
    expect(t.finished.lines.join(" ")).not.toContain(t.buttons.stop);
  });
});
