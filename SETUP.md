# SETUP

## 必要なもの

- Node.js 22 以上（`.ts` をそのまま動かすため）
- pnpm 10（`npm i -g pnpm@10`。`corepack enable` は権限が無いと失敗する）
- Playwright の Chromium（e2e を回す時だけ。`pnpm --filter @kimi/web exec playwright install chromium`）

## 初回の準備

```bash
pnpm install
```

## 鍵と環境変数

- `ANTHROPIC_API_KEY`：Claude を使う時だけ。リポジトリには書かず、OS の環境変数に置く。無くても画面は決まった言い方とよくある読み違いで動き、評価は Claude を使わない列だけを回す。
- `ANTHROPIC_BASE_URL` が設定された環境（Claude Code の中など）では、評価やサーバーのリクエストがその先へ送られることがある。公式の API に送る時は外してから動かす。

## よく使うコマンド

- `pnpm --filter @kimi/web dev`：画面（http://localhost:5173）
- `pnpm --filter @kimi/worker exec node src/serve.ts`：ローカルのサーバー（127.0.0.1:8787。キーが無ければ 503 を返し、画面は切り替えて動く）
- `pnpm test` ／ `pnpm typecheck` ／ `pnpm lint` ／ `pnpm e2e`
- `pnpm eval`：Claude を使わない評価を回して EVALS.md を書く。`pnpm eval:live` は Claude の列も回す（キーが要る、費用がかかる）
- `pnpm check:protocol`：評価の取り決めが凍結のとおりか確かめる
- `pnpm build:problems <inputs.json> [out]`：問題の準備（Opus で2回組み立てる。キーが要る）

## つまずいたとき

- `git push` が資格情報の画面待ちで止まる：`git -c credential.helper= -c "credential.helper=!gh auth git-credential" push`
- テストが赤のまま終われない：Stop フックが `pnpm test` を回している。赤のテストは手元でだけコミットし、緑にしてから push する。
- 書き込みがフックに止められる：設計文書と10語以上一致していないか、個人情報らしき文字列が無いかを見て、自分の言葉に直す。
