// The problem's words as tap targets in a real browser (whole-app review, 2026-11-08: tapping the middle of 「弟」
// pressed the 「の」 next to it, because each word's target reached 12 px into its neighbours). At both tablet sizes,
// the middle of every word presses that word, and no two words' targets overlap.
import { expect, test, type Page } from "@playwright/test";

const SIZES = [
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
] as const;

async function toWords(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("btn-home-start").click();
  await page.getByTestId("btn-next").click();
  await page.getByTestId("btn-consent-yes").click();
  await page.getByTestId("btn-guess-unknown").click();
  await page.getByTestId("btn-predict-odd").click();
}

for (const size of SIZES) {
  test(`every word's middle presses that word, ${String(size.width)}x${String(size.height)}`, async ({ page }) => {
    await page.setViewportSize(size);
    await toWords(page);
    const words = page.locator("[data-statement] button");
    await expect(words.first()).toBeVisible();
    const wrong = await page.evaluate(() => {
      const bs = [...document.querySelectorAll<HTMLElement>("[data-statement] button")];
      const out: string[] = [];
      bs.forEach((b, i) => {
        b.scrollIntoView({ block: "center" });
        const r = b.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (hit === null || hit.closest("button") !== b) out.push(`middle of 「${b.textContent ?? ""}」 hits 「${hit?.closest("button")?.textContent ?? "nothing"}」`);
        const n = bs[i + 1];
        if (n !== undefined && n.closest("li") === b.closest("li")) {
          const q = n.getBoundingClientRect();
          const sameLine = q.top < r.bottom && q.bottom > r.top;
          if (sameLine && q.left < r.right - 0.5) out.push(`「${b.textContent ?? ""}」 and 「${n.textContent ?? ""}」 overlap`);
        }
      });
      return out;
    });
    expect(wrong).toEqual([]);
  });
}
