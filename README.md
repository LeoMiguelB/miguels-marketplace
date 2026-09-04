# Miguel's Marketplace

Public store for Miguel's audio. Visitors browse published tracks, stream previews, review terms and sample clearance agreements, and download high-resolution audio. Admin catalog management and analytics are handled via a local .NET CLI.

This README explains how to run the stack on your machine. Product specs and phase blueprints live in `docs/`.

## Features

- **Storefront & Catalog**:
  - Responsive catalog grid displaying track titles, cover artwork (or deterministic procedural color placeholders), BPM, musical key, and publication dates.
  - Interactive playback directly from track cards with hover states, loading spinner, and animated wave bars.
- **Audio Engine & Player Bar**:
  - Global singleton `AudioEngine` (`useSyncExternalStore`) driving continuous audio playback across client navigation.
  - Sticky bottom player bar with transport controls (Play/Pause, Previous, Next, Loop mode toggle).
  - High-performance 60 FPS scrubber with drag-to-seek, elapsed time, and duration display.
  - Volume slider with mute toggle.
  - MediaSession API integration for OS/browser media keys, lock screen metadata, and notification controls.
- **Terms & Install Flow**:
  - Sample Clearance Agreement PDF viewer embedded directly in the install modal (`/sample-clearance.pdf`).
  - Gated terms acceptance required before download.
  - Contact collection form capturing Email, Name, Role (Producer, Artist, DJ, etc.), Instagram, and X handles.
  - Secure time-limited presigned S3 URLs (`/api/install`) for private high-resolution audio downloads.
- **Admin CLI (.NET 10)**:
  - Full catalog administration with subcommands to `create`, `list`, `update`, `delete` (with MinIO storage cleanup), and view `analytics`.
- **Object Storage Architecture (Backblaze B2 & MinIO)**:
  - Dual-bucket security model: Public bucket for audio previews (`stream/`) and artwork (`cover/`), Private bucket for gated master downloads (`download/`).
  - High-performance HTTP 206 byte-range audio streaming for browser scrub and instant seek.
  - Zero-cost egress capability via Backblaze B2 & Cloudflare Bandwidth Alliance.
  - Full local development parity using Docker Compose MinIO with automatic fallback.

## What you need

- Docker (MinIO + local Supabase)
- Node.js 20+ and npm
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) — `npx supabase` is enough
- [.NET 10 SDK](https://dotnet.microsoft.com/download) — for the admin CLI and test suite
- `psql` — only if you run `scripts/verify-schema.sh`

## Layout

```
app/                 Next.js store (App Router under src/app)
app/cli/             .NET 10 admin CLI (PersonalMusicStore.Cli)
supabase/            Postgres config + SQL migrations
docker-compose.yml   MinIO object storage (not Postgres)
scripts/             Local verification and smoke checks
docs/                Specs, design documents, and phase blueprints
```

Postgres is managed via `supabase start`, not Docker Compose. Docker Compose runs MinIO.

## One-time setup

From the repo root:

```bash
cp app/.env.example app/.env.local
cp app/cli/.env.example app/cli/.env
cd app && npm install
```

`app/.env.example` and `app/cli/.env.example` contain local defaults (Postgres on `127.0.0.1:54322`, MinIO on `127.0.0.1:9000`, shared `ADMIN_SECRET`). Do not commit real env files.

## Start local infra

Run both services and keep them active:

**1. MinIO** (object storage, bucket `music`):

```bash
docker compose up -d minio minio-init
./scripts/verify-minio.sh   # reapplies stream/ + cover/ public policy; expect: MinIO OK
```

- API: `http://127.0.0.1:9000`
- Console: `http://127.0.0.1:9001` (user/pass: `minioadmin` / `minioadmin`)

Public `GetObject` is allowed on `stream/` (previews) and `cover/` (artwork). The `download/` prefix stays private. `scripts/verify-minio.sh` ensures bucket policies are consistently applied even across volume re-creations.

**2. Postgres** (Local Supabase or Remote Supabase Cloud):

The application supports both **Local Supabase** (for offline development) and **Remote Supabase Cloud** via connection pooling.

#### Local Development (Profile A)
```bash
npx supabase start
npx supabase db reset
./scripts/verify-schema.sh   # verifies playable_audio, contacts, installs; expect: Schema OK
```

Local connection string:
```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

#### Remote Supabase Cloud (Profile B)
Remote Supabase projects run behind Supavisor connection poolers. Using the pooler ensures IPv4 compatibility and avoids network-unreachable errors on IPv6-restricted networks:

- **Next.js Web App (`app/.env.local`)**: Uses the **Transaction Pooler** (`:6543`) with automatic `prepare: false` and SSL enforcement:
  ```bash
  DATABASE_URL=postgresql://postgres.<PROJECT_REF>:[YOUR-PASSWORD]@aws-0-<REGION>.pooler.supabase.com:6543/postgres?sslmode=require
  SUPABASE_DB_PASSWORD=<your-database-password>
  ```
- **Admin CLI & Migrations (`app/cli/.env`)**: Uses the **Session Pooler** (`:5432`) for stateful commands and DDL:
  ```bash
  DATABASE_URL=postgresql://postgres.<PROJECT_REF>:[YOUR-PASSWORD]@aws-0-<REGION>.pooler.supabase.com:5432/postgres?sslmode=require
  SUPABASE_DB_PASSWORD=<your-database-password>
  ```

#### Deploying Migrations to Remote Supabase
To apply migrations from `supabase/migrations/` to the remote Supabase project:
```bash
npx supabase db push --db-url "postgresql://postgres.<PROJECT_REF>:[PASSWORD]@aws-0-<REGION>.pooler.supabase.com:5432/postgres?sslmode=require" --include-all
```

#### Verifying Schema
The schema verification script works with both local and remote databases:
```bash
# Verifies database from DATABASE_URL or passes explicit URL:
./scripts/verify-schema.sh
# OR
./scripts/verify-schema.sh "postgresql://postgres.<PROJECT_REF>:[PASSWORD]@aws-0-<REGION>.pooler.supabase.com:5432/postgres?sslmode=require"
```

## Object Storage Configuration (Local MinIO vs. Backblaze B2)

The application supports both **Local MinIO** (default for local development) and **Production Backblaze B2** cloud object storage using a dual-bucket security architecture.

### Where to Put Your Credentials

Object storage credentials are kept in two local files (both are gitignored so your secret keys are never committed to git):
1. **`app/.env.local`** — Used by the Next.js web application and the storage test script (`./scripts/verify-storage.sh`).
2. **`app/cli/.env`** — Used by the .NET admin CLI (`delete --force` and file uploads).

---

### Profile A: Local Development (MinIO)

MinIO runs locally via Docker Compose and uses a single bucket with public/private prefix policies. This is the default in `.env.example`:

```bash
S3_ENDPOINT=http://127.0.0.1:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=music
S3_FORCE_PATH_STYLE=true
```

---

### Profile B: Production Backblaze B2 (Recommended: 100% Private - No Credit Card Required)

Backblaze requires adding a payment method to set buckets to "Public". To run completely **free with zero credit card**, set your bucket to **Private** and use single-bucket presigned streaming:

```bash
S3_ENDPOINT=https://s3.<your-region>.backblazeb2.com
S3_REGION=<your-region>
S3_ACCESS_KEY=<your-keyID>
S3_SECRET_KEY=<your-applicationKey>
S3_BUCKET=<your-bucket-name>
S3_FORCE_PATH_STYLE=false
```

- **How streaming works**: Next.js signs stream and cover URLs during page load (< 1ms HMAC calculation). The browser player (`AudioEngine`) streams audio **directly from Backblaze B2** with HTTP 206 byte-range scrubbing. **Zero audio streaming load on Next.js.**
- **How downloads work**: When a user fills out the install form, `/api/install` issues a 1-hour presigned download link with `Content-Disposition: attachment`.

#### Backblaze B2 Setup Checklist (100% Private):
1. **Create a Single Bucket**:
   - Bucket Name: e.g. `my-music-bucket` (matches `S3_BUCKET`).
   - Files in Bucket Are: **Private** (no credit card requested).
2. **Configure CORS Rules**:
   - In Backblaze B2 Console, open your bucket's **Bucket Settings** ➔ **CORS Rules**.
   - Add a rule to allow web browsers to stream with `Range` requests:
     ```json
     [
       {
         "corsRuleName": "AllowBrowserAudioStreaming",
         "allowedOrigins": ["*"],
         "allowedOperations": ["s3_read", "s3_head", "b2_download_file_by_name"],
         "allowedHeaders": ["*"],
         "exposeHeaders": ["Range", "Content-Range", "Content-Length", "Accept-Ranges", "ETag"],
         "maxAgeSeconds": 3600
       }
     ]
     ```
3. **Generate Application Key**:
   - Under **App Keys**, create an Application Key with **Read and Write** access.
   - Map `keyID` ➔ `S3_ACCESS_KEY` and `applicationKey` ➔ `S3_SECRET_KEY`.
4. **Verify Storage Health**:
   - Run `./scripts/verify-storage.sh` to test connectivity, CORS, presigned streaming, and private download security.

---

### Profile C: Production Backblaze B2 (Dual Bucket: Public Streams + Private Downloads)

If you use dual buckets for public previews and private gated downloads (with Cloudflare Worker for zero-cost egress):

```bash
S3_ENDPOINT=https://s3.<your-region>.backblazeb2.com
S3_REGION=<your-region>
S3_ACCESS_KEY=<your-keyID>
S3_SECRET_KEY=<your-applicationKey>
S3_PUBLIC_BUCKET=miguelbbeats
S3_PRIVATE_BUCKET=store-downloads
S3_FORCE_PATH_STYLE=false
# Cloudflare Worker CDN for free egress (Cloudflare Bandwidth Alliance):
S3_PUBLIC_URL=https://miguels-marketplace-worker.lilpopcorn54321.workers.dev
```

## Run the store

```bash
cd app
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

- If no tracks are published yet, the catalog displays `NO_PUBLISHED_TRACKS`.
- If Postgres is unreachable, the store safely falls back to `CATALOG_UNAVAILABLE`.
- Tracks created with the admin CLI appear immediately upon publication. Tracks without cover art display a deterministic dark procedural block (`#2a2a2a`).

## Admin CLI

The CLI is located in `app/cli/` and is executed with `dotnet run -- <command>`.

### Environment configuration

Loaded from `app/cli/.env`:

- `DATABASE_URL`: Required by `create`, `list`, `update`, `delete`, and `analytics`.
- `UPLOAD_API_URL` & `ADMIN_SECRET`: Required by `create` (Next.js server must be running).
- `S3_*` variables: Required by `delete --force` when purging files directly from object storage (MinIO or Backblaze B2).

### Commands

#### 1. `create`

Uploads audio and optional cover art through Next.js (`POST /api/admin/upload`), stores objects in object storage (public & private buckets), and records a new row in Postgres. Prints the created row ID.

```bash
cd app/cli

# Basic upload
dotnet run -- create -f /path/to/track.wav -t "Night Drive" -p true

# Upload with cover image, BPM, and musical key
dotnet run -- create -f /path/to/beat.wav -t "Sunset Chill" -p true --cover /path/to/art.png --bpm 120 --key "F# Maj"
```

Options:

- `-f`, `--file <path>`: Local audio file (`.wav`, `.mp3`, `.flac`, `.aiff`) *(Required)*
- `-t`, `--title <string>`: Track title *(Required)*
- `-p`, `--published <true|false>`: Track publication status (`true` or `false`) *(Required)*
- `--cover <path>`: Local image file (`.png`, `.jpg`, `.webp`, `.avif`) *(Optional)*
- `--bpm <int>`: Tempo in beats per minute *(Optional)*
- `--key <string>`: Musical key, e.g. `"C min"`, `"F# Maj"` *(Optional)*

*(Note: Next.js must be running at `UPLOAD_API_URL` for `create`)*

#### 2. `list`

Displays a formatted ASCII table of all audio tracks in Postgres (both published and drafts) ordered newest first.

```bash
cd app/cli
dotnet run -- list
```

Output format: `ID | Title | Pub | BPM | Key | Created At`

#### 3. `update`

Updates metadata or publication status for an existing track row in Postgres.

```bash
cd app/cli

# Update title and BPM
dotnet run -- update --id 1 --title "Sunset Chill (Extended)" --bpm 124

# Unpublish a track
dotnet run -- update --id 1 --published false

# Update musical key
dotnet run -- update --id 1 --key "G min"
```

Options:

- `--id <int>`: Audio ID to update *(Required)*
- `--title <string>`: New title *(Optional)*
- `--published <true|false>`: New published status *(Optional)*
- `--bpm <int>`: New BPM *(Optional)*
- `--key <string>`: New musical key *(Optional)*

#### 4. `delete`

Deletes an audio track by ID.

```bash
cd app/cli

# Delete DB record only
dotnet run -- delete --id 1

# Delete DB record AND purge associated S3 files (stream, download, cover) from object storage
dotnet run -- delete --id 1 --force
```

Options:

- `--id <int>`: Audio ID to delete *(Required)*
- `--force`: Also delete stored blobs from object storage (MinIO or Backblaze B2) *(Optional)*

#### 5. `analytics`

Inspects download counts and contact submissions captured during the install flow.

```bash
cd app/cli

# View aggregated download totals across all tracks
dotnet run -- analytics

# View contact details (email, role, Instagram, X) for a specific track
dotnet run -- analytics --id 1
```

Options:

- `--id <int>`: Audio ID to inspect *(Optional)*

## API Endpoints

The Next.js backend exposes the following API routes:

- `POST /api/admin/upload`:
  - Protected route requiring header `X-Admin-Secret: <ADMIN_SECRET>`.
  - Accepts `multipart/form-data` with `file` (audio), `title`, `published`, and optional `cover` (image).
  - Puts audio into object storage under `stream/<uuid>` (public bucket) and `download/<uuid>` (private bucket), plus `cover/<uuid>` (public bucket) if present.
  - Returns `stream_blob_url`, `download_blob_url`, and `cover_blob_url`.
- `POST /api/install`:
  - Accepts JSON payload with `email` (required), `trackId` (required), and optional `name`, `role`, `instagram`, `x`.
  - Upserts contact info in the `contacts` table.
  - Records or increments download counts in the `installs` table.
  - Generates and returns a signed, time-limited S3 presigned URL for private download with native file attachment header (`Content-Disposition: attachment; filename="<title>.<ext>"`).

## Tests

Run the full automated test suite for both Next.js and the .NET CLI:

```bash
# Next.js / Vitest unit tests (audio engine, catalog, upload, terms/install)
cd app && npm test

# .NET / xUnit CLI unit tests (CLI actions, connection strings, insert mapping)
cd app/cli && dotnet test
```

## Verification Scripts

Helper scripts verify infrastructure health against the project specifications:

- `./scripts/verify-minio.sh`: Checks MinIO health on `127.0.0.1:9000` and verifies anonymous access to `stream/` and `cover/`.
- `./scripts/verify-storage.sh`: Validates object storage health (MinIO or Backblaze B2), CORS range headers, byte-range streaming (HTTP 206), private bucket access denial, and presigned download flow.
- `./scripts/verify-schema.sh`: Verifies Supabase Postgres connectivity, table schema (`playable_audio`, `contacts`, `installs`), and column constraints (`bpm`, `key`, `cover_blob_url`).

## Ports

| Service               | Address                  |
| --------------------- | ------------------------ |
| Next.js Storefront    | `http://127.0.0.1:3000`  |
| MinIO S3 API          | `http://127.0.0.1:9000`  |
| MinIO Web Console     | `http://127.0.0.1:9001`  |
| Supabase Postgres     | `127.0.0.1:54322`        |
| Supabase Studio / API | `http://127.0.0.1:54321` |

## Stop

```bash
# Stop the Next.js dev server: Ctrl+C in its terminal
docker compose down
npx supabase stop
```
