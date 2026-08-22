#!/bin/sh
set -eu

if [ -z "${SIGNER_API_TOKEN:-}" ]; then
  echo "SIGNER_API_TOKEN es obligatorio." >&2
  exit 1
fi

mkdir -p "${CERTIFICATE_HOME:-/tmp/certificates}"
for source in /etc/secrets/cert_*.crt; do
  [ -f "$source" ] || continue
  filename="$(basename "$source")"
  cp "$source" "${CERTIFICATE_HOME:-/tmp/certificates}/${filename#cert_}"
done

java \
  --add-opens java.base/java.math=ALL-UNNAMED \
  --add-opens java.base/java.time=ALL-UNNAMED \
  -jar /app.jar \
  --server.port=8113 &

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
