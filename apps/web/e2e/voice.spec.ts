// The child's voice in a real browser (指示書 第7.1節 手順5, 第11節 M6): a fake speech recognizer is put on the page
// (window.__kimiFakeSpeech) and the local worker's /safety and /interpret are answered by the test. The child
// says who is taken as 1; the junior acknowledges, restates with the words heard, and the child confirms.
import { expect, test } from "@playwright/test";
import { E2E_API_BASE } from "./api-base.ts";

const SAID = "AIくんが1だよ、AIくんがすくった金魚の数の3/4だから";
const CORS = { "access-control-allow-origin": "http://localhost:4173", "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type" };

test("the child tells the junior by talking, sees the words live, and confirms the junior's restatement", async ({ page }) => {
  await page.addInitScript((said: string) => {
    type Ev = { resultIndex: number; results: ({ transcript: string; confidence: number }[] & { isFinal: boolean })[] };
    const ev = (t: string, f: boolean): Ev => ({ resultIndex: 0, results: [Object.assign([{ transcript: t, confidence: 1 }], { isFinal: f })] });
    const w = window as unknown as Record<string, unknown>;
    w.__kimiFakeSpeech = class {
      lang = "";
      interimResults = false;
      continuous = true;
      maxAlternatives = 0;
      onresult: ((e: Ev) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start(): void {
        w.__kimiSpeechLang = this.lang;
        setTimeout(() => this.onresult?.(ev("AIくんが1", false)), 50);
        w.__kimiSpeechFinish = () => {
          this.onresult?.(ev(said, true));
          this.onend?.();
        };
      }
      stop(): void {
        this.onend?.();
      }
      abort(): void {
        this.onend?.();
      }
    };
  }, SAID);
  const interpretBodies: unknown[] = [];
  const safetyBodies: unknown[] = [];
  await page.route(`${E2E_API_BASE}/**`, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(req.url()).pathname;
    if (path === "/interpret") {
      interpretBodies.push(req.postDataJSON());
      return route.fulfill({
        status: 200,
        headers: CORS,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok", ops: [{ op: "set_relation_reference", target_id: "r_ratio", reference: "q_ai", evidence: "" }] }),
      });
    }
    if (path === "/safety") {
      safetyBodies.push(req.postDataJSON());
      return route.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify({ flag: "none" }) });
    }
    return route.fulfill({ status: 503, headers: CORS, contentType: "application/json", body: JSON.stringify({ error: "no_key" }) });
  });

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await page.getByTestId("btn-home-start").click();
  await page.getByTestId("btn-next").click();
  await page.getByTestId("btn-consent-yes").click();
  await page.getByTestId("btn-guess-unknown").click();
  await page.getByTestId("btn-predict-fits").click();
  const talk = page.getByTestId("btn-talk");
  await expect(talk).toHaveText("話して教える");
  await talk.click();
  // The interim words show live under the junior.
  await expect(page.getByTestId("voice-interim")).toHaveText("AIくんが1");
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__kimiSpeechLang)).toBe("ja-JP");
  await page.evaluate(() => ((window as unknown as Record<string, () => void>).__kimiSpeechFinish as () => void)());
  // The junior restates with the child's own words heard and the holder of the "1".
  await expect(page.getByTestId("junior-line")).toContainText(SAID);
  await expect(page.getByTestId("junior-line")).toContainText("「1」");
  expect(interpretBodies).toEqual([{ problem_id: "p_festival", transcript: SAID, lang: "ja" }]);
  expect(safetyBodies).toEqual([{ text: SAID }]);
  await page.getByTestId("btn-confirm-yes").click();
  // On the festival story a fix that makes every sentence fit goes straight to the rebuilt world (Q60).
  // The child's teaching rebuilds the junior's world; the flow goes on to the unit.
  await expect(page.getByTestId("btn-next")).toBeVisible();
  await expect(page.locator("main")).not.toContainText("8匹");
});
