// @vitest-environment jsdom
// Automatic accessibility check of the drawing (指示書 第8.4b節): axe-core finds no violation.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import type { StatementCheck } from "@kimi/core";
import { signboard } from "../../../../packages/core/fixtures/problems/signboard.ts";
import { signboardRecord } from "../../../../packages/core/fixtures/problems/signboard-record.ts";
import { WorldView } from "./WorldView.tsx";
import { SentenceList } from "./SentenceList.tsx";
import { AiBadge } from "./AiBadge.tsx";

afterEach(cleanup);

async function violations(el: Element): Promise<string[]> {
  const res = await axe.run(el, { resultTypes: ["violations"] });
  // The check ran real rules on real nodes, not on an empty tree.
  expect(res.passes.length).toBeGreaterThan(0);
  return res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
}

const checks: StatementCheck[] = [
  { index: 0, verdict: "holds", cues: [] },
  { index: 1, verdict: "fails", cues: [] },
  { index: 2, verdict: "undetermined", cues: [] },
];

describe("axe-core (指示書 第8.4b節)", () => {
  it("finds no violation in WorldView, with and without a placeable card", async () => {
    const a = render(
      <main>
        <WorldView world={signboard.correct} cardHolder={null} onPlaceCard={() => undefined} reducedMotion />
      </main>,
    );
    expect(await violations(a.container)).toEqual([]);
    a.unmount();
    const b = render(
      <main>
        <WorldView world={signboard.procedural} glowIds={["q_otouto"]} failingSentences={["これは、弟の金魚の数の3/4です。"]} reducedMotion />
      </main>,
    );
    expect(await violations(b.container)).toEqual([]);
  });

  it("finds no violation in SentenceList and AiBadge", async () => {
    const { container } = render(
      <main>
        <AiBadge />
        <SentenceList statements={signboardRecord.statements} checks={checks} onTapWord={() => undefined} reducedMotion />
      </main>,
    );
    expect(await violations(container)).toEqual([]);
  });
});
