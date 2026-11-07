---
name: visual-grammar
description: 世界の絵（舞台の絵とテープ図）を描く・動かす・直す時に読む。何を描いて何を隠すか、部品の約束事、確かめ方。
---

# visual-grammar

描画の手引き。参照は指示書 第8節・第12.2節。決めた経緯は QUESTIONS.md の Q57。

## 2つの層

- **舞台の絵**（`apps/web/src/draw/ObjectScene.tsx`、配置は `stage-layout.ts`）：問題の物を1つずつ描く。何を描くかは core の `objectScene`（`packages/core/src/stage`）が決め、画面は計算しない。
- **テープ図**（`WorldView.tsx`、`layout.ts`）：その下に置く抽象の層。

## 何を描き、何を隠すか

- 間違った世界は、その世界の値どおりに物を描く。配りきれない分は切れたかけら（生き物も切る。魚は頭の側を残す）。
- 正しい世界の答えと途中の値（1区切り）は、子どもが言うまで描かない。間違った世界の値がそれと同じになる時も描かない（`objectScene` の関門）。
- 正しい世界では、聞かれている人は「？」、皿は子どもが1区切りを言ってから。

## 形

- 持ち主ごとに枠を分け、名札と問題文の名前を同じ色にする（`holder-colors.ts`。色だけに頼らず下線も）。
- 「1」の人の物を分母の数の皿に配り、もう一人は分子の数の皿。配った後は入れ物を描かない。配らない時は入れ物の中に、2人で同じ大きさ・同じ左端の格子で並べる。
- 物は皿の内側の楕円の上に立つ。1皿に3つまでなら物は56px以上、それより多ければ40px以上。どこでも26px未満にしない。

## 部品

- 約束事は `apps/web/src/draw/assets/spec.ts`（viewBox、パレット、入れ物の back/front の層、物と入れ物の対応、MAX_THINGS）。
- 部品は Claude Opus が描く（`tools/asset-builder` の `pnpm make:parts`）。部品の検査（`spec-check.ts`）を通ったものだけを使う。
- 部品の実際の大きさの表（`PART_NARROW`、`PART_BOX`、`CONTAINER_INNER_OF`）は、`apps/web/e2e/parts.spec.ts` が本物の部品をブラウザで測って確かめる。部品を描き直したら e2e を回す。
- 入れ物は問題と計算から決める（`assets/premise.test.ts` が銀行の全問題・全部の世界で確かめる）。中に数えられそうな飾りを描かない。

## 動き

- 物が入れ物から皿へ移る配りの動き（Web Animations、`motion-tokens.ts`）。動きを減らす設定では動かさず、最後の絵は同じ。

## 確かめ方

- 大人用の `#/stages` に全場面が並ぶ。`pnpm --filter @kimi/asset-builder check:scenes` が全場面をブラウザで描き、重なり・大きさ・はみ出しをプログラムで、問題との合い方・数えやすさ・おかしさの見え方・可愛さを Opus で確かめる。
