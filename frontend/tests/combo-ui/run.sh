#!/usr/bin/env bash
# Menguji logika Combo Detector + Group Chain (comboDetector.js, comboPicker.js, groupChain.js ASLI).
# Tidak butuh browser maupun node_modules.   bash tests/combo-ui/run.sh      (dari folder frontend)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; SRC="$HERE/../../src"; OUT="$(mktemp -d)"
mkdir -p "$OUT/utils"
for f in comboDetector comboPicker groupChain handUi; do
  sed -e "s#from './comboDetector'#from './comboDetector.mjs'#" -e "s#from './comboPicker'#from './comboPicker.mjs'#" -e "s#from './groupChain'#from './groupChain.mjs'#" "$SRC/utils/$f.js" > "$OUT/utils/$f.mjs"
done
cp "$HERE/run.mjs" "$OUT/run.mjs"
# Server asli dipakai sebagai pembanding independen.
ln -s "$(cd "$HERE/../../../backend/src" && pwd)" "$OUT/server"
node "$OUT/run.mjs"
# Smoke test render GamePage (JSX dikompilasi dengan esbuild dari Vite; SKIP hanya bila node_modules belum ada, FAIL bila dependency hilang).
cp "$HERE/render.mjs" "$OUT/render.mjs"
NODE_PATH="${NODE_PATH:-}" node "$HERE/render.mjs"
