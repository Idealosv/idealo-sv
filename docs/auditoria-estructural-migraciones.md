# Control de migraciones

El repositorio contiene colisiones históricas de prefijos y timestamps en `supabase/migrations`. No se renombrarán retroactivamente porque podrían corresponder a migraciones ya ejecutadas.

Desde ahora toda migración nueva debe usar un identificador único. La prueba `apps/api/test/migration-history-integrity.test.js` registra las colisiones legacy conocidas y hace fallar CI si aparece una nueva.

Antes de consolidar migraciones antiguas debe compararse el historial aplicado en Supabase con los archivos del repositorio y generar una línea base nueva sin alterar el esquema productivo existente.
