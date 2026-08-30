# Scaffolding and Local Infra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a bootable tree (local Supabase Postgres, MinIO, Next.js stub store, .NET CLI) with no product features.

**Architecture:** Next.js in `app/` (App Router under `src/app`) owns a secret-gated upload stub and unused server-only Postgres/S3 clients. Schema lives in `supabase/migrations/` and is applied with the Supabase CLI. MinIO is a separate Compose file (S3 API). The .NET CLI lives in `app/cli/`, prints help, and POSTs create to the stub without inserting rows.

**Tech Stack:** Next.js App Router, TypeScript, npm, postgres.js, AWS SDK v3, Supabase CLI, Docker Compose (MinIO), .NET 8, System.CommandLine, Npgsql (package only this pass).

## Global Constraints

- Next.js location: `app/` (project root for the store)
- CLI location: `app/cli/`
- Next.js routes: App Router under `app/src/app` so we do not nest `app/app/`
- Schema ownership: SQL migrations in git via Supabase CLI only (no Prisma migrate, no Drizzle migrate)
- Next.js data access: server-only; browser never uses the anon key
- Object storage now: MinIO; later Backblaze via env swap
- Stream vs download: same bytes, two objects; no transcode
- Public auth: none
- Admin header: `X-Admin-Secret` must equal `ADMIN_SECRET`
- Upload stub: missing/wrong secret → `401` `{ "error": "unauthorized" }`; valid secret → `501` `{ "error": "not implemented" }`
- Multipart field names (stable for later): `file`, `title`, `published`
- Do not implement catalog, player, install form, T&C, PutObject, CLI Npgsql writes, cloud Supabase, or Backblaze
- Commit only when the user asks; skip `git commit` steps unless they have explicitly requested commits

## File structure

| Path | Responsibility |
| --- | --- |
| `.gitignore` | Ignore env files, `app/node_modules`, `app/.next`, Supabase temp, CLI `bin/obj` |
| `docker-compose.yml` | MinIO API `:9000` and console `:9001`, plus init job for bucket `music` |
| `minio/stream-public-policy.json` | Public `GetObject` for `music/stream/*` only |
| `scripts/verify-minio.sh` | Health + bucket exists |
| `scripts/verify-schema.sh` | Three public tables exist |
| `supabase/config.toml` | From `supabase init` (do not hand-write) |
| `supabase/migrations/20260827120000_init.sql` | `playable_audio`, `contacts`, `installs` |
| `app/.env.example` | Placeholder Next.js env names |
| `app/.env.local` | Local secrets (gitignored; copy from example) |
| `app/src/app/page.tsx` | Blank `/` |
| `app/src/lib/admin-auth.ts` | Shared-secret check |
| `app/src/lib/db.ts` | Server-only postgres.js client |
| `app/src/lib/s3.ts` | Server-only S3 client + prefixes |
| `app/src/app/api/admin/upload/route.ts` | `POST` stub |
| `app/src/lib/admin-auth.test.ts` | Auth unit tests |
| `app/src/app/api/admin/upload/route.test.ts` | 401/501 tests |
| `app/cli/PersonalMusicStore.Cli.csproj` | .NET 8 console |
| `app/cli/EnvLoader.cs` | Load `app/cli/.env` |
| `app/cli/CreatePlayableAudio.cs` | POST multipart to upload URL |
| `app/cli/Program.cs` | Commands: create/list/update/delete/analytics |
| `app/cli/.env.example` | Placeholder CLI env names |

---

### Task 1: Gitignore, env examples, MinIO

**Files:**
- Create: `.gitignore`
- Create: `docker-compose.yml`
- Create: `minio/stream-public-policy.json`
- Create: `scripts/verify-minio.sh`
- Create: `app/.env.example`
- Create: `app/cli/.env.example`

**Interfaces:**
- Consumes: nothing
- Produces: MinIO at `http://127.0.0.1:9000`, console `http://127.0.0.1:9001`, bucket `music`, prefixes `stream/` (public-read) and `download/` (private). Example env keys listed below.

- [x] **Step 1: Write the MinIO verify script (fails until Compose is up)**

Create `scripts/verify-minio.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

code="$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9000/minio/health/live || true)"
if [[ "$code" != "200" ]]; then
  echo "MinIO health failed (HTTP ${code:-none})"
  exit 1
fi

docker compose --profile tools run --rm --entrypoint /bin/sh minio-mc -c '
  mc alias set local http://minio:9000 minioadmin minioadmin >/dev/null
  mc ls local/music >/dev/null
'

echo "MinIO OK"
```

- [x] **Step 2: Run it to make sure it fails**

Run:

```bash
chmod +x scripts/verify-minio.sh
./scripts/verify-minio.sh
```

Expected: FAIL (connection refused or non-200). Do not start Compose yet.

- [x] **Step 3: Write gitignore, env examples, policy, Compose**

Create `.gitignore`:

```
.env
.env.local
.env*.local
app/.env.local
app/cli/.env
app/node_modules/
app/.next/
app/out/
app/cli/bin/
app/cli/obj/
supabase/.temp/
supabase/.branches/
```

Create `app/.env.example`:

```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
ADMIN_SECRET=dev-admin-secret
S3_ENDPOINT=http://127.0.0.1:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=music
S3_FORCE_PATH_STYLE=true
```

Create `app/cli/.env.example`:

```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
UPLOAD_API_URL=http://127.0.0.1:3000/api/admin/upload
ADMIN_SECRET=dev-admin-secret
```

Create `minio/stream-public-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "AWS": ["*"] },
      "Action": ["s3:GetObject"],
      "Resource": ["arn:aws:s3:::music/stream/*"]
    }
  ]
}
```

Create `docker-compose.yml`:

```yaml
services:
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports:
      - "127.0.0.1:9000:9000"
      - "127.0.0.1:9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio-data:/data

  minio-init:
    image: minio/mc:latest
    depends_on:
      - minio
    restart: on-failure
    volumes:
      - ./minio/stream-public-policy.json:/policy.json:ro
    entrypoint: ["/bin/sh", "-c"]
    command:
      - |
        sleep 8
        mc alias set local http://minio:9000 minioadmin minioadmin
        mc mb -p local/music
        mc anonymous set-json /policy.json local/music

  minio-mc:
    image: minio/mc:latest
    depends_on:
      - minio
    profiles: ["tools"]
    entrypoint: ["mc"]

volumes:
  minio-data:
```

- [x] **Step 4: Start MinIO and re-run verify**

Run:

```bash
docker compose up -d minio minio-init
sleep 8
./scripts/verify-minio.sh
```

Expected: `MinIO OK`. If `mc ls` fails, check `docker compose logs minio-init`.

- [x] **Step 5: Commit (only if the user asked for commits)**

```bash
git add .gitignore docker-compose.yml minio/stream-public-policy.json scripts/verify-minio.sh app/.env.example app/cli/.env.example
git commit -m "$(cat <<'EOF'
Add local MinIO stack and env examples.

EOF
)"
```

---

### Task 2: Supabase schema

**Files:**
- Create: `supabase/config.toml` (via CLI)
- Create: `supabase/migrations/20260827120000_init.sql`
- Create: `scripts/verify-schema.sh`

**Interfaces:**
- Consumes: nothing
- Produces: tables `playable_audio`, `contacts`, `installs` on local Postgres (`DB_URL` from `npx supabase status`)

- [x] **Step 1: Write the schema verify script (fails until migration exists)**

Create `scripts/verify-schema.sh`:

```bash
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
```

- [x] **Step 2: Init and start Supabase, run verify (expect fail)**

From repo root `/home/lbantoli/Desktop/projects/personal-music-store`:

```bash
chmod +x scripts/verify-schema.sh
npx supabase init
npx supabase start
./scripts/verify-schema.sh
```

Expected: FAIL (`grep` cannot find the three tables). If `psql` is missing, install the Postgres client (`postgresql` / `postgresql-libs`) so it can reach `127.0.0.1:54322`.

Do not add the migration until this fail is observed.

- [x] **Step 3: Write migration 1**

Create `supabase/migrations/20260827120000_init.sql`:

```sql
create table playable_audio (
  id integer generated by default as identity primary key,
  title text not null,
  published boolean not null default false,
  stream_blob_url text not null,
  download_blob_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table contacts (
  id integer generated by default as identity primary key,
  email text not null unique,
  name text null,
  role text null,
  instagram text null,
  x_handle text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_role_check check (
    role is null or role in ('producer', 'artist', 'other')
  )
);

create table installs (
  id integer generated by default as identity primary key,
  contact_id integer not null references contacts (id) on delete restrict,
  playable_audio_id integer not null references playable_audio (id) on delete cascade,
  count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint installs_count_check check (count >= 1),
  constraint installs_contact_audio_unique unique (contact_id, playable_audio_id)
);
```

- [x] **Step 4: Apply and verify**

Run:

```bash
npx supabase db reset
./scripts/verify-schema.sh
```

Expected: `Schema OK`.

Optional visual check:

```bash
psql "$(npx supabase status -o env | awk -F= '/^DB_URL=/{print $2}' | tr -d '"')" -c '\dt'
```

Expected: `playable_audio`, `contacts`, `installs`.

- [x] **Step 5: Commit (only if the user asked for commits)**

```bash
git add supabase scripts/verify-schema.sh
git commit -m "$(cat <<'EOF'
Add local Supabase schema for catalog, contacts, and installs.

EOF
)"
```

---

### Task 3: Next.js app shell

**Files:**
- Create: `app/` Next.js project via `create-next-app` (many generated files)
- Modify: `app/src/app/page.tsx` (replace default landing)
- Modify: `app/tsconfig.json` (`exclude` `cli`)
- Modify: `app/eslint.config.mjs` (ignore `cli/**`)
- Create: `app/.env.local` (copy from example; gitignored)

**Interfaces:**
- Consumes: `app/.env.example` keys
- Produces: `next dev` serves `/` as an empty `<main />`

- [ ] **Step 1: Scaffold Next.js in `app/`**

`app/` already has `.env.example`. Move it out, scaffold, move it back:

```bash
cd /home/lbantoli/Desktop/projects/personal-music-store
mv app/.env.example /tmp/pms-app.env.example
cd app
npx create-next-app@latest . --typescript --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
mv /tmp/pms-app.env.example .env.example
```

Confirm `app/src/app/` exists. Do not nest another Next project as `app/app` as the npm root.

- [ ] **Step 2: Blank page and ignore CLI**

Replace `app/src/app/page.tsx` with:

```tsx
export default function Home() {
  return <main />;
}
```

Keep `app/src/app/layout.tsx` but set a simple title. Replace `metadata` with:

```tsx
export const metadata = {
  title: "Personal Music Store",
};
```

Leave the rest of `layout.tsx` as generated (html/body + `children`).

In `app/tsconfig.json`, set:

```json
"exclude": ["node_modules", "cli"]
```

In `app/eslint.config.mjs`, add `cli/**` to `ignores` (merge with whatever `create-next-app` generated). Example if the file uses `defineConfig` with an `ignores` array:

```js
ignores: [".next/**", "cli/**"]
```

Copy env:

```bash
cp /home/lbantoli/Desktop/projects/personal-music-store/app/.env.example /home/lbantoli/Desktop/projects/personal-music-store/app/.env.local
```

Fill `DATABASE_URL` from `npx supabase status` if it is not the default `54322` URL.

- [ ] **Step 3: Prove `/` boots**

Run:

```bash
cd /home/lbantoli/Desktop/projects/personal-music-store/app
npm run build
```

Expected: compile success.

Then:

```bash
npm run dev
```

In another terminal:

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/
```

Expected: `200`. Stop looking for catalog copy; the body is an empty main.

- [ ] **Step 4: Commit (only if the user asked for commits)**

```bash
git add app
git commit -m "$(cat <<'EOF'
Scaffold Next.js store with a blank home route.

EOF
)"
```

Do not commit `app/.env.local` or `app/node_modules`.

---

### Task 4: Admin secret helper and upload stub

**Files:**
- Create: `app/vitest.config.ts`
- Modify: `app/package.json` (add `test` script)
- Create: `app/src/lib/admin-auth.ts`
- Create: `app/src/lib/admin-auth.test.ts`
- Create: `app/src/app/api/admin/upload/route.ts`
- Create: `app/src/app/api/admin/upload/route.test.ts`

**Interfaces:**
- Consumes: `process.env.ADMIN_SECRET`
- Produces:
  - `adminSecretOk(headerValue: string | null, expected: string | undefined): boolean`
  - `POST(request: Request): Promise<Response>` at `/api/admin/upload`
  - Header name `X-Admin-Secret`
  - `401` `{ "error": "unauthorized" }`, `501` `{ "error": "not implemented" }`

- [ ] **Step 1: Add Vitest and write failing auth tests**

From `app/`:

```bash
npm install -D vitest vite-tsconfig-paths
```

Create `app/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

In `app/package.json` scripts, add `"test": "vitest run"`.

Create `app/src/lib/admin-auth.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { adminSecretOk } from "./admin-auth";

describe("adminSecretOk", () => {
  test("false when header missing", () => {
    expect(adminSecretOk(null, "secret")).toBe(false);
  });

  test("false when expected missing", () => {
    expect(adminSecretOk("secret", undefined)).toBe(false);
  });

  test("false when expected empty", () => {
    expect(adminSecretOk("secret", "")).toBe(false);
  });

  test("false when mismatch", () => {
    expect(adminSecretOk("a", "b")).toBe(false);
  });

  test("true when match", () => {
    expect(adminSecretOk("secret", "secret")).toBe(true);
  });
});
```

Create `app/src/app/api/admin/upload/route.test.ts`:

```ts
import { afterEach, describe, expect, test } from "vitest";
import { POST } from "./route";

const original = process.env.ADMIN_SECRET;

afterEach(() => {
  process.env.ADMIN_SECRET = original;
});

describe("POST /api/admin/upload", () => {
  test("401 without secret", async () => {
    process.env.ADMIN_SECRET = "test-secret";
    const res = await POST(new Request("http://127.0.0.1/api/admin/upload", { method: "POST" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  test("401 with wrong secret", async () => {
    process.env.ADMIN_SECRET = "test-secret";
    const res = await POST(
      new Request("http://127.0.0.1/api/admin/upload", {
        method: "POST",
        headers: { "X-Admin-Secret": "nope" },
      }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  test("501 with valid secret", async () => {
    process.env.ADMIN_SECRET = "test-secret";
    const res = await POST(
      new Request("http://127.0.0.1/api/admin/upload", {
        method: "POST",
        headers: { "X-Admin-Secret": "test-secret" },
      }),
    );
    expect(res.status).toBe(501);
    expect(await res.json()).toEqual({ error: "not implemented" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/lbantoli/Desktop/projects/personal-music-store/app
npm test
```

Expected: FAIL (cannot find `./admin-auth` and/or `./route`).

- [ ] **Step 3: Implement auth helper and route**

Create `app/src/lib/admin-auth.ts`:

```ts
export function adminSecretOk(
  headerValue: string | null,
  expected: string | undefined,
): boolean {
  if (!expected || expected.length === 0) {
    return false;
  }
  if (!headerValue) {
    return false;
  }
  return headerValue === expected;
}
```

Create `app/src/app/api/admin/upload/route.ts`:

```ts
import { adminSecretOk } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const header = request.headers.get("X-Admin-Secret");
  if (!adminSecretOk(header, process.env.ADMIN_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json({ error: "not implemented" }, { status: 501 });
}
```

Do not write objects. Do not touch Postgres. Do not return blob URLs.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/lbantoli/Desktop/projects/personal-music-store/app
npm test
```

Expected: PASS (all five auth tests + three route tests).

- [ ] **Step 5: HTTP check against `next dev`**

With `npm run dev` running and `ADMIN_SECRET` in `.env.local` equal to `dev-admin-secret`:

```bash
curl -s -o /tmp/upload-no-secret.json -w "%{http_code}" -X POST http://127.0.0.1:3000/api/admin/upload
echo
cat /tmp/upload-no-secret.json
```

Expected: `401` and `{"error":"unauthorized"}`.

```bash
curl -s -o /tmp/upload-ok.json -w "%{http_code}" -X POST http://127.0.0.1:3000/api/admin/upload -H "X-Admin-Secret: dev-admin-secret"
echo
cat /tmp/upload-ok.json
```

Expected: `501` and `{"error":"not implemented"}`.

- [ ] **Step 6: Commit (only if the user asked for commits)**

```bash
git add app/src/lib/admin-auth.ts app/src/lib/admin-auth.test.ts app/src/app/api/admin/upload app/vitest.config.ts app/package.json app/package-lock.json
git commit -m "$(cat <<'EOF'
Add secret-gated admin upload stub.

EOF
)"
```

---

### Task 5: Server-only db and S3 clients

**Files:**
- Create: `app/src/lib/db.ts`
- Create: `app/src/lib/s3.ts`

**Interfaces:**
- Consumes: `DATABASE_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE`
- Produces:
  - `sql` — postgres.js client
  - `s3` — `S3Client`
  - `bucket: string`
  - `STREAM_PREFIX = "stream/"`
  - `DOWNLOAD_PREFIX = "download/"`
- These modules must not be imported by `page.tsx` or the upload stub in this pass

- [ ] **Step 1: Install libraries**

```bash
cd /home/lbantoli/Desktop/projects/personal-music-store/app
npm install postgres @aws-sdk/client-s3 server-only
```

- [ ] **Step 2: Write clients**

Create `app/src/lib/db.ts`:

```ts
import "server-only";
import postgres from "postgres";

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

export const sql = postgres(databaseUrl());
```

Create `app/src/lib/s3.ts`:

```ts
import "server-only";
import { S3Client } from "@aws-sdk/client-s3";

export const STREAM_PREFIX = "stream/";
export const DOWNLOAD_PREFIX = "download/";

export const bucket = process.env.S3_BUCKET ?? "";

export const s3 = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "",
  },
});
```

Do not import these from the upload route yet (`next build` would otherwise require `DATABASE_URL` at module load for `db.ts` if the route imported it). Leave them unused.

- [ ] **Step 3: Confirm tests and build still pass**

```bash
cd /home/lbantoli/Desktop/projects/personal-music-store/app
npm test
npm run build
```

Expected: PASS / compile success. `db.ts` is not imported, so build must not throw `DATABASE_URL is not set`.

- [ ] **Step 4: Commit (only if the user asked for commits)**

```bash
git add app/src/lib/db.ts app/src/lib/s3.ts app/package.json app/package-lock.json
git commit -m "$(cat <<'EOF'
Add unused server-only Postgres and S3 clients.

EOF
)"
```

---

### Task 6: .NET admin CLI

**Files:**
- Create: `app/cli/PersonalMusicStore.Cli.csproj`
- Create: `app/cli/EnvLoader.cs`
- Create: `app/cli/CreatePlayableAudio.cs`
- Create: `app/cli/Program.cs`
- Create: `app/cli/PersonalMusicStore.Cli.Tests/PersonalMusicStore.Cli.Tests.csproj`
- Create: `app/cli/PersonalMusicStore.Cli.Tests/CreatePlayableAudioTests.cs`
- Create: `app/cli/.env` from example (gitignored)

**Interfaces:**
- Consumes: `UPLOAD_API_URL`, `ADMIN_SECRET` from `app/cli/.env`; multipart fields `file`, `title`, `published`; header `X-Admin-Secret`
- Produces:
  - Commands: `create`, `list`, `update`, `delete`, `analytics`
  - `create --file|-f` `FileInfo`, `--title|-t` `string`, `--published|-p` `true|false`
  - `CreatePlayableAudio.RunAsync(...)` → `401` prints `secret failed` to stderr, exit `1`; `501` prints `not implemented` to stdout, exit `0`
  - `list` / `update` / `delete` / `analytics` print `not implemented` to stderr, exit `1`
  - No Npgsql calls

- [ ] **Step 1: Scaffold the console project and a test project**

```bash
cd /home/lbantoli/Desktop/projects/personal-music-store/app/cli
dotnet new console -n PersonalMusicStore.Cli -o . --framework net8.0 --force
dotnet add package System.CommandLine --version 2.0.0
dotnet add package Npgsql
dotnet new xunit -n PersonalMusicStore.Cli.Tests -o PersonalMusicStore.Cli.Tests --framework net8.0
dotnet add PersonalMusicStore.Cli.Tests/PersonalMusicStore.Cli.Tests.csproj reference PersonalMusicStore.Cli.csproj
```

If `dotnet new console` overwrites `.env.example`, restore it from git or recopy the Task 1 contents.

- [ ] **Step 2: Write failing tests for create HTTP handling**

Create `app/cli/CreatePlayableAudio.cs` as a stub that throws so tests fail for the right reason, or skip the stub and let tests fail to compile. Prefer compile-fail then implement.

Create `app/cli/PersonalMusicStore.Cli.Tests/CreatePlayableAudioTests.cs`:

```csharp
using System.Net;
using System.Net.Http;
using System.Text;
using PersonalMusicStore.Cli;

namespace PersonalMusicStore.Cli.Tests;

public class CreatePlayableAudioTests
{
    private static async Task<(int Exit, string Stdout, string Stderr)> Invoke(
        HttpStatusCode status,
        string json)
    {
        var handler = new StubHandler(new HttpResponseMessage(status)
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json"),
        });
        using var http = new HttpClient(handler);
        using var stdout = new StringWriter();
        using var stderr = new StringWriter();
        var file = new FileInfo(Path.GetTempFileName());
        await File.WriteAllTextAsync(file.FullName, "fake-audio");
        var exit = await CreatePlayableAudio.RunAsync(
            http,
            "http://127.0.0.1:3000/api/admin/upload",
            "test-secret",
            file,
            "Title",
            true,
            stdout,
            stderr);
        return (exit, stdout.ToString(), stderr.ToString());
    }

    [Fact]
    public async Task Unauthorized_prints_secret_failed()
    {
        var (exit, _, stderr) = await Invoke(HttpStatusCode.Unauthorized, """{"error":"unauthorized"}""");
        Assert.Equal(1, exit);
        Assert.Contains("secret failed", stderr);
    }

    [Fact]
    public async Task NotImplemented_prints_server_message()
    {
        var (exit, stdout, _) = await Invoke(HttpStatusCode.NotImplemented, """{"error":"not implemented"}""");
        Assert.Equal(0, exit);
        Assert.Contains("not implemented", stdout);
    }

    private sealed class StubHandler : HttpMessageHandler
    {
        private readonly HttpResponseMessage _response;

        public StubHandler(HttpResponseMessage response) => _response = response;

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            Assert.True(request.Headers.TryGetValues("X-Admin-Secret", out var values));
            Assert.Equal("test-secret", values.Single());
            Assert.IsType<MultipartFormDataContent>(request.Content);
            return Task.FromResult(_response);
        }
    }
}
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /home/lbantoli/Desktop/projects/personal-music-store/app/cli
dotnet test
```

Expected: FAIL (missing `CreatePlayableAudio`).

- [ ] **Step 4: Implement env loader, create, and Program**

Create `app/cli/EnvLoader.cs`:

```csharp
namespace PersonalMusicStore.Cli;

public static class EnvLoader
{
    public static void Load(string path)
    {
        if (!File.Exists(path))
        {
            return;
        }

        foreach (var raw in File.ReadAllLines(path))
        {
            var line = raw.Trim();
            if (line.Length == 0 || line.StartsWith('#'))
            {
                continue;
            }

            var eq = line.IndexOf('=');
            if (eq <= 0)
            {
                continue;
            }

            var key = line[..eq].Trim();
            var value = line[(eq + 1)..].Trim();
            if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable(key)))
            {
                Environment.SetEnvironmentVariable(key, value);
            }
        }
    }
}
```

Create `app/cli/CreatePlayableAudio.cs`:

```csharp
namespace PersonalMusicStore.Cli;

public static class CreatePlayableAudio
{
    public static async Task<int> RunAsync(
        HttpClient http,
        string uploadUrl,
        string adminSecret,
        FileInfo file,
        string title,
        bool published,
        TextWriter stdout,
        TextWriter stderr)
    {
        using var content = new MultipartFormDataContent();
        var stream = file.OpenRead();
        content.Add(new StreamContent(stream), "file", file.Name);
        content.Add(new StringContent(title), "title");
        content.Add(new StringContent(published ? "true" : "false"), "published");

        using var request = new HttpRequestMessage(HttpMethod.Post, uploadUrl);
        request.Headers.Add("X-Admin-Secret", adminSecret);
        request.Content = content;

        using var response = await http.SendAsync(request);
        var body = await response.Content.ReadAsStringAsync();

        if ((int)response.StatusCode == 401)
        {
            await stderr.WriteLineAsync("secret failed");
            return 1;
        }

        if ((int)response.StatusCode == 501)
        {
            await stdout.WriteLineAsync(ExtractError(body) ?? "not implemented");
            return 0;
        }

        await stderr.WriteLineAsync(body);
        return 1;
    }

    private static string? ExtractError(string body)
    {
        const string needle = "\"error\":";
        var idx = body.IndexOf(needle, StringComparison.Ordinal);
        if (idx < 0)
        {
            return null;
        }

        var start = body.IndexOf('"', idx + needle.Length);
        if (start < 0)
        {
            return null;
        }

        var end = body.IndexOf('"', start + 1);
        if (end < 0)
        {
            return null;
        }

        return body[(start + 1)..end];
    }
}
```

Do not add JSON packages. Do not insert into Postgres. Keep `System.CommandLine` at **2.0.0**.

Replace `app/cli/Program.cs`:

```csharp
using System.CommandLine;
using PersonalMusicStore.Cli;

EnvLoader.Load(Path.Combine(AppContext.BaseDirectory, ".env"));
EnvLoader.Load(Path.Combine(Directory.GetCurrentDirectory(), ".env"));

var root = new RootCommand("Admin CLI for the personal music store");

var fileOption = new Option<FileInfo>("--file", "-f")
{
    Description = "Local audio file",
    Required = true,
};
var titleOption = new Option<string>("--title", "-t")
{
    Description = "Title of the file",
    Required = true,
};
var publishedOption = new Option<string>("--published", "-p")
{
    Description = "true or false",
    Required = true,
};

var create = new Command("create", "Create a playable audio row (upload then insert)");
create.Options.Add(fileOption);
create.Options.Add(titleOption);
create.Options.Add(publishedOption);
create.SetAction(async (parseResult, ct) =>
{
    var publishedRaw = parseResult.GetValue(publishedOption);
    if (publishedRaw is not ("true" or "false"))
    {
        await Console.Error.WriteLineAsync("--published must be true or false");
        return 1;
    }

    var uploadUrl = Environment.GetEnvironmentVariable("UPLOAD_API_URL");
    var secret = Environment.GetEnvironmentVariable("ADMIN_SECRET");
    if (string.IsNullOrWhiteSpace(uploadUrl) || string.IsNullOrWhiteSpace(secret))
    {
        await Console.Error.WriteLineAsync("UPLOAD_API_URL and ADMIN_SECRET are required");
        return 1;
    }

    using var http = new HttpClient();
    return await CreatePlayableAudio.RunAsync(
        http,
        uploadUrl,
        secret,
        parseResult.GetValue(fileOption)!,
        parseResult.GetValue(titleOption)!,
        publishedRaw == "true",
        Console.Out,
        Console.Error);
});

root.Subcommands.Add(create);
root.Subcommands.Add(NotImplementedCommand("list", "List playable audio"));
root.Subcommands.Add(NotImplementedCommand("update", "Update playable audio"));
root.Subcommands.Add(NotImplementedCommand("delete", "Delete playable audio"));
root.Subcommands.Add(NotImplementedCommand("analytics", "View analytics"));

return await root.Parse(args).InvokeAsync();

static Command NotImplementedCommand(string name, string description)
{
    var command = new Command(name, description);
    command.SetAction(async (_, _) =>
    {
        await Console.Error.WriteLineAsync("not implemented");
        return 1;
    });
    return command;
}
```

Copy env:

```bash
cp /home/lbantoli/Desktop/projects/personal-music-store/app/cli/.env.example /home/lbantoli/Desktop/projects/personal-music-store/app/cli/.env
```

- [ ] **Step 5: Run tests and help**

```bash
cd /home/lbantoli/Desktop/projects/personal-music-store/app/cli
dotnet test
dotnet build
dotnet run -- --help
```

Expected: tests PASS; help lists `create`, `list`, `update`, `delete`, `analytics`.

```bash
dotnet run -- list
echo $?
```

Expected: prints `not implemented`, exit code `1`.

- [ ] **Step 6: Commit (only if the user asked for commits)**

```bash
git add app/cli
git commit -m "$(cat <<'EOF'
Add .NET admin CLI with upload stub handshake.

EOF
)"
```

Do not commit `app/cli/.env`, `bin/`, or `obj/`.

---

### Task 7: Spec done-line (manual gate)

**Files:** none (run only)

**Interfaces:**
- Consumes: Tasks 1–6
- Produces: all six verification items green

- [ ] **Step 1: Schema**

```bash
cd /home/lbantoli/Desktop/projects/personal-music-store
npx supabase db reset
./scripts/verify-schema.sh
```

Expected: `Schema OK`.

- [ ] **Step 2: MinIO**

```bash
docker compose up -d minio minio-init
./scripts/verify-minio.sh
```

Expected: `MinIO OK`.

- [ ] **Step 3: Blank page**

```bash
cd /home/lbantoli/Desktop/projects/personal-music-store/app
npm run dev
```

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/
```

Expected: `200`.

- [ ] **Step 4: Upload without secret**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:3000/api/admin/upload
```

Expected: `401`.

- [ ] **Step 5: Upload with secret**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:3000/api/admin/upload -H "X-Admin-Secret: dev-admin-secret"
```

Expected: `501` (secret must match `app/.env.local`).

- [ ] **Step 6: CLI help**

```bash
cd /home/lbantoli/Desktop/projects/personal-music-store/app/cli
dotnet build
dotnet run -- --help
```

Expected: build succeeds; help lists create/list/update/delete/analytics.

Stop. Do not implement PutObject, catalog UI, or Npgsql inserts.
