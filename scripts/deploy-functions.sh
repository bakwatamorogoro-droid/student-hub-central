#!/usr/bin/env bash
# Deploys the AI edge functions to the Supabase project.
#
# Two things about the Management API's deploy endpoint shape this script:
#
#  1. It takes multipart files, not a directory, so each function's files are
#     listed by hand.
#  2. It flattens everything it is given into one `source/` directory. The repo
#     keeps the shared module at `functions/_shared/`, which a function in
#     `functions/<slug>/` reaches with `../_shared/`, but after flattening that
#     path points outside `source/`. So the script stages a copy of each
#     `index.ts` with the import rewritten to `./_shared/` and uploads that.
#     The repo copy is never modified.
#
# Requires SUPABASE_ACCESS_TOKEN in the environment. Never pass the OpenRouter
# key here: the functions read it from the project's own secrets.
set -u

REF="${SUPABASE_PROJECT_REF:-weiwabywirhoxiyyjkko}"
API="https://api.supabase.com/v1/projects/$REF/functions"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHARED_DIR="$ROOT/supabase/functions/_shared"

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is required}"

deploy() {
  local slug="$1" verify_jwt="$2"
  local dir="$ROOT/supabase/functions/$slug"
  local stage
  stage="$(mktemp -d)"

  # Every `../_shared/<name>.ts` the function imports gets copied across, so
  # adding a shared module does not mean editing this script.
  local shared
  shared="$(grep -o '\.\./_shared/[A-Za-z0-9_]*\.ts' "$dir/index.ts" | sed 's#\.\./_shared/##' | sort -u)"

  local files=()
  if [ -n "$shared" ]; then
    mkdir -p "$stage/_shared"
    while IFS= read -r name; do
      cp "$SHARED_DIR/$name" "$stage/_shared/$name"
      files+=(-F "file=@$stage/_shared/$name;type=application/typescript;filename=_shared/$name")
    done <<< "$shared"
    sed 's#\.\./_shared/#./_shared/#g' "$dir/index.ts" > "$stage/index.ts"
    files+=(-F "file=@$stage/index.ts;type=application/typescript;filename=index.ts")
  else
    files+=(-F "file=@$dir/index.ts;type=application/typescript;filename=index.ts")
  fi

  # The slug has to exist before a deploy can target it; this create call is
  # harmless when it already does.
  curl -s -o /dev/null -X POST "$API" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"slug\":\"$slug\",\"name\":\"$slug\",\"body\":\"Deno.serve(() => new Response('pending'));\",\"verify_jwt\":$verify_jwt}"

  printf '%-22s ' "$slug"
  curl -s -X POST "$API/deploy?slug=$slug" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    "${files[@]}" \
    -F "metadata={\"entrypoint_path\":\"index.ts\",\"name\":\"$slug\",\"verify_jwt\":$verify_jwt}" \
    -w ' HTTP=%{http_code}\n' | tail -1

  rm -rf "$stage"
}

deploy ai-grade-short false
deploy ai-answer false
deploy ai-tutor-answer false
deploy ai-grade-assignment false
