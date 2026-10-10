#!/usr/bin/env bash
set -euo pipefail
image=${1:?image to test}
revision=${2:?expected revision}
[[ "$revision" =~ ^[a-f0-9]{40}$ ]]
container=$(docker run -d -p 127.0.0.1::80 "$image")
trap 'docker rm -f "$container" >/dev/null' EXIT
address=$(docker port "$container" 80/tcp)
base="http://$address"
for attempt in {1..30}; do
    if curl --fail --silent "$base/health" >/dev/null; then break; fi
    sleep 1
done
curl --fail --silent --show-error "$base/" | grep -q 'id="screen"'
curl --fail --silent --show-error "$base/version.json" | python3 -c 'import json,sys; assert json.load(sys.stdin)["revision"] == sys.argv[1]' "$revision"
for asset in assets/mobile-ui.js assets/mobile-ui.css prototype.js reporting.js insights.js fonts/Manrope-variable.ttf; do
    curl --fail --silent --show-error "$base/$asset" -o /dev/null
done
for private in README.md SPEC.md AUDIT.md package.json src/mobile-ui.jsx screenshots/full-day-light.png .env api/v1; do
    test "$(curl --silent --output /dev/null --write-out '%{http_code}' "$base/$private")" = 404
done
