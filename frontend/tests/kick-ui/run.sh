#!/usr/bin/env bash
# Menguji logika Host Kick di klien (utils/kick.js ASLI) dan merender ResultPage/LobbyPage ASLI dengan
# React + react-dom/server (render statis; dilewati otomatis bila react/react-dom/typescript tidak ada).
#   bash tests/kick-ui/run.sh      (dari folder frontend)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; SRC="$HERE/../../src"; OUT="$(mktemp -d)"
mkdir -p "$OUT/utils"
cp "$SRC/utils/kick.js" "$OUT/utils/kick.mjs"
cp "$HERE/run.mjs" "$OUT/run.mjs"
node "$OUT/run.mjs"
NODE_PATH="${NODE_PATH:-}" node "$HERE/render.mjs"
