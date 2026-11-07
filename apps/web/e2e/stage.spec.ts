// The stage picture above the tape on the junior's world (指示書 第8節), on a tablet: each holder's things in its
// container, its name under it; the correct answer never shows as text or as a count of things.
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/** Where the screenshots go: STAGE_SHOTS when set (a person looks at them), else the test's own output. */
const shot = (name: string): string => (process.env["STAGE_SHOTS"] ? join(process.env["STAGE_SHOTS"], name) : test.info().outputPath(name));
import { FRACTION_BANK } from "@kimi/core";

test("the junior's world shows the stage picture above the tape, without the answer", async ({ page }) => {
  const signboard = FRACTION_BANK.find((r) => r.world.problem_id === "p_signboard");
  const answer = signboard?.expected_answer?.num ?? 0;
  await page.setViewportSize({ width: 1024, height: 768 });
  // The final picture at once (the deal is the same picture after its motion; 指示書 第8.6節).
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByTestId("btn-next").click();
  await page.getByTestId("btn-consent-yes").click();
  await page.getByTestId("btn-guess-h_otouto").click();
  const stage = page.locator('[data-role="stage"]');
  await expect(stage).toBeVisible();
  await expect(stage.locator('[data-role="stage-holder"]')).toHaveCount(2);
  await expect(stage.locator('[data-role="name-tag"]')).toHaveText(["兄", "弟"]);
  // Above the tape.
  const stageBox = await stage.boundingBox();
  const tapeBox = await page.locator('[data-role="tape"]').first().boundingBox();
  expect(stageBox !== null && tapeBox !== null && stageBox.y < tapeBox.y).toBe(true);
  // The older brother's 6 goldfish are drawn; the answer is neither said nor countable.
  await expect(stage.locator('[data-role="thing"][data-holder="h_ani"]')).not.toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(`${String(answer)}匹`);
  const younger = stage.locator('[data-role="thing"][data-holder="h_otouto"]');
  const wholes = await younger.evaluateAll((els) => els.filter((e) => e.getAttribute("data-piece") === "").length);
  expect(wholes).not.toBe(answer);
  expect(await younger.count()).not.toBe(answer);
  // No holder's things, counted as shapes (a cut piece is one) in all or on one dish, are the answer before the child says it.
  const counts = await stage.locator('[data-role="thing"]').evaluateAll((els) => {
    const out: number[] = [];
    const by = new Map<string, Element[]>();
    for (const e of els) by.set(e.getAttribute("data-holder") ?? "", [...(by.get(e.getAttribute("data-holder") ?? "") ?? []), e]);
    for (const list of by.values()) {
      out.push(list.length);
      const dishes = new Map<string, number>();
      for (const e of list) if (e.getAttribute("data-place") === "dish") dishes.set(e.getAttribute("data-dish") ?? "", (dishes.get(e.getAttribute("data-dish") ?? "") ?? 0) + 1);
      out.push(...dishes.values());
    }
    return out;
  });
  expect(counts.length).toBeGreaterThan(0);
  expect(counts).not.toContain(answer);
  // The holders' names in the sentences carry the picture's colours.
  await expect(page.locator('[data-statement="0"] [data-role="holder-name"]').first()).toHaveText(/兄/);
  await page.screenshot({ path: shot(`${process.env["STAGE_PREFIX"] ?? ""}stage-1024.png`), fullPage: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(stage).toBeVisible();
  const box = await stage.boundingBox();
  expect(box !== null && box.width <= 768).toBe(true);
  await page.screenshot({ path: shot(`${process.env["STAGE_PREFIX"] ?? ""}stage-768.png`), fullPage: true });
});
