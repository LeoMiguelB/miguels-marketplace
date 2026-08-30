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
