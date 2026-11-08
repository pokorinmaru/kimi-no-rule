---
name: reading-rules
description: 読み方のルール（子どもの読み方の仮説、記述言語、runRule）を書く・読む・確かめる時、仮説の重みや見分ける問題に触れる時に読む。ルールの形、よくある読み違いの一覧の場所、足す手順と回すテスト。
---

# reading-rules

子どもの読み方の仮説をルールとして書く時の手引き。参照は指示書 第5.8節・第6.7節・第12.2節。決めた経緯は QUESTIONS.md の Q22（rules）、Q28（研究層）、Q38（ルールカード）、Q42・Q44（見分ける問題）、Q43（床）、Q45（裏で続ける）。

## ルールの形（`packages/core/src/schema/reading-rule.ts`）

- `readingRule` は `schema_version: "2"`、`hypotheses`（1〜5個）、`unexpressible`（表せない読み方の大人向けメモ）。
- 1つの仮説は `id`・`origin`（math / japanese_reading / first_language）・`clauses`（`when` 条件と `then` 動作の組、1つ以上）・`word_cues`・`note_for_adult`。
- 条件は `and` / `or`（2つ以上）/ `not` と述語（`PREDICATES`：relation_operator_is、ratio_kind_is、word_after_holder、reference_is、numbers_compare など）。関係にしか使えない述語は、not で包んでも出来事では成り立たない。
- 動作は choose_reference（位置か、言葉の前後の持ち主）、swap_reference、set_relation_type_additive、number_op（divide_large_by_small / multiply_always / divide_always / percent_as_count）、invert_ratio、flip_event、misread_question、no_change。
- 実例（`packages/core/src/research/common.ts`、どれも条件は `true` の1節）：
  - `c_known_whole`：`{ action: "choose_reference", by: "known_value" }`。数が分かっている持ち主を1とみる。この型ではいつもかける読みと同じ世界になるので一覧では1つ（Q28）。
  - `c_additive`：`{ action: "set_relation_type_additive", amount: "numerator" }`。分子を差として読む（足し算・引き算に読む）。
- テストで手書きする時は `packages/core/src/rules/test-rules.ts` の `p`・`and`・`not`・`act`・`hyp`・`always`・`H` を使う。

## 実行と比べ方（`packages/core/src/rules`）

- `runRule(h, record)`（`run.ts`）：正しい世界の関係・出来事を1つずつ見て、節を上から試し、合った節の動作を1回だけ当てる。その動作が使えない要素は元のまま（下の節は試さない）。`validateWorld` と `solve` を通らない結果は捨てる。返すのは後輩の世界（WorldScene）。`firedClauses` はカード用に働いた節の番号を返す。
- `sameReading`（`same-reading.ts`）：同じ世界で、子どもが「1」の札を置いた時は reference も同じ。
- `predict`（`predict.ts`）：仮説ごとの世界と、子どもが作りうる世界の集合 W（正しい世界＋`diagnose/candidates.ts` の `misreadCandidates`）。各世界の文の成否は `checkStatements`。
- `reproduction` / `scoreRule` / `groupHypotheses`（`score.ts`）：子どもの最初の読みを再現するか。全問題で同じ世界を作る仮説は1つにまとめる。

## 重みと次の問題（`packages/core/src/rules/weights.ts`、`packages/core/src/research/index.ts`）

- 尤度は `constructiveLikelihoods`（自分の世界に 1−ε、ε=0.1）と `agreementLikelihoods`（ぴったり／へん、ε=0.2）。「その他」も重みを持ち、最も重い時は表せない読み方として確定しない。
- 確定は `CONFIRM_WEIGHT` 0.8 以上かつ予測が分かれた問題での観測2回、0.5 未満で仮説に戻る。直した後・絵本を開いた後の読みは数えない（`countsAsObservation`）。
- 次の問題は `chooseNext`：銀行の各問題で `infoGain`（「その他」を除いた期待情報量）が最大のもの。`GAIN_THRESHOLD` 0.05 未満なら選ばない。

## Claude の仮説は core で確かめてから使う

- 研究エージェント（`packages/interpret/src/research.ts` の `writeHypotheses`）の道具は core の関数（run_rule、score_rule、predict、info_gain、submit_pool）。出した仮説は `revisePool` がスキーマ・実行・重複・上限5で確かめ、`leakOf` が子どもの言葉や問題文に無い語を含む仮説を断る。
- その後 `ensurePool` が、これまでの読みを再現するよくある読み違いを残し、候補を2つ以上にする（Q43）。直した仮説は「その他」の半分から始める。
- 見分ける問題（`packages/interpret/src/discriminate.ts`、`pnpm make:discriminating`）：Opus が書いた問題文を組み立ての全手順に通し、`splitsPair`（core の predict）で2つの読みが別の世界になる時だけ残す。`human_checked` は false のまま、CI で `pnpm check:discriminating`。

## 一覧の場所と、新しい読み方を足す手順

- よくある読み違いは `COMMON_FRACTION_READINGS`（`research/common.ts`、正しい読み `c_correct` を含む7つ）。ルールカードの選択肢は `research/card-rules.ts` の `CARD_RULE_IDS`。
- `common.ts` と `tools/evals/src/research-children.ts` は `evals/protocol-addendum-2.lock` で凍結している。書き換えると `tools/evals/src/locks.test.ts` と `pnpm check:protocol` が落ちる。一覧を変える時は新しい追補と lock を作る。
- 足す手順：動作や述語が足りなければ `reading-rule.ts` と `run.ts` の両方に足す → `run.test.ts` に実例のテストを先に書く → `pnpm test`（`judge-problems.test.ts` が一覧の読みどうしが同じ世界にならないことを確かめる）→ 研究の評価 `pnpm eval`（本物の Claude は `pnpm eval:live`）。

## 子どもに帰属させない

- ルールは仮説で、子どもの読み方だとは言わない。カードの1行（`readingCard`・`cardSlot`）と大人向けの `readingLine` はプログラムが決まった言い方で作り、`note_for_adult` は見せない。`card.test.ts` の `BANNED_JA` が「君」「あなた」や演算の名前を止め、後輩の言葉は `interpret/src/kohai.ts` の `ATTRIBUTION` が止める。
