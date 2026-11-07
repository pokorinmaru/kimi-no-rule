// The adults' try route (指示書 第6.9節, 第11節 M5). An adult plays the same flow a child would (the same machine,
// the same screens, the same calls to the local worker and nothing more), with 「中身を見る」 beside it and a
// simulated child that plays a problem by a chosen reading. The device store has a name of its own, so no child
// record mixes in, and it is emptied every time the route opens: a try keeps nothing for the next visit.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ProblemRecord } from "@kimi/core";
import { App, type SessionHandle } from "../App.tsx";
import { STORED_PROBLEMS, bankFor } from "../flow/bank.ts";
import type { FlowApi } from "../flow/session.ts";
import type { FlowSnapshot } from "../flow/view.ts";
import { openStore } from "../store/store.ts";
import { researchNote } from "./note.ts";
import { TRY_CHILDREN } from "./sim-children.ts";
import { runSim } from "./sim.ts";
import { TryPanel } from "./TryPanel.tsx";

export const TRY_DB_NAME = "kimi-no-rule-try";
/** The toggle that adds the discriminating and transfer problems AI wrote and no person has checked yet (Q33・Q48). Off by default. */
export const UNCHECKED_TOGGLE_LABEL = "AIが作った未確認の問題も使う";

/** The pause between the simulated child's taps, so the adult can watch the flow and the note move. */
export const SIM_DELAY_MS = 500;

const banner: CSSProperties = {
  maxWidth: 1240,
  margin: "0 auto 8px",
  padding: "10px 16px",
  background: "#fff8e1",
  border: "2px solid #f0b429",
  borderRadius: 10,
  fontFamily: "system-ui, sans-serif",
  fontSize: 15,
  lineHeight: 1.6,
  color: "#1f2933",
};

export function TryApp({
  api,
  simDelayMs = SIM_DELAY_MS,
  stored = STORED_PROBLEMS,
}: {
  api?: FlowApi | null;
  simDelayMs?: number;
  /** The stored discriminating and transfer problems (content/problems/discriminating, content/problems/transfer); tests pass their own. */
  stored?: readonly ProblemRecord[];
}) {
  const [ready, setReady] = useState(false);
  const [handle, setHandle] = useState<SessionHandle | null>(null);
  const [snap, setSnap] = useState<FlowSnapshot | null>(null);
  const [gateKinds, setGateKinds] = useState<string[]>([]);
  const [childId, setChildId] = useState<string>(TRY_CHILDREN[0]?.id ?? "");
  const [running, setRunning] = useState(false);
  const [useUnchecked, setUseUnchecked] = useState(false);
  const bank = useMemo(() => bankFor({ includeUnchecked: useUnchecked, stored }), [useUnchecked, stored]);
  const uncheckedIds = useMemo(() => new Set(stored.filter((r) => !r.checks.human_checked).map((r) => r.world.problem_id)), [stored]);
  const abort = useRef<AbortController | null>(null);

  // Whatever an earlier try left on this device is removed before the flow starts.
  useEffect(() => {
    let live = true;
    void (async () => {
      const st = openStore(TRY_DB_NAME);
      try {
        await st.deleteAll();
      } finally {
        await st.close();
      }
      if (live) setReady(true);
    })();
    return () => {
      live = false;
      abort.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (handle === null) {
      setSnap(null);
      return;
    }
    setSnap(handle.session.actor.getSnapshot());
    const sub = handle.session.actor.subscribe((x) => setSnap(x));
    return () => sub.unsubscribe();
  }, [handle]);

  // The gate's rejections are on the try store (kinds only); read again whenever the flow moves.
  useEffect(() => {
    if (handle === null) return;
    let live = true;
    void handle.store
      .listGateLog()
      .then((rows) => {
        if (live) setGateKinds(rows.flatMap((r) => r.kinds));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [handle, snap]);

  const note = useMemo(() => (snap === null ? null : researchNote(snap.context, gateKinds)), [snap, gateKinds]);
  const onProblem = snap !== null && snap.status === "active" && snap.matches({ active: "problem" });
  const child = TRY_CHILDREN.find((c) => c.id === childId);

  const play = (): void => {
    if (handle === null || child === undefined || running) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setRunning(true);
    void runSim(handle.session, child, simDelayMs, ctrl.signal).finally(() => {
      if (abort.current === ctrl) setRunning(false);
    });
  };

  const apiProp = api === undefined ? {} : { api };
  return (
    <div style={{ background: "#f5f7fa", minHeight: "100vh", padding: "8px 8px 24px" }}>
      <section aria-label="大人向けの試用" data-testid="try-banner" style={banner}>
        <h2 style={{ fontSize: 18, margin: "0 0 4px" }}>大人向けの試用ルート（子どもの利用は想定していません）</h2>
        <p style={{ margin: 0 }}>
          子どもと同じ画面と流れを、大人が自分の手で通せます。右の「中身を見る」に、読み方の研究（仮説・重み・問題を選んだ理由）が出ます。
          この試用の記録は子どもの記録と別の場所に置き、このページを開くたびに消します。サーバーに送るものは子どもの流れと同じです。
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
          <label htmlFor="sim-child">模擬の子ども：</label>
          <select id="sim-child" data-testid="sim-child" value={childId} onChange={(e) => setChildId(e.target.value)} disabled={running} style={{ fontSize: 15, minHeight: 36 }}>
            {TRY_CHILDREN.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-testid="btn-sim-play"
            onClick={play}
            disabled={!onProblem || running}
            style={{ minHeight: 40, padding: "6px 14px", fontSize: 15, borderRadius: 8, border: "2px solid #52606d", background: "#fff", cursor: "pointer" }}
          >
            {running ? "模擬の子どもが解いています…" : "模擬の子どもがこの問題を解く"}
          </button>
        </div>
        <div
          data-testid="try-bank"
          data-ids={bank.map((r) => r.world.problem_id).join(" ")}
          style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}
        >
          <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              data-testid="toggle-unchecked"
              checked={useUnchecked}
              disabled={running}
              onChange={(e) => {
                abort.current?.abort();
                setUseUnchecked(e.target.checked);
              }}
              style={{ width: 20, height: 20 }}
            />
            {UNCHECKED_TOGGLE_LABEL}
          </label>
          <span style={{ fontSize: 13, color: "#52606d" }}>
            問題 {String(bank.length)} 問（うち未確認 {String(bank.filter((r) => uncheckedIds.has(r.world.problem_id)).length)} 問／保存されている未確認 {String(uncheckedIds.size)} 問）。切り替えると流れを最初から始めます。子どもの画面では、人が確認した問題だけを使います。
          </span>
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#52606d" }}>
          模擬の子どもは、その読み方どおりに予測し「1」の札を置きます（毎回同じ）。札で世界が合った時は、数は大人が入れます。同意の画面は大人が進めてください。
        </p>
      </section>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start", justifyContent: "center", maxWidth: 1240, margin: "0 auto" }}>
        <div style={{ flex: "1 1 520px", minWidth: 0, background: "#fff", borderRadius: 10 }}>{ready && <App key={useUnchecked ? "with-unchecked" : "checked-only"} storeName={TRY_DB_NAME} onSession={setHandle} bank={bank} {...apiProp} />}</div>
        <div style={{ flex: "1 1 360px", minWidth: 0, maxWidth: 520 }}>
          <TryPanel note={note} />
        </div>
      </div>
    </div>
  );
}
