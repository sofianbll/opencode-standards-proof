#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source e2e/bases.env
forks="${1:-..}"
for name in opencode openchamber; do
  case "$name" in opencode) base="$OPENCODE_BASE";; openchamber) base="$OPENCHAMBER_BASE";; esac
  mkdir -p "patches/$name"
  # Only generated patch files owned by this script are replaced.
  find "patches/$name" -name '*.patch' -delete
  git -C "$forks/$name" format-patch --no-signature -o "$PWD/patches/$name" "$base..standards/mcp-apps"
done
