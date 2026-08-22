#!/bin/sh
set -eu

if [ -z "${SIGNER_API_TOKEN:-}" ]; then
  echo "SIGNER_API_TOKEN es obligatorio." >&2
  exit 1
fi

CERT_HOME="${CERTIFICATE_HOME:-/tmp/certificates}"
mkdir -p "$CERT_HOME"

first_certificate=""
certificate_count=0
for source in /etc/secrets/cert_*.crt; do
  [ -f "$source" ] || continue
  filename="$(basename "$source")"
  target="$CERT_HOME/${filename#cert_}"
  cp "$source" "$target"
  certificate_count=$((certificate_count + 1))
  if [ -z "$first_certificate" ]; then
    first_certificate="$target"
  fi
done

if [ -n "$first_certificate" ]; then
  cert_name="$(basename "$first_certificate")"
  mounted_nit="${cert_name%.crt}"
  fingerprint="$(sha256sum "$first_certificate" | awk '{print $1}')"
  size_bytes="$(wc -c < "$first_certificate" | tr -d ' ')"
  printf '{"certificatePresent":true,"certificateCount":%s,"mountedNit":"%s","fileName":"%s","sha256":"%s","sizeBytes":%s}\n' \
    "$certificate_count" "$mounted_nit" "$cert_name" "$fingerprint" "$size_bytes" > /tmp/cert-diagnostic.json
else
  printf '{"certificatePresent":false,"certificateCount":0,"mountedNit":null,"fileName":null,"sha256":null,"sizeBytes":0}\n' > /tmp/cert-diagnostic.json
fi

java \
  --add-opens java.base/java.math=ALL-UNNAMED \
  --add-opens java.base/java.time=ALL-UNNAMED \
  -jar /app.jar \
  --server.port=8113 &

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
