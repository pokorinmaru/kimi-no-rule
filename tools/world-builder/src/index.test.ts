import { expect, it } from "vitest";
import { PACKAGE } from "./index.ts";

it("@kimi/world-builder scaffold exports its package name", () => {
  expect(PACKAGE).toBe("@kimi/world-builder");
});
