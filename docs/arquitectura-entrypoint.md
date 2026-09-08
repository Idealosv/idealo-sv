# Entrypoint activo del ERP

El flujo autenticado vigente entra por `Workspace.jsx`. `ErpApp.jsx` se considera legado y no debe volver a conectarse al flujo principal sin una migración explícita.

La prueba `frontend-entrypoint-integrity.test.js` protege esta decisión para evitar que dos arquitecturas distintas vuelvan a competir por la sesión autenticada.
