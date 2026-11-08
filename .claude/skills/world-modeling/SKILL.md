---
name: world-modeling
description: 文章題を world-scene（世界）として表す・直す・検証するときに使う。要素と id の規則、時間の扱い、solve/apply/statements での確かめ方、問題の記録と銀行、Opus の組み立て、一致型と不一致型の対。
---

# world-modeling

文章題を世界の構造に落とす時の手引き。参照は指示書 第5節・第6.6節・第12.2節。世界を解く・確かめる処理は `packages/core` にしか置かない。

## 世界の形（`packages/core/src/schema/world-scene.ts`、schema_version "3"）

- 要素は5種類で、id の接頭辞が決まっている（`schema/common.ts` の `PREFIX`）：持ち主 `h_`、物の種類 `k_`（noun・counter・countable）、数量 `q_`（holder・item_kind・at_event・value）、関係 `r_`、出来事 `e_`。`validateWorld`（`schema/semantic.ts`）が重複・接頭辞・参照先の種類・分母を確かめる。
- 関係の operator は more_by・less_by・times・fraction_of・same_as・total_of（reference_list）・per・other。subject が文の話題の数量、reference が比べる相手。倍は subject = amount × reference。向きを裏返した世界は解けば同じ数でも別の組み立て（Q25）。
- 数は有理数 `{num, den}`。計算は `rational/index.ts`（bigint の `rat`・`add`・`div`・`eq`・`isInteger`、スキーマとの変換は `fromSchema`/`toSchema`）。
- 問いは `question`（target_type が quantity・relation_amount・event_amount）。聞かれている数量の value は null にする。problem_type は compare・change・combine・ratio・rate・other。
- 子どもの操作で足す要素は仮の id `n_1`〜`n_5`（`TEMP_IDS`）。`apply` が `h_new1` のような本物の id に付け直し、対応を `idMap` に返す（`apply/index.ts` の `freshId`）。null の new_id は Q7。

## 時間

- 出来事は gain・lose・move（move は to_holder 必須）。持ち主×物の種類ごとに、order（同じなら id）の順で時系列を作る（`solve/index.ts` の `buildSystem`）。
- 数量の at_event が null なら最初の時点、出来事を指せばその出来事の後の時点。触れていない出来事は量を null にして時点としてだけ残す（Q13）。

## 検証の道具

- `solve(world)`（`solve/index.ts`）：unique（全値と、負・数えられる物の非整数の `impossible`）／underdetermined／contradiction（`minimalSets`、全部の最小の矛盾の組、制約が20を超えると探さない）／nonlinear。最小の組の確かめ方は Q9。
- `withoutConstraints(world, ids)`：関係を外し、与えた数と出来事の量を未知にした写し。矛盾を解く時に使う（Q14・Q17）。
- `apply`（`apply/index.ts`）：正しい世界と子どもの操作から、判定用・描画用・照合用の3つの世界を作る（Q10〜Q12・Q15・Q17）。
- `checkStatements`（`statements/index.ts`）：文ごとに holds・fails・undetermined・different_question・jointly_unsatisfiable。聞かれている関係は量を使わず向きと種類だけ照合する（Q21）。
- `canonicalWorld`・`sameBuild`・`sameStructure`（`world/canonical.ts`）と `sameWorld`（`world/same-world.ts`）：2つの組み立てを id に関係なく比べる。
- `problemConditions`（`diagnose/conditions.ts`）：解が一つで起こりうる、`misreadCandidates`（反転は operator_swap・invert_amount・swap_ends・event_type、same_as の入れ替えは除く Q18）が1つ以上あり、各候補が答えを変え、どれかの文を崩す。

## 問題の記録と置き場所

- 形は `schema/problem-record.ts`：world・consistency（consistent／inconsistent）・pair_id（対のもう一方の id）・source・checks・expected_answer・statements（文ごとの element_ids と tokens）・syntax_marks。
- 用意した問題は `packages/core/fixtures/problems/`：看板の問題 `signboard.ts`（正しい世界と2つの読み違い、同じ id を共有）と `signboard-record.ts`、全型の一致型・不一致型の対 `provisional.ts`、分数の倍の銀行 `FRACTION_BANK`（`fraction-bank.ts`）、ふりがな `readings.ts`。
- Opus が作った問題は `content/problems/discriminating/`・`content/problems/transfer/` の JSON。`acceptStored`（`problems/stored.ts`）が core の検査を通るものだけ残す。
- `checks.human_checked` は人が確かめた印。作った問題はいつも false で、子どもの流れは true だけを使う（`apps/web/src/flow/bank.ts` の `bankFor`、Q42・Q48）。

## Opus が組み立てる経路（`packages/interpret/src/build.ts`）

- `buildProblem`：`buildOnce` を2回独立に回し `sameBuild` で比べる → `restate` の言い直しを判定 → 文の一覧 → `problemConditions` → 誤読への耐性（見分ける問題では記録だけ、Q44）。
- エージェントの道具は `BUILD_TOOLS` の solve・diagnose_candidates・restate・submit_world。世界は JSON 文字列 `world_json` で渡し zod と core で確かめる（Q27）。submit_world は条件の失敗の理由を返して断り、Opus が直して出し直す。3回断られたら打ち切り（Q25）。

## 足す手順と回すテスト

1. 問題文はリポジトリ用に書き、世界・文・印を fixtures に足す（または `pnpm build:problems`・`pnpm make:discriminating`・`pnpm make:transfer` で Opus に作らせる）。一致型と不一致型は pair_id で対にする。
2. `pnpm --filter @kimi/core test`（`schema/*.test.ts`・`solve`・`apply`・`statements`・`problems/*.test.ts`）。保存した問題は `pnpm check:discriminating`・`pnpm check:transfer`。
3. 描く入れ物と舞台の絵も変わるので、visual-grammar スキルの確かめ方も回す。最後に `pnpm test`。
