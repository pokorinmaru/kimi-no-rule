// The grown-up's research note and trend (指示書 第7.4節, 第6.7節 研究ノート): drawn on the grown-up's screen
// only, from the records already on this device. Core decides every line (researchSummary, readingLine); this
// only lays them out. No answer of a problem and no problem's numbers are shown, and nothing is sent anywhere.
import { useEffect, useState } from "react";
import { initialState, researchSummary, type Lang, type ResearchState } from "@kimi/core";
import { ui } from "../flow/text.ts";
import type { AttemptRow, FlowStore, ResearchLogRow } from "../store/store.ts";
import { trendOf, wordingFreeOf } from "./trend.ts";

const small = { fontSize: 16 } as const;

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
      <div data-testid="research-note">
        <h3 style={{ fontSize: 20 }}>{t.researchTitle}</h3>
        {t.researchLines.map((l) => (
          <p key={l} style={small}>
            {l}
          </p>
        ))}
        {summary.entries.length === 0 ? (
          <p>{t.researchNone}</p>
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
      <div data-testid="research-trend">
        <h3 style={{ fontSize: 20 }}>{t.trendTitle}</h3>
        {days.length === 0 ? (
          <p>{t.trendNone}</p>
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
      <div data-testid="wording-note">
        <h3 style={{ fontSize: 20 }}>{t.wordingTitle}</h3>
        {t.wordingLines.map((l) => (
          <p key={l} style={small}>
            {l}
          </p>
        ))}
        {wordingFree.length === 0 ? (
          <p>{t.wordingNone}</p>
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
