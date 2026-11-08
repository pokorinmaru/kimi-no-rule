// A child's wish to AI-kun (Q61). One call to Claude both judges distress (with the app's context: a complaint that
// something is hard, long or boring is not distress) and rephrases the words as one short request about the app,
// adding nothing the child did not say. The device's distress words are a floor Claude cannot lower, a cry for help
// is never made into a request, and the request is used only when core's wishGate lets it through.
import { describe, expect, it } from "vitest";
import { MODELS } from "./client.ts";
import { FakeClaude, fails, json, stopped } from "./fake.ts";
import { WISH_MODEL, WISH_SYSTEM, rephraseWish } from "./wish.ts";

const wish = (request: string) => json({ kind: "wish", request });

describe("rephraseWish", () => {
  it("asks the junior's model (Sonnet) once, with the child's words as the input only", async () => {
    const client = new FakeClaude([wish("問題の画面で、魚の絵が半分なのが分かりにくい")]);
    const out = await rephraseWish("なんで魚が半分なの、きもちわるい", client);
    expect(out).toEqual({ kind: "wish", request: "問題の画面で、魚の絵が半分なのが分かりにくい" });
    expect(client.requests).toHaveLength(1);
    const req = client.requests[0];
    expect(WISH_MODEL).toBe(MODELS.kohai);
    expect(req?.model).toBe(WISH_MODEL);
    expect(req?.system).toBe(WISH_SYSTEM);
    expect(req?.userText).toContain("なんで魚が半分なの");
    expect(req?.cachedContext).not.toContain("なんで魚が半分なの");
  });

  it("never turns a cry for help into a request", async () => {
    const client = new FakeClaude([json({ kind: "distress", request: "授業を短くしてほしい" })]);
    expect(await rephraseWish("じゅぎょうがはやくおわってほしい", client)).toEqual({ kind: "distress" });
  });

  it("the device's distress words win over Claude, and work when Claude cannot be reached", async () => {
    expect(await rephraseWish("たすけて", new FakeClaude([wish("ボタンを大きくしてほしい")]))).toEqual({ kind: "distress" });
    expect(await rephraseWish("つらい", new FakeClaude([fails()]), { timeoutMs: 50 })).toEqual({ kind: "distress" });
  });

  it("is unchecked, with no request, when Claude cannot be reached and no distress word is there", async () => {
    for (const reply of [fails(), stopped("max_tokens"), json({ kind: "maybe", request: "" })]) {
      expect(await rephraseWish("もっとはやくして", new FakeClaude([reply]), { timeoutMs: 50 })).toEqual({ kind: "unchecked" });
    }
  });

  it("is distress when the rephrasing itself holds a distress word", async () => {
    expect(await rephraseWish("ことば", new FakeClaude([wish("授業がつらいので短くしてほしい")]))).toEqual({ kind: "distress" });
  });

  it("is distress when Claude declines to answer", async () => {
    expect(await rephraseWish("ことば", new FakeClaude([stopped("refusal")]))).toEqual({ kind: "distress" });
  });

  it("drops a rephrasing core refuses (a name, a school, a long number) and keeps no request", async () => {
    for (const bad of ["たろうくんが分からないと言っていた", "さくら小学校の宿題に合わせてほしい", "ばんごう 1234567"]) {
      expect(await rephraseWish("ことば", new FakeClaude([wish(bad)])), bad).toEqual({ kind: "no_request" });
    }
  });

  it("keeps no request when the words are not about the app", async () => {
    expect(await rephraseWish("きょうのごはん", new FakeClaude([json({ kind: "not_about_app", request: "" })]))).toEqual({ kind: "no_request" });
  });

  it("tells Claude what is and is not distress here, to add nothing, never to ask for answers, and to drop names", () => {
    expect(WISH_SYSTEM).toMatch(/not distress/i);
    expect(WISH_SYSTEM).toMatch(/do not add anything the child did not say/i);
    expect(WISH_SYSTEM).toMatch(/never ask for answers/i);
    expect(WISH_SYSTEM).toMatch(/where the child got stuck/i);
    expect(WISH_SYSTEM).toMatch(/names/i);
    expect(WISH_SYSTEM).toMatch(/never write how the child read/i);
  });
});
