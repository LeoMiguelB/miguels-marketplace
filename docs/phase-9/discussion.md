# Phase 9 Discussion: Remote Supabase Database Integration & Local Parity

## 1. Context & Objective

In accordance with [docs/phase-9/plan.md](file:///home/lmb/Desktop/projects/miguels-marketplace/docs/phase-9/plan.md), Miguel's Marketplace is transitioning from a purely local development database (`supabase start` running Postgres on port `54322`) to a live remote **Supabase Postgres** instance.

Similar to the Phase 8 transition for object storage (Docker MinIO -> Backblaze B2), the objective is to connect the live marketplace to cloud-hosted infrastructure while:
1. **Preserving 100% local development capability**: Running `npx supabase start` locally must continue to work seamlessly without requiring cloud credentials or an active internet connection.
2. **Supporting Next.js runtime constraints**: Ensuring reliable database connection handling in Next.js Server Components and Route Handlers (connection pooling, SSL handling, prepared statement compatibility).
3. **Maintaining full C# Admin CLI compatibility**: Ensuring commands (`create`, `list`, `update`, `delete`, `analytics`) in [app/cli/](file:///home/lmb/Desktop/projects/miguels-marketplace/app/cli) connect cleanly to both remote Supabase and local Postgres.
4. **Ensuring schema integrity & security**: Applying and validating migrations, constraints, and Row Level Security (RLS) policies on the remote database.

---

## 2. Supabase Connection Modes & Architecture

Supabase provides several distinct connection strings for every project under Project Settings -> Database. Selecting the right connection mode for each component is critical:

| Connection Mode | Port | Protocol / Host | Prepared Statements | IPv4 / IPv6 | Best Use Case |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Direct Connection** | `5432` | `db.[PROJECT_REF].supabase.co` | Supported | IPv6 only (unless paid IPv4 add-on) | CLI migrations, direct DDL |
| **Connection Pooler (Session)** | `5432` | `aws-0-[REGION].pooler.supabase.com` | Supported | IPv4 & IPv6 | Admin CLI tool |
| **Connection Pooler (Transaction)** | `6543` | `aws-0-[REGION].pooler.supabase.com` | **Disabled** (`prepare: false`) | IPv4 & IPv6 | Next.js Serverless / Web App |

```
                                 ┌─────────────────────────────────────────────────┐
                                 │              Remote Supabase Cloud              │
                                 │                                                 │
                                 │  ┌───────────────────────────────────────────┐  │
                                 │  │          Postgres Database (5432)         │  │
                                 │  │  - playable_audio, contacts, installs     │  │
                                 │  │  - Row Level Security (RLS) active        │  │
                                 │  └─────────────────────▲─────────────────────┘  │
                                 │                        │                        │
                                 │  ┌─────────────────────┴─────────────────────┐  │
                                 │  │         Supavisor Connection Pooler       │  │
                                 │  │   Session: :5432    |  Transaction: :6543 │  │
                                 │  └──────────▲──────────────────────▲─────────┘  │
                                 └─────────────┼──────────────────────┼────────────┘
                                               │                      │
                     Session Mode (:5432)      │                      │ Transaction Mode (:6543)
                     (or Direct Connection)    │                      │ (prepare: false, SSL)
                                               │                      │
                                  ┌────────────┴────┐     ┌───────────┴──────────┐
                                  │  C# Admin CLI   │     │  Next.js Application │
                                  │ (app/cli tool)  │     │  (app/src/lib/db.ts) │
                                  └─────────────────┘     └──────────────────────┘
```

### 2.1 Critical Technical Considerations

1. **Prepared Statements in Transaction Mode (Port 6543)**:
   * Supabase's transaction pooler (Supavisor / PgBouncer) terminates client transactions across a shared pool of backend Postgres connections.
   * `postgres.js` (used in [`app/src/lib/db.ts`](file:///home/lmb/Desktop/projects/miguels-marketplace/app/src/lib/db.ts)) enables prepared statements by default. When connected to port 6543, prepared statements will cause `prepared statement "..." does not exist` errors unless `prepare: false` is configured.
   * In [`app/src/lib/db.ts`](file:///home/lmb/Desktop/projects/miguels-marketplace/app/src/lib/db.ts), we should detect if the connection targets the transaction pooler (e.g. port 6543) or allow configuring `prepare: false` when connecting remotely.

2. **SSL Enforcement**:
   * Remote Supabase requires SSL encryption for all external connections.
   * Local Supabase (`127.0.0.1:54322`) does not use SSL.
   * Both [`app/src/lib/db.ts`](file:///home/lmb/Desktop/projects/miguels-marketplace/app/src/lib/db.ts) and the C# CLI's [`InsertPlayableAudioRow.ToNpgsqlConnectionString`](file:///home/lmb/Desktop/projects/miguels-marketplace/app/cli/InsertPlayableAudio.cs) must handle SSL dynamically: enable SSL for remote hosts while leaving SSL disabled for local loopback (`127.0.0.1` / `localhost`).

3. **C# Npgsql Connection String Parsing**:
   * [`InsertPlayableAudioRow.ToNpgsqlConnectionString`](file:///home/lmb/Desktop/projects/miguels-marketplace/app/cli/InsertPlayableAudio.cs) currently parses the URI manually with `new Uri(databaseUrl)`.
   * When using Supabase poolers, the username contains a dot (`postgres.[PROJECT_REF]`), and connection strings include query parameters (`?sslmode=require`).
   * The parser needs to pass SSL options (`SslMode=Require;TrustServerCertificate=true`) when connecting to remote hosts and preserve any connection options.

---

## 3. Key Decision & Discussion Areas

Before finalizing the implementation plan in [docs/phase-9/implementation.md](file:///home/lmb/Desktop/projects/miguels-marketplace/docs/phase-9/implementation.md), we need alignment on the following points:

## 3. Decisions & Findings from User Discussion

During our discussion, we aligned on the following decisions and discovered key network constraints:

### 3.1 Decisions
1. **Remote Migrations**: The 5 migrations have **not** yet been applied to the remote database. We will apply them to the remote Supabase instance.
2. **Connection Information & Project Architecture**:
   * Project Ref: `<PROJECT_REF>`
   * Direct connection string: `postgresql://postgres:[YOUR-PASSWORD]@db.<PROJECT_REF>.supabase.co:5432/postgres`
   * Regional pooler: `aws-0-<REGION>.pooler.supabase.com`
3. **Data Strategy**: **Fresh start**. No legacy or test data needs to be migrated from the local database.

### 3.2 Critical Network Discovery: IPv6 Direct vs IPv4 Pooler
* **Direct Connection (`db.<PROJECT_REF>.supabase.co`)**:
  * Resolves exclusively to an **IPv6 address**.
  * On development machines or local networks lacking an active IPv6 internet route (common across residential ISPs and many standard Linux setups), attempting to connect directly fails with `Network is unreachable (errno 101)`.
* **Supabase Connection Pooler (`aws-0-<REGION>.pooler.supabase.com`)**:
  * Probed and confirmed reachable via **IPv4** on both port `5432` (Session mode) and port `6543` (Transaction mode).
  * Actively accepts connections for tenant `postgres.<PROJECT_REF>`.
  * **Conclusion**: Both Next.js and the C# CLI must support or default to the IPv4 pooler connection string:
    * Session Mode (:5432): `postgresql://postgres.<PROJECT_REF>:[PASSWORD]@aws-0-<REGION>.pooler.supabase.com:5432/postgres`
    * Transaction Mode (:6543): `postgresql://postgres.<PROJECT_REF>:[PASSWORD]@aws-0-<REGION>.pooler.supabase.com:6543/postgres`

---

## 4. Final Scope for Implementation

1. **Next.js Database Client (`app/src/lib/db.ts`)**:
   * Add intelligent options to `postgres(databaseUrl(), { ... })`:
     * Auto-detect remote hosts to enforce `ssl: 'require'`.
     * Auto-detect transaction pooler (port `6543`) to set `prepare: false`.
     * Configure connection pool limits (`max: 10`) appropriate for serverless environments.
2. **C# Admin CLI (`app/cli/InsertPlayableAudio.cs` & Tests)**:
   * Update `ToNpgsqlConnectionString` to support remote Supabase URLs:
     * Enable `SslMode.Require` and `TrustServerCertificate = true` for remote connections.
     * Handle dot usernames (`postgres.[REF]`) and query parameters.
   * Add unit tests in `PersonalMusicStore.Cli.Tests/NpgsqlConnectionStringTests.cs`.
3. **Remote Migration Deployment**:
   * Push all 5 migrations to the remote Supabase database using `npx supabase db push --db-url ...`.
4. **Environment Profiles**:
   * Update `app/.env.example` and `app/cli/.env.example` with documented templates for both Local Dev (Profile A) and Remote Supabase (Profile B).
5. **Enhanced Verification Tooling (`scripts/verify-schema.sh`)**:
   * Update script to accept `DATABASE_URL` as an argument or environment variable, falling back to local Supabase if unset.
   * Verify table existence, column types, constraints, and RLS policies on the target database.

