#!/bin/sh
# Applies the group-invites migration to a throwaway Postgres, then proves the
# rules and the concurrency guard.
#
#   initdb -D /tmp/pgdata -U postgres --auth=trust
#   pg_ctl -D /tmp/pgdata -o "-p 55432 -k /tmp" -l /tmp/pg.log start
#   supabase/tests/group_invites/run.sh
#
# PGURL can point at any Postgres 14+; it defaults to the local cluster above.
set -e
PGURL=${PGURL:-"postgresql://postgres@/postgres?host=/tmp&port=55432"}
DIR=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$DIR/../../.." && pwd)
PSQL="psql $PGURL -q -v ON_ERROR_STOP=1"

$PSQL -f "$DIR/00_setup.sql"
echo "--- migration"
$PSQL -f "$ROOT/supabase/migrations/20261111120000_group_invites.sql"
echo "--- rules"
$PSQL -f "$DIR/01_rules.sql"

echo "--- race: two accepts for the last seat"
$PSQL -f "$DIR/02_race_setup.sql"
$PSQL -f "$DIR/02_race_a.sql" >/tmp/gh_race_a.out 2>&1 &
sleep 0.5
$PSQL -f "$DIR/02_race_b.sql" >/tmp/gh_race_b.out 2>&1 || true
wait

seats=$(psql "$PGURL" -tAc "select count(*) from public.students where student_group='GROUP T'")
winners=$(grep -c accepted /tmp/gh_race_a.out /tmp/gh_race_b.out | awk -F: '{s+=$2} END {print s+0}')
losers=$(grep -c "limejaa" /tmp/gh_race_a.out /tmp/gh_race_b.out | awk -F: '{s+=$2} END {print s+0}')
echo "seats=$seats accepted=$winners refused=$losers"
[ "$seats" = "8" ] || { echo "FAIL: $seats students in a group of 8"; exit 1; }
[ "$winners" = "1" ] || { echo "FAIL: $winners accepts, expected exactly 1"; exit 1; }
[ "$losers" = "1" ] || { echo "FAIL: $losers refusals, expected exactly 1"; exit 1; }
echo "PASS: one accept took the last seat, the other was refused"
