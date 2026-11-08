#!/usr/bin/env bash
# Watch the CI run of a commit (default HEAD) until it ends; prints the conclusion and exits non-zero on failure.
# `gh run list --commit` matches the full SHA only (a short one finds nothing: 2026-11-08, three missed watches),
# so the commit is resolved here, and the run is waited for until GitHub has registered it.
set -euo pipefail
sha=$(git rev-parse "${1:-HEAD}")
id=""
for _ in $(seq 1 30); do
  id=$(gh run list --commit "$sha" --json databaseId -q '.[0].databaseId')
  [ -n "$id" ] && break
  sleep 4
done
[ -n "$id" ] || { echo "no CI run for $sha"; exit 2; }
echo "run $id for ${sha:0:7}"
gh run watch "$id" --exit-status >/dev/null 2>&1 || true
conclusion=$(gh run view "$id" --json conclusion -q .conclusion)
echo "$conclusion"
[ "$conclusion" = "success" ]
