# Admin Create Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill `POST /api/admin/upload` and CLI `create` so a required audio file lands in MinIO and a `playable_audio` row is inserted; cover is optional.

**Architecture:** Next.js owns `PutObject` (stream + download, optional cover) and returns the three URLs. The CLI inserts via Npgsql. Missing cover is `cover_blob_url = ''`; the UI fills that square with `#2a2a2a`. One UUID per create.

**Tech Stack:** Next.js App Router, AWS SDK v3 `PutObjectCommand`, Vitest, .NET 10, System.CommandLine, Npgsql, Supabase SQL migrations.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-30-admin-create-design.md`
- Audio required (`file` / `-f`). Cover optional (`cover` / `--cover`). No generated images.
- Empty cover UI: `#2a2a2a` (`bg-line`). Not a broken `<img>`.
- Drop `playable_audio_published_cover_check`. Published + `cover_blob_url = ''` is legal.
- Blob owner: Next.js. CLI inserts. Insert only, not upsert.
- Keys: one UUID. `stream/<uuid>`, `download/<uuid>`, `cover/<uuid>` only if cover sent.
- Same audio bytes for stream and download. No transcode.
- Public URL: `{S3_ENDPOINT}/{S3_BUCKET}/{key}` (strip trailing slash on endpoint).
- Errors: `401` unauthorized, `400` `{ "error": "bad request" }`, `503` `{ "error": "storage unavailable" }`. No stacks. Create does not treat `501` as success.
- CLI: `401` → `secret failed`; `503` → `storage unavailable`; insert fail → `insert failed`; unreachable → existing `cannot reach {url}`. Success prints the new id.
- Catalog must still never select `download_blob_url`.
- `list` / `update` / `delete` / `analytics` stay stubs.
- Tests: `cd app && npm test`; `cd app/cli && dotnet test`.
- Do not import `server-only` modules from Vitest files. Keep parse/put/url helpers in `app/src/lib/admin-upload.ts` with no `server-only`.
- Commit only when the user asks; skip `git commit` steps unless they have explicitly requested commits.

## File structure

| Path | Responsibility |
| --- | --- |
| `supabase/migrations/20260830210000_drop_published_cover_check.sql` | Drop `playable_audio_published_cover_check` |
| `docs/phase-2/db-design.md` | Empty cover on published is allowed |
| `scripts/verify-schema.sh` | Assert the check is gone; published + empty cover inserts |
| `app/src/app/catalog-grid.tsx` | Empty cover square `bg-line` |
| `app/src/app/player-bar.tsx` | Empty thumb `bg-line` |
| `app/src/lib/admin-upload.ts` | Parse form, object keys, public URLs, put helper, `handleAdminUpload` |
| `app/src/lib/admin-upload.test.ts` | Parse / URL / put / handle tests |
| `app/src/app/api/admin/upload/route.ts` | Secret + `handleAdminUpload` + real S3 put |
| `app/src/app/api/admin/upload/route.test.ts` | Keep 401; remove 501; 400 without secret-ok body still 401 |
| `app/next.config.ts` | `experimental.proxyClientMaxBodySize: '200mb'` |
| `app/cli/CreatePlayableAudio.cs` | Optional cover part; 200 insert; 503 no insert; 501 not success |
| `app/cli/InsertPlayableAudio.cs` | Npgsql insert, `returning id` |
| `app/cli/Program.cs` | `--cover`, `DATABASE_URL`, long HTTP timeout |
| `app/cli/PersonalMusicStore.Cli.Tests/CreatePlayableAudioTests.cs` | 200/503/cover fields |
| `README.md` | Create works; cover optional |

---

### Task 1: Drop published-needs-cover check

**Files:**
- Create: `supabase/migrations/20260830210000_drop_published_cover_check.sql`
- Modify: `docs/phase-2/db-design.md`
- Modify: `scripts/verify-schema.sh`

**Interfaces:**
- Consumes: existing constraint `playable_audio_published_cover_check` from `supabase/migrations/20260830200000_cover_blob_url.sql`
- Produces: constraint gone; `cover_blob_url text not null default ''` unchanged; verify script fails if the check still exists

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260830210000_drop_published_cover_check.sql`:

```sql
alter table playable_audio
  drop constraint if exists playable_audio_published_cover_check;
```

- [ ] **Step 2: Update db-design**

Replace `docs/phase-2/db-design.md` with:

```markdown
# Phase-2 DB additions

`playable_audio` gains one column. Meanings of the original three tables stay in `docs/phase-1/db-design.md`.

| Field | Type | Meaning |
| --- | --- | --- |
| cover_blob_url | text not null default `''` | Public cover image. Player and cards use this. Empty means no art (UI shows a `#2a2a2a` square). |

Published rows may have `cover_blob_url = ''`. There is no check requiring cover art to publish.

Objects live under the `cover/` prefix (public `GetObject`), same bucket as `stream/`.
```

- [ ] **Step 3: Assert the check is gone**

In `scripts/verify-schema.sh`, after the `cover_blob_url` column check and before `echo "Schema OK"`, add:

```bash
check_name="$(psql "$DB_URL" -Atc "select conname from pg_constraint where conname = 'playable_audio_published_cover_check'")"
if [[ -n "$check_name" ]]; then
  echo "playable_audio_published_cover_check still present"
  exit 1
fi

psql "$DB_URL" -v ON_ERROR_STOP=1 -c "insert into playable_audio (title, published, stream_blob_url, download_blob_url, cover_blob_url) values ('verify-empty-cover', true, 's', 'd', '');" >/dev/null
psql "$DB_URL" -v ON_ERROR_STOP=1 -c "delete from playable_audio where title = 'verify-empty-cover';" >/dev/null
```

- [ ] **Step 4: Apply and verify**

Run from repo root (needs local Supabase):

```bash
npx supabase db reset
./scripts/verify-schema.sh
```

Expected: `Schema OK`

If Supabase is not running, start it (`npx supabase start`) then retry. Do not skip this when Docker is available.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260830210000_drop_published_cover_check.sql docs/phase-2/db-design.md scripts/verify-schema.sh
git commit -m "fix: allow published tracks without cover"
```

---

### Task 2: Empty cover fill `#2a2a2a`

**Files:**
- Modify: `app/src/app/catalog-grid.tsx`
- Modify: `app/src/app/player-bar.tsx`

**Interfaces:**
- Consumes: Tailwind token `--color-line` / class `bg-line` already in `app/src/app/globals.css` (`#2a2a2a`)
- Produces: grid square and player thumb use `bg-line` instead of `bg-bg` so a missing cover is a visible tile

- [ ] **Step 1: Grid square**

In `app/src/app/catalog-grid.tsx`, change the cover wrapper class from `bg-bg` to `bg-line`:

```tsx
<div className="relative aspect-square bg-line border-b border-line">
```

Keep the `{track.cover_blob_url ? <img ... /> : null}` branch. Empty URL must not render `<img>`.

- [ ] **Step 2: Player thumb**

In `app/src/app/player-bar.tsx`, change the 40×40 wrapper from `bg-bg` to `bg-line`:

```tsx
<div className="h-10 w-10 shrink-0 border border-line bg-line">
```

- [ ] **Step 3: Confirm catalog tests still pass**

```bash
cd app && npm test
```

Expected: all tests pass (no `download_blob_url` in catalog SQL).

- [ ] **Step 4: Commit**

```bash
git add app/src/app/catalog-grid.tsx app/src/app/player-bar.tsx
git commit -m "fix: fill empty cover squares with theme gray"
```

---

### Task 3: Parse upload form and public URLs

**Files:**
- Create: `app/src/lib/admin-upload.ts`
- Test: `app/src/lib/admin-upload.test.ts`

**Interfaces:**
- Consumes: `FormData` with fields `file`, `title`, `published`, optional `cover`
- Produces:

```ts
export type ParsedUpload =
  | {
      ok: true;
      title: string;
      published: boolean;
      audio: File;
      cover: File | null;
    }
  | { ok: false; error: "bad request" };

export function parseUploadForm(form: FormData): ParsedUpload;
export function publicObjectUrl(endpoint: string, bucket: string, key: string): string;
export function blobKeys(id: string): {
  streamKey: string;
  downloadKey: string;
  coverKey: string;
};
```

- [ ] **Step 1: Write the failing tests**

Create `app/src/lib/admin-upload.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  blobKeys,
  parseUploadForm,
  publicObjectUrl,
} from "./admin-upload";

function audioFile(): File {
  return new File([new Uint8Array([1, 2, 3])], "crash.wav", {
    type: "audio/wav",
  });
}

describe("parseUploadForm", () => {
  test("ok with audio and no cover", () => {
    const form = new FormData();
    form.set("file", audioFile());
    form.set("title", "crash");
    form.set("published", "true");
    const parsed = parseUploadForm(form);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.title).toBe("crash");
    expect(parsed.published).toBe(true);
    expect(parsed.audio.name).toBe("crash.wav");
    expect(parsed.cover).toBeNull();
  });

  test("ok with cover file", () => {
    const form = new FormData();
    form.set("file", audioFile());
    form.set("title", "crash");
    form.set("published", "false");
    form.set("cover", new File([new Uint8Array([9])], "art.png", { type: "image/png" }));
    const parsed = parseUploadForm(form);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.published).toBe(false);
    expect(parsed.cover?.name).toBe("art.png");
  });

  test("400 when title missing", () => {
    const form = new FormData();
    form.set("file", audioFile());
    form.set("published", "true");
    expect(parseUploadForm(form)).toEqual({ ok: false, error: "bad request" });
  });

  test("400 when file missing", () => {
    const form = new FormData();
    form.set("title", "crash");
    form.set("published", "true");
    expect(parseUploadForm(form)).toEqual({ ok: false, error: "bad request" });
  });

  test("400 when published is not true or false", () => {
    const form = new FormData();
    form.set("file", audioFile());
    form.set("title", "crash");
    form.set("published", "yes");
    expect(parseUploadForm(form)).toEqual({ ok: false, error: "bad request" });
  });
});

describe("publicObjectUrl", () => {
  test("path-style and strips trailing slash", () => {
    expect(
      publicObjectUrl("http://127.0.0.1:9000/", "music", "stream/abc"),
    ).toBe("http://127.0.0.1:9000/music/stream/abc");
  });
});

describe("blobKeys", () => {
  test("one id, three prefixes", () => {
    expect(blobKeys("abc")).toEqual({
      streamKey: "stream/abc",
      downloadKey: "download/abc",
      coverKey: "cover/abc",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app && npx vitest run src/lib/admin-upload.test.ts
```

Expected: FAIL (module `./admin-upload` not found).

- [ ] **Step 3: Implement**

Create `app/src/lib/admin-upload.ts`:

```ts
export type ParsedUpload =
  | {
      ok: true;
      title: string;
      published: boolean;
      audio: File;
      cover: File | null;
    }
  | { ok: false; error: "bad request" };

export function parseUploadForm(form: FormData): ParsedUpload {
  const title = String(form.get("title") ?? "").trim();
  const publishedRaw = String(form.get("published") ?? "");
  const audio = form.get("file");
  const coverPart = form.get("cover");
  if (!title || (publishedRaw !== "true" && publishedRaw !== "false")) {
    return { ok: false, error: "bad request" };
  }
  if (!(audio instanceof File) || audio.size === 0) {
    return { ok: false, error: "bad request" };
  }
  const cover =
    coverPart instanceof File && coverPart.size > 0 ? coverPart : null;
  return {
    ok: true,
    title,
    published: publishedRaw === "true",
    audio,
    cover,
  };
}

export function publicObjectUrl(
  endpoint: string,
  bucket: string,
  key: string,
): string {
  const base = endpoint.replace(/\/$/, "");
  return `${base}/${bucket}/${key}`;
}

export function blobKeys(id: string): {
  streamKey: string;
  downloadKey: string;
  coverKey: string;
} {
  return {
    streamKey: `stream/${id}`,
    downloadKey: `download/${id}`,
    coverKey: `cover/${id}`,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd app && npx vitest run src/lib/admin-upload.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/admin-upload.ts app/src/lib/admin-upload.test.ts
git commit -m "feat: parse admin upload form and blob URLs"
```

---

### Task 4: Put stream, download, optional cover

**Files:**
- Modify: `app/src/lib/admin-upload.ts`
- Modify: `app/src/lib/admin-upload.test.ts`

**Interfaces:**
- Consumes: `blobKeys`; a `put(key, body, contentType)` function
- Produces:

```ts
export type PutObjectFn = (
  key: string,
  body: Uint8Array,
  contentType: string,
) => Promise<void>;

export type PutPlayableResult = {
  streamKey: string;
  downloadKey: string;
  coverKey: string | null;
};

export async function putPlayableBlobs(
  put: PutObjectFn,
  id: string,
  audio: { body: Uint8Array; contentType: string },
  cover: { body: Uint8Array; contentType: string } | null,
): Promise<PutPlayableResult>;
```

Audio is written twice (stream + download). Cover put only when `cover` is non-null. If `put` throws, the rejection propagates (route maps that to 503 later).

- [ ] **Step 1: Write the failing tests**

Append to `app/src/lib/admin-upload.test.ts`:

```ts
import { putPlayableBlobs } from "./admin-upload";

describe("putPlayableBlobs", () => {
  test("writes stream and download, no cover", async () => {
    const calls: { key: string; type: string; bytes: number }[] = [];
    const audio = { body: new Uint8Array([1, 2]), contentType: "audio/wav" };
    const result = await putPlayableBlobs(
      async (key, body, contentType) => {
        calls.push({ key, type: contentType, bytes: body.byteLength });
      },
      "id-1",
      audio,
      null,
    );
    expect(result).toEqual({
      streamKey: "stream/id-1",
      downloadKey: "download/id-1",
      coverKey: null,
    });
    expect(calls).toEqual([
      { key: "stream/id-1", type: "audio/wav", bytes: 2 },
      { key: "download/id-1", type: "audio/wav", bytes: 2 },
    ]);
  });

  test("also writes cover when present", async () => {
    const keys: string[] = [];
    await putPlayableBlobs(
      async (key) => {
        keys.push(key);
      },
      "id-2",
      { body: new Uint8Array([1]), contentType: "audio/wav" },
      { body: new Uint8Array([9, 9]), contentType: "image/png" },
    );
    expect(keys).toEqual(["stream/id-2", "download/id-2", "cover/id-2"]);
  });

  test("propagates put failure", async () => {
    await expect(
      putPlayableBlobs(
        async () => {
          throw new Error("minio down");
        },
        "id-3",
        { body: new Uint8Array([1]), contentType: "audio/wav" },
        null,
      ),
    ).rejects.toThrow("minio down");
  });
});
```

Add `putPlayableBlobs` to the existing import from `./admin-upload`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app && npx vitest run src/lib/admin-upload.test.ts
```

Expected: FAIL (`putPlayableBlobs` is not exported).

- [ ] **Step 3: Implement**

Append to `app/src/lib/admin-upload.ts`:

```ts
export type PutObjectFn = (
  key: string,
  body: Uint8Array,
  contentType: string,
) => Promise<void>;

export type PutPlayableResult = {
  streamKey: string;
  downloadKey: string;
  coverKey: string | null;
};

export async function putPlayableBlobs(
  put: PutObjectFn,
  id: string,
  audio: { body: Uint8Array; contentType: string },
  cover: { body: Uint8Array; contentType: string } | null,
): Promise<PutPlayableResult> {
  const keys = blobKeys(id);
  await put(keys.streamKey, audio.body, audio.contentType);
  await put(keys.downloadKey, audio.body, audio.contentType);
  if (!cover) {
    return {
      streamKey: keys.streamKey,
      downloadKey: keys.downloadKey,
      coverKey: null,
    };
  }
  await put(keys.coverKey, cover.body, cover.contentType);
  return {
    streamKey: keys.streamKey,
    downloadKey: keys.downloadKey,
    coverKey: keys.coverKey,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd app && npx vitest run src/lib/admin-upload.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/admin-upload.ts app/src/lib/admin-upload.test.ts
git commit -m "feat: put stream download and optional cover"
```

---

### Task 5: `handleAdminUpload` and wire the route

**Files:**
- Modify: `app/src/lib/admin-upload.ts`
- Modify: `app/src/lib/admin-upload.test.ts`
- Modify: `app/src/app/api/admin/upload/route.ts`
- Modify: `app/src/app/api/admin/upload/route.test.ts`
- Modify: `app/next.config.ts`

**Interfaces:**
- Consumes: `parseUploadForm`, `putPlayableBlobs`, `publicObjectUrl`; `adminSecretOk` stays in the route
- Produces:

```ts
export async function handleAdminUpload(
  request: Request,
  deps: {
    put: PutObjectFn;
    newId: () => string;
    endpoint: string;
    bucket: string;
  },
): Promise<Response>;
```

After the secret check, the route calls `handleAdminUpload`. Valid secret + missing file → `400`. Put throw → `503`. Success → `200` with the three URL keys. `cover_blob_url` is `""` when no cover. Route `maxDuration = 300`. `next.config.ts` sets `experimental.proxyClientMaxBodySize` to `'200mb'`.

- [ ] **Step 1: Write failing handleAdminUpload tests**

Append to `app/src/lib/admin-upload.test.ts` (import `handleAdminUpload`):

```ts
function uploadRequest(form: FormData): Request {
  return new Request("http://127.0.0.1/api/admin/upload", {
    method: "POST",
    body: form,
  });
}

describe("handleAdminUpload", () => {
  const depsBase = {
    newId: () => "fixed-id",
    endpoint: "http://127.0.0.1:9000",
    bucket: "music",
  };

  test("400 without file", async () => {
    const form = new FormData();
    form.set("title", "crash");
    form.set("published", "true");
    const res = await handleAdminUpload(uploadRequest(form), {
      ...depsBase,
      put: async () => {},
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad request" });
  });

  test("200 without cover leaves cover_blob_url empty", async () => {
    const form = new FormData();
    form.set("file", audioFile());
    form.set("title", "crash");
    form.set("published", "true");
    const res = await handleAdminUpload(uploadRequest(form), {
      ...depsBase,
      put: async () => {},
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      stream_blob_url: "http://127.0.0.1:9000/music/stream/fixed-id",
      download_blob_url: "http://127.0.0.1:9000/music/download/fixed-id",
      cover_blob_url: "",
    });
  });

  test("200 with cover fills cover_blob_url", async () => {
    const form = new FormData();
    form.set("file", audioFile());
    form.set("title", "crash");
    form.set("published", "true");
    form.set(
      "cover",
      new File([new Uint8Array([9])], "art.png", { type: "image/png" }),
    );
    const res = await handleAdminUpload(uploadRequest(form), {
      ...depsBase,
      put: async () => {},
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cover_blob_url).toBe(
      "http://127.0.0.1:9000/music/cover/fixed-id",
    );
  });

  test("503 when put throws", async () => {
    const form = new FormData();
    form.set("file", audioFile());
    form.set("title", "crash");
    form.set("published", "true");
    const res = await handleAdminUpload(uploadRequest(form), {
      ...depsBase,
      put: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "storage unavailable" });
  });
});
```

`audioFile` is already defined in this file from Task 3.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app && npx vitest run src/lib/admin-upload.test.ts
```

Expected: FAIL (`handleAdminUpload` is not exported).

- [ ] **Step 3: Implement handleAdminUpload**

Append to `app/src/lib/admin-upload.ts`:

```ts
export async function handleAdminUpload(
  request: Request,
  deps: {
    put: PutObjectFn;
    newId: () => string;
    endpoint: string;
    bucket: string;
  },
): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const parsed = parseUploadForm(form);
  if (!parsed.ok) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const audioBody = new Uint8Array(await parsed.audio.arrayBuffer());
  const coverBody = parsed.cover
    ? new Uint8Array(await parsed.cover.arrayBuffer())
    : null;
  try {
    const keys = await putPlayableBlobs(
      deps.put,
      deps.newId(),
      {
        body: audioBody,
        contentType: parsed.audio.type || "application/octet-stream",
      },
      coverBody && parsed.cover
        ? {
            body: coverBody,
            contentType: parsed.cover.type || "application/octet-stream",
          }
        : null,
    );
    return Response.json({
      stream_blob_url: publicObjectUrl(
        deps.endpoint,
        deps.bucket,
        keys.streamKey,
      ),
      download_blob_url: publicObjectUrl(
        deps.endpoint,
        deps.bucket,
        keys.downloadKey,
      ),
      cover_blob_url: keys.coverKey
        ? publicObjectUrl(deps.endpoint, deps.bucket, keys.coverKey)
        : "",
    });
  } catch {
    return Response.json({ error: "storage unavailable" }, { status: 503 });
  }
}
```

- [ ] **Step 4: Wire the route and drop 501**

Replace `app/src/app/api/admin/upload/route.ts` with:

```ts
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { adminSecretOk } from "@/lib/admin-auth";
import { handleAdminUpload } from "@/lib/admin-upload";
import { bucket, s3 } from "@/lib/s3";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const header = request.headers.get("X-Admin-Secret");
  if (!adminSecretOk(header, process.env.ADMIN_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return handleAdminUpload(request, {
    newId: () => crypto.randomUUID(),
    endpoint: process.env.S3_ENDPOINT ?? "",
    bucket,
    put: async (key, body, contentType) => {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },
  });
}
```

Replace the `501 with valid secret` test in `app/src/app/api/admin/upload/route.test.ts` with:

```ts
  test("valid secret without body is 400 not 501", async () => {
    process.env.ADMIN_SECRET = "test-secret";
    const res = await POST(
      new Request("http://127.0.0.1/api/admin/upload", {
        method: "POST",
        headers: { "X-Admin-Secret": "test-secret" },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad request" });
  });
```

Keep the two `401` tests unchanged.

Replace `app/next.config.ts` with:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: "200mb",
  },
};

export default nextConfig;
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd app && npm test
```

Expected: all tests PASS. The old 501 assertion is gone.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/admin-upload.ts app/src/lib/admin-upload.test.ts app/src/app/api/admin/upload/route.ts app/src/app/api/admin/upload/route.test.ts app/next.config.ts
git commit -m "feat: write audio blobs on admin upload"
```

---

### Task 6: CLI create — 200 inserts, 503 does not

**Files:**
- Modify: `app/cli/CreatePlayableAudio.cs`
- Modify: `app/cli/PersonalMusicStore.Cli.Tests/CreatePlayableAudioTests.cs`

**Interfaces:**
- Consumes: HTTP upload JSON `{ stream_blob_url, download_blob_url, cover_blob_url }`
- Produces:

```csharp
public delegate Task<int> InsertPlayableAudio(
    string title,
    bool published,
    string streamBlobUrl,
    string downloadBlobUrl,
    string coverBlobUrl);

public static async Task<int> RunAsync(
    HttpClient http,
    string uploadUrl,
    string adminSecret,
    FileInfo file,
    string title,
    bool published,
    FileInfo? cover,
    InsertPlayableAudio insert,
    TextWriter stdout,
    TextWriter stderr)
```

`200` → call `insert` → print the returned id. `503` → `storage unavailable` on stderr, exit 1, do not call `insert`. `501` → `unexpected status 501`, exit 1 (no longer success). Multipart names: `file`, `title`, `published`, and `cover` when `cover` is not null.

- [ ] **Step 1: Rewrite CreatePlayableAudioTests for the new signature**

Replace `app/cli/PersonalMusicStore.Cli.Tests/CreatePlayableAudioTests.cs` with:

```csharp
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using PersonalMusicStore.Cli;

namespace PersonalMusicStore.Cli.Tests;

public class CreatePlayableAudioTests
{
    private static InsertPlayableAudio NoInsert =>
        (_, _, _, _, _) => throw new InvalidOperationException("insert should not run");

    private static async Task<(int Exit, string Stdout, string Stderr, bool Inserted)> Invoke(
        HttpStatusCode status,
        string json,
        FileInfo? cover = null,
        InsertPlayableAudio? insert = null)
    {
        var inserted = false;
        InsertPlayableAudio wrapped = async (t, p, s, d, c) =>
        {
            inserted = true;
            if (insert is null)
            {
                throw new InvalidOperationException("insert should not run");
            }
            return await insert(t, p, s, d, c);
        };

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
            cover,
            wrapped,
            stdout,
            stderr);
        return (exit, stdout.ToString(), stderr.ToString(), inserted);
    }

    [Fact]
    public async Task Unauthorized_prints_secret_failed()
    {
        var (exit, _, stderr, inserted) = await Invoke(HttpStatusCode.Unauthorized, """{"error":"unauthorized"}""");
        Assert.Equal(1, exit);
        Assert.Contains("secret failed", stderr);
        Assert.False(inserted);
    }

    [Fact]
    public async Task NotImplemented_is_unexpected_and_does_not_insert()
    {
        var (exit, _, stderr, inserted) = await Invoke(HttpStatusCode.NotImplemented, """{"error":"not implemented"}""");
        Assert.Equal(1, exit);
        Assert.Contains("unexpected status", stderr);
        Assert.False(inserted);
    }

    [Fact]
    public async Task ServiceUnavailable_prints_storage_unavailable_and_does_not_insert()
    {
        var (exit, _, stderr, inserted) = await Invoke(
            HttpStatusCode.ServiceUnavailable,
            """{"error":"storage unavailable"}""");
        Assert.Equal(1, exit);
        Assert.Contains("storage unavailable", stderr);
        Assert.False(inserted);
    }

    [Fact]
    public async Task Ok_inserts_and_prints_id()
    {
        InsertPlayableAudio insert = (_, _, stream, download, cover) =>
        {
            Assert.Equal("http://127.0.0.1:9000/music/stream/x", stream);
            Assert.Equal("http://127.0.0.1:9000/music/download/x", download);
            Assert.Equal("", cover);
            return Task.FromResult(42);
        };
        var json = """{"stream_blob_url":"http://127.0.0.1:9000/music/stream/x","download_blob_url":"http://127.0.0.1:9000/music/download/x","cover_blob_url":""}""";
        var (exit, stdout, _, inserted) = await Invoke(HttpStatusCode.OK, json, insert: insert);
        Assert.Equal(0, exit);
        Assert.Contains("42", stdout);
        Assert.True(inserted);
    }

    [Fact]
    public async Task UnexpectedStatus_prints_short_message_not_raw_body()
    {
        var htmlBody = "<html><body><h1>500 Internal Server Error</h1>"
            + string.Concat(Enumerable.Repeat("<p>stack trace line</p>", 50))
            + "</body></html>";
        var (exit, _, stderr, inserted) = await Invoke(HttpStatusCode.InternalServerError, htmlBody);
        Assert.Equal(1, exit);
        Assert.Contains("unexpected status", stderr);
        Assert.DoesNotContain("<html>", stderr);
        Assert.DoesNotContain("stack trace line", stderr);
        Assert.False(inserted);
    }

    [Fact]
    public async Task SendFailure_prints_cannot_reach_and_no_stack_trace()
    {
        var handler = new ThrowingHandler(new HttpRequestException("Connection refused"));
        using var http = new HttpClient(handler);
        using var stdout = new StringWriter();
        using var stderr = new StringWriter();
        var file = new FileInfo(Path.GetTempFileName());
        await File.WriteAllTextAsync(file.FullName, "fake-audio");
        var uploadUrl = "http://127.0.0.1:3000/api/admin/upload";

        var exit = await CreatePlayableAudio.RunAsync(
            http,
            uploadUrl,
            "test-secret",
            file,
            "Title",
            true,
            null,
            NoInsert,
            stdout,
            stderr);

        Assert.Equal(1, exit);
        Assert.Contains("cannot reach", stderr.ToString());
        Assert.DoesNotContain("at PersonalMusicStore", stderr.ToString());
        Assert.DoesNotContain("Exception", stderr.ToString());
    }

    [Fact]
    public async Task Request_has_stable_multipart_field_names()
    {
        var capturingHandler = new CapturingHandler(new HttpResponseMessage(HttpStatusCode.Unauthorized)
        {
            Content = new StringContent("""{"error":"unauthorized"}""", Encoding.UTF8, "application/json"),
        });
        using var http = new HttpClient(capturingHandler);
        using var stdout = new StringWriter();
        using var stderr = new StringWriter();
        var file = new FileInfo(Path.GetTempFileName());
        await File.WriteAllTextAsync(file.FullName, "fake-audio");
        var cover = new FileInfo(Path.GetTempFileName());
        await File.WriteAllTextAsync(cover.FullName, "fake-img");

        await CreatePlayableAudio.RunAsync(
            http,
            "http://127.0.0.1:3000/api/admin/upload",
            "test-secret",
            file,
            "Title",
            true,
            cover,
            NoInsert,
            stdout,
            stderr);

        Assert.Equal(new[] { "file", "title", "published", "cover" }, capturingHandler.CapturedPartNames);
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

    private sealed class ThrowingHandler : HttpMessageHandler
    {
        private readonly Exception _exception;

        public ThrowingHandler(Exception exception) => _exception = exception;

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            throw _exception;
        }
    }

    private sealed class CapturingHandler : HttpMessageHandler
    {
        private readonly HttpResponseMessage _response;

        public CapturingHandler(HttpResponseMessage response) => _response = response;

        public List<string?> CapturedPartNames { get; } = new();

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var multipart = Assert.IsType<MultipartFormDataContent>(request.Content);
            CapturedPartNames.AddRange(
                multipart.Select(part => part.Headers.ContentDisposition?.Name?.Trim('"')));
            return Task.FromResult(_response);
        }
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app/cli && dotnet test
```

Expected: FAIL (compile errors: `RunAsync` has no `cover` / `insert` parameters).

- [ ] **Step 3: Implement CreatePlayableAudio**

Replace `app/cli/CreatePlayableAudio.cs` with:

```csharp
using System.Text.Json;

namespace PersonalMusicStore.Cli;

public delegate Task<int> InsertPlayableAudio(
    string title,
    bool published,
    string streamBlobUrl,
    string downloadBlobUrl,
    string coverBlobUrl);

public static class CreatePlayableAudio
{
    public static async Task<int> RunAsync(
        HttpClient http,
        string uploadUrl,
        string adminSecret,
        FileInfo file,
        string title,
        bool published,
        FileInfo? cover,
        InsertPlayableAudio insert,
        TextWriter stdout,
        TextWriter stderr)
    {
        using var content = new MultipartFormDataContent();
        content.Add(new StreamContent(file.OpenRead()), "file", file.Name);
        content.Add(new StringContent(title), "title");
        content.Add(new StringContent(published ? "true" : "false"), "published");
        if (cover is not null)
        {
            content.Add(new StreamContent(cover.OpenRead()), "cover", cover.Name);
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, uploadUrl);
        request.Headers.Add("X-Admin-Secret", adminSecret);
        request.Content = content;

        HttpResponseMessage? response = null;
        try
        {
            response = await http.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();
            var code = (int)response.StatusCode;

            if (code == 401)
            {
                await stderr.WriteLineAsync("secret failed");
                return 1;
            }

            if (code == 400)
            {
                await stderr.WriteLineAsync("bad request");
                return 1;
            }

            if (code == 503)
            {
                await stderr.WriteLineAsync("storage unavailable");
                return 1;
            }

            if (code != 200)
            {
                await stderr.WriteLineAsync($"unexpected status {code}");
                return 1;
            }

            UploadUrls? urls;
            try
            {
                urls = JsonSerializer.Deserialize<UploadUrls>(body);
            }
            catch (JsonException)
            {
                await stderr.WriteLineAsync("unexpected status 200");
                return 1;
            }

            if (urls is null
                || string.IsNullOrWhiteSpace(urls.stream_blob_url)
                || string.IsNullOrWhiteSpace(urls.download_blob_url))
            {
                await stderr.WriteLineAsync("unexpected status 200");
                return 1;
            }

            try
            {
                var id = await insert(
                    title,
                    published,
                    urls.stream_blob_url,
                    urls.download_blob_url,
                    urls.cover_blob_url ?? "");
                await stdout.WriteLineAsync(id.ToString());
                return 0;
            }
            catch
            {
                await stderr.WriteLineAsync("insert failed");
                return 1;
            }
        }
        catch (HttpRequestException)
        {
            await stderr.WriteLineAsync($"cannot reach {uploadUrl}");
            return 1;
        }
        finally
        {
            response?.Dispose();
        }
    }

    private sealed class UploadUrls
    {
        public string stream_blob_url { get; set; } = "";
        public string download_blob_url { get; set; } = "";
        public string? cover_blob_url { get; set; }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd app/cli && dotnet test
```

Expected: PASS (all facts). If `Invoke`'s 401 path sets `inserted` true because `RunAsync` calls insert, that is a bug — 401 must return before insert.

- [ ] **Step 5: Commit**

```bash
git add app/cli/CreatePlayableAudio.cs app/cli/PersonalMusicStore.Cli.Tests/CreatePlayableAudioTests.cs
git commit -m "feat: insert playable_audio after successful upload"
```

---

### Task 7: Npgsql insert, `--cover`, timeout, README

**Files:**
- Create: `app/cli/InsertPlayableAudio.cs`
- Create: `app/cli/PersonalMusicStore.Cli.Tests/InsertPlayableAudioTests.cs`
- Modify: `app/cli/Program.cs`
- Modify: `README.md`

**Interfaces:**
- Consumes: `DATABASE_URL`; `CreatePlayableAudio.RunAsync`
- Produces:

```csharp
public static class InsertPlayableAudioRow
{
    public const string Sql =
        """
        insert into playable_audio (title, published, stream_blob_url, download_blob_url, cover_blob_url)
        values (@title, @published, @stream, @download, @cover)
        returning id
        """;

    public static async Task<int> RunAsync(
        string databaseUrl,
        string title,
        bool published,
        string streamBlobUrl,
        string downloadBlobUrl,
        string coverBlobUrl);
}
```

`Program.cs` adds optional `--cover`, requires `DATABASE_URL`, sets `http.Timeout = TimeSpan.FromMinutes(30)`, and passes `InsertPlayableAudioRow.RunAsync` as the delegate. README documents working `create` and optional `--cover`.

- [ ] **Step 1: Write the failing SQL test**

Create `app/cli/PersonalMusicStore.Cli.Tests/InsertPlayableAudioTests.cs`:

```csharp
using PersonalMusicStore.Cli;

namespace PersonalMusicStore.Cli.Tests;

public class InsertPlayableAudioTests
{
    [Fact]
    public void Sql_inserts_all_blob_urls_and_returns_id()
    {
        Assert.Contains("insert into playable_audio", InsertPlayableAudioRow.Sql);
        Assert.Contains("cover_blob_url", InsertPlayableAudioRow.Sql);
        Assert.Contains("returning id", InsertPlayableAudioRow.Sql);
        Assert.Contains("@title", InsertPlayableAudioRow.Sql);
        Assert.Contains("@published", InsertPlayableAudioRow.Sql);
        Assert.Contains("@stream", InsertPlayableAudioRow.Sql);
        Assert.Contains("@download", InsertPlayableAudioRow.Sql);
        Assert.Contains("@cover", InsertPlayableAudioRow.Sql);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd app/cli && dotnet test --filter InsertPlayableAudioTests
```

Expected: FAIL (`InsertPlayableAudioRow` does not exist).

- [ ] **Step 3: Implement insert + Program.cs**

Create `app/cli/InsertPlayableAudio.cs`:

```csharp
using Npgsql;

namespace PersonalMusicStore.Cli;

public static class InsertPlayableAudioRow
{
    public const string Sql =
        """
        insert into playable_audio (title, published, stream_blob_url, download_blob_url, cover_blob_url)
        values (@title, @published, @stream, @download, @cover)
        returning id
        """;

    public static async Task<int> RunAsync(
        string databaseUrl,
        string title,
        bool published,
        string streamBlobUrl,
        string downloadBlobUrl,
        string coverBlobUrl)
    {
        await using var conn = new NpgsqlConnection(databaseUrl);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(Sql, conn);
        cmd.Parameters.AddWithValue("title", title);
        cmd.Parameters.AddWithValue("published", published);
        cmd.Parameters.AddWithValue("stream", streamBlobUrl);
        cmd.Parameters.AddWithValue("download", downloadBlobUrl);
        cmd.Parameters.AddWithValue("cover", coverBlobUrl);
        var result = await cmd.ExecuteScalarAsync();
        return Convert.ToInt32(result);
    }
}
```

Replace the create action in `app/cli/Program.cs` so the full file is:

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
var coverOption = new Option<FileInfo?>("--cover")
{
    Description = "Optional local cover image",
    Required = false,
};

var create = new Command("create", "Create a playable audio row (upload then insert)");
create.Options.Add(fileOption);
create.Options.Add(titleOption);
create.Options.Add(publishedOption);
create.Options.Add(coverOption);
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
    var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
    if (string.IsNullOrWhiteSpace(uploadUrl) || string.IsNullOrWhiteSpace(secret))
    {
        await Console.Error.WriteLineAsync("UPLOAD_API_URL and ADMIN_SECRET are required");
        return 1;
    }
    if (string.IsNullOrWhiteSpace(databaseUrl))
    {
        await Console.Error.WriteLineAsync("DATABASE_URL is required");
        return 1;
    }

    using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(30) };
    return await CreatePlayableAudio.RunAsync(
        http,
        uploadUrl,
        secret,
        parseResult.GetValue(fileOption)!,
        parseResult.GetValue(titleOption)!,
        publishedRaw == "true",
        parseResult.GetValue(coverOption),
        (title, published, stream, download, cover) =>
            InsertPlayableAudioRow.RunAsync(databaseUrl, title, published, stream, download, cover),
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

- [ ] **Step 4: Update README**

In `README.md`, replace the paragraph that says upload returns `501` and the whole `## Admin CLI` / `## Admin CLI (optional)` section with this text (keep setup, MinIO, Postgres, tests, ports, stop):

There is no seed catalog. Create tracks with the admin CLI (audio required, cover optional). Published rows without a cover show a `#2a2a2a` square on `/`.

Heading: `## Admin CLI`

Needs `app/cli/.env` (`UPLOAD_API_URL`, `ADMIN_SECRET`, `DATABASE_URL`). Next.js must be running. Then from `app/cli`:

- `dotnet run -- create -t "crash" -p true -f /path/to/crash.wav`
- `dotnet run -- create -t "crash" -p true -f /path/to/crash.wav --cover /path/to/art.png`

Success prints the new row id. `list`, `update`, `delete`, and `analytics` still print `not implemented`.

- [ ] **Step 5: Run tests**

```bash
cd app && npm test
cd app/cli && dotnet test
```

Expected: all PASS.

- [ ] **Step 6: Manual done-line**

With MinIO, Supabase (after Task 1 reset), `app/.env.local`, `app/cli/.env`, and `cd app && npm run dev`:

```bash
cd app/cli
dotnet run -- create -t "crash" -p true -f /path/to/crash.wav
```

Expected: a number on stdout. Open `http://127.0.0.1:3000` — card titled `crash`, gray cover square, stream plays. Repeat with `--cover` and confirm the image. Wrong secret still `secret failed`. Network tab on `/` has no `download_blob_url`.

- [ ] **Step 7: Commit**

```bash
git add app/cli/InsertPlayableAudio.cs app/cli/PersonalMusicStore.Cli.Tests/InsertPlayableAudioTests.cs app/cli/Program.cs README.md
git commit -m "feat: persist playable_audio rows from the CLI"
```
