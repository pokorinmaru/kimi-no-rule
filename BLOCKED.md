# BLOCKED

人の作業を待っている項目。各項目に「理由」「再開の手順」を書く。終わったら「解決済み」へ移す。

## 待ち

### B1 GitHub への push（gh のトークンに workflow 権限が無い）
- 理由：`.github/workflows/ci.yml` を含むコミットの push が、権限不足で拒否される。
- 人の作業：`gh auth refresh -h github.com -s workflow` を実行し、ブラウザで承認する。
- 再開の手順：`git push -u origin main` → `gh run watch` で CI の成功を確かめる。

## 解決済み
