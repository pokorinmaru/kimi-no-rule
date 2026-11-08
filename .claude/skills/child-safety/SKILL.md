---
name: child-safety
description: 子どもに見える文言・画面・発話・記録に触れるとき、関門や safety_flag を扱うときに読む。どの約束をどこで守っているか、後輩の言葉の関門、変えた後に回すテストと評価。
---

# child-safety

子どもの安全の手引き。参照は指示書 第1節・第5.5節・第6.8節・第9節。決めた経緯は QUESTIONS.md の Q20・Q23・Q24・Q26・Q30・Q32・Q37・Q47・Q51・Q58。

## 約束と、守っている場所

- **答えと演算を先に出さない**：`packages/core/src/gates/index.ts` の `gate()`。`say` は隠す値（答えと、問題に書かれていない途中の値）を `numbersIn` で探して `answer_leak`、演算の名前と記号を `operation_name` で断る。`show_world` で描いてよいのは、正しい世界に与えられた値と子ども自身が口にした値に限られ、聞かれている値は「？」のまま（`question_not_hidden`）。`show_statements`・`show_correct_world` は子どもの解釈を記録し予測に答えるまで `too_early`。正しい世界が1つの答えに解けなければ全部 `unverified`。
- **学年は下げてよい**（Q62、ユーザーの決定）：つまずいた所まで戻って確かめられるように、`gate()` の `switch_problem` は学年で断らない。
- **読み方を子どもに帰属させない**：`apps/web/src/flow/text.ts` の `FORBIDDEN_CHILD_PHRASES` と `hasForbiddenPhrase`（全角・ゼロ幅・空白をそろえてから照らす。Q37）。子どもの画面の見出しに作品名を出さない（Q30）。保護者の画面でも「正しい」と見立ての言葉を使わない（Q37）。
- **後輩は教えない**：`packages/interpret/src/kohai.ts`。意図は `read`・`which`・`restate` の3つだけ。生成器には正しい世界・正誤・研究の仮説・子どもの発話を渡さない。worker の `/kohai` は正しい世界を画面から受け取らず銀行から引き、後輩の世界が正しい世界と同じなら 400（`apps/worker/src/app.ts`）。
- **助けを求める声は算数より優先**：`packages/interpret/src/safety.ts` の `checkSafety`。端末の辞書 `DISTRESS_WORDS` が下限で、Claude が none でも辞書に当たれば distress（Q24）。Claude の refusal も distress。Claude が答えず辞書にも無ければ none でなく `unchecked`（Q26）。
- **いつでも止められる**：`apps/web/src/ui/controls.tsx` の `AlwaysNav`（やめる／わからない、下に固定。「つらい」ボタンは無い、Q64）。`apps/web/src/flow/machine.ts` の `STOP` と `SAFETY_RESULT`：子どもの言葉が distress なら `hard`（相談の画面。ボタンからは開かない）、unchecked は札を目立たせ、2回続くと `rest`。「つらい」の画面の窓口は Q32。決まった言い方だけの発話は Claude に送らず端末で止める（Q47）。
- **記録は端末だけ**：`apps/web/src/store/store.ts`（Dexie）。解釈は core の `redactInterpretation`（`packages/core/src/redact`）を通し、`hasChildText` が残りを見つけたら保存せず投げる。子どもが付けた名前も消す（Q23）。関門の行と安全の行は種類と日時だけ。`deleteAll` で全部消せる。
- **サーバーは保存もログもしない**：`apps/worker/src/app.ts` に logger は無く、本文に上限、エラーは詳細なし。`/interpret` も redact した ops だけ返す。キーが無ければ 503 で、画面は定型文と端末の判定に戻る。
- **実在の子どもの情報を書かない**：テストと評価データは作った例だけ。`.claude/hooks/pre-write-guard.mjs` が個人情報らしき文字列を止める（公的な窓口の番号だけ許す。Q32）。

## 後輩の言葉の関門

- `kohaiGates()` の種類：`answer_leak`・`relation_word`・`operation_name`・`judging`・`feeling`・`mind`・`attribution`・`off_topic`・`refers_to`・`length`・`intent_shape`。
- 数は許す一覧の方式：問題文・文・子どもが言った言葉に出る数だけ（Q24）。その上に core の `gate()` も重ねる。`restate` 以外では「1」の札も止める。
- 関係の数（3/4 など）は、どの書き方でも `read`・`which` の生成文に出さない（`saysNoFigure`。Q51）。「長い・短い」は後輩の世界の長さと合う時だけ。漢字は問題文と名前と `COMMON_KANJI` だけ、40字・2文まで。
- 通らない・時間切れ・形が違う時は `kohai()` が `templateFor` の定型文に落とし、断った種類だけ返す（文は残さない）。画面側も `acceptGenerated` で `hasForbiddenPhrase` と `gate()` をもう一度通し、だめなら定型文のまま。
- 答え漏れの読み取り：`numbersIn` は算用数字・全角・漢数字・分数（a/b、b分のa、帯分数）・小数・%・割・半分・英語の数詞に加え、ひらがな・カタカナの読み（`kanaToDigits`：はち、やっつ、はっぴき、さんぶんのに）も数にする（Q20）。せんぱい・いちばん等は数にしない。読みすぎは関門を厳しくするだけなので、子どもの言葉を集める用途には使わない。
- 見えている形の数（丸ごと＋かけら）も隠す値と比べる（Q58、`packages/core/src/stage`）。

## 変えたら回すもの

- `packages/core/src/gates/gates.test.ts`・`numbers.test.ts`、`packages/core/src/redact/redact.test.ts`
- `packages/interpret/src/kohai-gates.test.ts`（関門ごとに止める例と通す例）・`kohai-safety.test.ts`（安全レビューで見つけた抜け道）・`kohai.test.ts`・`safety.test.ts`
- `apps/web/src/flow/machine.test.ts`（全画面の最短経路に禁止の言い方と数が無いこと）、`apps/worker/src/app.test.ts`（どの経路もコンソールに書かない）
- 評価：`tools/evals/src/kohai-eval.ts`（後輩の言葉の漏れの比べ）と `leak-judge.ts`（Haiku の第二の判定。数えるだけで表示は決めない）、`safety-eval.ts`。`pnpm eval`、本物の Claude は `pnpm eval:live`（eval-runner サブエージェント）。
- 子どもに見える差分は、reviewer に加えて safety-reviewer サブエージェント（`.claude/agents/safety-reviewer.md`）に通す。
