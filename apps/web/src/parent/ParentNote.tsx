// The grown-up's research note and trend (指示書 第7.4節, 第6.7節 研究ノート): drawn on the grown-up's screen
// only, from the records already on this device. Core decides every line (researchSummary, readingLine); this
// only lays them out. No answer of a problem and no problem's numbers are shown, and nothing is sent anywhere.
import { useEffect, useState } from "react";
import { initialState, researchSummary, type Lang, type ResearchState } from "@kimi/core";
import { ui } from "../flow/text.ts";
import type { AttemptRow, FlowStore, ResearchLogRow } from "../store/store.ts";
import { trendOf, wordingFreeOf } from "./trend.ts";
import { COLOR, SPACE, TYPE, card, prose } from "../ui/tokens.ts";

/** The notes under each heading: body text in a short line, not small grey type (screen check, 2026-11-08). */
const small = { ...prose, maxWidth: "44em", fontSize: TYPE.small, color: COLOR.ink, margin: `0 0 ${String(SPACE.sm)}px` } as const;
/** Each part of the note is its own card, so the long page reads as blocks. */
export const parentCard = { ...card, margin: `0 0 ${String(SPACE.lg)}px` } as const;
const heading = { fontSize: TYPE.large, margin: `0 0 ${String(SPACE.sm)}px` } as const;
/** "Nothing yet": quieter than the notes. */
const none = { margin: 0, color: COLOR.inkSoft, fontWeight: 700 } as const;

export function ParentNote({ store, lang, reload }: { store: FlowStore; lang: Lang; reload: unknown }) {
  const t = ui(lang).parent;
  const [research, setResearch] = useState<ResearchState>(initialState());
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [log, setLog] = useState<ResearchLogRow[]>([]);
  useEffect(() => {
    let live = true;
    void Promise.all([store.loadResearch(), store.listAttempts(), store.listResearchLog()]).then(([r, a, l]) => {
      if (!live) return;
      setResearch(r);
      setAttempts(a);
      setLog(l);
    });
    return () => {
      live = false;
    };
  }, [store, reload]);

  const summary = researchSummary(research, lang);
  const days = trendOf(attempts, log, lang);
  const wordingFree = wordingFreeOf(attempts, lang, t.wordingUnknown);
  return (
    <>
      <div data-testid="research-note" style={parentCard}>
        <h3 style={heading}>{t.researchTitle}</h3>
        {t.researchLines.map((l) => (
          <p key={l} style={small}>
            {l}
          </p>
        ))}
        {summary.entries.length === 0 ? (
          <p style={none}>{t.researchNone}</p>
        ) : (
          <ul>
            {summary.entries.map((e) => (
              <li key={e.id} data-testid="research-entry">
                {t.entry(e.line, t.status[e.status], e.backing, summary.counted)}
              </li>
            ))}
          </ul>
        )}
        {summary.unsettled && <p>{t.researchUnsettled}</p>}
      </div>
      <div data-testid="research-trend" style={parentCard}>
        <h3 style={heading}>{t.trendTitle}</h3>
        {days.length === 0 ? (
          <p style={none}>{t.trendNone}</p>
        ) : (
          <ul>
            {days.map((d) => (
              <li key={d.date} data-testid="trend-day">
                {t.trendRow(d.date, d.solved, d.held, d.fixes)}
                {(d.settled.length > 0 || d.backToGuess.length > 0 || d.dropped.length > 0) && (
                  <ul>
                    {d.settled.map((l) => (
                      <li key={`s-${l}`}>{t.trendSettled(l)}</li>
                    ))}
                    {d.backToGuess.map((l) => (
                      <li key={`b-${l}`}>{t.trendBack(l)}</li>
                    ))}
                    {d.dropped.map((l) => (
                      <li key={`d-${l}`}>{t.trendDropped(l)}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        <p style={small}>{t.trendNote}</p>
      </div>
      <div data-testid="wording-note" style={parentCard}>
        <h3 style={heading}>{t.wordingTitle}</h3>
        {t.wordingLines.map((l) => (
          <p key={l} style={small}>
            {l}
          </p>
        ))}
        {wordingFree.length === 0 ? (
          <p style={none}>{t.wordingNone}</p>
        ) : (
          <ul>
            {wordingFree.map((w) => (
              <li key={w.key} data-testid="wording-entry">
                {t.wordingRow(w.date, w.line)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
