# scripts/

Local infra smoke checks. Not app code. Not the admin CLI (`app/cli/`).

Docker volumes do not clone. After you bring MinIO and Postgres up, run these from **repo root** to confirm the spec's done-line.

## `verify-minio.sh`

MinIO is live on `127.0.0.1:9000`, bucket `music` exists, and anonymous `GetObject` is allowed on `stream/` and `cover/`.

Re-applies `minio/stream-public-policy.json` each run (init does not rerun after the first success).

```bash
docker compose up -d minio minio-init
./scripts/verify-minio.sh
```

Expect: `MinIO OK`

## `verify-schema.sh`

Local Supabase Postgres has public tables `playable_audio`, `contacts`, `installs`.

Needs Docker socket access (`npx supabase status`) and `psql`.

```bash
npx supabase start
npx supabase db reset
./scripts/verify-schema.sh
```

Expect: `Schema OK`
