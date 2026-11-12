#!/usr/bin/env bash
# Thin wrapper (works the same without bash: `node tests/player-names/run.mjs`).
set -euo pipefail
exec node "$(cd "$(dirname "$0")" && pwd)/run.mjs"
