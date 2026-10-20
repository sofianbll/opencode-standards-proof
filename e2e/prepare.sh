#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source e2e/bases.env
for name in opencode openchamber; do
  case "$name" in
    opencode) base="$OPENCODE_BASE"; url=https://github.com/anomalyco/opencode.git;;
    openchamber) base="$OPENCHAMBER_BASE"; url=https://github.com/openchamber/openchamber.git;;
  esac
  dest="$PWD/.build/$name"
  if [[ ! -d "$dest/.git" ]]; then
    mkdir -p "$dest"
    git -C "$dest" init -q
    # An optional local source saves network on the Mac; CI always fetches the pinned upstream SHA.
    source_url="$url"
    if [[ -n "${PROOF_SOURCE_ROOT:-}" ]]; then source_url="$PROOF_SOURCE_ROOT/$name"; fi
    git -C "$dest" fetch --depth=1 "$source_url" "$base"
    git -C "$dest" checkout -q --detach FETCH_HEAD
    git -C "$dest" -c user.name=Proof -c user.email=proof@localhost am "$PWD/patches/$name/"*.patch
  fi
  (cd "$dest" && bun install --frozen-lockfile)
done
npm ci
npm ci --prefix demo-server
npm ci --prefix agent-plugin
(cd .build/openchamber && bun run build:web)
