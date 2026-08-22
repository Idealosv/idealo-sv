# IDEALO SV

Sistema integral de gestión para agencias de publicidad, creado desde cero.

## Arquitectura

- `apps/web`: React + Vite
- `apps/api`: Node.js + Express
- `supabase/migrations`: esquema inicial PostgreSQL y políticas RLS
- `render.yaml`: infraestructura para desplegar frontend y API en Render

## Requisitos

- Node.js 20+
- npm 10+
- Proyecto de Supabase

## Inicio local

1. Copia las variables de entorno:

   ```bash
   cp .env.example .env
   ```

2. Completa las credenciales de Supabase.
3. Instala dependencias y ejecuta:

   ```bash
   npm install
   npm run dev
   ```

- Web: http://localhost:5173
- API: http://localhost:4000
- Salud API: http://localhost:4000/health

## Supabase

Ejecuta `supabase/migrations/0001_initial.sql` desde el SQL Editor de Supabase. El esquema inicial incluye perfiles, empresas, membresías y políticas de aislamiento por empresa.

## Render

1. Crea un Blueprint desde este repositorio.
2. Render detectará `render.yaml`.
3. Configura las variables marcadas como `sync: false`.
4. Despliega primero la API y luego el frontend.

Nunca publiques `SUPABASE_SERVICE_ROLE_KEY` en el frontend.

## Integración DTE

La API incluye clientes separados para Hacienda y el firmador, un orquestador idempotente y la migración `0006_dte_transmission.sql` para conservar estados e intentos.

1. Aplica las migraciones de Supabase en orden.
2. Ejecuta el firmador oficial en una red privada; el certificado y su contraseña nunca deben almacenarse en GitHub ni exponerse al navegador.
3. Completa en Render las variables `DTE_*` de `.env.example`.
4. Mantén `DTE_ENVIRONMENT=test` y `DTE_ENABLE_PRODUCTION=false` durante la homologación.
5. Comprueba `/api/dte/status`; solo informa si la integración está configurada, sin devolver secretos.

El paso a producción exige dos cambios deliberados: `DTE_ENVIRONMENT=production` y `DTE_ENABLE_PRODUCTION=true`.
