// Controls shared by the junior's flow and the AI-free check: the big buttons, the three always-visible
// buttons (原則7) and the number pad. They draw and report taps only; nothing here judges a number.
// Their look comes from ui/tokens.ts: rounded, with the picture parts' dark outline and a short "sticker" shadow.
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { Lang, Rational } from "@kimi/core";
import { ui, type UiText } from "../flow/text.ts";
import { BORDER, COLOR, RADIUS, SHADOW, SPACE, TYPE } from "./tokens.ts";

export type ButtonKind = "primary" | "secondary" | "choice" | "quiet";

const base: CSSProperties = {
  minHeight: 56,
  minWidth: 56,
  padding: `${String(SPACE.sm)}px ${String(SPACE.xl)}px`,
  fontFamily: "inherit",
  fontSize: TYPE.body,
  fontWeight: 700,
  lineHeight: 1.8,
  borderRadius: RADIUS.md,
  border: `${String(BORDER.width)}px solid ${COLOR.outline}`,
  background: COLOR.surface,
  color: COLOR.ink,
  boxShadow: SHADOW.button,
  cursor: "pointer",
};

/** How a button of each kind looks: the one main action filled, the others white, the grown-ups' ones quiet. */
export const BUTTON_STYLE: Record<ButtonKind, CSSProperties> = {
  primary: {
    ...base,
    background: COLOR.primary,
    color: COLOR.onPrimary,
    minHeight: 60,
    padding: `${String(SPACE.sm)}px ${String(SPACE.xxl)}px`,
    fontSize: TYPE.large,
  },
  secondary: base,
  // An answer to the question on the screen (who has more, does it fit, yes or no): every option looks the same,
  // larger than the buttons at the bottom and tinted, so the answers never read as help (screen check, 2026-11-08).
  choice: {
    ...base,
    minHeight: 64,
    minWidth: 160,
    fontSize: TYPE.large,
    background: COLOR.choice,
  },
  quiet: {
    ...base,
    minHeight: 48,
    fontSize: TYPE.small,
    fontWeight: 400,
    border: `${String(BORDER.thin)}px solid ${COLOR.inkSoft}`,
    boxShadow: "none",
    color: COLOR.ink,
    background: COLOR.surface,
  },
};

export function Button(props: {
  onClick: () => void;
  children: ReactNode;
  kind?: ButtonKind;
  highlight?: boolean;
  testId?: string;
  style?: CSSProperties;
  /** Not pressable yet (for example while a box is empty): dimmed, and announced as unavailable. */
  disabled?: boolean;
  /** The problem this button opens (the top page's list, Q64). */
  problemId?: string;
}) {
  const style = {
    ...BUTTON_STYLE[props.kind ?? "secondary"],
    ...(props.highlight === true
      ? { outline: `4px solid ${COLOR.attention}`, outlineOffset: 2 }
      : {}),
    ...(props.disabled === true ? { opacity: 0.45, cursor: "not-allowed" } : {}),
    ...props.style,
  };
  return (
    <button
      type="button"
      className="k-btn"
      style={style}
      onClick={props.onClick}
      disabled={props.disabled === true}
      data-testid={props.testId}
      data-problem-id={props.problemId}
    >
      {props.children}
    </button>
  );
}

/** A switch the child presses on and off (the language, furigana, an option of the rule card): pressed looks pressed. */
export function Toggle(props: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  testId?: string;
  lang?: string;
  dataRule?: string;
}) {
  return (
    <button
      type="button"
      className="k-btn"
      lang={props.lang}
      aria-pressed={props.pressed}
      data-testid={props.testId}
      data-rule={props.dataRule}
      onClick={props.onClick}
      style={{
        ...base,
        minHeight: 48,
        fontSize: TYPE.small,
        padding: `${String(SPACE.xs)}px ${String(SPACE.lg)}px`,
        fontWeight: props.pressed ? 700 : 400,
        background: props.pressed ? COLOR.pressed : COLOR.surface,
        border: `${String(props.pressed ? BORDER.width : BORDER.thin)}px solid ${props.pressed ? COLOR.outline : COLOR.inkSoft}`,
        boxShadow: props.pressed ? SHADOW.buttonPressed : "none",
      }}
    >
      {props.children}
    </button>
  );
}

/** The buttons every screen keeps (原則7): stop and don't know. Without onDontKnow the second one is left out (the
 * math has stopped there, Q30). There is no 「つらい」 button (Q64: a parent found the help screen it opened out of
 * place); the child's own words that show distress still open that screen (machine: distress). A band fixed to the bottom of the screen; the page
 * leaves room under its last content (tokens BAR_SPACE), so the band never covers it. */
export function AlwaysNav(props: {
  lang?: Lang;
  buttons?: UiText["buttons"];
  highlight?: boolean;
  onStop: () => void;
  onDontKnow?: () => void;
}) {
  const t = ui(props.lang ?? "ja");
  const buttons = props.buttons ?? t.buttons;
  const hl = props.highlight === true;
  const small: CSSProperties = {
    minHeight: 56,
    fontSize: TYPE.body,
    padding: `${String(SPACE.xs)}px ${String(SPACE.lg)}px`,
    boxShadow: SHADOW.buttonPressed,
  };
  return (
    <nav
      aria-label={t.alwaysLabel}
      data-testid="always"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10,
        background: COLOR.bar,
        borderTop: `${String(BORDER.thin)}px solid ${COLOR.line}`,
        boxShadow: SHADOW.bar,
      }}
    >
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: `${String(SPACE.md)}px ${String(SPACE.lg)}px calc(${String(SPACE.md)}px + env(safe-area-inset-bottom, 0px))`,
          display: "flex",
          // Centred on the screen, whatever the page's width (screen check, 2026-11-08).
          justifyContent: "center",
          gap: SPACE.lg,
          flexWrap: "wrap",
        }}
      >
        <Button
          onClick={props.onStop}
          highlight={hl}
          testId="btn-stop"
          style={small}
        >
          {buttons.stop}
        </Button>
        {props.onDontKnow !== undefined && (
          <Button
            onClick={props.onDontKnow}
            highlight={hl}
            testId="btn-dont-know"
            style={small}
          >
            {buttons.dontKnow}
          </Button>
        )}
      </div>
    </nav>
  );
}

/** A number pad for the child's answer: digits only (the bank's answers are whole numbers). Keys of 64px, laid
 * out like a phone's; the number shows big, "？" until the child types. */
export function NumberPad({
  label,
  onAnswer,
  lang = "ja",
  labelNode,
}: {
  label: string;
  onAnswer: (v: Rational) => void;
  lang?: Lang;
  labelNode?: ReactNode;
}) {
  const [digits, setDigits] = useState("");
  const t = ui(lang).pad;
  const key: CSSProperties = {
    minWidth: 56,
    minHeight: 64,
    padding: 0,
    fontSize: TYPE.title,
  };
  const press = (d: string) => setDigits((x) => (x.length < 3 ? x + d : x));
  return (
    <div
      role="group"
      aria-label={label}
      data-role="number-pad"
      style={{
        marginTop: SPACE.lg,
        padding: SPACE.lg,
        background: COLOR.surface,
        border: `${String(BORDER.thin)}px solid ${COLOR.line}`,
        borderRadius: RADIUS.lg,
        boxShadow: SHADOW.card,
        width: "fit-content",
        maxWidth: "100%",
      }}
    >
      <p
        style={{
          margin: `0 0 ${String(SPACE.md)}px`,
          display: "flex",
          alignItems: "center",
          gap: SPACE.md,
          flexWrap: "wrap",
        }}
      >
        <span>{labelNode ?? label}</span>
        <output
          aria-live="polite"
          data-testid="pad-value"
          style={{
            display: "inline-block",
            minWidth: 96,
            padding: `${String(SPACE.xs)}px ${String(SPACE.lg)}px`,
            border: `${String(BORDER.width)}px solid ${COLOR.outline}`,
            borderRadius: RADIUS.md,
            textAlign: "center",
            fontSize: TYPE.title,
            fontWeight: 700,
            background: COLOR.page,
          }}
        >
          {digits === "" ? "？" : digits}
        </output>
      </p>
      {/* Two rows of five digits, then the clear key and the OK key: short enough to sit under the world. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(56px, 72px))", gap: SPACE.md }}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((d) => (
          <Button key={d} onClick={() => press(d)} testId={`pad-${d}`} style={key}>
            {d}
          </Button>
        ))}
        <Button onClick={() => setDigits("")} style={{ ...key, gridColumn: "span 2", fontSize: TYPE.body }}>
          {t.clear}
        </Button>
        <Button
          kind="primary"
          testId="pad-ok"
          style={{ ...key, gridColumn: "span 3", fontSize: TYPE.large }}
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
export function HoldButton(props: {
  onHold: () => void;
  holdMs: number;
  children: ReactNode;
  testId?: string;
}) {
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
      className="k-btn"
      style={BUTTON_STYLE.quiet}
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
