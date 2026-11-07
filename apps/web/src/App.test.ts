import { expect, it } from "vitest";
import { APP_TITLE } from "./App.tsx";

it("@kimi/web scaffold exposes the app title", () => {
  expect(APP_TITLE).toBe("後輩と問題を読もう");
});
