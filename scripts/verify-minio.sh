#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

code="$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9000/minio/health/live || true)"
if [[ "$code" != "200" ]]; then
  echo "MinIO health failed (HTTP ${code:-none})"
  exit 1
fi

# Re-apply git policy so an old MinIO volume picks up cover/ (init only runs once).
docker compose --profile tools run --rm -T --entrypoint /bin/sh minio-mc <<'EOF'
set -eu
mc alias set local http://minio:9000 minioadmin minioadmin >/dev/null
mc ls local/music >/dev/null
mc anonymous set-json /policy.json local/music >/dev/null
printf 'ok' | mc pipe local/music/cover/.policy-probe >/dev/null
EOF

probe="$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9000/music/cover/.policy-probe || true)"
if [[ "$probe" != "200" ]]; then
  echo "cover/ anonymous GetObject failed (HTTP ${probe:-none})"
  exit 1
fi

docker compose --profile tools run --rm -T --entrypoint /bin/sh minio-mc <<'EOF'
mc alias set local http://minio:9000 minioadmin minioadmin >/dev/null
mc rm local/music/cover/.policy-probe >/dev/null
EOF

echo "MinIO OK"
