# Firmador DTE

Contenedor oficial `svfe/svfe-api-firmador:v20260316` suministrado por el
Ministerio de Hacienda, envuelto únicamente para su despliegue seguro en Render:

- imagen oficial fijada a una versión concreta;
- proxy HTTPS administrado por Render y puerto configurable mediante `PORT`;
- certificado leído desde `/etc/secrets` mediante `CERTIFICATE_HOME`;
- protección adicional `X-Signer-Token` en el proxy para todas las rutas
  `/firmardocumento`.

## Secretos de Render

El servicio requiere `SIGNER_API_TOKEN` y un Secret File llamado exactamente
`<NIT-sin-guiones>.crt`. Nunca se deben incorporar certificados, contraseñas o
credenciales de Hacienda al repositorio.

La API debe usar el mismo token en `DTE_SIGNER_TOKEN` y la URL HTTPS del servicio
en `DTE_SIGNER_URL`.
