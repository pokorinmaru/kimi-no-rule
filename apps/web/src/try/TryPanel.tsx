// 「中身を見る」 beside the flow on the adults' try route (指示書 第6.9節, 第6.7節 研究ノート). It draws researchNote
// only: the pool and its weights, why the problem on screen was chosen with each hypothesis's predicted world
// (the sentence's own world waits until the adult has answered; the asked value stays "？"), the observations,
// the junior's reading and where it came from, the gate's rejections (kinds only) and the scenes' source.
// For adults; it is never mounted on the child's route.
import type { CSSProperties } from "react";
import { WorldView } from "../draw/WorldView.tsx";
import type { NoteView } from "./note.ts";

const box: CSSProperties = { border: "1px solid #cbd2d9", borderRadius: 10, padding: "8px 12px", margin: "0 0 12px", background: "#fff" };
const h3: CSSProperties = { fontSize: 16, margin: "0 0 6px" };
const small: CSSProperties = { fontSize: 14, color: "#52606d", margin: "4px 0" };

const PREDICTION: Record<string, string> = { fits: "ぴったり", odd: "へん", unknown: "まだわからない" };
const OUTCOME: Record<string, string> = { solved: "解いた", held: "あとで", stopped: "やめた", hard: "つらい", rest: "休む", open: "解いている" };
const SOURCE: Record<string, string> = {
  mirror: "鏡（仮説プールの上位の読み方）",
  competitor: "競合（その型でよくある別の読み違い）",
  taught: "教わった読み方（子どもが直したルールカード）",
};

const pct = (w: number): string => `${(w * 100).toFixed(0)}%`;

function Bar({ weight }: { weight: number }) {
  return (
    <div aria-hidden="true" style={{ height: 10, background: "#e4e7eb", borderRadius: 5, overflow: "hidden" }}>
      <div style={{ width: pct(Math.max(0, Math.min(1, weight))), height: "100%", background: "#3e7cb1" }} />
    </div>
  );
}

export function TryPanel({ note }: { note: NoteView | null }) {
  return (
    <aside aria-label="中身を見る（大人向け）" data-testid="research-note" style={{ fontSize: 15, lineHeight: 1.5, color: "#1f2933" }}>
      <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>中身を見る（研究ノート）</h2>
      {note === null ? (
        <p style={small}>流れが始まると、ここに出ます。</p>
      ) : (
        <>
          <section style={box} aria-label="仮説と重み">
            <h3 style={h3}>仮説と重み</h3>
            {note.pool.length === 0 ? (
              <p style={small}>まだ仮説はありません（1問目の「1」の置き方から作ります）。</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
                {note.pool.map((h) => (
                  <li key={h.id} data-testid="note-hypothesis" data-hypothesis={h.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span>
                        {h.line}
                        {h.status === "confirmed" ? "（今のところの読み方）" : ""}
                      </span>
                      <span data-testid="note-weight">{h.weight.toFixed(3)}</span>
                    </div>
                    <Bar weight={h.weight} />
                    <p style={small}>
                      {h.id}・予測が分かれる問題での観測 {String(h.splitObservations)}
                    </p>
                  </li>
                ))}
                <li data-testid="note-other">
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>その他（書けない読み方）</span>
                    <span>{note.other.toFixed(3)}</span>
                  </div>
                  <Bar weight={note.other} />
                </li>
              </ul>
            )}
            <p style={small}>
              数えた読み：{String(note.readings)}（うち仮説の前の読み {String(note.unscored)}）
              {note.unexpressible ? "・「その他」が最も重い：今のところ読み方は定まりません" : ""}
            </p>
          </section>

          <section style={box} aria-label="この問題を選んだ理由" data-testid="note-choice">
            <h3 style={h3}>この問題を選んだ理由</h3>
            {note.choice === null && <p style={small}>問題はまだ開いていません。</p>}
            {note.choice?.kind === "first" && <p>最初の問題は決まっています（{note.choice.problemId}）。</p>}
            {note.choice?.kind === "bank_order" && <p>見分ける問題が無いので、銀行の順に出しました（{note.choice.problemId}）。</p>}
            {note.choice?.kind === "transfer" && (
              <p data-testid="note-transfer">
                転移の問題：{note.choice.fixedProblemId} で後輩の『{note.choice.oldReadingLine}』が直ったので、その読み方では合わなくなる問題を
                {note.choice.wording === "different" ? "別の言い回し" : "同じ言い回し"}で出しました（{note.choice.problemId}）。別の言い回しで、最初の「1」が文のとおりに置かれて解けた時だけ、保護者の画面に「ことばに頼らない読み方」として残ります。
              </p>
            )}
            {note.choice?.kind === "chosen" && (
              <>
                <p>
                  見分け問題：core の chooseNext が、仮説どうしの予測が最もよく分かれる問題として選びました（{note.choice.problemId}、期待される情報量{" "}
                  <span data-testid="note-gain">{note.choice.gain.toFixed(3)}</span> ビット）。
                </p>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
                  {note.choice.predictions.map((p) => (
                    <li key={p.hypothesisId} data-testid="note-prediction" style={{ borderTop: "1px solid #e4e7eb", paddingTop: 6 }}>
                      <p style={{ margin: 0 }}>
                        {p.line} → 世界{p.label}
                        {p.correct ? "（文のとおりの世界）" : ""}
                      </p>
                      {p.world !== null ? (
                        <div style={{ maxWidth: 260 }}>
                          <WorldView world={p.world} label={`世界${p.label}`} lang="ja" reducedMotion />
                        </div>
                      ) : (
                        <p style={small} data-testid="note-hidden">
                          {p.hiddenReason === "too_early" ? "？（大人がこの問題に答えるまで見せません）" : "？（core が描くのを断りました）"}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
                <p style={small}>聞かれている数は、どの世界でも「？」のままです。</p>
              </>
            )}
          </section>

          <section style={box} aria-label="観測">
            <h3 style={h3}>観測（予測と最初の「1」）</h3>
            {note.observations.length === 0 ? (
              <p style={small}>まだありません。</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {note.observations.map((o) => (
                  <li key={o.problemId} data-testid="note-observation">
                    {o.problemId}：予測 {o.prediction === null ? "—" : PREDICTION[o.prediction]}・「1」は{o.placedOn}・{OUTCOME[o.outcome]}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={box} aria-label="後輩の読み方" data-testid="note-junior">
            <h3 style={h3}>後輩の読み方（子どもの画面には出しません）</h3>
            {note.junior === null ? (
              <p style={small}>問題が開いていません。</p>
            ) : (
              <>
                <p style={{ margin: 0 }}>{note.junior.line}</p>
                <p style={small}>由来：{SOURCE[note.junior.source]}</p>
                <p style={small}>
                  このセッションの読み違い：{note.junior.sessionMisreadId ?? "—"}
                  {note.junior.locked ? "（研究の後で固定）" : "（仮）"}
                </p>
              </>
            )}
          </section>

          <section style={box} aria-label="関門が止めたもの" data-testid="note-gate">
            <h3 style={h3}>関門が止めた後輩の言葉（種類と回数だけ）</h3>
            {note.gate.length === 0 ? (
              <p style={small}>まだありません。</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {note.gate.map((g) => (
                  <li key={g.kind}>
                    {g.kind}：{String(g.count)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={box} aria-label="身近な場面" data-testid="note-scenes">
            <h3 style={h3}>身近な場面の出どころ</h3>
            <p style={small}>
              {note.scenes === null
                ? "ルールカードの画面で作ります。"
                : note.scenes.source === "claude"
                  ? `Opus が選び、core が確かめた場面（${note.scenes.focusId}）`
                  : `プログラムが探した場面（${note.scenes.focusId}）`}
            </p>
          </section>
        </>
      )}
    </aside>
  );
}
