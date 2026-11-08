// The entries (指示書 第6.9節): the child's flow, the adults' try route on #/try, and the adults' page of every
// stage picture on #/stages. The try route is never
// reached from a child's screen; it is linked from the grown-up's screen and from the README.
// The public judge build asks for the judges' passcode before any of them (SETUP.md); a local build never does.
import { useEffect, useState } from "react";
import { App } from "./App.tsx";
import type { FlowApi } from "./flow/session.ts";
import { DEFAULT_API_BASE } from "./flow/api.ts";
import { REQUIRE_PASSCODE, checkPasscode, getPasscode, setPasscode } from "./flow/passcode.ts";
import { TryApp } from "./try/TryApp.tsx";
import { STAGES_HASH, StagesPage } from "./stages/StagesPage.tsx";
import { Button } from "./ui/controls.tsx";
import { COLOR, GLOBAL_CSS, RADIUS, SPACE, TYPE, prose } from "./ui/tokens.ts";

export const TRY_HASH = "#/try";

const current = (): string => (typeof window === "undefined" ? "" : window.location.hash);

/** The judges' passcode, asked once per tab and checked with the worker (never with Claude). */
function PassGate({ onPass }: { onPass: () => void }) {
  const [pass, setPass] = useState("");
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (): Promise<void> => {
    const p = pass.trim();
    if (p === "" || busy) return;
    setBusy(true);
    const ok = await checkPasscode(DEFAULT_API_BASE, p);
    setBusy(false);
    if (!ok) {
      setBad(true);
      return;
    }
    setPasscode(p);
    onPass();
  };
  return (
    <main className="k-page" data-testid="pass-gate" lang="ja" style={{ margin: "0 auto", padding: SPACE.lg, color: COLOR.ink }}>
      <style>{GLOBAL_CSS}</style>
      <h1 style={{ fontSize: TYPE.title, margin: `0 0 ${String(SPACE.md)}px` }}>君のルールで世界を作る</h1>
      <p style={prose}>審査用の公開版です。お知らせしたパスコードを入れてください。</p>
      <p style={{ ...prose, fontSize: TYPE.small, color: COLOR.inkSoft }}>This is the judges' build. Please enter the passcode you were given.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        style={{ display: "flex", gap: SPACE.md, flexWrap: "wrap", alignItems: "center", marginTop: SPACE.lg }}
      >
        <label htmlFor="judge-pass" style={{ fontWeight: 700 }}>
          パスコード
        </label>
        <input
          id="judge-pass"
          data-testid="input-pass"
          type="password"
          autoComplete="off"
          value={pass}
          onChange={(e) => {
            setPass(e.target.value);
            setBad(false);
          }}
          style={{ minHeight: 48, fontSize: TYPE.large, padding: "6px 12px", border: `2px solid ${bad ? COLOR.danger : COLOR.line}`, borderRadius: RADIUS.md }}
        />
        <Button kind="primary" onClick={() => void submit()} testId="btn-pass">
          はいる
        </Button>
      </form>
      {bad && (
        <p data-testid="pass-bad" role="alert" style={{ ...prose, color: COLOR.danger }}>
          パスコードがちがいます。The passcode is not right.
        </p>
      )}
    </main>
  );
}

export function Root({ api, requirePasscode = REQUIRE_PASSCODE }: { api?: FlowApi | null; requirePasscode?: boolean }) {
  const [hash, setHash] = useState(current);
  const [passed, setPassed] = useState(() => !requirePasscode || getPasscode() !== null);
  useEffect(() => {
    const on = (): void => setHash(current());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  if (!passed) return <PassGate onPass={() => setPassed(true)} />;
  const apiProp = api === undefined ? {} : { api };
  if (hash === STAGES_HASH) return <StagesPage />;
  return hash === TRY_HASH ? <TryApp {...apiProp} /> : <App {...apiProp} />;
}
