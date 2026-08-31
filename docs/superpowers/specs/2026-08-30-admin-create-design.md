# Admin create (upload + insert)

Date: 2026-08-30

Status: approved in conversation; waiting on file review before the implementation plan.

This is a patch on the existing store, not a new product phase. It fills the scaffold upload contract in `docs/superpowers/specs/2026-08-27-scaffolding-infra-design.md` and the CLI pipeline in `docs/phase-1/cli-design.db`. List / update / delete / analytics stay stubs.

## Goal

`dotnet run -- create -t "crash" -p true -f /path/to/crash.wav` writes two audio objects to MinIO, inserts `playable_audio`, and the track can appear on `/`. Cover art is optional.

When this pass is done:

- Valid `POST /api/admin/upload` no longer returns `501`.
- Audio is required. Cover is optional.
- Published rows may have empty `cover_blob_url`.
- Empty cover squares (grid + player thumb) fill `#2a2a2a`.
- CLI inserts the row after a successful upload. No insert if S3/upload fails.

## Locked decisions

| Topic | Choice |
| --- | --- |
| Audio | Required (`-f` / multipart `file`) |
| Cover | Optional (`--cover` / multipart `cover`) |
| Missing cover | `cover_blob_url = ''`. No generated image, no stock file, no per-track random color |
| Empty-cover UI | Solid `#2a2a2a` (`--color-line`) on the square. Real URL still uses `<img>` |
| Published + no cover | Legal. Drop `playable_audio_published_cover_check` |
| Blob owner | Next.js writes objects. CLI inserts `playable_audio` via Npgsql |
| Object keys | One UUID per create. `stream/<uuid>`, `download/<uuid>`, and `cover/<uuid>` if a cover was sent |
| Stream vs download | Same audio bytes, two objects. No transcode |
| Cover bytes | Stored as-is. No image transcode |
| Public URL shape | Path-style `{S3_ENDPOINT}/{S3_BUCKET}/{key}` |
| Create vs upsert | Insert only. Same title twice → two rows |
| Body size | Allow local wavs up to 200MB on this route |

## Pipeline

1. CLI POSTs `multipart/form-data` with `X-Admin-Secret`:
   - `file` — local audio (required)
   - `title` — string (required)
   - `published` — `true` or `false` (required)
   - `cover` — local image (optional)
2. Server checks the secret, then the required fields.
3. Server `PutObject`s audio to `stream/<uuid>` (public prefix) and `download/<uuid>` (private prefix). If `cover` is present, also `cover/<uuid>` (public prefix).
4. Server returns `200` JSON:

```json
{
  "stream_blob_url": "http://127.0.0.1:9000/music/stream/<uuid>",
  "download_blob_url": "http://127.0.0.1:9000/music/download/<uuid>",
  "cover_blob_url": ""
}
```

`cover_blob_url` is the public cover URL when a cover was uploaded, otherwise `""`.

5. CLI inserts one `playable_audio` row (`title`, `published`, the three URLs). Prints the new `id` on success. HTTP timeout must survive a 200MB local upload.

If S3/upload fails, CLI must not insert. If insert fails after S3 succeeded, leftover objects are acceptable (no distributed rollback).

## Schema

New migration: drop constraint `playable_audio_published_cover_check`.

Update `docs/phase-2/db-design.md` to match: empty cover on a published row is allowed; UI shows the theme fill.

`cover_blob_url` stays `text not null default ''`.

## Errors

| Case | Response |
| --- | --- |
| Missing/wrong admin secret | HTTP `401` `{ "error": "unauthorized" }` |
| Missing audio file or title, or `published` not `true`/`false` | HTTP `400` `{ "error": "bad request" }` |
| MinIO/S3 down or PutObject fail | HTTP `503` `{ "error": "storage unavailable" }`; CLI does not insert |
| DB insert fails after blobs | CLI stderr short message; exit non-zero; orphans allowed |

No stack traces in HTTP bodies or CLI output. Create no longer treats `501` as success.

CLI: `401` → `secret failed`. Unreachable upload URL → `cannot reach {url}` (existing). `503` → short storage message. Insert fail → short db message.

## Tests

- Upload: `401` wrong/missing secret (keep). Valid secret is no longer `501`.
- Upload: `400` without file or title.
- Upload: success returns the three URL keys; `cover_blob_url` empty when no cover part.
- CLI: `200` leads to an insert attempt; `503` does not insert.
- CLI: multipart field names include `file`, `title`, `published`, and `cover` when a cover file is passed.
- Catalog query still must not select `download_blob_url`.

## Out of scope

- `list` / `update` / `delete` / `analytics`
- Upsert / replace-by-title
- Signed download URLs
- Transcode / HLS
- Admin web UI
- Cloud Supabase / Backblaze cutover
- Orphan-blob cleanup

## Verification (done-line)

1. `npx supabase db reset` applies the drop-check migration.
2. `create -p true -f <wav>` with no `--cover` inserts a published row and `/` can show it.
3. Grid/player empty cover is `#2a2a2a`, not a broken `<img>`.
4. `create` with `--cover` stores a public cover object; the card shows that image.
5. Catalog JSON/HTML still has no `download_blob_url`.
6. Wrong `X-Admin-Secret` still `401`.
