# Auditoría estructural — ronda 2

Esta ronda no renombra migraciones históricas ni elimina código legado de forma destructiva. Primero instala controles automáticos para impedir nuevas colisiones y regresiones mientras se prepara un saneamiento seguro.

Controles incorporados:
- Bloqueo de nuevas colisiones de prefijos/timestamps de migraciones.
- Protección del entrypoint autenticado por `Workspace.jsx`.
- Contrato de presencia de los principales flujos empresariales dentro de la auditoría automática.
- Documentación de la estrategia de saneamiento sin modificar retroactivamente el historial ya desplegado.
