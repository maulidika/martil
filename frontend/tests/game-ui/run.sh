#!/usr/bin/env bash
# Menguji util redesign halaman Game (gameLayout.js, profile.js ASLI) tanpa browser/node_modules.
#   bash tests/game-ui/run.sh      (dari folder frontend)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; SRC="$HERE/../../src"; OUT="$(mktemp -d)"
mkdir -p "$OUT/utils"
for f in gameLayout profile; do cp "$SRC/utils/$f.js" "$OUT/utils/$f.mjs"; done
cp "$HERE/run.mjs" "$OUT/run.mjs"
node "$OUT/run.mjs"
