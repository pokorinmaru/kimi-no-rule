// The adults' try route in a real browser (指示書 第6.9節, 第11節 M5), with the local server down: the simulated
// child plays two problems, and 「中身を見る」 shows the pool's weights change and why the second problem was chosen.
import { expect, test } from "@playwright/test";

test("#/try: the simulated child plays two problems and the research note follows", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/#/try");
  await expect(page.getByTestId("try-banner")).toContainText("大人");
  // The unchecked problems AI wrote stay out unless the adult turns them on (Q33).
  await expect(page.getByLabel("AIが作った未確認の問題も使う")).not.toBeChecked();
  await page.getByTestId("btn-next").click();
  await page.getByTestId("btn-consent-yes").click();
  const note = page.getByTestId("research-note");
  await expect(note.getByTestId("note-choice")).toContainText("最初の問題");

  await page.getByTestId("sim-child").selectOption("s_known");
  await page.getByTestId("btn-sim-play").click();
  // After the first problem: the pool and the reason for the second problem.
  await expect(note.getByTestId("note-weight").nth(1)).toBeVisible({ timeout: 20_000 });
  await expect(note.getByTestId("note-choice")).toContainText("見分け");
  await expect(note.getByTestId("note-gain")).toHaveText(/\d/);
  await expect(note.getByTestId("note-hidden").first()).toBeVisible();
  const before = await note.getByTestId("note-weight").allTextContents();

  await page.getByTestId("btn-sim-play").click();
  await expect(note.getByTestId("note-observation")).toHaveCount(2, { timeout: 20_000 });
  await expect.poll(async () => note.getByTestId("note-weight").allTextContents()).not.toEqual(before);
  // The child's screen beside it never carries the note's words.
  await expect(page.locator("main")).not.toContainText("仮説");
});

test("the child's route has no research note", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("btn-home-start").click();
  await page.getByTestId("btn-next").click();
  await page.getByTestId("btn-consent-yes").click();
  // The child's route runs the problem one sentence at a time (Q62).
  await expect(page.getByTestId("screen-steps")).toBeVisible();
  await expect(page.getByTestId("research-note")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("研究ノート");
  await expect(page.getByTestId("toggle-unchecked")).toHaveCount(0);
});

test("#/try at 1280 px: the old problem screen keeps one column beside the research note (its words are not crushed)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/#/try");
  await page.getByTestId("btn-next").click();
  await page.getByTestId("btn-consent-yes").click();
  await expect(page.getByTestId("screen-guess")).toBeVisible();
  const main = await page.locator("main").boundingBox();
  const text = await page.locator(".k-text").first().boundingBox();
  expect(main).not.toBeNull();
  expect(text).not.toBeNull();
  // One column: the words take the app's whole column (less its padding), not what a 548 px world leaves.
  expect(text?.width ?? 0).toBeGreaterThan((main?.width ?? 0) * 0.8);
  // And the world (when drawn) comes under the words, not beside them.
  const world = page.locator(".k-world").first();
  if ((await world.count()) > 0) {
    const w = await world.boundingBox();
    expect(w?.y ?? 0).toBeGreaterThanOrEqual((text?.y ?? 0) + (text?.height ?? 0) - 1);
  }
});
