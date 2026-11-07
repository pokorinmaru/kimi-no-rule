// The screens (指示書 第7.1節, HANDOFF §3 F1・F8・F9). Each screen draws only viewOf(snapshot); every number
// and world comes from core through the flow, and every tap goes back to the flow as an event.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { gate, type Lang, type ProblemRecord, type Rational, type StatementCheck } from "@kimi/core";
import { AiBadge } from "./draw/AiBadge.tsx";
import { SceneView } from "./draw/SceneView.tsx";
import { SentenceList } from "./draw/SentenceList.tsx";
import { WorldView } from "./draw/WorldView.tsx";
import { startSession, type Session } from "./flow/session.ts";
import { bankFor } from "./flow/bank.ts";
import { viewOf, type CardScreenView, type FlowSnapshot, type FlowView, type ProblemView } from "./flow/view.ts";
import { helplineLine, ui, type UiText } from "./flow/text.ts";
import { openStore, type CheckRow, type FlowStore } from "./store/store.ts";
import { CheckMode } from "./check/CheckMode.tsx";
import { scoreOf } from "./check/check.ts";
import { checkText } from "./check/text.ts";
import { AlwaysNav, Button, HoldButton, NumberPad } from "./ui/controls.tsx";
import { VoicePanel, type RecognizerFactory } from "./voice/VoicePanel.tsx";
import { createRecognizer } from "./voice/recognizer.ts";

/** The browser's own speech recognition, in the screen's language (the user chose the Web Speech API). */
const browserSpeech: RecognizerFactory = (lang) => createRecognizer(lang);

/** What the problem screen needs for the child's voice: the recognizer, whether the session can hear, and where the final words go. */
interface VoiceHooks {
  make: RecognizerFactory;
  canHear: boolean;
  hear: (text: string) => void;
}

/** The heading the child sees in Japanese (ui(lang).title in the screen's language). The work's name is not
 * shown to the child: it would attribute the reading to the child (原則10, 指示書 第11節 M7). */
export const APP_TITLE = ui("ja").title;

const page: CSSProperties = { maxWidth: 760, margin: "0 auto", padding: "16px", fontFamily: "system-ui, sans-serif", fontSize: 20, lineHeight: 1.6, color: "#1f2933" };
/** The three buttons every screen keeps (原則7): stop, don't know, it's hard. */
function Always({ view, send }: { view: FlowView; send: Session["send"] }) {
  return (
    <AlwaysNav
      lang={view.lang}
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

function ProblemScreen({ view, send, voice }: { view: ProblemView; send: Session["send"]; voice: VoiceHooks | null }) {
  const t = view.text.problem;
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
    <section aria-label={t.label} data-problem-id={view.problemId}>
      {view.note !== null && (
        <p data-testid="problem-note" style={{ fontSize: 16, color: "#52606d", margin: "0 0 8px" }}>
          {view.note}
        </p>
      )}
      {view.card !== null && (
        <p data-testid="reading-card" style={{ display: "inline-block", padding: "6px 14px", border: "2px dashed #9aa5b1", borderRadius: 10, background: "#f5f7fa" }}>
          {view.card}
        </p>
      )}
      <SentenceList
        statements={view.statements}
        checks={view.step === "reading" ? null : checks}
        {...(view.canPlace ? { onTapWord: (i: number, t: number) => send({ type: "TAP_WORD", statementIndex: i, token: t }) } : {})}
        label={t.sentences}
        lang={view.lang}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
        <AiBadge />
        <p data-testid="junior-line" aria-live="polite" style={{ margin: 0 }}>
          {view.line ?? "…"}
        </p>
      </div>
      {voice !== null && voice.canHear && (
        // The child may tell the junior by talking (指示書 第7.1節 手順5); the card below always stays.
        <VoicePanel lang={view.lang} text={t.voice} make={voice.make} canTalk={view.voice.canTalk} off={view.voice.off} onFinal={voice.hear} />
      )}
      <WorldView
        {...(view.orderOnly ? { correct: view.world } : {})}
        world={view.world}
        cardHolder={cardHolder}
        childNumbers={childNumbers}
        unitValue={view.unitValue}
        answered={answered}
        glowIds={view.glowIds}
        failingSentences={view.step === "reading" ? [] : failing}
        label={t.world}
        lang={view.lang}
        {...(view.canPlace ? { onPlaceCard: placeOn } : {})}
      />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        {view.predict !== null && (
          // The child's prediction about the junior's world, before any sentence lights (指示書 第7.1節 手順4).
          // The buttons look alike and none is chosen beforehand; their order changes on every problem.
          <div role="group" aria-label={view.predict.label} data-testid="predict" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ margin: 0 }} data-testid="predict-question">
              {view.predict.question}
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {view.predict.choices.map((c) => (
                <Button key={c.answer} onClick={() => send({ type: "PREDICT", answer: c.answer })} testId={`btn-predict-${c.answer}`}>
                  {c.label}
                </Button>
              ))}
            </div>
          </div>
        )}
        {view.step === "looking" && <p>{t.looking}</p>}
        {view.step === "placed" && (
          <>
            <Button kind="primary" onClick={() => send({ type: "CONFIRM_YES" })} testId="btn-confirm-yes">
              {t.yes}
            </Button>
            <Button onClick={() => send({ type: "CONFIRM_NO" })} testId="btn-confirm-no">
              {t.no}
            </Button>
          </>
        )}
        {view.step === "rebuilt" && (
          <Button kind="primary" onClick={() => send({ type: "NEXT" })} testId="btn-next">
            {t.next}
          </Button>
        )}
        {(view.step === "solved" || view.step === "held") && (
          <Button kind="primary" onClick={() => send({ type: "NEXT" })} testId="btn-next">
            {t.nextProblem}
          </Button>
        )}
      </div>
      {view.step === "unit" && <NumberPad lang={view.lang} label={t.unitPad} onAnswer={(v) => send({ type: "ANSWER_UNIT", value: v })} />}
      {view.step === "total" && <NumberPad lang={view.lang} label={t.totalPad} onAnswer={(v) => send({ type: "ANSWER_TOTAL", value: v })} />}
    </section>
  );
}

/**
 * The junior's rule card (指示書 第7.1節 後輩のルールカード, 第2節 自分で直す). The child chooses who is taken as 1
 * in the card's slot; each choice goes to the flow, core builds every gallery world again and WorldView draws
 * the new worlds (the tapes grow again unless motion is reduced). Nothing here says right or wrong: the
 * sentences' light is the only feedback, and the asked value stays "？".
 */
function CardScreen({ view, send }: { view: CardScreenView; send: Session["send"] }) {
  const t = view.text;
  return (
    <section aria-label={t.ruleCard.label} data-testid="screen-card">
      <h2 style={{ fontSize: 20, margin: "0 0 8px" }}>{t.ruleCard.label}</h2>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <AiBadge />
        <div>
          {view.lines.map((l) => (
            <p key={l} style={{ margin: 0 }}>
              {l}
            </p>
          ))}
        </div>
      </div>
      <div style={{ margin: "12px 0", padding: "10px 14px", border: "2px dashed #9aa5b1", borderRadius: 10, background: "#f5f7fa" }}>
        <p data-testid="rule-card" aria-live="polite" style={{ margin: "0 0 8px" }}>
          {view.card ?? ""}
        </p>
        <div role="group" aria-label={view.slotLabel} data-testid="card-slot" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {view.options.map((o) => (
            <button
              key={o.ruleId}
              type="button"
              data-rule={o.ruleId}
              data-testid={`card-option-${o.ruleId}`}
              aria-pressed={o.chosen}
              onClick={() => send({ type: "CARD_PICK", ruleId: o.ruleId })}
              style={{
                minHeight: 48,
                padding: "8px 14px",
                fontSize: 18,
                borderRadius: 12,
                border: "2px solid #52606d",
                // The chosen option looks pressed only; no option is marked as better than another.
                background: o.chosen ? "#e4ecf7" : "#fff",
                color: "#1f2933",
                fontWeight: o.chosen ? 700 : 400,
                cursor: "pointer",
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <h3 style={{ fontSize: 18 }}>{view.galleryLabel}</h3>
      <ul data-testid="gallery" style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 16 }}>
        {view.gallery.map((g) => {
          const checks: StatementCheck[] = g.statements.map((s) => ({ index: s.index, verdict: s.lit ? "fails" : "holds", cues: [] }) as StatementCheck);
          return (
            <li key={g.problemId} data-testid="gallery-item" data-problem-id={g.problemId} style={{ borderTop: "1px solid #cbd2d9", paddingTop: 8 }}>
              <SentenceList statements={g.statements} checks={checks} label={t.problem.sentences} lang={view.lang} />
              {g.world !== null && (
                <WorldView
                  world={g.world}
                  glowIds={g.glowIds}
                  failingSentences={g.statements.filter((s) => s.lit).map((s) => s.text)}
                  label={t.problem.world}
                  lang={view.lang}
                />
              )}
            </li>
          );
        })}
      </ul>
      {view.scenes !== null && (
        // 身近な場面で見てみる (指示書 第6.7節 手順5): two everyday scenes read with the card's rule; only the lit sentence says where it stops fitting.
        <section aria-label={view.scenes.label} data-testid="scenes" style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 18 }}>{view.scenes.label}</h3>
          <p style={{ margin: "0 0 8px" }}>{view.scenes.note}</p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 16 }}>
            {view.scenes.items.map((item) => (
              <li key={item.key} style={{ borderTop: "1px solid #cbd2d9", paddingTop: 8 }}>
                <SceneView item={item} drawing={view.scenes?.drawing ?? ""} lang={view.lang} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <p style={{ marginTop: 12 }}>
        <Button kind="primary" onClick={() => send({ type: "NEXT" })} testId="btn-card-next">
          {view.next}
        </Button>
      </p>
    </section>
  );
}

/** The date and time of a check, for the grown-up (this device's clock). */
export function checkDate(at: string): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(d.getFullYear())}/${String(d.getMonth() + 1)}/${String(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The language switch (HANDOFF §7 の4): each language in its own words; the choice is kept on the device. */
function LangSwitch({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  const t = ui(lang).langSwitch;
  return (
    <div role="group" aria-label={t.label} style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
      {(["ja", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={lang === l}
          data-testid={`lang-${l}`}
          onClick={() => onChange(l)}
          style={{
            minHeight: 48,
            minWidth: 48,
            padding: "8px 18px",
            fontSize: 18,
            borderRadius: 12,
            border: "2px solid #52606d",
            background: lang === l ? "#e4ecf7" : "#fff",
            color: "#1f2933",
            fontWeight: lang === l ? 700 : 400,
            cursor: "pointer",
          }}
        >
          {t[l]}
        </button>
      ))}
    </div>
  );
}

/** The AI-free checks (指示書 第7.3節・第7.4節): per check, how many of the problems given were answered right. */
function CheckResults({ rows, text }: { rows: readonly CheckRow[]; text: UiText["parent"] }) {
  return (
    <div data-testid="check-results">
      <h3 style={{ fontSize: 20 }}>{text.checksTitle}</h3>
      {rows.length === 0 ? (
        <p>{text.checksNone}</p>
      ) : (
        <ul>
          {rows.map((r) => {
            const { right, total } = scoreOf(r.items);
            return <li key={r.id ?? r.at}>{text.checkRow(checkDate(r.at), right, total)}</li>;
          })}
        </ul>
      )}
      <p style={{ fontSize: 16 }}>{text.checksNote}</p>
    </div>
  );
}

/** The grown-up's screen (F9): the language, the AI-free checks and deleting every record on this device. */
function ParentScreen({
  store,
  lang,
  onLang,
  onDelete,
  onClose,
}: {
  store: FlowStore;
  lang: Lang;
  onLang: (l: Lang) => void;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const t = ui(lang).parent;
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
    <section aria-label={t.label}>
      <h2>{t.label}</h2>
      <LangSwitch lang={lang} onChange={onLang} />
      {t.lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
      <CheckResults rows={checks} text={t} />
      {!asked && <Button onClick={() => setAsked(true)}>{t.deleteAsk}</Button>}
      {asked && !done && (
        <>
          <p>{t.deleteWarn}</p>
          <Button
            kind="primary"
            testId="btn-delete-all"
            onClick={() => {
              void onDelete().then(() => setDone(true));
            }}
          >
            {t.deleteYes}
          </Button>
          <Button onClick={() => setAsked(false)}>{t.deleteNo}</Button>
        </>
      )}
      {done && <p data-testid="deleted">{t.deleted}</p>}
      <p>
        <a href="#/try" data-testid="link-try">
          {t.tryLink}
        </a>
      </p>
      <p>
        <Button onClick={onClose}>{t.back}</Button>
      </p>
    </section>
  );
}

function Screen({ view, send, onLang, voice }: { view: FlowView; send: Session["send"]; onLang: (l: Lang) => void; voice: VoiceHooks | null }) {
  const t = view.text;
  switch (view.screen) {
    case "intro":
      return (
        <section aria-label={t.intro.label}>
          <LangSwitch lang={view.lang} onChange={onLang} />
          <Lines lines={view.lines} />
          <Button kind="primary" onClick={() => send({ type: "NEXT" })} testId="btn-next">
            {t.intro.start}
          </Button>
        </section>
      );
    case "consent":
      return (
        <section aria-label={t.consent.label}>
          <Lines lines={view.lines} />
          <Button kind="primary" onClick={() => send({ type: "CONSENT_YES" })} testId="btn-consent-yes">
            {t.consent.yes}
          </Button>{" "}
          <Button onClick={() => send({ type: "CONSENT_NO" })}>{t.consent.no}</Button>
        </section>
      );
    case "problem":
      return <ProblemScreen view={view} send={send} voice={voice} />;
    case "card":
      return <CardScreen view={view} send={send} />;
    case "research":
    case "finished":
      return (
        <section aria-label={view.screen === "research" ? t.research.label : t.finished.label}>
          <Lines lines={view.lines} />
          {view.screen === "finished" && (
            <Button kind="primary" onClick={() => send({ type: "NEXT" })} testId="btn-next">
              {t.finished.end}
            </Button>
          )}
        </section>
      );
    case "stuck":
      return (
        <section aria-label={t.stuck.label}>
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
        <section aria-label={view.screen === "hard" ? t.hard.label : t.rest.label} data-testid={`screen-${view.screen}`}>
          <Lines lines={view.lines} />
          <h2 style={{ fontSize: 20 }}>{view.helpline.title}</h2>
          <p>{view.helpline.pending}</p>
          {view.helpline.note !== null && <p>{view.helpline.note}</p>}
          <ul data-testid="helplines">
            {view.helpline.entries.map((h) => (
              <li key={h.number}>{helplineLine(h, view.lang)}</li>
            ))}
          </ul>
          <Button onClick={() => send({ type: "CLOSE" })}>{t.hard.close}</Button>
        </section>
      );
    case "ended":
      return (
        <section aria-label={t.ended.label} data-testid="screen-ended">
          <p>{t.ended.line}</p>
        </section>
      );
  }
}

/** How long the grown-up holds 「おうちの人へ」 to open the parent screen (Q31). */
export const PARENT_HOLD_MS = 2000;

/** The child's bank: the prepared problems and the discriminating problems a person has checked (Q33). */
const CHILD_BANK = bankFor({ includeUnchecked: false });

/** The running session and its store, handed to the adults' try route (never drawn on the child's screens). */
export interface SessionHandle {
  session: Session;
  store: FlowStore;
}

export function App({
  storeName = "kimi-no-rule",
  api,
  parentHoldMs = PARENT_HOLD_MS,
  onSession,
  bank = CHILD_BANK,
  speech = browserSpeech,
}: {
  storeName?: string;
  api?: Parameters<typeof startSession>[0]["api"];
  parentHoldMs?: number;
  /** The try route watches the same session for 「中身を見る」 and the simulated child; null when it stops. */
  onSession?: (h: SessionHandle | null) => void;
  /** The problems the flow chooses from; only the adults' try route passes one (with unchecked problems behind its toggle). */
  bank?: readonly ProblemRecord[];
  /** The speech recognizer for the child's voice (the browser's own; a fake in the tests). */
  speech?: RecognizerFactory;
}) {
  const onSessionRef = useRef(onSession);
  onSessionRef.current = onSession;
  const [store, setStore] = useState<FlowStore | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [snap, setSnap] = useState<FlowSnapshot | null>(null);
  const [lang, setLang] = useState<Lang>("ja");
  const [parent, setParent] = useState(false);
  const [restart, setRestart] = useState(0);
  const [check, setCheck] = useState(false);

  useEffect(() => {
    let live = true;
    let s: Session | null = null;
    void (async () => {
      const st = await openStore(storeName);
      const settings = await st.getSettings();
      const started = await startSession({ store: st, input: { bank }, ...(api === undefined ? {} : { api }) });
      if (!live) {
        started.stop();
        return;
      }
      s = started;
      setStore(st);
      setLang(settings.lang);
      setSession(started);
      setSnap(started.actor.getSnapshot());
      started.actor.subscribe((x) => setSnap(x));
      onSessionRef.current?.({ session: started, store: st });
    })();
    return () => {
      live = false;
      if (s !== null) onSessionRef.current?.(null);
      s?.stop();
    };
  }, [storeName, api, restart, bank]);

  const send = useMemo<Session["send"]>(() => (e) => session?.send(e), [session]);
  // The words heard go to the session only (in memory); nothing here keeps them.
  const voice = useMemo<VoiceHooks | null>(
    () => (session === null ? null : { make: speech, canHear: session.canHear, hear: (text) => void session.hear(text) }),
    [session, speech],
  );
  // The screen's words follow the device's choice; the session takes it while no problem is open.
  const view = useMemo(() => (snap === null ? null : viewOf(snap, lang)), [snap, lang]);
  const t = ui(lang);
  const changeLang = (l: Lang): void => {
    setLang(l);
    session?.send({ type: "SET_LANG", lang: l });
    void store?.setLang(l);
  };

  return (
    <main style={page} lang={lang}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>{t.title}</h1>
        <AiBadge />
      </header>
      {view === null && <p>{t.preparing}</p>}
      {view !== null && store !== null && parent && (
        <ParentScreen
          store={store}
          lang={lang}
          onLang={changeLang}
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
          lang={lang}
          bank={bank}
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
      {view !== null && !parent && !check && <Screen view={view} send={send} onLang={changeLang} voice={voice} />}
      {view !== null && !check && view.screen !== "ended" && <Always view={view} send={send} />}
      {!parent && !check && (view?.screen === "intro" || view?.screen === "consent" || view?.screen === "ended") && (
        <p style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
          {(view.screen === "intro" || view.screen === "ended") && (
            <Button onClick={() => setCheck(true)} testId="btn-check">
              {checkText(lang).entry}
            </Button>
          )}
          <HoldButton onHold={() => setParent(true)} holdMs={parentHoldMs} testId="btn-parent">
            {t.parentDoor}
          </HoldButton>
        </p>
      )}
    </main>
  );
}
