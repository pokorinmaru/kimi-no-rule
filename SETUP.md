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

## 審査用の公開版（Cloudflare）

審査員がパスコードで使える公開版を、画面は Cloudflare Pages、サーバーは Cloudflare Workers に置く。サーバーは手元と同じで、何も保存せずログも出さない。パスコードが無い呼び出しは断り（401）、パスコードが設定されていなければ何も受けない（503）。子どもの記録は、使う人のブラウザの中だけに残る。

人がする準備（鍵とアカウントは人の手で）：
1. Anthropic のコンソールで、月の使用額の上限を決める（公開中のキーの使いすぎを止める）。
2. `cd apps/worker` で `npx wrangler login`（ブラウザで Cloudflare にログイン）。
3. `npx wrangler secret put ANTHROPIC_API_KEY` と `npx wrangler secret put JUDGE_PASSCODE`（どちらも画面に貼る。ファイルには書かない）。

公開の手順：
1. サーバー：`pnpm --filter @kimi/worker deploy`（`content/problems` を `src/stored.gen.json` にまとめてから公開する）。表示された `https://kimi-no-rule-worker.<アカウント>.workers.dev` を控える。
2. 画面：`VITE_API_BASE=<サーバーのURL> VITE_REQUIRE_PASSCODE=1 pnpm --filter @kimi/web build:judge` の後、`npx wrangler pages deploy apps/web/dist-judge --project-name kimi-no-rule`。表示された `https://kimi-no-rule.pages.dev` を控える。
3. `apps/worker/wrangler.toml` の `ALLOWED_ORIGINS` に画面のURL、`WORKER_HOSTS` にサーバーのホスト名を書いて、もう一度 `pnpm --filter @kimi/worker deploy`。
4. 画面のURLを開き、パスコードで入れることを確かめる。

手元での確かめ（ログイン不要）：`npx wrangler dev --port 8790 --var JUDGE_PASSCODE:<仮の値> --var ALLOWED_ORIGINS:http://localhost:5190 --var WORKER_HOSTS:localhost:8790`、画面は `VITE_API_BASE=http://localhost:8790 VITE_REQUIRE_PASSCODE=1` で `build:judge` して `npx vite preview --outDir dist-judge --port 5190`。

## つまずいたとき

- `git push` が資格情報の画面待ちで止まる：`git -c credential.helper= -c "credential.helper=!gh auth git-credential" push`
- テストが赤のまま終われない：Stop フックが `pnpm test` を回している。赤のテストは手元でだけコミットし、緑にしてから push する。
- 書き込みがフックに止められる：設計文書と10語以上一致していないか、個人情報らしき文字列が無いかを見て、自分の言葉に直す。
