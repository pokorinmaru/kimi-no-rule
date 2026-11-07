// The screens (指示書 第7.1節, HANDOFF §3 F1・F8・F9). Each screen draws only viewOf(snapshot); every number
// and world comes from core through the flow, and every tap goes back to the flow as an event.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { gate, type Rational, type StatementCheck } from "@kimi/core";
import { AiBadge } from "./draw/AiBadge.tsx";
import { SentenceList } from "./draw/SentenceList.tsx";
import { WorldView } from "./draw/WorldView.tsx";
import { startSession, type Session } from "./flow/session.ts";
import { viewOf, type FlowView, type ProblemView } from "./flow/view.ts";
import { openStore, type CheckRow, type FlowStore } from "./store/store.ts";
import { CheckMode } from "./check/CheckMode.tsx";
import { scoreOf } from "./check/check.ts";
import { CHECK_TEXT } from "./check/text.ts";
import { AlwaysNav, Button, HoldButton, NumberPad } from "./ui/controls.tsx";

/** The heading the child sees. The work's name (君のルールで世界を作る) is not shown to the child: it would
 * attribute the reading to the child (原則10, 指示書 第11節 M7). */
export const APP_TITLE = "後輩と問題を読もう";

const page: CSSProperties = { maxWidth: 760, margin: "0 auto", padding: "16px", fontFamily: "system-ui, sans-serif", fontSize: 20, lineHeight: 1.6, color: "#1f2933" };
/** The three buttons every screen keeps (原則7): stop, don't know, it's hard. */
function Always({ view, send }: { view: FlowView; send: Session["send"] }) {
  return (
    <AlwaysNav
      buttons={view.buttons}
      highlight={view.highlightButtons}
      onStop={() => send({ type: "STOP" })}
      // The math has stopped on these screens: "don't know" would do nothing there (Q30).
      {...(view.screen !== "hard" && view.screen !== "rest" ? { onDontKnow: () => send({ type: "DONT_KNOW" }) } : {})}
      onHard={() => send({ type: "HARD" })}
    />
  );
}

function Lines({ lines }: { lines: readonly string[] }) {
  return (
    <>
      {lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
    </>
  );
}

function ProblemScreen({ view, send }: { view: ProblemView; send: Session["send"] }) {
  const checks: StatementCheck[] = view.statements.map((s) => ({ index: s.index, verdict: s.lit ? "fails" : "holds", cues: [] }) as StatementCheck);
  const rel = view.world.relations.find((r) => r.id === view.relationId);
  const ends = rel === undefined ? [] : [rel.subject, rel.reference].filter((x): x is string => x !== null);
  const holderOf = (q: string) => view.world.quantities.find((x) => x.id === q)?.holder;
  const placeOn = (holderId: string) => {
    const q = ends.find((e) => holderOf(e) === holderId);
    // The card covers a whole tape only; core's gate decides (指示書 第5.5節).
    if (q !== undefined && gate({ kind: "place_card", covers: "whole_tape" }, view.gate).ok) send({ type: "PLACE_ONE", quantityId: q });
  };
  const cardHolder = view.placement !== null ? holderOf(view.placement) ?? null : view.one !== null ? holderOf(view.one) ?? null : null;
  const answered: Record<string, Rational> = {};
  if (view.totalValue !== null) answered[view.world.question.target_id] = view.totalValue;
  const childNumbers = [view.unitValue, view.totalValue].filter((x): x is Rational => x !== null);
  const failing = view.statements.filter((s) => s.lit).map((s) => s.text);

  return (
    <section aria-label="問題">
      {view.card !== null && (
        <p data-testid="reading-card" style={{ display: "inline-block", padding: "6px 14px", border: "2px dashed #9aa5b1", borderRadius: 10, background: "#f5f7fa" }}>
          {view.card}
        </p>
      )}
      <SentenceList
        statements={view.statements}
        checks={view.step === "reading" ? null : checks}
        {...(view.canPlace ? { onTapWord: (i: number, t: number) => send({ type: "TAP_WORD", statementIndex: i, token: t }) } : {})}
        label="問題の文"
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
        <AiBadge />
        <p data-testid="junior-line" aria-live="polite" style={{ margin: 0 }}>
          {view.line ?? "…"}
        </p>
      </div>
      <WorldView
        world={view.world}
        cardHolder={cardHolder}
        childNumbers={childNumbers}
        unitValue={view.unitValue}
        answered={answered}
        glowIds={view.glowIds}
        failingSentences={view.step === "reading" ? [] : failing}
        label="後輩が作った世界"
        {...(view.canPlace ? { onPlaceCard: placeOn } : {})}
      />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        {view.step === "reading" && (
          <Button kind="primary" onClick={() => send({ type: "NEXT" })} testId="btn-next">
            つぎへ
          </Button>
        )}
        {view.step === "looking" && <p>「1」の札を、1とみる人のテープに動かして、後輩に教えてね。</p>}
        {view.step === "placed" && (
          <>
            <Button kind="primary" onClick={() => send({ type: "CONFIRM_YES" })} testId="btn-confirm-yes">
              うん、そう
            </Button>
            <Button onClick={() => send({ type: "CONFIRM_NO" })} testId="btn-confirm-no">
              ちがう
            </Button>
          </>
        )}
        {view.step === "rebuilt" && (
          <Button kind="primary" onClick={() => send({ type: "NEXT" })} testId="btn-next">
            つぎへ
          </Button>
        )}
        {(view.step === "solved" || view.step === "held") && (
          <Button kind="primary" onClick={() => send({ type: "NEXT" })} testId="btn-next">
            つぎの問題へ
          </Button>
        )}
      </div>
      {view.step === "unit" && <NumberPad label="1区切りは、いくつ？" onAnswer={(v) => send({ type: "ANSWER_UNIT", value: v })} />}
      {view.step === "total" && <NumberPad label="聞かれている数は、いくつ？" onAnswer={(v) => send({ type: "ANSWER_TOTAL", value: v })} />}
    </section>
  );
}

/** The date and time of a check, for the grown-up (this device's clock). */
export function checkDate(at: string): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(d.getFullYear())}/${String(d.getMonth() + 1)}/${String(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The AI-free checks (指示書 第7.3節・第7.4節): per check, how many of the problems given were answered right. */
function CheckResults({ rows }: { rows: readonly CheckRow[] }) {
  return (
    <div data-testid="check-results">
      <h3 style={{ fontSize: 20 }}>AIなしで ためした記録</h3>
      {rows.length === 0 ? (
        <p>まだありません。</p>
      ) : (
        <ul>
          {rows.map((r) => {
            const { right, total } = scoreOf(r.items);
            return (
              <li key={r.id ?? r.at}>
                {checkDate(r.at)}：{total}問中{right}問 正しく答えました
              </li>
            );
          })}
        </ul>
      )}
      <p style={{ fontSize: 16 }}>後輩も図もなしで、問題の文と数の入力だけで解いた結果です。答えはプログラムが確かめています。「わからない」でとばした問題は、正しく答えた数に入りません。</p>
    </div>
  );
}

/** The grown-up's screen (F9): consent, the AI-free checks and deleting every record on this device. */
function ParentScreen({ store, onDelete, onClose }: { store: FlowStore; onDelete: () => Promise<void>; onClose: () => void }) {
  const [asked, setAsked] = useState(false);
  const [done, setDone] = useState(false);
  const [checks, setChecks] = useState<CheckRow[]>([]);
  useEffect(() => {
    let live = true;
    void store.listChecks().then((rows) => {
      if (live) setChecks(rows);
    });
    return () => {
      live = false;
    };
  }, [store, done]);
  return (
    <section aria-label="おうちの人へ">
      <h2>おうちの人へ</h2>
      <p>このアプリの記録は、この端末の中にだけ保存されます。子どもの言葉の本文は保存しません。</p>
      <p>後輩は AI（Anthropic の Claude）で、人ではありません。2問目からは、1問目の子どもの「1」の札の置き方から作った読み方や、よくある読み違いで問題を読みます。後輩は答えを知らされていません。</p>
      <CheckResults rows={checks} />
      {!asked && <Button onClick={() => setAsked(true)}>記録をすべて消す</Button>}
      {asked && !done && (
        <>
          <p>この端末の記録と同意を、すべて消します。元には戻せません。</p>
          <Button
            kind="primary"
            testId="btn-delete-all"
            onClick={() => {
              void onDelete().then(() => setDone(true));
            }}
          >
            消す
          </Button>
          <Button onClick={() => setAsked(false)}>やめておく</Button>
        </>
      )}
      {done && <p data-testid="deleted">消しました。</p>}
      <p>
        <Button onClick={onClose}>もどる</Button>
      </p>
    </section>
  );
}

function Screen({ view, send }: { view: FlowView; send: Session["send"] }) {
  switch (view.screen) {
    case "intro":
      return (
        <section aria-label="はじめに">
          <Lines lines={view.lines} />
          <Button kind="primary" onClick={() => send({ type: "NEXT" })} testId="btn-next">
            はじめる
          </Button>
        </section>
      );
    case "consent":
      return (
        <section aria-label="おうちの人の同意">
          <Lines lines={view.lines} />
          <Button kind="primary" onClick={() => send({ type: "CONSENT_YES" })} testId="btn-consent-yes">
            同意する
          </Button>{" "}
          <Button onClick={() => send({ type: "CONSENT_NO" })}>同意しない</Button>
        </section>
      );
    case "problem":
      return <ProblemScreen view={view} send={send} />;
    case "research":
    case "finished":
      return (
        <section aria-label={view.screen === "research" ? "じゅんび" : "おわり"}>
          <Lines lines={view.lines} />
          {view.screen === "finished" && (
            <Button kind="primary" onClick={() => send({ type: "NEXT" })} testId="btn-next">
              おわる
            </Button>
          )}
        </section>
      );
    case "stuck":
      return (
        <section aria-label="まっています">
          <Lines lines={view.lines} />
          <Button kind="primary" onClick={() => send({ type: "RESUME" })} testId="btn-resume">
            {view.resume}
          </Button>{" "}
          {view.hold !== null && <Button onClick={() => send({ type: "HOLD" })}>{view.hold}</Button>}
        </section>
      );
    case "hard":
    case "rest":
      return (
        <section aria-label={view.screen === "hard" ? "つらいとき" : "ひとやすみ"} data-testid={`screen-${view.screen}`}>
          <Lines lines={view.lines} />
          <h2 style={{ fontSize: 20 }}>{view.helpline.title}</h2>
          <p>{view.helpline.pending}</p>
          <Button onClick={() => send({ type: "CLOSE" })}>とじる</Button>
        </section>
      );
    case "ended":
      return (
        <section aria-label="おわり" data-testid="screen-ended">
          <p>おつかれさまでした。</p>
        </section>
      );
  }
}

/** How long the grown-up holds 「おうちの人へ」 to open the parent screen (Q31). */
export const PARENT_HOLD_MS = 2000;

export function App({
  storeName = "kimi-no-rule",
  api,
  parentHoldMs = PARENT_HOLD_MS,
}: {
  storeName?: string;
  api?: Parameters<typeof startSession>[0]["api"];
  parentHoldMs?: number;
}) {
  const [store, setStore] = useState<FlowStore | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<FlowView | null>(null);
  const [parent, setParent] = useState(false);
  const [restart, setRestart] = useState(0);
  const [check, setCheck] = useState(false);

  useEffect(() => {
    let live = true;
    let s: Session | null = null;
    void (async () => {
      const st = await openStore(storeName);
      const started = await startSession({ store: st, ...(api === undefined ? {} : { api }) });
      if (!live) {
        started.stop();
        return;
      }
      s = started;
      setStore(st);
      setSession(started);
      setView(viewOf(started.actor.getSnapshot()));
      started.actor.subscribe((snap) => setView(viewOf(snap)));
    })();
    return () => {
      live = false;
      s?.stop();
    };
  }, [storeName, api, restart]);

  const send = useMemo<Session["send"]>(() => (e) => session?.send(e), [session]);

  return (
    <main style={page}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>{APP_TITLE}</h1>
        <AiBadge />
      </header>
      {view === null && <p>じゅんびしています…</p>}
      {view !== null && store !== null && parent && (
        <ParentScreen
          store={store}
          onClose={() => setParent(false)}
          onDelete={async () => {
            // Stop the session and let its last writes land first, so nothing is written back after the delete.
            session?.stop();
            await session?.settle();
            await store.deleteAll();
            setRestart((n) => n + 1);
          }}
        />
      )}
      {view !== null && store !== null && check && !parent && (
        <CheckMode
          store={store}
          lang="ja"
          onExit={() => setCheck(false)}
          // The session's hard screen is reachable while it is still running (not on the ended screen).
          {...(view.screen !== "ended"
            ? {
                onSessionHard: () => {
                  setCheck(false);
                  send({ type: "HARD" });
                },
              }
            : {})}
        />
      )}
      {view !== null && !parent && !check && <Screen view={view} send={send} />}
      {view !== null && !check && view.screen !== "ended" && <Always view={view} send={send} />}
      {!parent && !check && (view?.screen === "intro" || view?.screen === "consent" || view?.screen === "ended") && (
        <p style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
          {(view.screen === "intro" || view.screen === "ended") && (
            <Button onClick={() => setCheck(true)} testId="btn-check">
              {CHECK_TEXT.entry}
            </Button>
          )}
          <HoldButton onHold={() => setParent(true)} holdMs={parentHoldMs} testId="btn-parent">
            おうちの人へ（2びょう おしつづける）
          </HoldButton>
        </p>
      )}
    </main>
  );
}
