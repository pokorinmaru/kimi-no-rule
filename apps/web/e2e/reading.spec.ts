// Reading support in a real browser (指示書 第8.4b節 読みの配慮): the browser's speech synthesis is replaced by a
// recorder (it ends each utterance when the test says so), so the test sees what is read and which sentence is lit.
// Furigana is on at first, the switch turns it off, and the choice stays after a reload.
import { expect, test } from "@playwright/test";

test("「読み上げ」 reads the problem sentence by sentence; ふりがな is on, turns off, and stays off after a reload", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    const spoken: { text: string; lang: string; rate: number }[] = [];
    let current: { onend: (() => void) | null } | null = null;
    w.__kimiSpoken = spoken;
    w.__kimiSpeakEnd = () => {
      const c = current;
      current = null;
      c?.onend?.();
    };
    class Utt {
      lang = "";
      rate = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utt, configurable: true });
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        speak(u: Utt) {
          spoken.push({ text: u.text, lang: u.lang, rate: u.rate });
          current = u;
        },
        cancel() {
          current = null;
        },
      },
      configurable: true,
    });
  });
  const spoken = () => page.evaluate(() => (window as unknown as { __kimiSpoken: { text: string; lang: string; rate: number }[] }).__kimiSpoken);
  const end = () => page.evaluate(() => (window as unknown as { __kimiSpeakEnd: () => void }).__kimiSpeakEnd());

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await page.getByTestId("btn-next").click();
  await page.getByTestId("btn-consent-yes").click();
  await page.getByTestId("btn-guess-unknown").click();
  await expect(page.getByTestId("junior-line")).not.toHaveText("…");
  // Furigana over the problem's kanji, on at first.
  await expect(page.locator('[data-statement="0"] rt').first()).toHaveText("あに");
  await page.getByTestId("btn-read-aloud").click();
  await expect(page.locator('[data-statement="0"]')).toHaveAttribute("data-reading", "true");
  expect((await spoken())[0]).toEqual({ text: "あにのきんぎょは6匹。", lang: "ja-JP", rate: 0.85 });
  await end();
  await expect(page.locator('[data-statement="1"]')).toHaveAttribute("data-reading", "true");
  expect((await spoken())[1]?.text).toBe("これは、おとうとのきんぎょのかずの4分の3です。");
  // Stop: nothing stays lit.
  await page.getByTestId("btn-read-stop").click();
  await expect(page.locator('[data-reading="true"]')).toHaveCount(0);
  // Nothing read holds the answer.
  for (const u of await spoken()) expect(u.text).not.toContain("8");

  await page.getByTestId("btn-furigana").click();
  await expect(page.locator("[data-statement] ruby")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("btn-furigana")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("[data-statement] ruby")).toHaveCount(0);
});
