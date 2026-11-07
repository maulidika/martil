#!/usr/bin/env bash
# Renders the REAL LobbyPage.jsx with React + react-dom/server (static render; skipped automatically when
# dependencies are not installed yet) and checks what Homepage offers when creating a Room.
#   bash tests/lobby-ui/run.sh      (from the frontend folder)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
NODE_PATH="${NODE_PATH:-}" node "$HERE/render.mjs"
