import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { PACKAGE } from "./index.ts";

describe("@kimi/core scaffold", () => {
  it("exports its package name", () => {
    expect(PACKAGE).toBe("@kimi/core");
  });

  it("runs fast-check property tests", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => a + b === b + a),
    );
  });
});
