#!/bin/sh
set -eu
case "${FRONTEND_REGISTRATION_ENABLED:-false}" in
    true) enabled=true ;;
    false) enabled=false ;;
    *) echo 'FRONTEND_REGISTRATION_ENABLED must be true or false' >&2; exit 1 ;;
esac
printf 'globalThis.__BABY_CONFIG__ = {"registrationEnabled":%s};\n' "$enabled" > /usr/share/nginx/html/config.js
