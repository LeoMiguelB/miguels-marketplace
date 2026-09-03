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

check_name="$(psql "$DB_URL" -Atc "select conname from pg_constraint where conname = 'playable_audio_published_cover_check'")"
if [[ -n "$check_name" ]]; then
  echo "playable_audio_published_cover_check still present"
  exit 1
fi

psql "$DB_URL" -v ON_ERROR_STOP=1 -c "insert into playable_audio (title, published, stream_blob_url, download_blob_url, cover_blob_url) values ('verify-empty-cover', true, 's', 'd', '');" >/dev/null
psql "$DB_URL" -v ON_ERROR_STOP=1 -c "delete from playable_audio where title = 'verify-empty-cover';" >/dev/null

echo "Schema OK"
