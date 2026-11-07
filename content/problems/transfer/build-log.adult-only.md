# 転移の問題の組み立ての記録（大人向け：答えが書いてあります。子どもに見せないこと）

## c_swap・同じ言い回し（直した問題：p_fraction_c）

### p_transfer_c_swap_same_1

- ✓ build_a / solve: {"kind":"unique","values":{"q_big":"12/1","q_small":"8/1","r_frac":"2/3"},"impossible":[]}
- ✓ build_a / diagnose_candidates: 1 candidates
- ✓ build_a / restate: 大きい水そうの水は12L。 小さい水そうの水は、大きい水そうの水の2/3。 小さい水そうの水は何Lですか。
- ✓ build_a / submit_world: accepted
- ✓ build_b / solve: {"kind":"unique","values":{"q_big":"12/1","q_small":"8/1","r_frac":"2/3"},"impossible":[]}
- ✓ build_b / diagnose_candidates: 1 candidates
- ✓ build_b / restate: 大きい水そうの水は12L。 小さい水そうの水は、大きい水そうの水の2/3。 小さい水そうの水は何Lですか。
- ✓ build_b / submit_world: accepted
- ✓ double_build: the two builds agree
- ✓ restate: 大きい水そうの水は12L。 小さい水そうの水は、大きい水そうの水の2/3。 小さい水そうの水は何Lですか。
- ✓ statements: 3 sentences, 8 marks
- ✓ conditions: met
- ✓ misread: 15/20
- ✓ adopt: p_transfer_c_swap_same_1
- ✓ adopt: c_swap builds a world other than the correct one; wording same

問題の文：大きい水そうの水は12Lです。小さい水そうの水は、大きい水そうの水の2/3です。小さい水そうの水は何Lですか。
採用（人の確認待ち）。答え：8/1。誤読への耐性（記録）：0.75

## c_swap・別の言い回し（直した問題：p_fraction_c）

### p_transfer_c_swap_different_1

- ✓ build_a / solve: {"kind":"unique","values":{"q_blue":"15/1","q_red":"6/1","r_frac":"2/5"},"impossible":[]}
- ✓ build_a / diagnose_candidates: 1 candidates
- ✓ build_a / restate: 赤いバケツの水は6L。 赤いバケツの水は、青いバケツの水の2/5。 青いバケツの水は何Lですか。
- ✓ build_a / submit_world: accepted
- ✓ build_b / solve: {"kind":"unique","values":{"q_blue":"15/1","q_red":"6/1","r_frac":"2/5"},"impossible":[]}
- ✓ build_b / diagnose_candidates: 1 candidates
- ✓ build_b / restate: 赤いバケツの水は6L。 赤いバケツの水は、青いバケツの水の2/5。 青いバケツの水は何Lですか。
- ✓ build_b / submit_world: accepted
- ✓ double_build: the two builds agree
- ✓ restate: 赤いバケツの水は6L。 赤いバケツの水は、青いバケツの水の2/5。 青いバケツの水は何Lですか。
- ✓ statements: 3 sentences, 9 marks
- ✓ conditions: met
- ✓ misread: 14/20
- ✓ adopt: p_transfer_c_swap_different_1
- ✓ adopt: c_swap builds a world other than the correct one; wording different

問題の文：青いバケツの水の量を1とみると、赤いバケツの水の量は2/5にあたります。赤いバケツの水は6Lです。青いバケツの水は何Lですか。
採用（人の確認待ち）。答え：15/1。誤読への耐性（記録）：0.7

## c_known_whole・同じ言い回し（直した問題：p_signboard）

### p_transfer_c_known_whole_same_1

- ✓ build_a / solve: {"kind":"unique","values":{"q_grandma":"12/1","q_mother":"16/1","r_frac":"3/4"},"impossible":[]}
- ✓ build_a / diagnose_candidates: 1 candidates
- ✓ build_a / restate: 祖母のいちごは12こ。 祖母のいちごは、母のいちごの3/4。 母のいちごは何こですか。
- ✓ build_a / submit_world: accepted
- ✓ build_b / solve: {"kind":"unique","values":{"q_haha":"16/1","q_sobo":"12/1","r_frac":"3/4"},"impossible":[]}
- ✓ build_b / diagnose_candidates: 1 candidates
- ✓ build_b / restate: 祖母のいちごは12こ。 祖母のいちごは、母のいちごの3/4。 母のいちごは何こですか。
- ✓ build_b / submit_world: accepted
- ✓ double_build: the two builds agree
- ✓ restate: 祖母のいちごは12こ。 祖母のいちごは、母のいちごの3/4。 母のいちごは何こですか。
- ✓ statements: 3 sentences, 9 marks
- ✓ conditions: met
- ✓ misread: 13/20
- ✓ adopt: p_transfer_c_known_whole_same_1
- ✓ adopt: c_known_whole builds a world other than the correct one; wording same

問題の文：祖母がつんだいちごは12こです。これは、母がつんだいちごの数の3/4です。母がつんだいちごは何こですか。
採用（人の確認待ち）。答え：16/1。誤読への耐性（記録）：0.65

## c_known_whole・別の言い回し（直した問題：p_signboard）

### p_transfer_c_known_whole_different_1

- ✓ build_a / solve: {"kind":"unique","values":{"q_large":"20/1","q_small":"12/1","r_frac":"3/5"},"impossible":[]}
- ✓ build_a / diagnose_candidates: 1 candidates
- ✓ build_a / restate: 小さい箱のクッキーは12こ。 小さい箱のクッキーは、大きい箱のクッキーの3/5。 大きい箱のクッキーは何こですか。
- ✓ build_a / submit_world: accepted
- ✓ build_b / solve: {"kind":"unique","values":{"q_large":"20/1","q_small":"12/1","r_frac":"3/5"},"impossible":[]}
- ✓ build_b / diagnose_candidates: 1 candidates
- ✓ build_b / restate: 小さい箱のクッキーは12こ。 小さい箱のクッキーは、大きい箱のクッキーの3/5。 大きい箱のクッキーは何こですか。
- ✓ build_b / submit_world: accepted
- ✓ double_build: the two builds agree
- ✓ restate: 小さい箱のクッキーは12こ。 小さい箱のクッキーは、大きい箱のクッキーの3/5。 大きい箱のクッキーは何こですか。
- ✓ statements: 3 sentences, 9 marks
- ✓ conditions: met
- ✓ misread: 14/20
- ✓ adopt: p_transfer_c_known_whole_different_1
- ✓ adopt: c_known_whole builds a world other than the correct one; wording different

問題の文：小さい箱のクッキーの数は、大きい箱のクッキーの数に対して3/5です。小さい箱のクッキーは12こです。大きい箱のクッキーは何こですか。
採用（人の確認待ち）。答え：20/1。誤読への耐性（記録）：0.7

## c_first_whole・同じ言い回し（直した問題：p_signboard）

### p_transfer_c_first_whole_same_1

- ✓ build_a / solve: {"kind":"unique","values":{"q_mother":"25/1","q_sister":"10/1","r_frac":"2/5"},"impossible":[]}
- ✓ build_a / diagnose_candidates: 1 candidates
- ✓ build_a / restate: 姉のつるは10羽。 姉のつるは、母のつるの2/5。 母のつるは何羽ですか。
- ✓ build_a / submit_world: accepted
- ✓ build_b / solve: {"kind":"unique","values":{"q_mother":"25/1","q_sister":"10/1","r_frac":"2/5"},"impossible":[]}
- ✓ build_b / diagnose_candidates: 1 candidates
- ✓ build_b / restate: 姉のつるは10羽。 姉のつるは、母のつるの2/5。 母のつるは何羽ですか。
- ✓ build_b / submit_world: accepted
- ✓ double_build: the two builds agree
- ✓ restate: 姉のつるは10羽。 姉のつるは、母のつるの2/5。 母のつるは何羽ですか。
- ✓ statements: 4 sentences, 10 marks
- ✓ conditions: met
- ✓ misread: 15/20
- ✓ adopt: p_transfer_c_first_whole_same_1
- ✓ adopt: c_first_whole builds a world other than the correct one; wording same

問題の文：みんなでつるを折りました。姉が折ったつるは10羽です。これは、母が折ったつるの数の2/5です。母が折ったつるは何羽ですか。
採用（人の確認待ち）。答え：25/1。誤読への耐性（記録）：0.75

## c_first_whole・別の言い回し（直した問題：p_signboard）

### p_transfer_c_first_whole_different_1

- ✓ build_a / solve: {"kind":"unique","values":{"q_father":"25/1","q_grandpa":"15/1","r_frac":"3/5"},"impossible":[]}
- ✓ build_a / diagnose_candidates: 1 candidates
- ✓ build_a / restate: 祖父のトマトは15こ。 祖父のトマトは、父のトマトの3/5。 父のトマトは何こですか。
- ✓ build_a / submit_world: accepted
- ✓ build_b / solve: {"kind":"unique","values":{"q_father":"25/1","q_grandfather":"15/1","r_frac":"3/5"},"impossible":[]}
- ✓ build_b / diagnose_candidates: 1 candidates
- ✓ build_b / restate: 祖父のトマトは15こ。 祖父のトマトは、父のトマトの3/5。 父のトマトは何こですか。
- ✓ build_b / submit_world: accepted
- ✓ double_build: the two builds agree
- ✓ restate: 祖父のトマトは15こ。 祖父のトマトは、父のトマトの3/5。 父のトマトは何こですか。
- ✓ statements: 3 sentences, 11 marks
- ✓ conditions: met
- ✓ misread: 9/20
- ✓ adopt: p_transfer_c_first_whole_different_1
- ✓ adopt: c_first_whole builds a world other than the correct one; wording different

問題の文：祖父がとったトマトは15こです。祖父がとったトマトの数は、父がとったトマトの数を1とみると3/5にあたります。父がとったトマトは何こですか。
採用（人の確認待ち）。答え：25/1。誤読への耐性（記録）：0.45

## c_additive・同じ言い回し（直した問題：p_fraction_c）

### p_transfer_c_additive_same_1

- ✓ build_a / solve: {"kind":"unique","values":{"q_large":"15/1","q_small":"6/1","r_frac":"2/5"},"impossible":[]}
- ✓ build_a / diagnose_candidates: 1 candidates
- ✓ build_a / restate: 小さいかごのみかんは6こ。 小さいかごのみかんは、大きいかごのみかんの2/5。 大きいかごのみかんは何こですか。
- ✓ build_a / submit_world: accepted
- ✓ build_b / solve: {"kind":"unique","values":{"q_large":"15/1","q_small":"6/1","r_frac":"2/5"},"impossible":[]}
- ✓ build_b / diagnose_candidates: 1 candidates
- ✓ build_b / restate: 小さいかごのみかんは6こ。 小さいかごのみかんは、大きいかごのみかんの2/5。 大きいかごのみかんは何こですか。
- ✓ build_b / submit_world: accepted
- ✓ double_build: the two builds agree
- ✓ restate: 小さいかごのみかんは6こ。 小さいかごのみかんは、大きいかごのみかんの2/5。 大きいかごのみかんは何こですか。
- ✓ statements: 3 sentences, 10 marks
- ✓ conditions: met
- ✓ misread: 7/20
- ✓ adopt: p_transfer_c_additive_same_1
- ✓ adopt: c_additive builds a world other than the correct one; wording same

問題の文：小さいかごのみかんは6こです。小さいかごのみかんは、大きいかごのみかんの2/5です。大きいかごのみかんは何こですか。
採用（人の確認待ち）。答え：15/1。誤読への耐性（記録）：0.35

## c_additive・別の言い回し（直した問題：p_fraction_c）

### p_transfer_c_additive_different_1

- ✓ build_a / solve: {"kind":"unique","values":{"q_daughter":"15/1","q_mother":"20/1","r_ratio":"3/4"},"impossible":[]}
- ✓ build_a / diagnose_candidates: 1 candidates
- ✓ build_a / restate: 母の毛糸は20m。 娘の毛糸は、母の毛糸の3/4。 娘の毛糸は何mですか。
- ✓ build_a / submit_world: accepted
- ✓ build_b / solve: {"kind":"unique","values":{"q_daughter":"15/1","q_mother":"20/1","r_ratio":"3/4"},"impossible":[]}
- ✓ build_b / diagnose_candidates: 1 candidates
- ✓ build_b / restate: 母の毛糸は20m。 娘の毛糸は、母の毛糸の3/4。 娘の毛糸は何mですか。
- ✓ build_b / submit_world: accepted
- ✓ double_build: the two builds agree
- ✓ restate: 母の毛糸は20m。 娘の毛糸は、母の毛糸の3/4。 娘の毛糸は何mですか。
- ✓ statements: 3 sentences, 10 marks
- ✓ conditions: met
- ✓ misread: 14/20
- ✓ adopt: p_transfer_c_additive_different_1
- ✓ adopt: c_additive builds a world other than the correct one; wording different

問題の文：母の毛糸は20mです。母の毛糸の長さをもとにすると、娘の毛糸の長さの割合は3/4です。娘の毛糸は何mですか。
採用（人の確認待ち）。答え：15/1。誤読への耐性（記録）：0.7
