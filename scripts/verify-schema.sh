#!/usr/bin/env bash
set -euo pipefail

DB_URL="$(npx supabase status -o env | awk -F= '/^DB_URL=/{print $2}' | tr -d '"')"
if [[ -z "$DB_URL" ]]; then
  echo "DB_URL missing; is supabase start running?"
  exit 1
fi

tables="$(psql "$DB_URL" -Atc "select tablename from pg_tables where schemaname='public' order by 1")"
echo "$tables" | grep -qx playable_audio
echo "$tables" | grep -qx contacts
echo "$tables" | grep -qx installs
echo "Schema OK"
