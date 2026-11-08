// Where the child stopped, on the grown-up's screen (Q62): for each problem done one sentence at a time, each step
// and how it went. From the device's records only; no words of the child are kept or shown.
import { useEffect, useState } from "react";
import { PREPARED_BANK, type Lang } from "@kimi/core";
import type { AttemptRow, FlowStore } from "../store/store.ts";
import { parentCard } from "../parent/ParentNote.tsx";
import { COLOR, SPACE, TYPE, prose } from "../ui/tokens.ts";

const JA = {
  title: "どこで止まったか（1文ずつの記録）",
  note: "問題を1文ずつ進めたときの、段ごとの記録です。この端末の中の記録だけから作っています。",
  none: "まだありません。",
  kind: { fact: "1つめの文の数を読む", relation: "だれとくらべるか", unit: "1つ分を出す", total: "こたえを出す" },
  outcome: { ok: "すぐにできた", helped: "ヒントや小さな段を見て、できた", stopped: "ここで止まった" },
  rechose: "はじめは ちがう人を選び、その読み方の世界を見て、選び直した",
  unknown: "「わからない」を押して、ヒントを見た",
  row: (date: string, n: number) => `${date} ${String(n)}問目`,
};
const EN = {
  title: "Where the child stopped (one sentence at a time)",
  note: "Each step of the problems done one sentence at a time, from the records on this device only.",
  none: "None yet.",
  kind: { fact: "Reading the number in the first sentence", relation: "Who is compared with whom", unit: "Finding one part", total: "Finding the answer" },
  outcome: { ok: "right away", helped: "after a hint or a smaller step", stopped: "stopped here" },
  rechose: "first chose the other person, saw that reading's world, and chose again",
  unknown: 'pressed "I don\'t know" and saw a hint',
  row: (date: string, n: number) => `${date}  problem ${String(n)}`,
};

export function StepsNote({ store, lang, reload }: { store: FlowStore; lang: Lang; reload: unknown }) {
  const t = lang === "en" ? EN : JA;
  const [rows, setRows] = useState<AttemptRow[]>([]);
  useEffect(() => {
    let live = true;
    void store.listAttempts().then((a) => {
      if (live) setRows(a.filter((r) => r.steps !== undefined && r.steps.length > 0));
    });
    return () => {
      live = false;
    };
  }, [store, reload]);
  const referenceOf = (problemId: string): string | undefined => {
    const w = PREPARED_BANK.find((r) => r.world.problem_id === problemId)?.world;
    const ref = w?.relations[0]?.reference;
    return w?.quantities.find((q) => q.id === ref)?.holder;
  };
  return (
    <div data-testid="steps-note" style={parentCard}>
      <h3 style={{ fontSize: TYPE.large, margin: `0 0 ${String(SPACE.sm)}px` }}>{t.title}</h3>
      <p style={{ ...prose, fontSize: TYPE.small, margin: `0 0 ${String(SPACE.sm)}px` }}>{t.note}</p>
      {rows.length === 0 && <p style={{ ...prose, color: COLOR.inkSoft }}>{t.none}</p>}
      {rows.map((r, i) => (
        <div key={r.id ?? i} data-testid="steps-row" style={{ marginTop: SPACE.md }}>
          <p style={{ ...prose, fontWeight: 700, margin: 0 }}>{t.row(r.at.slice(0, 10), i + 1)}</p>
          <ul style={{ margin: `${String(SPACE.xs)}px 0 0`, paddingLeft: "1.4em" }}>
            {(r.steps ?? []).map((e, k) => {
              const ref = referenceOf(r.problemId);
              const extra =
                e.kind === "relation" && e.choices !== undefined
                  ? [e.choices.includes("unknown") ? t.unknown : null, e.choices.some((c) => c !== "unknown" && c !== ref) ? t.rechose : null].filter((x): x is string => x !== null)
                  : [];
              return (
                <li key={k} data-outcome={e.outcome} style={{ ...prose, margin: 0, color: e.outcome === "stopped" ? COLOR.danger : COLOR.ink }}>
                  {t.kind[e.kind]}：{t.outcome[e.outcome]}
                  {extra.length > 0 ? `（${extra.join("。")}）` : ""}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
