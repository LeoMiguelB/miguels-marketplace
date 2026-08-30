# Session handoff — scaffolding infra

Read this before doing anything else. Chat history does not survive a clone.

**Resume here:** Task 3 (Next.js app shell). Do not re-do Tasks 1–2.

## How we were working

- Plan: `docs/superpowers/plans/2026-08-27-scaffolding-infra.md`
- Spec: `docs/superpowers/specs/2026-08-27-scaffolding-infra-design.md`
- Workflow: superpowers **subagent-driven-development** — one implementer per task, then a task review, then **stop for a human review** before the next task
- Branch: `feat/scaffolding-infra`
- **No commits unless the user asks** (this file + Tasks 1–2 were committed so the other machine can clone)
- Do not implement catalog, player, install form, T&C, PutObject, CLI Npgsql writes, cloud Supabase, or Backblaze

## Progress

| Task | Status |
| --- | --- |
| 1. Gitignore, env examples, MinIO | Done. Human reviewed. Spec reviewer Approved. GREEN: `MinIO OK` |
| 2. Supabase schema | Done. Spec reviewer Approved. Human asked questions, then said continue. GREEN: `npx supabase db reset` + `Schema OK`. Migrator row `20260827120000` / `init` |
| 3. Next.js app shell | **Next** |
| 4. Admin secret helper and upload stub | Not started |
| 5. Server-only db and S3 clients | Not started |
| 6. .NET admin CLI | Not started |
| 7. Spec done-line | Not started |

## Decisions already locked (do not re-litigate)

- MinIO is the **local S3-compatible store**, not an AWS mock. AWS SDK v3 later points at `S3_ENDPOINT`. Prod later: same SDK, env swap to Backblaze B2.
- This pass: no `PutObject`. `stream/*` is public `GetObject`. `download/*` is private.
- Database is **real local Postgres** via `supabase start` (`127.0.0.1:54322`). Not in-memory. Not a throwaway test DB. Same migrations later swap `DATABASE_URL` to cloud Supabase.
- `ADMIN_SECRET` / `X-Admin-Secret` gates **`POST /api/admin/upload` only**. It does not protect blobs. Store has no public user auth.

## After clone (local infra is not in git)

Docker volumes and running containers do not clone. On the new machine:

1. Install Docker, Docker Compose, Node/npx, `psql` (Postgres client), later .NET 8 for Task 6.
2. Put your user in the `docker` group (or use `sudo` for Compose / `npx supabase *`).
3. From repo root:

```bash
docker compose up -d minio minio-init
sleep 8
./scripts/verify-minio.sh          # expect: MinIO OK

npx supabase start
npx supabase db reset
./scripts/verify-schema.sh         # expect: Schema OK
```

4. Copy env when Task 3 needs it: `cp app/.env.example app/.env.local` (gitignored).

## Environment notes from the last machine

- User was **not** in the `docker` group; Compose and Supabase CLI needed `sudo`.
- `scripts/verify-schema.sh` calls `npx supabase status`, which needs Docker socket access.
- Example MinIO keys in `.env.example` are local defaults (`minioadmin`), not production secrets.

## Next agent instruction

Using subagent-driven-development, implement **Task 3 only** from the plan. Then review with the human before Task 4. Skip `git commit` unless they ask.
