// The mic under the junior (指示書 第7.1節 手順5): a big 「話して教える」 button, the interim words shown live while the
// child talks, and the final words handed to the session. The words are kept in this component's state only
// while they are interim, and are never written anywhere. Without the browser's speech recognition, or with the
// microphone denied, the button is not offered and a short line says to use the card; the card always stays.
import { useEffect, useMemo, useState } from "react";
import type { Lang } from "@kimi/core";
import { Button } from "../ui/controls.tsx";
import { COLOR, TYPE } from "../ui/tokens.ts";
import type { UiText } from "../flow/text.ts";
import type { Recognizer } from "./recognizer.ts";

export type RecognizerFactory = (lang: Lang) => Recognizer;

type Status = "idle" | "talking" | "denied";

export function VoicePanel(props: {
  lang: Lang;
  text: UiText["problem"]["voice"];
  /** Teaching in typed words (Q60): offered whenever the voice could be (canTalk), with or without a microphone. */
  typed: UiText["problem"]["typed"];
  make: RecognizerFactory;
  /** The flow offers the mic now (looking or placed, turns left, not waiting, the worker reachable). */
  canTalk: boolean;
  /** The voice is off for this session (the worker could not be reached). */
  off: boolean;
  onFinal: (text: string) => void;
}) {
  const { lang, make, onFinal } = props;
  const rec = useMemo(() => make(lang), [make, lang]);
  const [status, setStatus] = useState<Status>("idle");
  const [interim, setInterim] = useState("");

  useEffect(() => {
    rec.onInterim = (t) => setInterim(t);
    rec.onFinal = (t) => {
      setInterim("");
      setStatus("idle");
      onFinal(t);
    };
    rec.onError = (kind) => {
      setInterim("");
      setStatus(kind === "denied" || kind === "unsupported" ? "denied" : "idle");
    };
    rec.onEnd = () => {
      setInterim("");
      setStatus((s) => (s === "talking" ? "idle" : s));
    };
    return () => {
      rec.onInterim = null;
      rec.onFinal = null;
      rec.onError = null;
      rec.onEnd = null;
      rec.stop();
    };
  }, [rec, onFinal]);

  const note = (line: string) => (
    <p data-testid="voice-note" style={{ fontSize: TYPE.small, color: COLOR.inkSoft, margin: "8px 0 0" }}>
      {line}
    </p>
  );
  // The typed words go the same way as the voice's final words; the box keeps them only until they are sent.
  const typedBox = props.canTalk && !props.off ? <TypedTeach text={props.typed} onSend={onFinal} /> : null;
  if (props.off) return note(props.text.off);
  if (!rec.isSupported())
    return (
      <>
        {note(props.text.unsupported)}
        {typedBox}
      </>
    );
  if (status === "denied")
    return (
      <>
        {note(props.text.denied)}
        {typedBox}
      </>
    );
  if (status === "talking") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
        <p data-testid="voice-interim" aria-live="polite" style={{ margin: 0, fontSize: TYPE.body, color: COLOR.ink }}>
          {interim === "" ? props.text.listening : interim}
        </p>
        <Button onClick={() => rec.stop()} testId="btn-talk-stop">
          {props.text.stop}
        </Button>
      </div>
    );
  }
  if (!props.canTalk) return null;
  return (
    <>
      <p style={{ margin: "8px 0 0" }}>
        <Button
          testId="btn-talk"
          onClick={() => {
            setInterim("");
            setStatus("talking");
            rec.start();
          }}
        >
          {props.text.talk}
        </Button>
      </p>
      {typedBox}
    </>
  );
}

/** One line of typed words for AI-kun and its send button (Enter sends too); empty words are never sent. */
function TypedTeach(props: { text: UiText["problem"]["typed"]; onSend: (text: string) => void }) {
  const [value, setValue] = useState("");
  const send = (): void => {
    const words = value.trim();
    if (words === "") return;
    setValue("");
    props.onSend(words);
  };
  return (
    <form
      data-role="typed-teach"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, margin: "12px 0 0" }}
    >
      <label htmlFor="teach-typed" style={{ fontSize: TYPE.small, fontWeight: 700, color: COLOR.ink, width: "100%" }}>
        {props.text.label}
      </label>
      <input
        id="teach-typed"
        data-testid="input-teach"
        type="text"
        value={value}
        maxLength={80}
        autoComplete="off"
        placeholder={props.text.hint}
        onChange={(e) => setValue(e.target.value)}
        style={{ flex: "1 1 220px", minHeight: 48, fontSize: TYPE.body, padding: "6px 12px", border: `2px solid ${COLOR.line}`, borderRadius: 10, color: COLOR.ink, background: COLOR.surface }}
      />
      <Button testId="btn-teach-send" onClick={send}>
        {props.text.send}
      </Button>
    </form>
  );
}
