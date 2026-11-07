// The mic under the junior (指示書 第7.1節 手順5): a big 「話して教える」 button, the interim words shown live while the
// child talks, and the final words handed to the session. The words are kept in this component's state only
// while they are interim, and are never written anywhere. Without the browser's speech recognition, or with the
// microphone denied, the button is not offered and a short line says to use the card; the card always stays.
import { useEffect, useMemo, useState } from "react";
import type { Lang } from "@kimi/core";
import { Button } from "../ui/controls.tsx";
import type { UiText } from "../flow/text.ts";
import type { Recognizer } from "./recognizer.ts";

export type RecognizerFactory = (lang: Lang) => Recognizer;

type Status = "idle" | "talking" | "denied";

export function VoicePanel(props: {
  lang: Lang;
  text: UiText["problem"]["voice"];
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
    <p data-testid="voice-note" style={{ fontSize: 16, color: "#52606d", margin: "8px 0 0" }}>
      {line}
    </p>
  );
  if (!rec.isSupported()) return note(props.text.unsupported);
  if (status === "denied") return note(props.text.denied);
  if (props.off) return note(props.text.off);
  if (status === "talking") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
        <p data-testid="voice-interim" aria-live="polite" style={{ margin: 0, fontSize: 20, color: "#334e68" }}>
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
    <p style={{ margin: "8px 0 0" }}>
      <Button
        kind="primary"
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
  );
}
