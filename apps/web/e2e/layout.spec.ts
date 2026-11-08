// The band of the three buttons at the bottom (原則7) never covers what the child must see or tap (whole-screen review,
// 2026-11-08: the band sat over the stage picture). On every screen of the first problem, at both tablet sizes, with
// the page scrolled to its end, the band's box overlaps no button, no number-pad key and no thing of the picture.
// The child's route runs the problem one sentence at a time (Q62), so the screens are its steps and their branches.
import { expect, test, type Page } from "@playwright/test";

async function typeNumber(page: Page, n: number): Promise<void> {
  for (const d of String(n)) await page.getByTestId(`pad-${d}`).click();
  await page.getByTestId("pad-ok").click();
}

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
  // The band itself stays on the screen, its buttons in view (no 「つらい」 button, Q64).
  await expect(page.getByTestId("btn-stop")).toBeInViewport();
  await expect(page.getByTestId("btn-dont-know")).toBeInViewport();
}

for (const size of SIZES) {
  test(`the bottom band covers nothing at ${String(size.width)}x${String(size.height)}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    await page.getByTestId("btn-home-start").click();
    await expect(page.getByTestId("btn-next")).toBeVisible();
    await expectBarClear(page, "intro");
    await page.getByTestId("btn-next").click();
    await expect(page.getByTestId("btn-consent-yes")).toBeVisible();
    await expectBarClear(page, "consent");
    await page.getByTestId("btn-consent-yes").click();
    // The child's route runs the problem one sentence at a time (Q62): every step and its branches.
    const steps = page.getByTestId("screen-steps");
    await expect(steps).toHaveAttribute("data-step", "fact");
    await expectBarClear(page, "fact step");
    await typeNumber(page, 5);
    await expect(page.getByTestId("steps-lead")).toBeVisible();
    await expectBarClear(page, "fact step, its number lit");
    await typeNumber(page, 8);
    await expect(steps).toHaveAttribute("data-step", "relation");
    await expectBarClear(page, "relation step");
    await page.getByTestId("btn-step-h_ai").click();
    await expect(page.getByTestId("btn-step-again")).toBeVisible();
    await expectBarClear(page, "the other reading's world");
    await page.getByTestId("btn-step-again").click();
    await page.getByTestId("btn-step-h_me").click();
    await expect(steps).toHaveAttribute("data-step", "unit");
    await expectBarClear(page, "one part");
    await typeNumber(page, 5);
    await expect(page.getByTestId("deal-board")).toBeVisible();
    await expectBarClear(page, "one part, the child's own dealing");
    await typeNumber(page, 2);
    await expect(steps).toHaveAttribute("data-step", "total");
    await expectBarClear(page, "the answer");
    await typeNumber(page, 6);
    await expect(steps).toHaveAttribute("data-step", "solved");
    await expectBarClear(page, "solved");
  });
}
