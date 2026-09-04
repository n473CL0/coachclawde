#!/bin/bash
# SessionStart hook: make sure the app can build, lint and run during a session.
# Coach Claude is a Vite + TypeScript PWA, so dependencies must be installed
# before any `npm run lint` / `npm run build` / `npm run dev` will work.
set -euo pipefail

# Only do work in Claude Code on the web; locally the user manages their own env.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# Idempotent: npm install is a no-op when node_modules is already up to date,
# and we prefer it over `npm ci` so the cached container layer is reused.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  npm install --no-audit --no-fund
fi
