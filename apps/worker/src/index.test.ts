import { expect, it } from "vitest";
import { PACKAGE } from "./index.ts";

it("@kimi/worker scaffold exports its package name", () => {
  expect(PACKAGE).toBe("@kimi/worker");
});
