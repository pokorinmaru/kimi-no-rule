# BLOCKED

人の作業を待っている項目。各項目に「理由」「再開の手順」を書く。終わったら「解決済み」へ移す。

## 待ち

## 解決済み

### B1 GitHub への push（gh のトークンに workflow 権限が無い）
- 解決：2026-11-06。人が `gh auth refresh -h github.com -s workflow` で承認し、push と CI の成功を確かめた。
