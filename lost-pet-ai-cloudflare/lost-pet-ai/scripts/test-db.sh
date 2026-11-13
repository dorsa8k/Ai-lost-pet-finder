#!/usr/bin/env bash
# Runs the migration, seed data and security tests against a throwaway local
# PostgreSQL 16 instance. Requires PostgreSQL server binaries (initdb, pg_ctl).
# Usage: bash scripts/test-db.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"

cleanup() { "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT

"$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=''" -l "$DATA/log" start -w >/dev/null

PSQL=(psql -h "$DATA" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -c "create database lostpet" postgres
"${PSQL[@]}" -d lostpet -f "$ROOT/tests/db/supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "Applying $(basename "$f")"
  "${PSQL[@]}" -d lostpet -f "$f"
done
"${PSQL[@]}" -d lostpet -f "$ROOT/supabase/seed.sql"
"${PSQL[@]}" -d lostpet -f "$ROOT/tests/db/rls_test.sql"
"${PSQL[@]}" -d lostpet -f "$ROOT/tests/db/phase2_test.sql"
