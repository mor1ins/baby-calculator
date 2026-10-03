#!/usr/bin/env bash
set -euo pipefail
: "${DEPLOY_ENV:?}" "${SSH_HOST:?}" "${SSH_USER:?}" "${SSH_KEY:?}" "${SSH_KNOWN_HOSTS:?}"
case "$DEPLOY_ENV" in DEV) remote_env=dev ;; PROD) remote_env=prod ;; *) exit 2 ;; esac
[[ "$SSH_HOST" =~ ^[a-zA-Z0-9.-]+$ ]] && [[ "$SSH_USER" =~ ^[a-zA-Z0-9_-]+$ ]]
install -m 700 -d "$HOME/.ssh"
printf '%s\n' "$SSH_KEY" > "$HOME/.ssh/baby_release"
printf '%s\n' "$SSH_KNOWN_HOSTS" > "$HOME/.ssh/baby_known_hosts"
chmod 600 "$HOME/.ssh/baby_release" "$HOME/.ssh/baby_known_hosts"
trap 'rm -f "$HOME/.ssh/baby_release" "$HOME/.ssh/baby_known_hosts"' EXIT
options=(-i "$HOME/.ssh/baby_release" -o UserKnownHostsFile="$HOME/.ssh/baby_known_hosts" -o StrictHostKeyChecking=yes -o BatchMode=yes)
remote="$SSH_USER@$SSH_HOST"
folder="/srv/baby/$remote_env"
ssh "${options[@]}" "$remote" "mkdir -p '$folder'"
scp "${options[@]}" deploy/compose.server.yaml "$remote:$folder/compose.yaml"
scp "${options[@]}" deploy/release.sh release.env "$remote:$folder/"
ssh "${options[@]}" "$remote" "cd '$folder' && mv release.env candidate.env && bash release.sh '$remote_env'"
