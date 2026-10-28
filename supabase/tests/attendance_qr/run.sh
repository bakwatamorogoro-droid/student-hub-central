#!/bin/sh
# Applies the attendance migration to a throwaway Postgres and runs the
# assertions in 01_tests.sql. See AGENTS.md ("Testing SQL before shipping it").
#
#   sudo docker run -d --name attpg -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=test postgres:16-alpine
#   supabase/tests/attendance_qr/run.sh
#
# Files are copied into the container because `docker exec -i` with a redirected
# stdin can block depending on how the caller's shell handles the pipe.
set -e
C=${C:-attpg}
DIR=$(cd "$(dirname "$0")" && pwd)
MIG="$DIR/../../../drizzle/migrations/0006_attendance_qr.sql"
cp "$MIG" "$DIR/.migration.sql"
for f in 00_setup.sql .migration.sql 01_tests.sql; do
  sudo docker cp "$DIR/$f" "$C:/tmp/$f" >/dev/null
done
rm -f "$DIR/.migration.sql"
sudo docker exec "$C" psql -U postgres -d test -q \
  -c "DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;" >/dev/null
for f in 00_setup.sql .migration.sql 01_tests.sql; do
  sudo docker exec "$C" psql -U postgres -d test -q -v ON_ERROR_STOP=1 -f "/tmp/$f"
done
