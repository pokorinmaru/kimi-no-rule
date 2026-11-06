// The screens (指示書 第7.1節, HANDOFF §3 F1・F8・F9). Each screen draws only viewOf(snapshot); every number
// and world comes from core through the flow, and every tap goes back to the flow as an event.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { Rational, StatementCheck } from "@kimi/core";
import { AiBadge } from "./draw/AiBadge.tsx";
import { SentenceList } from "./draw/SentenceList.tsx";
import { WorldView } from "./draw/WorldView.tsx";
import { startSession, type Session } from "./flow/session.ts";
import { viewOf, type FlowView, type ProblemView } from "./flow/view.ts";
import { openStore, type FlowStore } from "./store/store.ts";

export const APP_TITLE = "君のルールで世界を作る";

const page: CSSProperties = { maxWidth: 760, margin: "0 auto", padding: "16px", fontFamily: "system-ui, sans-serif", fontSize: 20, lineHeight: 1.6, color: "#1f2933" };
const big: CSSProperties = { minHeight: 48, minWidth: 48, padding: "8px 18px", fontSize: 20, borderRadius: 12, border: "2px solid #52606d", background: "#fff", cursor: "pointer" };
const primary: CSSProperties = { ...big, background: "#1f6feb", color: "#fff", borderColor: "#1f6feb" };

function Button(props: { onClick: () => void; children: ReactNode; kind?: "primary"; highlight?: boolean; testId?: string }) {
  const style = { ...(props.kind === "primary" ? primary : big), ...(props.highlight === true ? { outline: "4px solid #f5a623", outlineOffset: 2 } : {}) };
  return (
    <button type="button" style={style} onClick={props.onClick} data-testid={props.testId}>
      {props.children}
    </button>
  );
}

/** The three buttons every screen keeps (原則7): stop, don't know, it's hard. */
function Always({ view, send }: { view: FlowView; send: Session["send"] }) {
  return (
    <nav aria-label="いつでも使えるボタン" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24, borderTop: "1px solid #cbd2d9", paddingTop: 12 }}>
      <Button onClick={() => send({ type: "STOP" })} highlight={view.highlightButtons} testId="btn-stop">
        {view.buttons.stop}
      </Button>
      <Button onClick={() => send({ type: "DONT_KNOW" })} highlight={view.highlightButtons} testId="btn-dont-know">
        {view.buttons.dontKnow}
      </Button>
      <Button onClick={() => send({ type: "HARD" })} highlight={view.highlightButtons} testId="btn-hard">
        {view.buttons.hard}
      </Button>
    </nav>
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

/** A number pad for the child's answer: digits only (the bank's answers are whole numbers). */
function NumberPad({ label, onAnswer }: { label: string; onAnswer: (v: Rational) => void }) {
  const [digits, setDigits] = useState("");
  return (
    <div role="group" aria-label={label} style={{ marginTop: 12 }}>
      <p>
        {label}
        <output aria-live="polite" data-testid="pad-value" style={{ display: "inline-block", minWidth: 64, marginLeft: 12, padding: "2px 12px", border: "2px solid #52606d", borderRadius: 8, textAlign: "center" }}>
          {digits === "" ? "？" : digits}
        </output>
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((d) => (
          <Button key={d} onClick={() => setDigits((x) => (x.length < 3 ? x + d : x))} testId={`pad-${d}`}>
            {d}
          </Button>
        ))}
        <Button onClick={() => setDigits("")}>けす</Button>
        <Button
          kind="primary"
          testId="pad-ok"
          onClick={() => {
            if (digits === "") return;
            onAnswer({ num: Number(digits), den: 1 });
            setDigits("");
          }}
        >
          これでいい
        </Button>
      </div>
    </div>
  );
}

function ProblemScreen({ view, send }: { view: ProblemView; send: Session["send"] }) {
  const checks: StatementCheck[] = view.statements.map((s) => ({ index: s.index, verdict: s.lit ? "fails" : "holds", cues: [] }) as StatementCheck);
  const rel = view.world.relations.find((r) => r.id === view.relationId);
  const ends = rel === undefined ? [] : [rel.subject, rel.reference].filter((x): x is string => x !== null);
  const holderOf = (q: string) => view.world.quantities.find((x) => x.id === q)?.holder;
  const placeOn = (holderId: string) => {
    const q = ends.find((e) => holderOf(e) === holderId);
    if (q !== undefined) send({ type: "PLACE_ONE", quantityId: q });
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
        answered={answered}
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

/** The grown-up's screen (F9): consent and deleting every record on this device. */
function ParentScreen({ store, onClose }: { store: FlowStore; onClose: () => void }) {
  const [asked, setAsked] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <section aria-label="おうちの人へ">
      <h2>おうちの人へ</h2>
      <p>このアプリの記録は、この端末の中にだけ保存されます。子どもの言葉の本文は保存しません。</p>
      {!asked && <Button onClick={() => setAsked(true)}>記録をすべて消す</Button>}
      {asked && !done && (
        <>
          <p>この端末の記録と同意を、すべて消します。元には戻せません。</p>
          <Button
            kind="primary"
            testId="btn-delete-all"
            onClick={() => {
              void store.deleteAll().then(() => setDone(true));
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

export function App({ storeName = "kimi-no-rule", api }: { storeName?: string; api?: Parameters<typeof startSession>[0]["api"] }) {
  const [store, setStore] = useState<FlowStore | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<FlowView | null>(null);
  const [parent, setParent] = useState(false);

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
  }, [storeName, api]);

  const send = useMemo<Session["send"]>(() => (e) => session?.send(e), [session]);

  return (
    <main style={page}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>{APP_TITLE}</h1>
        <AiBadge />
      </header>
      {view === null && <p>じゅんびしています…</p>}
      {view !== null && store !== null && parent && <ParentScreen store={store} onClose={() => setParent(false)} />}
      {view !== null && !parent && <Screen view={view} send={send} />}
      {view !== null && !parent && view.screen !== "ended" && <Always view={view} send={send} />}
      {!parent && (view?.screen === "intro" || view?.screen === "consent" || view?.screen === "ended") && (
        <p style={{ marginTop: 24 }}>
          <Button onClick={() => setParent(true)} testId="btn-parent">
            おうちの人へ
          </Button>
        </p>
      )}
    </main>
  );
}
