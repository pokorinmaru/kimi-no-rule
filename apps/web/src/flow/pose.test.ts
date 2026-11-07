// The junior character's pose (spec.ts CHARACTER_PARTS): what the junior is doing, decided from the flow state, never
// from its words, and never a feeling.
import { describe, expect, it } from "vitest";
import { KOHAI_POSES, kohaiPose } from "./pose.ts";

describe("kohaiPose", () => {
  it("reads while it shows its reading: the reading and looking steps, and its read lines", () => {
    expect(kohaiPose({ screen: "problem", step: "reading", intent: null, listening: false })).toBe("read");
    expect(kohaiPose({ screen: "problem", step: "looking", intent: null, listening: false })).toBe("read");
    expect(kohaiPose({ screen: "problem", step: "placed", intent: "read", listening: false })).toBe("read");
  });

  it("looks while the child checks sentences or fixes: which, placed, rebuilt", () => {
    expect(kohaiPose({ screen: "problem", step: "looking", intent: "which", listening: false })).toBe("look");
    expect(kohaiPose({ screen: "problem", step: "placed", intent: null, listening: false })).toBe("look");
    expect(kohaiPose({ screen: "problem", step: "rebuilt", intent: null, listening: false })).toBe("look");
    expect(kohaiPose({ screen: "help", step: null, intent: null, listening: false })).toBe("look");
  });

  it("listens while it restates or the child is talking", () => {
    expect(kohaiPose({ screen: "problem", step: "placed", intent: "restate", listening: false })).toBe("listen");
    expect(kohaiPose({ screen: "problem", step: "looking", intent: "which", listening: true })).toBe("listen");
  });

  it("the word book and the rule card show the junior reading", () => {
    expect(kohaiPose({ screen: "wordbook", step: null, intent: null, listening: false })).toBe("read");
    expect(kohaiPose({ screen: "card", step: null, intent: null, listening: false })).toBe("read");
  });

  it("has only the three poses of the contract, none a feeling", () => {
    expect([...KOHAI_POSES]).toEqual(["read", "look", "listen"]);
  });
});
