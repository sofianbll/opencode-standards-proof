#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:$PATH"
if [[ ! -f .build/openchamber/packages/web/dist/index.html ]]; then
  if [[ " $* " == *" --desktop "* ]]; then
    echo 'Desktop requires a prepared local .build (see README); no upstream fetch is performed.' >&2
    exit 1
  fi
  bash e2e/prepare.sh
fi
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$PWD/.build/browsers}"
if [[ " $* " != *" --desktop "* && " $* " != *" --plugins "* && -z "${PROOF_CHROMIUM_PATH:-}" ]]; then
  node_modules/node/bin/node node_modules/playwright/cli.js install chromium
fi
exec node_modules/node/bin/node e2e/run.mjs "$@"
