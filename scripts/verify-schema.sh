#!/usr/bin/env bash
set -euo pipefail

TARGET_URL="${1:-${DATABASE_URL:-}}"

if [[ -z "$TARGET_URL" ]]; then
  TARGET_URL="$(npx supabase status -o env 2>/dev/null | awk -F= '/^DB_URL=/{print $2}' | tr -d '"' || true)"
fi

if [[ -z "$TARGET_URL" ]]; then
  echo "DB_URL missing. Provide DATABASE_URL env var, pass as argument, or start local supabase."
  exit 1
fi

if [[ -n "${SUPABASE_DB_PASSWORD:-}" && "$TARGET_URL" == *"[YOUR-PASSWORD]"* ]]; then
  ENCODED_PW="$(node -e 'console.log(encodeURIComponent(process.env.SUPABASE_DB_PASSWORD))')"
  TARGET_URL="${TARGET_URL//\[YOUR-PASSWORD\]/$ENCODED_PW}"
fi

DB_URL="$TARGET_URL"

tables="$(psql "$DB_URL" -Atc "select tablename from pg_tables where schemaname='public' order by 1")"
echo "$tables" | grep -qx playable_audio
echo "$tables" | grep -qx contacts
echo "$tables" | grep -qx installs

col="$(psql "$DB_URL" -Atc "select column_name from information_schema.columns where table_schema='public' and table_name='playable_audio' and column_name='cover_blob_url'")"
if [[ "$col" != "cover_blob_url" ]]; then
  echo "cover_blob_url missing on playable_audio"
  exit 1
fi

bpm_col="$(psql "$DB_URL" -Atc "select column_name from information_schema.columns where table_schema='public' and table_name='playable_audio' and column_name='bpm'")"
if [[ "$bpm_col" != "bpm" ]]; then
  echo "bpm missing on playable_audio"
  exit 1
fi

key_col="$(psql "$DB_URL" -Atc "select column_name from information_schema.columns where table_schema='public' and table_name='playable_audio' and column_name='key'")"
if [[ "$key_col" != "key" ]]; then
  echo "key missing on playable_audio"
  exit 1
fi

check_name="$(psql "$DB_URL" -Atc "select conname from pg_constraint where conname = 'playable_audio_published_cover_check'")"
if [[ -n "$check_name" ]]; then
  echo "playable_audio_published_cover_check still present"
  exit 1
fi

psql "$DB_URL" -v ON_ERROR_STOP=1 -c "insert into playable_audio (title, published, stream_blob_url, download_blob_url, cover_blob_url, bpm, key) values ('verify-empty-cover', true, 's', 'd', '', 140, 'C min');" >/dev/null
psql "$DB_URL" -v ON_ERROR_STOP=1 -c "delete from playable_audio where title = 'verify-empty-cover';" >/dev/null

rls_count="$(psql "$DB_URL" -Atc "select count(*) from pg_tables where schemaname='public' and tablename in ('playable_audio', 'contacts', 'installs') and rowsecurity = true")"
if [[ "$rls_count" != "3" ]]; then
  echo "Row Level Security (RLS) is not enabled on all public tables"
  exit 1
fi

echo "Schema OK"
