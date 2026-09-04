# Phase 9 Implementation Plan: Remote Supabase Database Integration & Local Parity

## 1. Goal & Objectives

Phase 9 transitions Miguel's Marketplace from a local-only database (`127.0.0.1:54322` via local Docker Supabase) to a live, cloud-hosted **Supabase PostgreSQL** database in accordance with [docs/phase-9/plan.md](file:///home/lmb/Desktop/projects/miguels-marketplace/docs/phase-9/plan.md) and [docs/phase-9/discussion.md](file:///home/lmb/Desktop/projects/miguels-marketplace/docs/phase-9/discussion.md).

### Core Objectives:
1. **Remote Supabase Connectivity**: Connect Next.js and the C# Admin CLI to the remote Supabase project (`<PROJECT_REF>` in `<REGION>`).
2. **IPv4 Pooler Routing**: Route connections through Supabase's IPv4 Supavisor connection pooler (`aws-0-<REGION>.pooler.supabase.com`) to avoid IPv6-only unreachable network errors on local ISP/Linux environments.
3. **Transaction Pooler Compatibility in Next.js**: Configure `postgres.js` in [`app/src/lib/db.ts`](file:///home/lmb/Desktop/projects/miguels-marketplace/app/src/lib/db.ts) with `prepare: false` and SSL enforcement when targeting remote poolers, while preserving local development defaults.
4. **C# Admin CLI Parser Enhancement**: Update [`InsertPlayableAudioRow.ToNpgsqlConnectionString`](file:///home/lmb/Desktop/projects/miguels-marketplace/app/cli/InsertPlayableAudio.cs) to properly negotiate SSL (`SslMode=Require`) and parse pooler usernames containing tenant dots (`postgres.<PROJECT_REF>`).
5. **Automated Migration Deployment**: Apply all 5 SQL migrations in [`supabase/migrations/`](file:///home/lmb/Desktop/projects/miguels-marketplace/supabase/migrations/) to the live Supabase instance using `npx supabase db push --db-url`.
6. **Universal Schema Verification**: Upgrade [`scripts/verify-schema.sh`](file:///home/lmb/Desktop/projects/miguels-marketplace/scripts/verify-schema.sh) to accept `DATABASE_URL` from the environment or as a CLI argument to verify tables, columns, constraints, and RLS policies on either local or remote databases.
7. **Environment Profiles & 100% Local Parity**: Document distinct profiles in `.env.example` so developers can switch between local Docker Postgres and remote Supabase instantly.

---

## 2. Network Topography & Connection Strings

### 2.1 Remote Supabase Project Details
* **Project Reference**: `<PROJECT_REF>`
* **Region**: `<REGION>` (AWS)
* **Direct Host**: `db.<PROJECT_REF>.supabase.co` *(IPv6 only - unreachable on IPv4-only networks)*
* **Pooler Host**: `aws-0-<REGION>.pooler.supabase.com` *(IPv4 & IPv6 reachable)*

### 2.2 Connection String Profiles

#### Next.js Web App (`app/.env.local`)
Uses the **Transaction Pooler** (`:6543`) for scalable connection multiplexing in serverless runtimes:
```bash
DATABASE_URL=postgresql://postgres.<PROJECT_REF>:[PASSWORD]@aws-0-<REGION>.pooler.supabase.com:6543/postgres?sslmode=require
```

#### C# Admin CLI & Migration Tooling (`app/cli/.env`)
Uses the **Session Pooler** (`:5432`) for stateful DDL migrations, long-running CLI operations, and prepared statement compatibility:
```bash
DATABASE_URL=postgresql://postgres.<PROJECT_REF>:[PASSWORD]@aws-0-<REGION>.pooler.supabase.com:5432/postgres?sslmode=require
```

#### Local Development (Fallback)
```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

---

## 3. Step-by-Step Implementation Tasks

### Task 1: Next.js Database Client Configuration ([app/src/lib/db.ts](file:///home/lmb/Desktop/projects/miguels-marketplace/app/src/lib/db.ts))
* **Objective**: Automatically apply appropriate connection settings based on the target URL.
* **Logic**:
  1. Inspect `DATABASE_URL`.
  2. Check if host is remote (`!url.includes("127.0.0.1") && !url.includes("localhost")`).
  3. If remote, enforce `ssl: "require"`. If local, disable SSL (`ssl: false`).
  4. Check if connected to transaction pooler (`url.includes(":6543")`).
  5. If on port `6543`, set `prepare: false` (to prevent Supavisor `prepared statement does not exist` errors). If not on `6543`, leave `prepare: true`.
  6. Configure client pool sizing: `max: 10`, `idle_timeout: 20`, `connect_timeout: 10`.
* **Verification**: Run `npm test` in `app/` to ensure all existing test suites pass.

### Task 2: C# Admin CLI Connection String Parser ([app/cli/InsertPlayableAudio.cs](file:///home/lmb/Desktop/projects/miguels-marketplace/app/cli/InsertPlayableAudio.cs))
* **Objective**: Enable Npgsql to connect securely to remote Supabase instances.
* **Logic**:
  1. Update `ToNpgsqlConnectionString(string databaseUrl)`:
     - Check if host is remote (not `127.0.0.1`, `localhost`, or loopback).
     - If remote, set `builder.SslMode = SslMode.Require` and `builder.TrustServerCertificate = true`.
     - Parse username safely (handling `postgres.<PROJECT_REF>`).
     - Parse port safely (defaulting to 5432 if unspecified).
  2. Update unit tests in [`PersonalMusicStore.Cli.Tests/NpgsqlConnectionStringTests.cs`](file:///home/lmb/Desktop/projects/miguels-marketplace/app/cli/PersonalMusicStore.Cli.Tests/NpgsqlConnectionStringTests.cs):
     - Test local connection string (`127.0.0.1:54322`).
     - Test remote Supabase session pooler connection string (`aws-0-<REGION>.pooler.supabase.com:5432`).
     - Test remote Supabase transaction pooler connection string (`aws-0-<REGION>.pooler.supabase.com:6543`).
* **Verification**: Run `dotnet test` in `app/cli/`.

### Task 3: Remote Database Migration Deployment
* **Objective**: Apply the full schema to the remote database.
* **Logic**:
  1. Use Supabase CLI with `--db-url` pointing to the remote session pooler (`:5432`):
     ```bash
     npx supabase db push --db-url "postgresql://postgres.<PROJECT_REF>:[PASSWORD]@aws-0-<REGION>.pooler.supabase.com:5432/postgres?sslmode=require" --include-all
     ```
  2. This applies all 5 migrations in sequence:
     - `20260827120000_init.sql` (Creates `playable_audio`, `contacts`, `installs`)
     - `20260830200000_cover_blob_url.sql` (Adds `cover_blob_url`)
     - `20260830210000_drop_published_cover_check.sql` (Drops legacy check constraint)
     - `20260903120000_bpm_and_key.sql` (Adds `bpm` and `key` columns)
     - `20260904120000_enable_rls.sql` (Enables RLS on all tables and revokes anon access)
* **Verification**: Verify migration history recorded in `supabase_migrations.schema_migrations`.

### Task 4: Upgrade Verification Script ([scripts/verify-schema.sh](file:///home/lmb/Desktop/projects/miguels-marketplace/scripts/verify-schema.sh))
* **Objective**: Allow running schema and RLS verification against either local or remote database.
* **Logic**:
  1. Allow `DB_URL` resolution precedence:
     - First: First command-line argument (`$1`).
     - Second: `DATABASE_URL` environment variable.
     - Third: `npx supabase status -o env` (for local Docker Supabase).
  2. Verify all tables exist: `playable_audio`, `contacts`, `installs`.
  3. Verify columns exist: `cover_blob_url`, `bpm`, `key`.
  4. Verify constraint drop: `playable_audio_published_cover_check` is absent.
  5. Verify RLS is enabled:
     ```sql
     select rowsecurity from pg_tables where schemaname='public' and tablename='playable_audio';
     ```
  6. Execute a test insert and cleanup transaction to verify write permissions.
* **Verification**: Run `./scripts/verify-schema.sh` against the remote database.

### Task 5: Environment Files & Documentation
* **Objective**: Clear instructions and templates for local vs production environments.
* **Updates**:
  1. [`app/.env.example`](file:///home/lmb/Desktop/projects/miguels-marketplace/app/.env.example):
     - Add Profile A (Local Supabase) and Profile B (Remote Supabase Pooler).
  2. [`app/cli/.env.example`](file:///home/lmb/Desktop/projects/miguels-marketplace/app/cli/.env.example):
     - Add Profile A (Local Supabase) and Profile B (Remote Supabase Pooler).
  3. [`README.md`](file:///home/lmb/Desktop/projects/miguels-marketplace/README.md):
     - Document remote Supabase setup, pooler URL formatting, and migration deployment.

### Task 6: End-to-End Validation
1. **Schema Check**: Run `./scripts/verify-schema.sh "$DATABASE_URL"`.
2. **CLI Commands**:
   - `dotnet run -- list`: Confirms empty table read (fresh start).
   - `dotnet run -- analytics`: Confirms contacts/installs aggregation queries work without error.
3. **Next.js Web Player**:
   - Start Next.js dev server with remote `DATABASE_URL`.
   - Verify `GET /` renders the store successfully without `CATALOG_UNAVAILABLE` error.
4. **Test Suite**: Run full test suites (`npm test` and `dotnet test`).

---

## 4. Execution Readiness

To begin execution of Step 3 (applying migrations) and Step 6 (live verification), the remote database password is required. The password can either be provided directly or placed into [`app/.env.local`](file:///home/lmb/Desktop/projects/miguels-marketplace/app/.env.local) and [`app/cli/.env`](file:///home/lmb/Desktop/projects/miguels-marketplace/app/cli/.env).
