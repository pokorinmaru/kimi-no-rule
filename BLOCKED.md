# BLOCKED

人の作業を待っている項目。各項目に「理由」「再開の手順」を書く。終わったら「解決済み」へ移す。

## 待ち

### B3 本物の Claude を呼ぶ評価と問題の組み立て（API キーが無い）
- 理由：この PC には Anthropic の API キーが無い（2026-11-07 確認。人が登録を試み、アプリを開き直した後も、ユーザー環境変数に ANTHROPIC_API_KEY が無く、`ant` CLI も入っていない）。世界組み立てエージェントと評価は、偽物の Claude で全経路をテストしてある。キーワード規則の基線は Claude を使わないので、その数字だけは本物。
- 再開の手順：キーを環境変数 ANTHROPIC_API_KEY に置き（リポジトリには書かない）、`pnpm eval:live` を1回だけ回す。結果の EVALS.md と、費用・遅延を HANDOFF.md に書く。問題の組み立ては `pnpm build:problems` で回し、出来た問題は人が目で確かめてから `human_checked` を true にする。
- 人の作業：評価データの一部は第三者の大人が書く（指示書 第10.1節）。今のデータは AI の下書き（source が ai_draft）なので、第三者の行を足して EVALS-PROTOCOL.md の改訂として固定し直す。

## 解決済み

### B2 子ども向けの相談窓口の一覧
- 解決：2026-11-07。辞書は人が確認した。相談窓口は、運営元の公式のページ（文部科学省・チャイルドライン・法務省・こども家庭庁）で番号と受付時間を確かめ、apps/web/src/flow/text.ts の HELPLINES に、確かめた先の URL と一緒に入れた。リリースの前に、もう一度確かめ直す。

### B1 GitHub への push（gh のトークンに workflow 権限が無い）
- 解決：2026-11-06。人が `gh auth refresh -h github.com -s workflow` で承認し、push と CI の成功を確かめた。
