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

col="$(psql "$DB_URL" -Atc "select column_name from information_schema.columns where table_schema='public' and table_name='playable_audio' and column_name='cover_blob_url'")"
if [[ "$col" != "cover_blob_url" ]]; then
  echo "cover_blob_url missing on playable_audio"
  exit 1
fi

echo "Schema OK"
