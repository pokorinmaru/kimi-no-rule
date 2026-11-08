// The whole first problem in a real browser, with the local server down: templates and the fallback pool
// only (指示書 第11節 M7: the flow never stops when the server does). Every step is a tap. The child's route runs
// the problem one sentence at a time (Q62); the old screens (guess, prediction, the "1" card) are on #/try.
import { createRequire } from "node:module";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { FRACTION_BANK, judgeAnswer } from "@kimi/core";
import { COLOR } from "../src/ui/tokens.ts";

/** A locator's text as written, its furigana (the <rt> readings) aside. */
const plainOf = (loc: Locator): Promise<string> =>
  loc.evaluate((el) => {
    const c = el.cloneNode(true) as Element;
    for (const rt of c.querySelectorAll("rt")) rt.remove();
    return c.textContent ?? "";
  });

const rgbOf = (hex: string): string => `rgb(${[1, 3, 5].map((i) => String(parseInt(hex.slice(i, i + 2), 16))).join(", ")})`;

const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

/** axe-core on the whole page as it is now (指示書 第8.4b節): no violation. */
async function expectNoAxeViolations(page: Page, screen: string): Promise<void> {
  await page.addScriptTag({ path: axePath });
  const found = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (c: Document, o: unknown) => Promise<{ violations: { id: string; nodes: { html: string }[] }[]; passes: unknown[] }> } }).axe;
    const res = await axe.run(document, { resultTypes: ["violations"] });
    return { passes: res.passes.length, violations: res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`) };
  });
  expect(found.passes, screen).toBeGreaterThan(0);
  expect(found.violations, screen).toEqual([]);
}

/** The child's route to the first step of the first problem: top page, はじめる, the intro, consent. */
async function startChild(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await page.getByTestId("btn-home-start").click();
  await page.getByTestId("btn-next").click();
  await page.getByTestId("btn-consent-yes").click();
}

async function typeNumber(page: Page, n: number): Promise<void> {
  for (const d of String(n)) await page.getByTestId(`pad-${d}`).click();
  await page.getByTestId("pad-ok").click();
}

const stepScreen = (page: Page): Locator => page.getByTestId("screen-steps");

test("app shell renders with the AI mark and the three buttons", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("btn-home-start").click();
  // The title as written, its furigana aside (指示書 第8.4b節).
  const title = await page.getByRole("heading", { level: 1 }).evaluate((el) => {
    const c = el.cloneNode(true) as Element;
    for (const rt of c.querySelectorAll("rt")) rt.remove();
    return c.textContent;
  });
  expect(title).toBe("AIくんと問題を読もう");
  await expect(page.locator("h1 rt").first()).toHaveText("もんだい");
  await expect(page.getByTestId("btn-stop")).toBeVisible();
  await expect(page.getByTestId("btn-dont-know")).toBeVisible();
  await expect(page.getByTestId("btn-hard")).toBeVisible();
});

// Q62: the child's route runs the problem one sentence at a time (the count, who is compared with, one part, the answer).
test("the festival problem one sentence at a time: a wrong count, the other reading's world, the answer, then the second problem", async ({ page }) => {
  await startChild(page);
  // The first step: only the first sentence, its count asked; the answer (6) is not on the screen.
  await expect(stepScreen(page)).toHaveAttribute("data-step", "fact");
  await expect(stepScreen(page)).toHaveAttribute("data-problem-id", "p_festival_whole");
  await expect(page.getByTestId("steps-progress")).toHaveText("1 / 4");
  await expect(page.locator("[data-statement]")).toHaveCount(1);
  await expect(page.locator("main")).not.toContainText("6匹");
  await expect(page.getByTestId("steps-lead")).toHaveCount(0);
  // The three buttons stay on screen while the child types a number (原則7).
  await expect(page.getByTestId("btn-hard")).toBeInViewport();
  // A wrong count once lights the sentence's number; the step stays.
  await typeNumber(page, 5);
  await expect(stepScreen(page)).toHaveAttribute("data-step", "fact");
  await expect(page.getByTestId("steps-lead")).toBeVisible();
  await typeNumber(page, 8);
  // Who is compared with: the other holder draws that reading's world, then the question again.
  await expect(stepScreen(page)).toHaveAttribute("data-step", "relation");
  await expect(page.getByTestId("steps-progress")).toHaveText("2 / 4");
  await page.getByTestId("btn-step-h_ai").click();
  await expect(page.getByTestId("btn-step-again")).toBeVisible();
  await expect(page.getByTestId("steps-lead")).toBeVisible();
  await expect(page.getByTestId("steps-question")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("6匹");
  await page.getByTestId("btn-step-again").click();
  await expect(page.getByTestId("btn-step-again")).toHaveCount(0);
  await page.getByTestId("btn-step-h_me").click();
  // One part, then the answer.
  await expect(stepScreen(page)).toHaveAttribute("data-step", "unit");
  await expect(page.locator("main")).not.toContainText("6匹");
  await typeNumber(page, 2);
  await expect(stepScreen(page)).toHaveAttribute("data-step", "total");
  await typeNumber(page, 6);
  await expect(stepScreen(page)).toHaveAttribute("data-step", "solved");
  await expect.poll(() => plainOf(page.getByTestId("btn-next"))).toBe("つぎの問題へ");
  await page.getByTestId("btn-next").click();
  // The second problem's first step (the session may wait up to 8 s for a research reply that never comes).
  await expect(stepScreen(page)).toHaveAttribute("data-problem-id", "p_festival", { timeout: 15_000 });
  await expect(stepScreen(page)).toHaveAttribute("data-step", "fact");
  await expect(page.getByTestId("steps-progress")).toHaveText("1 / 4");
  await expect(page.getByTestId("btn-stop")).toBeVisible();
  await expect(page.getByTestId("btn-dont-know")).toBeVisible();
  await expect(page.getByTestId("btn-hard")).toBeVisible();
  await expect(page.locator('[data-role="ai-badge"]').first()).toBeVisible();
  await expect(page.locator("main")).not.toContainText("8匹");
  await expect(page.locator("main")).not.toContainText("君のルール");
});

// Q62: a wrong one part opens the smaller step (the plates dealt); two wrong answers keep the problem for later.
test("a wrong one part opens the smaller step, never the number; two wrong answers hold the problem", async ({ page }) => {
  await startChild(page);
  await typeNumber(page, 8);
  await page.getByTestId("btn-step-h_me").click();
  await expect(stepScreen(page)).toHaveAttribute("data-step", "unit");
  const before = await plainOf(page.getByTestId("steps-question"));
  await typeNumber(page, 5);
  await expect(stepScreen(page)).toHaveAttribute("data-step", "unit");
  await expect.poll(() => plainOf(page.getByTestId("steps-question"))).not.toBe(before);
  await expect(page.locator('[data-role="thing"]').first()).toBeAttached();
  await expect(page.locator("main")).not.toContainText("6匹");
  await typeNumber(page, 2);
  await expect(stepScreen(page)).toHaveAttribute("data-step", "total");
  await typeNumber(page, 5);
  await expect(stepScreen(page)).toHaveAttribute("data-step", "total");
  await expect(page.getByTestId("steps-lead")).toBeVisible();
  await typeNumber(page, 5);
  await expect(stepScreen(page)).toHaveAttribute("data-step", "held");
  await expect.poll(() => plainOf(page.getByTestId("btn-next"))).toBe("つぎの問題へ");
});

test("つらい stops the math from a problem and shows no phone number", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("btn-home-start").click();
  await page.getByTestId("btn-next").click();
  await page.getByTestId("btn-consent-yes").click();
  await page.getByTestId("btn-hard").click();
  await expect(page.getByTestId("screen-hard")).toBeVisible();
  await expect(page.locator('[data-role="tape"]')).toHaveCount(0);
  // The helplines checked against their operators' pages are listed (B2), each with its number.
  const lines = page.getByTestId("helplines").locator("li");
  await expect(lines).toHaveCount(4);
  await expect(page.getByTestId("helplines")).toContainText("0120-0-78310");
});

test("the three buttons stay on the parent screen too", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("btn-home-start").click();
  await page.getByTestId("btn-parent").click({ delay: 2200 });
  await expect(page.getByTestId("btn-stop")).toBeVisible();
  await expect(page.getByTestId("btn-hard")).toBeVisible();
});

// Q62: on the child's route the problem runs one sentence at a time, so axe runs on its steps.
test("axe-core finds no violation on the intro, consent, a fact step, the relation step, the other world and the number pad", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await page.getByTestId("btn-home-start").click();
  await expect(page.getByTestId("btn-next")).toBeVisible();
  await expectNoAxeViolations(page, "intro");
  await page.getByTestId("btn-next").click();
  await expect(page.getByTestId("btn-consent-yes")).toBeVisible();
  await expectNoAxeViolations(page, "consent");
  await page.getByTestId("btn-consent-yes").click();
  await expect(stepScreen(page)).toHaveAttribute("data-step", "fact");
  await expect(page.getByTestId("pad-ok")).toBeVisible();
  await expectNoAxeViolations(page, "fact step with the number pad");
  await typeNumber(page, 8);
  await expect(page.getByTestId("btn-step-unknown")).toBeVisible();
  await expectNoAxeViolations(page, "relation step");
  await page.getByTestId("btn-step-h_ai").click();
  await expect(page.getByTestId("btn-step-again")).toBeVisible();
  await expectNoAxeViolations(page, "the other reading's world");
  await page.getByTestId("btn-step-again").click();
  await page.getByTestId("btn-step-h_me").click();
  await expect(stepScreen(page)).toHaveAttribute("data-step", "unit");
  await typeNumber(page, 5);
  await expect(page.locator('[data-role="thing"]').first()).toBeAttached();
  await expectNoAxeViolations(page, "one part, the smaller step with the number pad");
});

// The old screens (guess, prediction, the "1" card, the junior's words at the pad) are on the adults' try route
// now (Q62). It has no top page; its first problem is the same festival problem the child's route used before.
test("#/try: a wrong unit gets the junior's words, never the right number; a second wrong one holds the problem", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/#/try");
  await page.getByTestId("btn-next").click();
  await page.getByTestId("btn-consent-yes").click();
  await page.getByTestId("btn-guess-unknown").click();
  await page.getByTestId("btn-predict-unknown").click();
  await page.locator('[data-role="reference_mark"]').click();
  await page.locator('[data-drop-target="h_ai"]').first().click();
  await page.getByTestId("btn-confirm-yes").click();
  // On the festival story a fix that makes every sentence fit goes straight to the rebuilt world (Q60).
  await page.getByTestId("btn-next").click();
  const before = await page.getByTestId("junior-line").textContent();
  await page.getByTestId("pad-5").click();
  await page.getByTestId("pad-ok").click();
  await expect(page.getByTestId("junior-line")).not.toHaveText(before ?? "");
  await expect(page.getByTestId("junior-line")).toContainText("6");
  await expect(page.locator("main")).not.toContainText("8匹");
  await page.getByTestId("pad-5").click();
  await page.getByTestId("pad-ok").click();
  await expect(page.getByTestId("btn-next")).toHaveText("つぎの問題へ");
});

test("the AI-free check: three problems, a neutral line after each, and the result on the parent screen", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await page.getByTestId("btn-home-start").click();
  await page.getByRole("button", { name: "AIなしで ためしてみる" }).click();
  for (let i = 0; i < 3; i++) {
    const problem = page.getByTestId("check-problem");
    await expect(problem).toBeVisible();
    const id = await problem.getAttribute("data-problem-id");
    const record = FRACTION_BANK.find((r) => r.world.problem_id === id);
    if (record === undefined) throw new Error(`no bank problem ${String(id)}`);
    // The answer comes from the prepared problem, checked by core here; the screen never shows it.
    const answer = record.expected_answer as { num: number; den: number };
    expect(judgeAnswer(record, answer as never)).toBe(true);
    // No junior and no world on this screen; the AI mark and the three buttons stay.
    await expect(page.getByTestId("junior-line")).toHaveCount(0);
    await expect(page.locator('[data-role="tape"]')).toHaveCount(0);
    await expect(page.locator('[data-role="ai-badge"]').first()).toBeVisible();
    await expect(page.getByTestId("btn-hard")).toBeInViewport();
    for (const d of String(answer.num)) await page.getByTestId(`pad-${d}`).click();
    await page.getByTestId("pad-ok").click();
    await expect(page.getByTestId("check-line")).toHaveText("こたえを、うけとりました。");
    await expect(page.locator("main")).not.toContainText(/正し|まちが|間違|合って|正解/);
    await page.getByTestId("btn-check-next").click();
  }
  await expect(page.getByTestId("check-done")).toBeVisible();
  await page.getByTestId("btn-check-back").click();
  await page.getByTestId("btn-parent").click({ delay: 2200 });
  await expect(page.getByTestId("check-results")).toContainText(/\d{4}\/\d{1,2}\/\d{1,2} \d{2}:\d{2}：3問中3問/);
});

// Q62: the first problem in English runs one sentence at a time; the problem's own words stay Japanese.
test("in English: switch on the intro, then the first problem with taps; the choice stays after a reload", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await page.getByTestId("btn-home-start").click();
  await page.getByTestId("lang-en").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Read problems with AI-kun");
  await expect(page.getByTestId("btn-next")).toHaveText("Start");
  await page.reload();
  // After a reload the app opens on the top page again, in English (Q60).
  await expect(page.getByTestId("btn-home-start")).toHaveText("Start");
  await page.getByTestId("btn-home-start").click();
  await expect(page.getByTestId("btn-next")).toHaveText("Start");
  await page.getByTestId("btn-next").click();
  await page.getByTestId("btn-consent-yes").click();
  // The step's question is English; the holders' names and the thing stay as written in the problem.
  await expect(stepScreen(page)).toHaveAttribute("data-step", "fact");
  await expect(page.getByTestId("steps-question")).toHaveText(/^How many .* does そら have\?$/);
  await expect(page.getByTestId("btn-hard")).toHaveText("I feel bad");
  await typeNumber(page, 8);
  await expect(page.getByTestId("btn-step-unknown")).toHaveText("I don't know");
  await page.getByTestId("btn-step-h_ai").click();
  await expect(page.getByTestId("steps-lead")).toContainText("Does it fit the problem?");
  await expect(page.getByTestId("btn-step-again")).toHaveText("Choose again");
  await page.getByTestId("btn-step-again").click();
  await page.getByTestId("btn-step-h_me").click();
  await typeNumber(page, 2);
  await typeNumber(page, 6);
  await expect(page.getByTestId("btn-next")).toHaveText("Next problem");
  await page.getByTestId("btn-next").click();
  await expect(stepScreen(page)).toHaveAttribute("data-problem-id", "p_festival", { timeout: 15_000 });
  await expect(page.getByTestId("steps-question")).toHaveText(/^How many /);
  await expect(page.locator("main")).not.toContainText(/your rule|wrong|correct|mistake/i);
});

// Run-through, 2026-11-08: with the device in dark mode the page was left transparent, so dark text sat on a
// dark canvas. The page paints its own light background and says it is a light page.
test("in dark mode the page keeps its light background and readable text", async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: "dark" });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByTestId("btn-home-start").click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // The warm off-white of the tokens (ui/tokens.ts COLOR.page), the same in every device mode.
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe(rgbOf(COLOR.page));
  const scheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  expect(scheme).toBe("light");
  await expectNoAxeViolations(page, "intro in dark mode");
  await ctx.close();
});
