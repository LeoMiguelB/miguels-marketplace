# Miguel's Marketplace

Public store for Miguel's audio. Visitors browse published tracks, play streams, and go through terms before install. Admin work is a local CLI, not a web dashboard.

This README is how to run the stack on your machine. Product specs live in `docs/`.

## What you need

- Docker (MinIO + local Supabase)
- Node.js 20+ and npm
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) — `npx supabase` is enough
- [.NET 10 SDK](https://dotnet.microsoft.com/download) — only if you use the admin CLI
- `psql` — only if you run `scripts/verify-schema.sh`

## Layout

```
app/            Next.js store (App Router under src/app)
app/cli/        .NET admin CLI
supabase/       Postgres config + SQL migrations
docker-compose.yml   MinIO only (not Postgres)
scripts/        local smoke checks
docs/           specs and design
```

Postgres is `supabase start`, not Compose. Compose is MinIO.

## One-time setup

From the repo root:

```bash
cp app/.env.example app/.env.local
cp app/cli/.env.example app/cli/.env
cd app && npm install
```

`app/.env.example` and `app/cli/.env.example` already have local defaults (Postgres on `127.0.0.1:54322`, MinIO on `127.0.0.1:9000`, shared `ADMIN_SECRET`). Do not commit real env files.

## Start local infra

Two processes. Keep them running.

**1. MinIO** (object storage, bucket `music`):

```bash
docker compose up -d minio minio-init
./scripts/verify-minio.sh   # expect: MinIO OK
```

API: `http://127.0.0.1:9000`  
Console: `http://127.0.0.1:9001` (user/pass `minioadmin` / `minioadmin`)

Public `GetObject` is allowed on `stream/` and `cover/` in that bucket. `download/` stays private.

**2. Postgres** (Supabase local):

```bash
npx supabase start
npx supabase db reset
./scripts/verify-schema.sh   # expect: Schema OK
```

`db reset` applies `supabase/migrations/`. There is no `seed.sql` yet; an empty `playable_audio` table is expected.

`DATABASE_URL` in the env examples matches the default local URL:

```
postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

If `supabase start` prints a different URL, copy that into `app/.env.local` and `app/cli/.env`.

## Run the store

```bash
cd app
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

With infra up and no published rows you should see the catalog header and `NO_PUBLISHED_TRACKS`. If Postgres is down you see `CATALOG_UNAVAILABLE`.

There is no seed catalog. Admin upload (`POST /api/admin/upload`) still returns `501`. The CLI `create` command posts to that route and does not insert a row. To see a real cover and stream you have to put objects in MinIO yourself and insert a published `playable_audio` row (published rows require a non-empty `cover_blob_url`).

## Admin CLI (optional)

```bash
cd app/cli
dotnet run -- --help
```

`create` needs `--file` / `-f`, `--title` / `-t`, `--published` / `-p` (`true` or `false`). With the current upload stub, a valid secret yields `not implemented` (HTTP 501). `list`, `update`, `delete`, and `analytics` print `not implemented`.

## Tests

```bash
cd app && npm test
cd app/cli && dotnet test
```

## Ports

| What | Where |
| --- | --- |
| Store | `127.0.0.1:3000` |
| MinIO S3 API | `127.0.0.1:9000` |
| MinIO console | `127.0.0.1:9001` |
| Postgres | `127.0.0.1:54322` |
| Supabase API | `127.0.0.1:54321` |

## Stop

```bash
# from app/, Ctrl+C the Next dev server
docker compose down
npx supabase stop
```
