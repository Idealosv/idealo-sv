FROM svfe/svfe-api-firmador:v20260316 AS official-signer
FROM caddy:2-alpine AS caddy
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=official-signer /app.jar /app.jar
COPY --chmod=0755 --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile
COPY --chmod=0755 entrypoint.sh /app/entrypoint.sh
RUN apk add --no-cache libcap \
    && (setcap -r /usr/bin/caddy 2>/dev/null || true) \
    && apk del libcap
ENV TZ=America/El_Salvador
EXPOSE 10000
ENTRYPOINT ["/app/entrypoint.sh"]
