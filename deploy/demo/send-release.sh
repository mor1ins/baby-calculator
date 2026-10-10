#!/usr/bin/env bash
set -euo pipefail
: "${DEPLOY_ENV:?}" "${SSH_HOST:?}" "${SSH_USER:?}" "${SSH_KEY:?}" "${SSH_KNOWN_HOSTS:?}" "${GHCR_USER:?}" "${GHCR_TOKEN:?}" "${DEMO_REPOSITORY:?}"
case "$DEPLOY_ENV" in DEV) environment=dev ;; PROD) environment=prod ;; *) exit 2 ;; esac
[[ "$SSH_HOST" =~ ^[a-zA-Z0-9.-]+$ && "$SSH_USER" =~ ^[a-zA-Z0-9_-]+$ ]]
[[ "$GHCR_USER" =~ ^[a-zA-Z0-9_-]+$ ]]
[[ "$DEMO_REPOSITORY" =~ ^ghcr\.io/[a-z0-9._-]+/[a-z0-9._-]+/demo$ ]]
credentials=$(mktemp -d)
trap 'rm -rf "$credentials"' EXIT
printf '%s\n' "$SSH_KEY" > "$credentials/key"
printf '%s\n' "$SSH_KNOWN_HOSTS" > "$credentials/known_hosts"
chmod 600 "$credentials/key" "$credentials/known_hosts"
options=(-i "$credentials/key" -o UserKnownHostsFile="$credentials/known_hosts" -o StrictHostKeyChecking=yes -o BatchMode=yes -o ConnectTimeout=15)
remote="$SSH_USER@$SSH_HOST"
folder="/srv/baby/demo/$environment"
# Each run uploads its own bundle before taking the server lock. Concurrent uploads cannot overwrite a candidate.
bundle=$(ssh "${options[@]}" "$remote" "test -f '$folder/.env' && mkdir -p '$folder/releases' && mktemp -d '$folder/releases/release.XXXXXXXXXX'")
[[ "$bundle" =~ ^$folder/releases/release\.[a-zA-Z0-9]+$ ]]
scp "${options[@]}" deploy/demo/compose.yaml deploy/demo/release.sh release.env "$remote:$bundle/"
printf '%s\n' "$GHCR_TOKEN" | ssh "${options[@]}" "$remote" \
    "GHCR_USER='$GHCR_USER' DEMO_REPOSITORY='$DEMO_REPOSITORY' bash '$bundle/release.sh' '$environment'"
