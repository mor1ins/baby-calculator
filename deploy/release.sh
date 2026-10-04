#!/usr/bin/env bash
set -euo pipefail
# Run on the VPS from /srv/baby/{dev,prod}; .env belongs to the server.
environment=${1:?dev or prod}
case "$environment" in dev|prod) ;; *) exit 2 ;; esac
exec 9>release.lock
flock 9
# Actions supplies its short-lived read-only registry token over SSH stdin.
if [[ -n "${GHCR_USER:-}" ]]; then
    export DOCKER_CONFIG
    DOCKER_CONFIG=$(mktemp -d)
    trap 'rm -rf "$DOCKER_CONFIG"' EXIT
    docker login ghcr.io --username "$GHCR_USER" --password-stdin
fi
compose() { docker compose -p "baby-$environment" --env-file .env --env-file "$1" -f compose.yaml "${@:2}"; }
# Validate data without sourcing an artifact as executable shell code.
python3 - <<'PY'
import re
from pathlib import Path
lines = Path('candidate.env').read_text().splitlines()
assert len(lines) == 2
for prefix, line in zip(('BACKEND_IMAGE=', 'FRONTEND_IMAGE='), lines):
    assert line.startswith(prefix)
    assert re.fullmatch(r'ghcr\.io/[a-z0-9._/-]+@sha256:[a-f0-9]{64}', line[len(prefix):])
PY
compose candidate.env pull
compose candidate.env up -d --wait postgres
compose candidate.env run --rm --no-deps backend uv run --locked --no-dev alembic upgrade head
if compose candidate.env up -d --wait --wait-timeout 120; then
    if [ -f current.env ]; then cp current.env previous.env; fi
    mv candidate.env current.env
else
    if [ -f current.env ]; then
        compose current.env up -d --wait --wait-timeout 120 || {
            echo 'Previous app failed healthcheck after migration; manual schema compatibility review required.' >&2
            exit 1
        }
    fi
    exit 1
fi
