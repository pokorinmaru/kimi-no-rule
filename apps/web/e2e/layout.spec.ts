// The band of the three buttons at the bottom (原則7) never covers what the child must see or tap (whole-screen review,
// 2026-11-08: the band sat over the stage picture). On every screen of the first problem, at both tablet sizes, with
// the page scrolled to its end, the band's box overlaps no button, no number-pad key and no thing of the picture.
import { expect, test, type Page } from "@playwright/test";

const SIZES = [
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
] as const;

/** The boxes under the band at the end of the page: none may meet it. */
async function expectBarClear(page: Page, screen: string): Promise<void> {
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await page.waitForTimeout(150);
  const hits = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="always"]');
    if (bar === null) return ["no bar"];
    const b = bar.getBoundingClientRect();
    const targets = [
      ...document.querySelectorAll(
        '[data-testid^="btn-"], [data-testid^="pad-"], [data-role="thing"]',
      ),
    ].filter((el) => !bar.contains(el));
    return targets.flatMap((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return [];
      const meets =
        r.left < b.right &&
        r.right > b.left &&
        r.top < b.bottom &&
        r.bottom > b.top;
      return meets
        ? [
            `${el.getAttribute("data-testid") ?? el.getAttribute("data-role") ?? el.tagName} at ${String(Math.round(r.top))}-${String(Math.round(r.bottom))} (band ${String(Math.round(b.top))})`,
          ]
        : [];
    });
  });
  expect(hits, screen).toEqual([]);
  // The band itself stays on the screen, its three buttons in view.
  await expect(page.getByTestId("btn-stop")).toBeInViewport();
  await expect(page.getByTestId("btn-hard")).toBeInViewport();
}

for (const size of SIZES) {
  test(`the bottom band covers nothing at ${String(size.width)}x${String(size.height)}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    await expect(page.getByTestId("btn-next")).toBeVisible();
    await expectBarClear(page, "intro");
    await page.getByTestId("btn-next").click();
    await expect(page.getByTestId("btn-consent-yes")).toBeVisible();
    await expectBarClear(page, "consent");
    await page.getByTestId("btn-consent-yes").click();
    await expect(page.getByTestId("btn-guess-unknown")).toBeVisible();
    await expectBarClear(page, "first guess");
    await page.getByTestId("btn-guess-unknown").click();
    await expect(page.getByTestId("btn-predict-fits")).toBeVisible();
    await expectBarClear(page, "the junior's world");
    await page.getByTestId("btn-predict-odd").click();
    await expect(page.locator('[data-role="reference_mark"]')).toBeVisible();
    await expectBarClear(page, "the lit sentence");
    await page.locator('[data-role="reference_mark"]').click();
    await page.locator('[data-drop-target="h_otouto"]').first().click();
    await expect(page.getByTestId("btn-confirm-yes")).toBeVisible();
    await expectBarClear(page, "restatement");
    await page.getByTestId("btn-confirm-yes").click();
    await expect(page.getByTestId("btn-book-close")).toBeVisible();
    await expectBarClear(page, "word book");
    await page.getByTestId("btn-book-close").click();
    await expect(page.getByTestId("btn-next")).toBeVisible();
    await expectBarClear(page, "rebuilt world");
    await page.getByTestId("btn-next").click();
    await expect(page.getByTestId("pad-ok")).toBeVisible();
    await expectBarClear(page, "number pad");
    await page.getByTestId("btn-hard").click();
    await expect(page.getByTestId("screen-hard")).toBeVisible();
    await expectBarClear(page, "つらい");
  });
}
