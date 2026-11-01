#!/usr/bin/env bash
# Builds the end-to-end test with Vite (so import.meta.env is replaced, exactly
# as in the app bundle) and runs it against the live Supabase project.
set -euo pipefail
cd "$(dirname "$0")/../.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

: "${VITE_SUPABASE_URL:?set VITE_SUPABASE_URL (see .env)}"
: "${VITE_SUPABASE_PUBLISHABLE_KEY:?set VITE_SUPABASE_PUBLISHABLE_KEY (see .env)}"
export SUPABASE_URL="$VITE_SUPABASE_URL"
export SUPABASE_PUBLISHABLE_KEY="$VITE_SUPABASE_PUBLISHABLE_KEY"
export SB_URL="$VITE_SUPABASE_URL"
export SB_KEY="$VITE_SUPABASE_PUBLISHABLE_KEY"

OUT="tests/e2e/.build"
npx vite build --ssr tests/e2e/attendance.e2e.ts --outDir "$OUT" >/dev/null
node "$OUT/attendance.e2e.js"
