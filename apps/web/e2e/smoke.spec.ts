// The whole first problem in a real browser, with the local server down: templates and the fallback pool
// only (指示書 第11節 M7: the flow never stops when the server does). Every step is a tap.
import { expect, test } from "@playwright/test";

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
  await expect(page.getByTestId("screen-hard")).not.toContainText(/\d{2,4}-\d{2,4}-\d{3,4}|0120/);
});

test("the three buttons stay on the parent screen too", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("btn-parent").click();
  await expect(page.getByTestId("btn-stop")).toBeVisible();
  await expect(page.getByTestId("btn-hard")).toBeVisible();
});
