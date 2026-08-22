FROM svfe/svfe-api-firmador:v20260316 AS official-signer
FROM caddy:2-alpine AS caddy
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=official-signer /app.jar /app.jar
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile
COPY entrypoint.sh /app/entrypoint.sh
ENV TZ=America/El_Salvador
EXPOSE 10000
ENTRYPOINT ["/app/entrypoint.sh"]
