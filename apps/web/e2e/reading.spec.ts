// Reading support in a real browser (指示書 第8.4b節 読みの配慮): the browser's speech synthesis is replaced by a
// recorder (it ends each utterance when the test says so), so the test sees what is read and which sentence is lit.
// Furigana is on at first, the switch turns it off, and the choice stays after a reload. The child's route runs the
// problem one sentence at a time (Q62), so this reads on a step screen.
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
  await page.getByTestId("btn-home-start").click();
  await page.getByTestId("btn-next").click();
  await page.getByTestId("btn-consent-yes").click();
  // The child's route runs the problem one sentence at a time (Q62): on the relation step two sentences are shown,
  // the step's own sentence lit, then the step's question.
  await page.getByTestId("pad-8").click();
  await page.getByTestId("pad-ok").click();
  await expect(page.getByTestId("screen-steps")).toHaveAttribute("data-step", "relation");
  // Furigana over the problem's kanji, on at first.
  await expect(page.locator('[data-statement="0"] rt').first()).toHaveText("きんぎょ");
  await expect(page.locator('[data-statement="1"]')).toHaveAttribute("data-reading", "true");
  await page.getByTestId("btn-read-aloud").click();
  await expect(page.locator('[data-statement="0"]')).toHaveAttribute("data-reading", "true");
  await expect(page.locator('[data-statement="1"]')).toHaveAttribute("data-reading", "false");
  expect((await spoken())[0]).toEqual({ text: "なつまつりのきんぎょすくいで、そらはきんぎょを8匹すくいました。", lang: "ja-JP", rate: 0.85 });
  await end();
  await expect(page.locator('[data-statement="1"]')).toHaveAttribute("data-reading", "true");
  expect((await spoken())[1]?.text).toContain("4分の3");
  // Then the step's question, read with the problem's readings.
  await end();
  await expect.poll(async () => (await spoken())[2]?.text ?? "").toContain("きんぎょ");
  // Stop: only the step's own sentence keeps its light.
  await page.getByTestId("btn-read-stop").click();
  await expect(page.locator('[data-reading="true"]')).toHaveCount(1);
  await expect(page.locator('[data-statement="1"]')).toHaveAttribute("data-reading", "true");
  // Nothing read holds the answer (6) or one part (2).
  for (const u of await spoken()) expect(u.text).not.toMatch(/[62]匹/);

  await page.getByTestId("btn-furigana").click();
  await expect(page.locator("[data-statement] ruby")).toHaveCount(0);
  await page.reload();
  await page.getByTestId("btn-home-start").click();
  await expect(page.getByTestId("btn-furigana")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("[data-statement] ruby")).toHaveCount(0);
});
