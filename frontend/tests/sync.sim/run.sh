#!/usr/bin/env bash
# Thin wrapper: the preparation is done in Node (main.mjs) so it behaves the same on Windows, macOS and Linux.
#   bash tests/sync.sim/run.sh      or, without bash:      node tests/sync.sim/main.mjs      (from the frontend folder)
set -euo pipefail
exec node "$(cd "$(dirname "$0")" && pwd)/main.mjs"
