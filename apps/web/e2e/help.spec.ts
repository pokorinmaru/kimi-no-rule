// The junior's staged questions and the word book in a real browser, with the local server down (指示書 第7.1節
// 手順4・5, 第11節 M7): 「わからない」 lights the relation words, asks which is longer, offers the word book; the word
// book draws an everyday example with the "1" card; two failed fixes open it by itself. No answer on any of them.
// These screens are on the adults' try route (#/try) since the child's route runs one sentence at a time (Q62).
import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";

const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

async function expectNoAxeViolations(page: Page, screen: string): Promise<void> {
  await page.addScriptTag({ path: axePath });
  const found = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (c: Document, o: unknown) => Promise<{ violations: { id: string; nodes: { html: string }[] }[] }> } }).axe;
    const res = await axe.run(document, { resultTypes: ["violations"] });
    return res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
  });
  expect(found, screen).toEqual([]);
}

/** On every help screen: the three buttons, and neither the signboard's answer nor the size of one part. */
async function keepsTheRules(page: Page): Promise<void> {
  await expect(page.getByTestId("btn-stop")).toBeVisible();
  await expect(page.getByTestId("btn-dont-know")).toBeVisible();
  await expect(page.getByTestId("btn-hard")).toBeVisible();
  await expect(page.locator("main")).not.toContainText("8匹");
  await expect(page.getByTestId("junior-line")).not.toContainText("AIくん");
}

async function start(page: Page): Promise<void> {
  // 900 px wide: on #/try at 1000 px and wider the app column sits beside the research note (the try route never
  // splits the problem screen, App split={false}), narrower than a tablet. Below that width the note wraps under
  // the app and the screen is laid out as on a tablet.
  await page.setViewportSize({ width: 900, height: 768 });
  // The old screens live on the adults' try route now (Q62): no top page there; its first problem is the festival one.
  await page.goto("/#/try");
  await page.getByTestId("btn-next").click();
  await page.getByTestId("btn-consent-yes").click();
  await page.getByTestId("btn-guess-unknown").click();
  await page.getByTestId("btn-predict-odd").click();
}

test("「わからない」 opens the staged questions, and the word book draws the wording with the 1 card", async ({ page }) => {
  await start(page);
  await page.getByTestId("btn-dont-know").click();
  await expect(page.getByTestId("screen-help")).toHaveAttribute("data-stage", "read");
  await expect(page.locator('[data-role="lit-word"]')).toHaveText(["の", "の"]);
  await expect(page.getByTestId("btn-read-aloud")).toBeVisible();
  await keepsTheRules(page);
  await expectNoAxeViolations(page, "help: read");
  await page.getByTestId("btn-help-read").click();
  await expect(page.getByTestId("screen-help")).toHaveAttribute("data-stage", "order");
  await expect(page.getByTestId("help-order").getByRole("button")).toHaveCount(2);
  await keepsTheRules(page);
  await page.getByTestId("btn-order-h_me").click();
  await expect(page.getByTestId("screen-help")).toHaveAttribute("data-stage", "offer");
  await keepsTheRules(page);
  await page.getByTestId("btn-open-book").click();
  await expect(page.getByTestId("screen-wordbook")).toHaveAttribute("data-page", "no");
  await expect(page.getByTestId("screen-wordbook").locator('[data-role="tape"]')).toHaveCount(2);
  await expect(page.getByTestId("screen-wordbook").locator('[data-role="tape"][data-unit="true"]')).toHaveAttribute("data-holder", "h_one");
  // The page's two contrasting stage pictures, each captioned by which holder is taken as 1.
  await expect(page.getByTestId("wordbook-contrast")).toHaveCount(2);
  await expect(page.getByTestId("wordbook-caption").first()).toContainText("とみると");
  // Side by side, the two pictures together at most 700 px tall (the page's own text and tape are the rest; the
  // whole page was about 1,330 px on the signboard, whose set is 22 and 11: the smallest set, 14 and 7, would show
  // 8 shapes in picture (2), the signboard's hidden answer).
  await expect(page.getByTestId("wordbook-contrasts")).toHaveAttribute("data-side-by-side", "true");
  const tall = await page.getByTestId("wordbook-contrasts").evaluate((el) => el.getBoundingClientRect().height);
  expect(tall).toBeLessThanOrEqual(700);
  await keepsTheRules(page);
  await expectNoAxeViolations(page, "word book");
  await page.getByTestId("btn-book-close").click();
  await expect(page.getByTestId("looking-line")).toBeVisible();
});

test("two failed fixes open the word book by itself", async ({ page }) => {
  await start(page);
  for (let fix = 1; fix <= 2; fix++) {
    await page.locator('[data-role="reference_mark"]').click();
    // The card already lies on 兄 (the junior's reading): put it there again, so a sentence stays lit.
    await page.locator('[data-drop-target="h_me"]').first().dispatchEvent("click");
    await page.getByTestId("btn-confirm-yes").click();
    // The first fix on the session's first wording, and the second failed fix: the book, each time.
    await expect(page.getByTestId("screen-wordbook")).toBeVisible();
    await keepsTheRules(page);
    await page.getByTestId("btn-book-close").click();
  }
  await expect(page.getByTestId("looking-line")).toBeVisible();
});
