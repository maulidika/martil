#!/usr/bin/env bash
# Thin wrapper around the standalone test (works the same without bash: `node tests/server-errors/run.mjs`).
#   bash tests/server-errors/run.sh      (from the frontend folder)
set -euo pipefail
exec node "$(cd "$(dirname "$0")" && pwd)/run.mjs"
