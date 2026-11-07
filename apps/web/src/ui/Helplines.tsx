// The places a child can call, on the 「つらい」 screen (BLOCKED B2: the names, numbers and hours were checked by a
// person against each operator's page; they are flow/text.ts HELPLINES as they are). One card per line: the name
// (with furigana), the number big enough to tap and call, and the hours on their own line.
import type { Lang } from "@kimi/core";
import type { HelplineText } from "../flow/text.ts";
import { RubyText } from "./Ruby.tsx";
import {
  BORDER,
  COLOR,
  RADIUS,
  SHADOW,
  SPACE,
  TYPE,
  card,
  prose,
} from "./tokens.ts";

export function Helplines({
  helpline,
  lang,
  furigana,
}: {
  helpline: HelplineText;
  lang: Lang;
  furigana: boolean;
}) {
  const ruby = furigana && lang === "ja";
  return (
    <section aria-labelledby="helplines-title" style={{ marginTop: SPACE.xl }}>
      <h2
        id="helplines-title"
        style={{ fontSize: TYPE.large, margin: `0 0 ${String(SPACE.sm)}px` }}
      >
        <RubyText text={helpline.title} on={ruby} />
      </h2>
      <p style={{ ...prose, margin: `0 0 ${String(SPACE.md)}px` }}>
        <RubyText text={helpline.pending} on={ruby} />
      </p>
      {helpline.note !== null && (
        <p style={{ ...prose, margin: `0 0 ${String(SPACE.md)}px` }}>
          {helpline.note}
        </p>
      )}
      <ul
        data-testid="helplines"
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "grid",
          gap: SPACE.md,
        }}
      >
        {helpline.entries.map((h) => (
          <li
            key={h.number}
            data-role="helpline"
            style={{
              ...card,
              padding: `${String(SPACE.md)}px ${String(SPACE.lg)}px`,
            }}
          >
            <p style={{ margin: 0, fontWeight: 700, fontSize: TYPE.body }}>
              <RubyText text={h.name} on={ruby} />
              {h.about !== undefined && (
                <span style={{ fontWeight: 400 }}>{` (${h.about})`}</span>
              )}
            </p>
            <a
              href={`tel:${h.number.replace(/-/g, "")}`}
              data-testid="helpline-number"
              style={{
                display: "inline-block",
                margin: `${String(SPACE.sm)}px 0`,
                padding: `${String(SPACE.xs)}px ${String(SPACE.lg)}px`,
                minHeight: 48,
                fontSize: TYPE.title,
                fontWeight: 700,
                letterSpacing: "0.04em",
                color: COLOR.ink,
                textDecoration: "none",
                background: COLOR.surfaceSoft,
                border: `${String(BORDER.width)}px solid ${COLOR.outline}`,
                borderRadius: RADIUS.md,
                boxShadow: SHADOW.buttonPressed,
              }}
            >
              {h.number}
            </a>
            <p
              style={{
                ...prose,
                margin: 0,
                fontSize: TYPE.small,
                color: COLOR.inkSoft,
              }}
            >
              <RubyText text={h.when} on={ruby} />
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
