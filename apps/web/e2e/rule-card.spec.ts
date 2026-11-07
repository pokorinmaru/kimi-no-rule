// 指示書 第7.1節「後輩のルールカード」, 第2節「自分で直す」in a real browser with the local server down: two
// problems solved by taps, then the junior's card; choosing who is taken as 1 builds every world of the gallery
// again, and only the sentences' light changes; the everyday scenes are read with the picked rule too. The answers
// are found here with core and never read off the screen.
import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";
import { FRACTION_BANK, judgeAnswer, judgeUnitValue, numbersIn, sceneAvoidValues, type ProblemRecord } from "@kimi/core";

const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

async function axeViolations(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (c: Document, o: unknown) => Promise<{ violations: { id: string; nodes: { html: string }[] }[] }> } }).axe;
    const res = await axe.run(document, { resultTypes: ["violations"] });
    return res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
  });
}

async function recordOnScreen(page: Page): Promise<ProblemRecord> {
  const id = await page.locator("section[data-problem-id]").getAttribute("data-problem-id");
  const r = FRACTION_BANK.find((x) => x.world.problem_id === id);
  if (r === undefined) throw new Error(`no bank problem ${String(id)}`);
  return r;
}

function rightNumbers(record: ProblemRecord): { unit: number; total: number } {
  let unit = 0;
  let total = 0;
  for (let n = 1; n <= 60; n++) {
    if (unit === 0 && judgeUnitValue(record, { num: n, den: 1 })) unit = n;
    if (total === 0 && judgeAnswer(record, { num: n, den: 1 })) total = n;
  }
  return { unit, total };
}

async function typeNumber(page: Page, n: number): Promise<void> {
  for (const d of String(n)) await page.getByTestId(`pad-${d}`).click();
  await page.getByTestId("pad-ok").click();
}

async function solve(page: Page): Promise<void> {
  await page.getByTestId("btn-predict-odd").click();
  const record = await recordOnScreen(page);
  const rel = record.world.relations[0];
  const holder = record.world.quantities.find((q) => q.id === rel?.reference)?.holder;
  await page.locator('[data-role="reference_mark"]').click();
  await page.locator(`[data-drop-target="${String(holder)}"]`).first().click();
  await page.getByTestId("btn-confirm-yes").click();
  await page.getByTestId("btn-next").click();
  const { unit, total } = rightNumbers(record);
  await typeNumber(page, unit);
  await typeNumber(page, total);
  await page.getByTestId("btn-next").click();
}

/** The lit sentences of each gallery item, and the lengths of its tapes. */
async function gallery(page: Page): Promise<string> {
  return page.getByTestId("gallery-item").evaluateAll((items) =>
    JSON.stringify(
      items.map((it) => ({
        lit: [...it.querySelectorAll('[data-statement][data-glow="true"]')].map((e) => e.getAttribute("data-statement")),
        tapes: [...it.querySelectorAll('[data-role="tape-bar"] rect, [data-role="segment"]')].length,
      })),
    ),
  );
}

test("two solved problems open the junior's card; choosing who is 1 builds the gallery again", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await page.getByTestId("btn-next").click();
  await page.getByTestId("btn-consent-yes").click();
  await solve(page);
  await expect(page.getByTestId("screen-card")).toHaveCount(0);
  await expect(page.getByTestId("btn-predict-odd")).toBeVisible();
  await solve(page);

  await expect(page.getByTestId("screen-card")).toBeVisible();
  await expect(page.getByTestId("rule-card")).toContainText("後輩の読み方：");
  await expect(page.getByTestId("gallery-item")).toHaveCount(2);
  // The AI mark and the three buttons stay on the card screen.
  await expect(page.locator('[data-role="ai-badge"]').first()).toBeVisible();
  await expect(page.getByTestId("btn-hard")).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);

  await page.getByTestId("card-option-c_swap").click();
  await expect(page.getByTestId("card-option-c_swap")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("rule-card")).toContainText("1とみる人を、入れかえて読む");
  const swapped = await gallery(page);
  // Swapping lights a sentence on every world of the gallery.
  for (const g of JSON.parse(swapped) as { lit: string[] }[]) expect(g.lit.length).toBeGreaterThan(0);

  // 身近な場面で見てみる (指示書 第6.7節 手順5): two everyday scenes read with the swap; the common-sense sentence is
  // lit in one and kept in the other. The server is down, so these are the program's scenes.
  const scenes = page.getByTestId("scenes");
  await expect(scenes).toBeVisible();
  await expect(scenes).toContainText("身近な場面で見てみる");
  await expect(scenes.getByTestId("scene")).toHaveCount(2);
  await expect(scenes.locator('[data-role="common-sense"][data-glow="true"]')).toHaveCount(1);
  expect(await scenes.locator('[data-role="scene-tape"]').count()).toBeGreaterThanOrEqual(4);
  const avoid = sceneAvoidValues(FRACTION_BANK);
  for (const n of numbersIn((await scenes.textContent()) ?? "")) expect(avoid.some((a) => a.num * n.den === n.num * a.den)).toBe(false);
  expect(await axeViolations(page)).toEqual([]);

  await page.getByTestId("card-option-c_correct").click();
  await expect(page.getByTestId("rule-card")).toContainText("文が言うとおりの人を、1とみる");
  await expect(page.locator('[data-testid="gallery-item"] [data-glow="true"][data-statement]')).toHaveCount(0);
  await expect(scenes.getByTestId("scene")).toHaveCount(2);
  await expect(scenes.locator('[data-role="common-sense"][data-glow="true"]')).toHaveCount(0);
  expect(await gallery(page)).not.toBe(swapped);
  // Nothing on the screen judges.
  await expect(page.locator("main")).not.toContainText(/正し|まちが|間違|正解/);

  await page.getByTestId("btn-card-next").click();
  await expect(page.getByTestId("predict")).toBeVisible();
});
