# 見分け問題の組み立ての記録（大人向け：答えが書いてあります。子どもに見せないこと）

## c_correct と s_unit_additive（銀行で分かれる問題 1）

### p_disc_c_correct_s_unit_additive_1

- ✓ build_a / restate: 父のクッキーは20まい。 弟のクッキーは、父のクッキーの1/4。 弟のクッキーは何まいですか。
- ✗ build_a: agent_failed
- ✗ reject: agent_failed

問題の文：父のクッキーは20まいです。弟のクッキーは、父のクッキーの1/4です。弟のクッキーは何まいですか。
不採用：build_rejected（agent_failed）

### p_disc_c_correct_s_unit_additive_2

- ✗ build_a: agent_failed
- ✗ reject: agent_failed

問題の文：青い箱のビー玉は6こです。これは、赤い箱のビー玉の1/3です。赤い箱のビー玉は何こですか。
不採用：build_rejected（agent_failed）

## c_first_whole と s_motoni_plain（銀行で分かれる問題 1）

### p_disc_c_first_whole_s_motoni_plain_1

- ✓ build_a / restate: 姉のおはじきは12こ。 妹のおはじきは、姉のおはじきの2/3。 妹のおはじきは何こですか。
- ✓ build_a / solve: {"kind":"unique","values":{"q_ane":"12/1","q_imouto":"8/1","r_ratio":"2/3"},"impossible":[]}
- ✓ build_a / diagnose_candidates: 1 candidates
- ✓ build_a / submit_world: accepted
- ✓ build_b / solve: {"kind":"unique","values":{"q_ane":"12/1","q_imouto":"8/1","r_1":"2/3"},"impossible":[]}
- ✓ build_b / restate: 姉のおはじきは12こ。 妹のおはじきは、姉のおはじきの2/3。 妹のおはじきは何こですか。
- ✓ build_b / diagnose_candidates: 1 candidates
- ✓ build_b / submit_world: accepted
- ✗ double_build: the two builds differ
- ✗ reject: double_build_mismatch

問題の文：妹のおはじきの数は、姉のおはじきの数をもとにすると2/3です。姉のおはじきは12こです。妹のおはじきは何こですか。
不採用：build_rejected（double_build_mismatch）

### p_disc_c_first_whole_s_motoni_plain_2

- ✗ build_a: agent_failed
- ✗ reject: agent_failed

問題の文：大きい箱のビー玉の数は、小さい箱のビー玉の数をもとにすると4/3倍です。大きい箱には20こ入っています。小さい箱には何こ入っていますか。
不採用：build_rejected（agent_failed）

## c_correct と s_unit_additive（銀行で分かれる問題 1）

### p_disc_c_correct_s_unit_additive_1

- ✓ build_a / solve: {"kind":"unique","values":{"q_big":"24/1","q_small":"6/1","r_frac":"1/4"},"impossible":[]}
- ✓ build_a / diagnose_candidates: 1 candidates
- ✓ build_a / restate: 大きい水そうの水は24L。 小さい水そうの水は、大きい水そうの水の1/4。 小さい水そうの水は何Lですか。
- ✓ build_a / submit_world: accepted
- ✓ build_b / solve: {"kind":"unique","values":{"q_big":"24/1","q_small":"6/1","r_frac":"1/4"},"impossible":[]}
- ✓ build_b / diagnose_candidates: 1 candidates
- ✓ build_b / restate: 大きい水そうの水は24L。 小さい水そうの水は、大きい水そうの水の1/4。 小さい水そうの水は何Lですか。
- ✓ build_b / submit_world: accepted
- ✓ double_build: the two builds agree
- ✓ restate: 大きい水そうの水は24L。 小さい水そうの水は、大きい水そうの水の1/4。 小さい水そうの水は何Lですか。
- ✓ statements: 3 sentences, 10 marks
- ✓ conditions: met
- ✗ misread: 14/20
- ✗ reject: misread_below_threshold

問題の文：大きい水そうには水が24L入っています。小さい水そうの水は、大きい水そうの水の1/4です。小さい水そうの水は何Lですか。
不採用：build_rejected（misread_below_threshold）

### p_disc_c_correct_s_unit_additive_2

- ✓ build_a / solve: {"kind":"unique","values":{"q_ani":"21/1","q_otouto":"7/1","r_frac":"1/3"},"impossible":[]}
- ✓ build_a / diagnose_candidates: 1 candidates
- ✓ build_a / restate: 弟のどんぐりは7こ。 弟のどんぐりは、兄のどんぐりの1/3。 兄のどんぐりは何こですか。
- ✓ build_a / submit_world: accepted
- ✓ build_b / solve: {"kind":"unique","values":{"q_ani":"21/1","q_otouto":"7/1","r_frac":"1/3"},"impossible":[]}
- ✓ build_b / diagnose_candidates: 1 candidates
- ✓ build_b / restate: 弟のどんぐりは7こ。 弟のどんぐりは、兄のどんぐりの1/3。 兄のどんぐりは何こですか。
- ✓ build_b / submit_world: accepted
- ✓ double_build: the two builds agree
- ✓ restate: 弟のどんぐりは7こ。 弟のどんぐりは、兄のどんぐりの1/3。 兄のどんぐりは何こですか。
- ✓ statements: 3 sentences, 8 marks
- ✓ conditions: met
- ✗ misread: 13/20
- ✗ reject: misread_below_threshold

問題の文：弟のどんぐりは7こです。これは、兄のどんぐりの1/3です。兄のどんぐりは何こですか。
不採用：build_rejected（misread_below_threshold）

## c_first_whole と s_motoni_plain（銀行で分かれる問題 1）

### p_disc_c_first_whole_s_motoni_plain_1

- ✓ build_a / solve: {"kind":"unique","values":{"q_ane":"18/1","q_imouto":"12/1","r_frac":"2/3"},"impossible":[]}
- ✓ build_a / diagnose_candidates: 1 candidates
- ✓ build_a / restate: 姉のおはじきは18こ。 妹のおはじきは、姉のおはじきの2/3。 妹のおはじきは何こですか。
- ✓ build_a / submit_world: accepted
- ✓ build_b / solve: {"kind":"unique","values":{"q_ane":"18/1","q_imouto":"12/1","r_frac":"2/3"},"impossible":[]}
- ✓ build_b / diagnose_candidates: 1 candidates
- ✓ build_b / restate: 姉のおはじきは18こ。 妹のおはじきは、姉のおはじきの2/3。 妹のおはじきは何こですか。
- ✓ build_b / submit_world: accepted
- ✓ double_build: the two builds agree
- ✓ restate: 姉のおはじきは18こ。 妹のおはじきは、姉のおはじきの2/3。 妹のおはじきは何こですか。
- ✓ statements: 3 sentences, 10 marks
- ✓ conditions: met
- ✗ misread: 14/20
- ✗ reject: misread_below_threshold

問題の文：妹のおはじきの数は、姉のおはじきの数をもとにすると2/3です。姉のおはじきは18こです。妹のおはじきは何こですか。
不採用：build_rejected（misread_below_threshold）

### p_disc_c_first_whole_s_motoni_plain_2

- ✓ build_a / solve: {"kind":"unique","values":{"q_blue":"30/1","q_white":"24/1","r_times":"5/4"},"impossible":[]}
- ✓ build_a / diagnose_candidates: 1 candidates
- ✓ build_a / restate: 青い水そうの水は30L。 青い水そうの水は、白い水そうの水の5/4倍。 白い水そうの水は何Lですか。
- ✓ build_a / submit_world: accepted
- ✓ build_b / solve: {"kind":"unique","values":{"q_blue":"30/1","q_white":"24/1","r_times":"5/4"},"impossible":[]}
- ✓ build_b / diagnose_candidates: 1 candidates
- ✓ build_b / restate: 青い水そうの水は30L。 青い水そうの水は、白い水そうの水の5/4倍。 白い水そうの水は何Lですか。
- ✓ build_b / submit_world: accepted
- ✓ double_build: the two builds agree
- ✓ restate: 青い水そうの水は30L。 青い水そうの水は、白い水そうの水の5/4倍。 白い水そうの水は何Lですか。
- ✓ statements: 3 sentences, 8 marks
- ✓ conditions: met
- ✗ misread: 11/20
- ✗ reject: misread_below_threshold

問題の文：青い水そうの水の量は、白い水そうの水の量をもとにすると5/4倍です。青い水そうの水は30Lです。白い水そうの水は何Lですか。
不採用：build_rejected（misread_below_threshold）

## c_correct と s_unit_additive（銀行で分かれる問題 1）

### p_disc_c_correct_s_unit_additive_1

- ✓ build_a / solve: {"kind":"unique","values":{"q_big":"24/1","q_small":"6/1","r_frac":"1/4"},"impossible":[]}
- ✓ build_a / diagnose_candidates: 1 candidates
- ✓ build_a / restate: 大きい水そうの金魚は24匹。 小さい水そうの金魚は、大きい水そうの金魚の1/4。 小さい水そうの金魚は何匹ですか。
- ✓ build_a / submit_world: accepted
- ✓ build_b / solve: {"kind":"unique","values":{"q_big":"24/1","q_small":"6/1","r_frac":"1/4"},"impossible":[]}
- ✓ build_b / diagnose_candidates: 1 candidates
- ✓ build_b / restate: 大きい水そうの金魚は24匹。 小さい水そうの金魚は、大きい水そうの金魚の1/4。 小さい水そうの金魚は何匹ですか。
- ✓ build_b / submit_world: accepted
- ✓ double_build: the two builds agree
- ✓ restate: 大きい水そうの金魚は24匹。 小さい水そうの金魚は、大きい水そうの金魚の1/4。 小さい水そうの金魚は何匹ですか。
- ✓ statements: 3 sentences, 9 marks
- ✓ conditions: met
- ✓ misread: 14/20
- ✓ adopt: p_disc_c_correct_s_unit_additive_1
- ✓ adopt: c_correct and s_unit_additive build different worlds

問題の文：大きい水そうには、金魚が24匹います。小さい水そうの金魚は、大きい水そうの金魚の1/4です。小さい水そうの金魚は何匹ですか。
採用（人の確認待ち）。答え：6/1

### p_disc_c_correct_s_unit_additive_2

- ✓ build_a / solve: {"kind":"unique","values":{"q_blue":"5/1","q_red":"15/1","r_frac":"1/3"},"impossible":[]}
- ✓ build_a / diagnose_candidates: 1 candidates
- ✓ build_a / restate: 青い箱のおはじきは5こ。 青い箱のおはじきは、赤い箱のおはじきの1/3。 赤い箱のおはじきは何こですか。
- ✓ build_a / submit_world: accepted
- ✓ build_b / solve: {"kind":"unique","values":{"q_blue":"5/1","q_red":"15/1","r_frac":"1/3"},"impossible":[]}
- ✓ build_b / diagnose_candidates: 1 candidates
- ✓ build_b / restate: 青い箱のおはじきは5こ。 青い箱のおはじきは、赤い箱のおはじきの1/3。 赤い箱のおはじきは何こですか。
- ✓ build_b / submit_world: accepted
- ✓ double_build: the two builds agree
- ✓ restate: 青い箱のおはじきは5こ。 青い箱のおはじきは、赤い箱のおはじきの1/3。 赤い箱のおはじきは何こですか。
- ✓ statements: 3 sentences, 9 marks
- ✓ conditions: met
- ✓ misread: 9/20
- ✓ adopt: p_disc_c_correct_s_unit_additive_2
- ✓ adopt: c_correct and s_unit_additive build different worlds

問題の文：青い箱のおはじきは5こです。これは、赤い箱のおはじきの1/3です。赤い箱のおはじきは何こですか。
採用（人の確認待ち）。答え：15/1

## c_first_whole と s_motoni_plain（銀行で分かれる問題 1）

### p_disc_c_first_whole_s_motoni_plain_1

- ✓ build_a / solve: {"kind":"unique","values":{"q_ane":"12/1","q_imouto":"8/1","r_frac":"2/3"},"impossible":[]}
- ✓ build_a / diagnose_candidates: 1 candidates
- ✓ build_a / restate: 姉のおり紙は12まい。 妹のおり紙は、姉のおり紙の2/3。 妹のおり紙は何まいですか。
- ✓ build_a / submit_world: accepted
- ✓ build_b / solve: {"kind":"unique","values":{"q_ane":"12/1","q_imouto":"8/1","r_frac":"2/3"},"impossible":[]}
- ✓ build_b / diagnose_candidates: 1 candidates
- ✓ build_b / restate: 姉のおり紙は12まい。 妹のおり紙は、姉のおり紙の2/3。 妹のおり紙は何まいですか。
- ✓ build_b / submit_world: accepted
- ✓ double_build: the two builds agree
- ✓ restate: 姉のおり紙は12まい。 妹のおり紙は、姉のおり紙の2/3。 妹のおり紙は何まいですか。
- ✓ statements: 3 sentences, 10 marks
- ✓ conditions: met
- ✓ misread: 17/20
- ✓ adopt: p_disc_c_first_whole_s_motoni_plain_1
- ✓ adopt: c_first_whole and s_motoni_plain build different worlds

問題の文：妹のおり紙の数は、姉のおり紙の数をもとにすると2/3です。姉のおり紙は12まいです。妹のおり紙は何まいですか。
採用（人の確認待ち）。答え：8/1

### p_disc_c_first_whole_s_motoni_plain_2

- ✓ build_a / solve: {"kind":"unique","values":{"q_large":"10/1","q_small":"6/1","r_frac":"3/5"},"impossible":[]}
- ✓ build_a / diagnose_candidates: 1 candidates
- ✓ build_a / restate: 小さいびんのジュースは6dL。 小さいびんのジュースは、大きいびんのジュースの3/5。 大きいびんのジュースは何dLですか。
- ✓ build_a / submit_world: accepted
- ✓ build_b / solve: {"kind":"unique","values":{"q_large":"10/1","q_small":"6/1","r_frac":"3/5"},"impossible":[]}
- ✓ build_b / diagnose_candidates: 1 candidates
- ✓ build_b / restate: 小さいびんのジュースは6dL。 小さいびんのジュースは、大きいびんのジュースの3/5。 大きいびんのジュースは何dLですか。
- ✓ build_b / submit_world: accepted
- ✓ double_build: the two builds agree
- ✓ restate: 小さいびんのジュースは6dL。 小さいびんのジュースは、大きいびんのジュースの3/5。 大きいびんのジュースは何dLですか。
- ✓ statements: 3 sentences, 10 marks
- ✓ conditions: met
- ✓ misread: 11/20
- ✓ adopt: p_disc_c_first_whole_s_motoni_plain_2
- ✓ adopt: c_first_whole and s_motoni_plain build different worlds

問題の文：小さいびんのジュースは、大きいびんのジュースをもとにすると3/5です。小さいびんのジュースは6dLです。大きいびんのジュースは何dLですか。
採用（人の確認待ち）。答え：10/1
