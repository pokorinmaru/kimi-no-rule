// The child's wishes to AI-kun on the device (Q61): the words the child wrote, kept here only so the parent can
// read them; the rephrased request (or none); whether the parent sent it. All of it goes with deleteAll.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { openStore, type FlowStore } from "./store.ts";

const stores: FlowStore[] = [];
let n = 0;
function fresh(): FlowStore {
  const s = openStore(`kimi-wish-test-${String(++n)}`);
  stores.push(s);
  return s;
}
afterEach(async () => {
  await Promise.all(stores.splice(0).map((s) => s.close()));
});

describe("wishes", () => {
  it("keeps each wish with its request, newest first, unsent until the parent sends it", async () => {
    const s = fresh();
    expect(await s.listWishes()).toEqual([]);
    await s.addWish({ original: "なんで魚が半分なの", request: "魚の絵が半分なのが分かりにくい" });
    await s.addWish({ original: "もっとはやくして", request: null });
    const rows = await s.listWishes();
    expect(rows.map((r) => r.original)).toEqual(["もっとはやくして", "なんで魚が半分なの"]);
    expect(rows.map((r) => r.request)).toEqual([null, "魚の絵が半分なのが分かりにくい"]);
    expect(rows.every((r) => r.sent === false && typeof r.at === "string")).toBe(true);
    await s.markWishSent(rows[1]?.id as number);
    expect((await s.listWishes())[1]?.sent).toBe(true);
  });

  it("keeps only the mark and the date of a heavy wish: no words, and never a request to send", async () => {
    const s = fresh();
    await s.addWish({ original: "zz-heavy-words", request: "ignored", distress: true });
    const [row] = await s.listWishes();
    expect(row?.distress).toBe(true);
    expect(row?.request).toBeNull();
    expect(row?.original).toBe("");
  });

  it("removes one wish, and deleteAll removes every wish", async () => {
    const s = fresh();
    await s.addWish({ original: "a", request: null });
    await s.addWish({ original: "b", request: null });
    const [first] = await s.listWishes();
    await s.deleteWish(first?.id as number);
    expect((await s.listWishes()).map((r) => r.original)).toEqual(["a"]);
    await s.deleteAll();
    expect(await s.listWishes()).toEqual([]);
  });

  it("keeps at most 200 characters of the child's words", async () => {
    const s = fresh();
    await s.addWish({ original: "あ".repeat(500), request: null });
    expect((await s.listWishes())[0]?.original).toHaveLength(200);
  });
});
