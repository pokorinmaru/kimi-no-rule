// A wish to AI-kun (Q61). The child tells AI-kun what was hard or what they want. The words stay on this device
// for the parent; the server passes them to Claude once to judge distress and rephrase them, and keeps nothing. A cry
// for help never becomes a wish: the screen shows where to talk, and only a mark and the date are kept. When the
// server cannot judge, nothing says the words were safe: the thanks comes with a gentle line to tell a grown-up (Q26, Q64).
// The buttons of the top page stay under this screen (Q60; no 「つらい」 button since Q64). On the parent screen only the rephrased request, checked by core
// again here, can be sent to the developer, copied by the parent's own hand.
import { useEffect, useState, type CSSProperties } from "react";
import { wishGate, type Lang } from "@kimi/core";
import { KohaiBeside } from "../draw/Kohai.tsx";
import type { FlowApi, WishReply } from "../flow/api.ts";
import type { UiText } from "../flow/text.ts";
import { parentCard } from "../parent/ParentNote.tsx";
import type { FlowStore, WishRow } from "../store/store.ts";
import { Button } from "../ui/controls.tsx";
import { Helplines } from "../ui/Helplines.tsx";
import { RubyText } from "../ui/Ruby.tsx";
import { BORDER, COLOR, RADIUS, SPACE, TYPE, prose } from "../ui/tokens.ts";

/** How long the screen waits for the server before keeping the words with no request. */
export const WISH_WAIT_MS = 10000;
/** The most a child can type in one wish. */
export const WISH_MAX_INPUT = 200;

const h2: CSSProperties = { fontSize: TYPE.large, lineHeight: 1.5, margin: `${String(SPACE.sm)}px 0 ${String(SPACE.md)}px` };
const actions: CSSProperties = { display: "flex", gap: SPACE.md, flexWrap: "wrap", alignItems: "center", marginTop: SPACE.lg };

type Phase = "write" | "sending" | "done" | "hard";

/** No server, an error, a cap or a timeout: nothing judged the words, so they are never taken as safe. */
async function ask(api: FlowApi | null | undefined, text: string): Promise<WishReply> {
  if (api?.wish === undefined) return { kind: "unchecked" };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), WISH_WAIT_MS);
  try {
    return await api.wish(text, ctl.signal);
  } catch {
    return { kind: "unchecked" };
  } finally {
    clearTimeout(timer);
  }
}

export function WishScreen(props: {
  t: UiText;
  lang: Lang;
  ruby: boolean;
  furigana: boolean;
  store: FlowStore;
  api: FlowApi | null | undefined;
  /** The words as sent to the server: the child's name put back to the story's placeholder (Q60). */
  outbound: (text: string) => string;
  onBack: () => void;
}) {
  const { t, ruby } = props;
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("write");
  const [unchecked, setUnchecked] = useState(false);
  const send = async (): Promise<void> => {
    const words = text.trim();
    if (words === "") return;
    setPhase("sending");
    const reply = await ask(props.api, props.outbound(words));
    if (reply.kind === "distress") {
      // Help comes first: the screen shows where to talk. Only a mark and the date are kept (the store drops the words).
      await props.store.logSafety("distress");
      await props.store.addWish({ original: words, request: null, distress: true });
      setText("");
      setPhase("hard");
      return;
    }
    // Claude's request is kept only when core lets it through here too (CLAUDE.md 守ること4).
    const request = reply.kind === "wish" && wishGate(reply.request).ok ? reply.request : null;
    await props.store.addWish({ original: words, request });
    setText("");
    setUnchecked(reply.kind === "unchecked");
    setPhase("done");
  };
  return (
    <section aria-label={t.wish.label} data-testid="screen-wish">
      <h2 style={h2}>
        <RubyText text={t.wish.label} on={ruby} />
      </h2>
      {phase === "hard" ? (
        <div data-testid="wish-hard">
          <h3 style={{ fontSize: TYPE.large, margin: `0 0 ${String(SPACE.sm)}px` }}>
            <RubyText text={t.hard.label} on={ruby} />
          </h3>
          <p style={prose}>
            <RubyText text={t.hard.talk} on={ruby} />
          </p>
          <Helplines helpline={t.helpline} lang={props.lang} furigana={props.furigana} />
        </div>
      ) : (
        <KohaiBeside pose="listen">
          <div>
            {t.wish.lead.map((l) => (
              <p key={l} style={{ ...prose, margin: `0 0 ${String(SPACE.sm)}px` }}>
                <RubyText text={l} on={ruby} />
              </p>
            ))}
          </div>
        </KohaiBeside>
      )}
      {(phase === "write" || phase === "sending") && (
        <div style={{ marginTop: SPACE.lg, maxWidth: 560 }}>
          <label htmlFor="wish-text" style={{ display: "block", fontWeight: 700, marginBottom: SPACE.sm }}>
            <RubyText text={t.wish.field} on={ruby} />
          </label>
          <textarea
            id="wish-text"
            data-testid="input-wish"
            value={text}
            rows={3}
            maxLength={WISH_MAX_INPUT}
            placeholder={t.wish.hint}
            disabled={phase === "sending"}
            onChange={(e) => setText(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", fontSize: TYPE.large, padding: "8px 14px", border: `${String(BORDER.thin)}px solid ${COLOR.line}`, borderRadius: RADIUS.md, color: COLOR.ink, background: COLOR.surface, fontFamily: "inherit", lineHeight: 1.6 }}
          />
        </div>
      )}
      {phase === "sending" && (
        <p role="status" style={prose}>
          <RubyText text={t.wish.sending} on={ruby} />
        </p>
      )}
      {phase === "done" && (
        <p role="status" data-testid="wish-done" style={{ ...prose, fontSize: TYPE.large, marginTop: SPACE.lg }}>
          <RubyText text={t.wish.done} on={ruby} />
        </p>
      )}
      {phase === "done" && unchecked && (
        <p data-testid="wish-unchecked" style={{ ...prose, marginTop: SPACE.sm }}>
          <RubyText text={t.wish.unchecked} on={ruby} />
        </p>
      )}
      <p style={actions}>
        {phase === "write" && (
          <Button kind="primary" onClick={() => void send()} disabled={text.trim() === ""} testId="btn-wish-send">
            <RubyText text={t.wish.send} on={ruby} />
          </Button>
        )}
        {phase === "done" && (
          <Button onClick={() => setPhase("write")} testId="btn-wish-again">
            <RubyText text={t.wish.again} on={ruby} />
          </Button>
        )}
        <Button kind="quiet" onClick={props.onBack} testId="btn-wish-back">
          <RubyText text={t.wish.back} on={ruby} />
        </Button>
      </p>
    </section>
  );
}

/** The parent's list of the child's wishes: the words, the rephrased request, and copying the request only. */
export function ParentWishes({ store, t }: { store: FlowStore; t: UiText["parent"] }) {
  const [rows, setRows] = useState<WishRow[]>([]);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    void store.listWishes().then((r) => {
      if (live) setRows(r);
    });
    return () => {
      live = false;
    };
  }, [store, reload]);
  const copy = async (row: WishRow): Promise<void> => {
    if (row.request === null || row.id === undefined) return;
    try {
      await navigator.clipboard.writeText(t.wishMessage(row.request));
    } catch {
      return;
    }
    await store.markWishSent(row.id);
    setReload((n) => n + 1);
  };
  const remove = async (row: WishRow): Promise<void> => {
    if (row.id === undefined) return;
    await store.deleteWish(row.id);
    setReload((n) => n + 1);
  };
  const label: CSSProperties = { fontSize: TYPE.small, fontWeight: 700, color: COLOR.inkSoft, margin: `${String(SPACE.sm)}px 0 0` };
  return (
    <div style={parentCard} data-testid="parent-wishes">
      <h3 style={{ fontSize: TYPE.large, margin: `0 0 ${String(SPACE.sm)}px` }}>{t.wishTitle}</h3>
      {t.wishLines.map((l) => (
        <p key={l} style={{ ...prose, maxWidth: "44em", fontSize: TYPE.small, margin: `0 0 ${String(SPACE.sm)}px` }}>
          {l}
        </p>
      ))}
      {rows.length === 0 && <p style={{ ...prose, color: COLOR.inkSoft }}>{t.wishNone}</p>}
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {rows.map((row) => (
          <li key={row.id} data-testid="wish-row" style={{ borderTop: `${String(BORDER.thin)}px solid ${COLOR.line}`, padding: `${String(SPACE.md)}px 0` }}>
            <p style={label}>
              {t.wishOriginal}（{row.at.slice(0, 10)}）
            </p>
            {row.distress === true ? (
              <p data-testid="wish-heavy" style={{ ...prose, margin: 0, color: COLOR.danger }}>
                {t.wishHeavy}
              </p>
            ) : (
              <>
                <p style={{ ...prose, margin: 0 }}>「{row.original}」</p>
                <p style={label}>{t.wishRequest}</p>
                <p style={{ ...prose, margin: 0 }}>{row.request ?? t.wishNoRequest}</p>
              </>
            )}
            <p style={actions}>
              {row.request !== null && !row.sent && (
                <Button onClick={() => void copy(row)} testId="btn-wish-copy">
                  {t.wishCopy}
                </Button>
              )}
              {row.sent && (
                <span data-testid="wish-sent" style={{ fontSize: TYPE.small, color: COLOR.inkSoft }}>
                  {t.wishSent}
                </span>
              )}
              <Button kind="quiet" onClick={() => void remove(row)} testId="btn-wish-delete">
                {t.wishDelete}
              </Button>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
