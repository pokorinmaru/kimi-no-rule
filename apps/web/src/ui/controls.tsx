// Controls shared by the junior's flow and the AI-free check: the big buttons, the three always-visible
// buttons (原則7) and the number pad. They draw and report taps only; nothing here judges a number.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Lang, Rational } from "@kimi/core";
import { ui, type UiText } from "../flow/text.ts";

const big: CSSProperties = { minHeight: 48, minWidth: 48, padding: "8px 18px", fontSize: 20, borderRadius: 12, border: "2px solid #52606d", background: "#fff", cursor: "pointer" };
const primary: CSSProperties = { ...big, background: "#1f6feb", color: "#fff", borderColor: "#1f6feb" };

export function Button(props: { onClick: () => void; children: ReactNode; kind?: "primary"; highlight?: boolean; testId?: string }) {
  const style = { ...(props.kind === "primary" ? primary : big), ...(props.highlight === true ? { outline: "4px solid #f5a623", outlineOffset: 2 } : {}) };
  return (
    <button type="button" style={style} onClick={props.onClick} data-testid={props.testId}>
      {props.children}
    </button>
  );
}

/** The three buttons every screen keeps (原則7): stop, don't know, it's hard. Without onDontKnow the
 * middle one is left out (the math has stopped there, Q30). */
export function AlwaysNav(props: { lang?: Lang; buttons?: UiText["buttons"]; highlight?: boolean; onStop: () => void; onDontKnow?: () => void; onHard: () => void }) {
  const t = ui(props.lang ?? "ja");
  const buttons = props.buttons ?? t.buttons;
  const hl = props.highlight === true;
  return (
    <nav
      aria-label={t.alwaysLabel}
      data-testid="always"
      style={{ position: "sticky", bottom: 0, display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24, borderTop: "1px solid #cbd2d9", padding: "12px 0", background: "#fff" }}
    >
      <Button onClick={props.onStop} highlight={hl} testId="btn-stop">
        {buttons.stop}
      </Button>
      {props.onDontKnow !== undefined && (
        <Button onClick={props.onDontKnow} highlight={hl} testId="btn-dont-know">
          {buttons.dontKnow}
        </Button>
      )}
      <Button onClick={props.onHard} highlight={hl} testId="btn-hard">
        {buttons.hard}
      </Button>
    </nav>
  );
}

/** A number pad for the child's answer: digits only (the bank's answers are whole numbers). */
export function NumberPad({ label, onAnswer, lang = "ja" }: { label: string; onAnswer: (v: Rational) => void; lang?: Lang }) {
  const [digits, setDigits] = useState("");
  const t = ui(lang).pad;
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
        <Button onClick={() => setDigits("")}>{t.clear}</Button>
        <Button
          kind="primary"
          testId="pad-ok"
          onClick={() => {
            if (digits === "") return;
            onAnswer({ num: Number(digits), den: 1 });
            setDigits("");
          }}
        >
          {t.ok}
        </Button>
      </div>
    </div>
  );
}

/**
 * A button the grown-up holds down for `holdMs` (or holds Enter or Space): the parent screen's door, so a
 * child does not open it by a tap (指示書 第7.4節). With holdMs 0 a press opens it at once (tests).
 */
export function HoldButton(props: { onHold: () => void; holdMs: number; children: ReactNode; testId?: string }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const start = () => {
    cancel();
    if (props.holdMs <= 0) return props.onHold();
    timer.current = setTimeout(() => {
      timer.current = null;
      props.onHold();
    }, props.holdMs);
  };
  useEffect(() => cancel, []);
  return (
    <button
      type="button"
      style={big}
      data-testid={props.testId}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) start();
      }}
      onKeyUp={cancel}
    >
      {props.children}
    </button>
  );
}
