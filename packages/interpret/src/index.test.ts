import { expect, it } from "vitest";
import { PACKAGE } from "./index.ts";

it("@kimi/interpret scaffold exports its package name", () => {
  expect(PACKAGE).toBe("@kimi/interpret");
});
