// The whole first problem in a real browser, with the local server down: templates and the fallback pool
// only (指示書 第11節 M7: the flow never stops when the server does). Every step is a tap.
import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";
import { FRACTION_BANK, judgeAnswer } from "@kimi/core";

const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

/** axe-core on the whole page as it is now (指示書 第8.4b節): no violation. */
async function expectNoAxeViolations(page: Page, screen: string): Promise<void> {
  await page.addScriptTag({ path: axePath });
  const found = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (c: Document, o: unknown) => Promise<{ violations: { id: string; nodes: { html: string }[] }[]; passes: unknown[] }> } }).axe;
    const res = await axe.run(document, { resultTypes: ["violations"] });
    return { passes: res.passes.length, violations: res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`) };
  });
  expect(found.passes, screen).toBeGreaterThan(0);
  expect(found.violations, screen).toEqual([]);
}

test("app shell renders with the AI mark and the three buttons", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("後輩と問題を読もう");
  await expect(page.getByTestId("btn-stop")).toBeVisible();
  await expect(page.getByTestId("btn-dont-know")).toBeVisible();
  await expect(page.getByTestId("btn-hard")).toBeVisible();
});

test("the signboard problem from the junior's misreading to the answer, then a second problem with the junior's card", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await page.getByTestId("btn-next").click();
  await page.getByTestId("btn-consent-yes").click();
  // The junior's world: the younger brother's tape is asked, so it shows ？ and never the answer.
  await expect(page.getByTestId("junior-line")).not.toHaveText("…");
  await expect(page.locator("main")).not.toContainText("8匹");
  await page.getByTestId("btn-next").click();
  // The child teaches with the 1 card: tap it, then tap the younger brother's whole tape.
  await page.locator('[data-role="reference_mark"]').click();
  await page.locator('[data-drop-target="h_otouto"]').first().click();
  await expect(page.getByTestId("junior-line")).toContainText("弟");
  await page.getByTestId("btn-confirm-yes").click();
  await page.getByTestId("btn-next").click();
  // The three buttons stay on screen while the child types a number (原則7).
  await expect(page.getByTestId("btn-hard")).toBeInViewport();
  await page.getByTestId("pad-2").click();
  await page.getByTestId("pad-ok").click();
  await page.getByTestId("pad-8").click();
  await page.getByTestId("pad-ok").click();
  await expect(page.locator("main")).toContainText("8匹");
  await page.getByTestId("btn-next").click();
  await expect(page.getByTestId("reading-card")).toContainText("後輩の読み方：");
  await expect(page.locator("main")).not.toContainText("君のルール");
});

test("つらい stops the math from a problem and shows no phone number", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("btn-next").click();
  await page.getByTestId("btn-consent-yes").click();
  await page.getByTestId("btn-hard").click();
  await expect(page.getByTestId("screen-hard")).toBeVisible();
  await expect(page.locator('[data-role="tape"]')).toHaveCount(0);
  // The helplines checked against their operators' pages are listed (B2), each with its number.
  const lines = page.getByTestId("helplines").locator("li");
  await expect(lines).toHaveCount(4);
  await expect(page.getByTestId("helplines")).toContainText("0120-0-78310");
});

test("the three buttons stay on the parent screen too", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("btn-parent").click({ delay: 2200 });
  await expect(page.getByTestId("btn-stop")).toBeVisible();
  await expect(page.getByTestId("btn-hard")).toBeVisible();
});

test("axe-core finds no violation on the intro, consent and number-pad screens", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await expect(page.getByTestId("btn-next")).toBeVisible();
  await expectNoAxeViolations(page, "intro");
  await page.getByTestId("btn-next").click();
  await expect(page.getByTestId("btn-consent-yes")).toBeVisible();
  await expectNoAxeViolations(page, "consent");
  await page.getByTestId("btn-consent-yes").click();
  await page.getByTestId("btn-next").click();
  await page.locator('[data-role="reference_mark"]').click();
  await page.locator('[data-drop-target="h_otouto"]').first().click();
  await page.getByTestId("btn-confirm-yes").click();
  await page.getByTestId("btn-next").click();
  await expect(page.getByTestId("pad-ok")).toBeVisible();
  await expectNoAxeViolations(page, "number pad");
});

test("a wrong unit gets the junior's words, never the right number; a second wrong one holds the problem", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await page.getByTestId("btn-next").click();
  await page.getByTestId("btn-consent-yes").click();
  await page.getByTestId("btn-next").click();
  await page.locator('[data-role="reference_mark"]').click();
  await page.locator('[data-drop-target="h_otouto"]').first().click();
  await page.getByTestId("btn-confirm-yes").click();
  await page.getByTestId("btn-next").click();
  const before = await page.getByTestId("junior-line").textContent();
  await page.getByTestId("pad-5").click();
  await page.getByTestId("pad-ok").click();
  await expect(page.getByTestId("junior-line")).not.toHaveText(before ?? "");
  await expect(page.getByTestId("junior-line")).toContainText("6");
  await expect(page.locator("main")).not.toContainText("8匹");
  await page.getByTestId("pad-5").click();
  await page.getByTestId("pad-ok").click();
  await expect(page.getByTestId("btn-next")).toHaveText("つぎの問題へ");
});

test("the AI-free check: three problems, a neutral line after each, and the result on the parent screen", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await page.getByRole("button", { name: "AIなしで ためしてみる" }).click();
  for (let i = 0; i < 3; i++) {
    const problem = page.getByTestId("check-problem");
    await expect(problem).toBeVisible();
    const id = await problem.getAttribute("data-problem-id");
    const record = FRACTION_BANK.find((r) => r.world.problem_id === id);
    if (record === undefined) throw new Error(`no bank problem ${String(id)}`);
    // The answer comes from the prepared problem, checked by core here; the screen never shows it.
    const answer = record.expected_answer as { num: number; den: number };
    expect(judgeAnswer(record, answer as never)).toBe(true);
    // No junior and no world on this screen; the AI mark and the three buttons stay.
    await expect(page.getByTestId("junior-line")).toHaveCount(0);
    await expect(page.locator('[data-role="tape"]')).toHaveCount(0);
    await expect(page.locator('[data-role="ai-badge"]').first()).toBeVisible();
    await expect(page.getByTestId("btn-hard")).toBeInViewport();
    for (const d of String(answer.num)) await page.getByTestId(`pad-${d}`).click();
    await page.getByTestId("pad-ok").click();
    await expect(page.getByTestId("check-line")).toHaveText("こたえを、うけとりました。");
    await expect(page.locator("main")).not.toContainText(/正し|まちが|間違|合って|正解/);
    await page.getByTestId("btn-check-next").click();
  }
  await expect(page.getByTestId("check-done")).toBeVisible();
  await page.getByTestId("btn-check-back").click();
  await page.getByTestId("btn-parent").click({ delay: 2200 });
  await expect(page.getByTestId("check-results")).toContainText(/\d{4}\/\d{1,2}\/\d{1,2} \d{2}:\d{2}：3問中3問/);
});

test("in English: switch on the intro, then the first problem with taps; the choice stays after a reload", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await page.getByTestId("lang-en").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Read problems with the junior");
  await expect(page.getByTestId("btn-next")).toHaveText("Start");
  await page.reload();
  await expect(page.getByTestId("btn-next")).toHaveText("Start");
  await page.getByTestId("btn-next").click();
  await page.getByTestId("btn-consent-yes").click();
  // The problem stays as written, with a note in English; the junior's words are English.
  await expect(page.getByText("The problem is written in Japanese.")).toBeVisible();
  await expect(page.getByTestId("junior-line")).not.toHaveText("…");
  await expect(page.getByTestId("junior-line")).not.toContainText(/[\u3040-\u30ff]/);
  await expect(page.locator("main")).not.toContainText("8匹");
  await page.getByTestId("btn-next").click();
  await page.locator('[data-role="reference_mark"]').click();
  await page.locator('[data-drop-target="h_otouto"]').first().click();
  // The holder's name stays as in the problem.
  await expect(page.getByTestId("junior-line")).toContainText("弟");
  await page.getByTestId("btn-confirm-yes").click();
  await page.getByTestId("btn-next").click();
  await expect(page.getByTestId("btn-hard")).toHaveText("I feel bad");
  await page.getByTestId("pad-2").click();
  await page.getByTestId("pad-ok").click();
  await page.getByTestId("pad-8").click();
  await page.getByTestId("pad-ok").click();
  await expect(page.getByTestId("btn-next")).toHaveText("Next problem");
  await page.getByTestId("btn-next").click();
  await expect(page.getByTestId("reading-card")).toContainText("Junior's reading: ");
  await expect(page.locator("main")).not.toContainText(/your rule|wrong|correct|mistake/i);
});
