#!/usr/bin/env bash
# Menguji state machine koneksi klien (useSocket.js + gameStore.js ASLI) dengan socket,
# react, router, dan timer palsu. Tidak butuh browser maupun node_modules.
#   bash tests/sync.sim/run.sh      (dari folder frontend)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; SRC="$HERE/../../src"; OUT="$(mktemp -d)"
mkdir -p "$OUT/hooks" "$OUT/store" "$OUT/utils" "$OUT/stubs"
cp "$HERE"/stubs/*.mjs "$OUT/stubs/"; cp "$HERE/run.mjs" "$OUT/run.mjs"; cp "$HERE/fixture-restored-waiting.json" "$OUT/"
for f in hooks/useSocket store/gameStore utils/session utils/kick; do
  sed -e "s#from 'zustand'#from '../stubs/zustand.mjs'#" -e "s#from 'react'#from '../stubs/react.mjs'#" \
      -e "s#from 'socket.io-client'#from '../stubs/sio.mjs'#" -e "s#from 'react-router-dom'#from '../stubs/router.mjs'#" \
      -e "s#'../store/gameStore'#'../store/gameStore.mjs'#" -e "s#'../utils/session'#'../utils/session.mjs'#" -e "s#'../utils/kick'#'../utils/kick.mjs'#" \
      -e "s#import.meta.env.VITE_SERVER_URL#undefined#" "$SRC/$f.js" > "$OUT/$f.mjs"
done
node "$OUT/run.mjs" 2>&1 | grep -v -i warning
