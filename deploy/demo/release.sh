#!/usr/bin/env bash
set -euo pipefail
# Run from an uploaded immutable bundle, e.g. releases/release.ABC123.
environment=${1:?dev or prod}
case "$environment" in dev|prod) ;; *) exit 2 ;; esac
root="/srv/baby/demo/$environment"
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
[[ "$bundle" =~ ^$root/releases/release\.[a-zA-Z0-9]+$ ]] || exit 2
cd "$root"
exec 9>release.lock
flock 9
: "${DEMO_REPOSITORY:?Set expected GHCR repository}"
export DEMO_REPOSITORY
python3 - "$bundle/release.env" <<'PY'
import os, re, sys
from pathlib import Path
lines = Path(sys.argv[1]).read_text().splitlines()
repository = os.environ['DEMO_REPOSITORY']
assert re.fullmatch(r'ghcr\.io/[a-z0-9._-]+/[a-z0-9._-]+/demo', repository)
assert len(lines) == 2
assert re.fullmatch(r'DEMO_IMAGE=' + re.escape(repository) + r'@sha256:[a-f0-9]{64}', lines[0])
assert re.fullmatch(r'DEMO_REVISION=[a-f0-9]{40}', lines[1])
PY
if [[ -n "${GHCR_USER:-}" ]]; then
    export DOCKER_CONFIG
    DOCKER_CONFIG=$(mktemp -d)
    trap 'rm -rf "$DOCKER_CONFIG"' EXIT
    docker login ghcr.io --username "$GHCR_USER" --password-stdin
fi
compose() {
    local release=$1
    shift
    docker compose -p "baby-demo-$environment" --env-file "$root/.env" \
        --env-file "$release/release.env" -f "$release/compose.yaml" "$@"
}
compose "$bundle" config --quiet
compose "$bundle" pull
if compose "$bundle" up -d --wait --wait-timeout 120; then
    if [[ -L current ]]; then
        ln -sfn "$(readlink current)" previous.next
        mv -Tf previous.next previous
    fi
    ln -sfn "${bundle#"$root/"}" current.next
    mv -Tf current.next current
else
    if [[ -L current ]]; then
        compose "$root/current" up -d --wait --wait-timeout 120 || {
            echo 'Demo rollback failed; inspect the container logs.' >&2
            exit 1
        }
    fi
    exit 1
fi
