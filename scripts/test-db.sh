#!/usr/bin/env bash
# Runs the database migration and tests against a throwaway local Postgres.
set -euo pipefail
cd "$(dirname "$0")/.."
BIN="$(dirname "$(command -v pg_ctl || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")"
DIR="$(mktemp -d)"
PORT=54329
trap '"$BIN/pg_ctl" -D "$DIR" stop -m fast >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
"$BIN/initdb" -D "$DIR" -U postgres >/dev/null
"$BIN/pg_ctl" -D "$DIR" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" start >/dev/null
PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f supabase/tests/auth_stub.sql
for f in supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
for f in supabase/tests/*_test.sql; do "${PSQL[@]}" -f "$f"; done
