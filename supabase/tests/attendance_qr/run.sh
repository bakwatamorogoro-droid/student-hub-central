#!/bin/sh
# Applies the attendance and PIN-auth migrations to a throwaway Postgres, then
# runs the assertions in 01_tests.sql.
#
#   sudo docker run -d --name attpg -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=test postgres:16-alpine
#   supabase/tests/attendance_qr/run.sh
#
# Files are copied into the container because `docker exec -i` with a redirected
# stdin can block depending on how the caller's shell handles the pipe.
set -e
C=${C:-attpg}
DIR=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$DIR/../../.." && pwd)

sudo docker exec "$C" psql -U postgres -d test -q \
  -c "DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" >/dev/null

for f in \
  "$DIR/00_setup.sql" \
  "$ROOT/drizzle/migrations/0006_attendance_qr.sql" \
  "$ROOT/drizzle/migrations/0007_student_pin_auth.sql" \
  "$ROOT/supabase/HARDEN_RLS.sql" \
  "$DIR/01_tests.sql"
do
  b=$(basename "$f")
  sudo docker cp "$f" "$C:/tmp/$b" >/dev/null
  echo "--- $b"
  sudo docker exec "$C" psql -U postgres -d test -q -v ON_ERROR_STOP=1 -f "/tmp/$b"
done
