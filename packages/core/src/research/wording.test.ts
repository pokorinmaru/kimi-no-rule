// The wording of a transfer problem (指示書 第6.7節 手順6): whether a new text keeps the relation words of the
// problem the child fixed ("same") or uses another of the known phrasings instead ("different"). Decided by
// the program only. Written before the implementation.
import { describe, expect, it } from "vitest";
import { TRANSFER_CUES, wordingCues, wordingTag } from "./wording.ts";

describe("wordingCues", () => {
  it("finds each known phrasing, ignoring spaces and the width of the digit 1", () => {
    expect(wordingCues("姉のシールに対して、妹のシールは3/5です。")).toEqual(["ni_taishite"]);
    expect(wordingCues("姉のシールを1とみると、妹のシールは3/5です。")).toEqual(["wo_ichi_to_miru"]);
    expect(wordingCues("姉のシールを１と見ると、妹のシールは3/5です。")).toEqual(["wo_ichi_to_miru"]);
    expect(wordingCues("姉のシールをもとにすると、妹のシールは3/5です。")).toEqual(["wo_moto_ni_suru"]);
    expect(wordingCues("姉のシール を もとに すると 3/5")).toEqual(["wo_moto_ni_suru"]);
    expect(wordingCues("姉のシールに対する妹のシールの割合は3/5です。")).toEqual(["no_wariai_wa"]);
  });

  it("gives no cue for the plain の and lists several in the order of TRANSFER_CUES", () => {
    expect(wordingCues("妹のシールは、姉のシールの3/5です。")).toEqual([]);
    expect(wordingCues("Aに対して、Bをもとにすると")).toEqual(["ni_taishite", "wo_moto_ni_suru"]);
    expect(TRANSFER_CUES.map((c) => c.id)).toEqual(["ni_taishite", "wo_ichi_to_miru", "wo_moto_ni_suru", "no_wariai_wa"]);
  });
});

describe("wordingTag", () => {
  const plain = "妹のシールは、姉のシールの3/5です。姉のシールは20まいです。";
  const moto = "姉のリボンをもとにすると、妹のリボンは3/4です。";

  it("same: the same set of cues (the plain の on both sides counts)", () => {
    expect(wordingTag(plain, "弟のえんぴつは、兄のえんぴつの2/3です。")).toBe("same");
    expect(wordingTag(moto, "大きい箱をもとにすると、小さい箱は2/5です。")).toBe("same");
  });

  it("different: at least one known phrasing, none of them in the fixed text", () => {
    expect(wordingTag(plain, "兄のえんぴつに対して、弟のえんぴつは2/3です。")).toBe("different");
    expect(wordingTag(moto, "大きい箱を1とみると、小さい箱は2/5です。")).toBe("different");
  });

  it("neither: a plain text against a cued one, or a cue shared with the fixed text plus another", () => {
    expect(wordingTag(moto, "弟のえんぴつは、兄のえんぴつの2/3です。")).toBe("neither");
    expect(wordingTag(moto, "兄のえんぴつに対して、つまり兄をもとにすると、2/3です。")).toBe("neither");
  });
});
