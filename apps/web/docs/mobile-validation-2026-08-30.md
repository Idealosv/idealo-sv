# Revalidación móvil — 30 agosto 2026

Base validada: `dfe874152c3765dbff1442367481e5a90c9de8bd`.

Esta marca existe únicamente para disparar y dejar trazabilidad de la regresión móvil automática y la compilación APK Android sobre el `main` vigente tras la auditoría estructural ERP.

Criterios automáticos esperados:
- `mobile:regression` PASS.
- build frontend PASS.
- Capacitor add/sync PASS.
- Gradle assembleDebug PASS.
- artefacto APK generado.

La validación física de cámara, GPS, firma, compartir/PDF y recuperación real de conectividad continúa siendo una prueba manual de dispositivo.
