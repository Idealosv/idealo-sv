# Regresión móvil IDEALO SV

Esta matriz separa lo que puede certificar CI de lo que necesita un teléfono físico. La aplicación Android se construye con Capacitor; en iPhone la cobertura actual corresponde a PWA/Safari instalada en pantalla de inicio.

| Área | Android CI | iPhone/PWA CI | Dispositivo físico |
|---|---|---|---|
| Ruta `/mobile` y modo standalone | PASS automático | PASS automático | PENDIENTE |
| Runtime Android/iPhone y viewport seguro | PASS automático | PASS automático | PENDIENTE |
| Service Worker, actualización y caché | PASS automático | PASS automático | PENDIENTE |
| Navegación inferior y roles | PASS automático | PASS automático | PENDIENTE |
| Cliente 360 / clientes / cotizaciones | PASS contrato | PASS contrato | PENDIENTE |
| Offline de OT, agenda y evidencias | PASS contrato | PASS contrato | PENDIENTE |
| Cámara / galería | PASS contrato | PASS contrato | PENDIENTE permiso/captura |
| GPS | PASS contrato | PASS contrato | PENDIENTE permiso/precisión |
| Firma táctil | PASS contrato | PASS contrato | PENDIENTE gesto real |
| DTE-01 / DTE-03 y bloqueo offline | PASS contrato | PASS contrato | PENDIENTE emisión TEST |
| Compartir e imprimir/guardar PDF | PASS contrato | PASS contrato | PENDIENTE hoja nativa |
| Compilación APK Capacitor | PASS workflow | N/A | PENDIENTE instalación |

## Pasada física mínima

1. Instalar/abrir, cerrar y reabrir la app; confirmar que siempre entra a la experiencia móvil y no al escritorio.
2. Cambiar de Wi-Fi/datos a sin conexión y volver a conectar; registrar una acción offline y confirmar sincronización.
3. Tomar una foto, aceptar/denegar y volver a aceptar GPS, firmar con el dedo y guardar evidencia.
4. Abrir Cliente 360, crear/consultar una cotización y recorrer OT → producción → entrega/cobro con datos de prueba.
5. Con conexión, preparar DTE-01 y DTE-03 en ambiente de prueba, revisar estado/sello y probar Compartir + Imprimir/Guardar PDF.
6. Tras publicar una versión nueva, reabrir y confirmar que el Service Worker no deja JS/CSS anterior.

Una fila física solo cambia a PASS después de ejecutarla realmente en el dispositivo correspondiente; CI no debe marcarla por inferencia.
