# Entrega de DTE por correo

- El envío automático ocurre únicamente después de que un DTE de PRODUCCIÓN queda `PROCESSED` y con sello de recepción de Hacienda.
- El correo incluye representación gráfica PDF, JSON del DTE, JWS firmado y respuesta MH cuando estén disponibles.
- `invoice_email_deliveries` registra estado `pending`, `sent`, `failed` o `skipped`, destinatario, tipo de entrega, identificador del proveedor y fecha.
- La entrega automática mantiene una sola fila por DTE para evitar duplicados.
- Los reenvíos manuales crean registros independientes con `delivery_kind = manual`.
- El endpoint de reenvío no llama a firma ni transmisión fiscal: solo reconstruye el correo desde el DTE ya almacenado.
- La UI deshabilita el reenvío real para TEST y solo lo habilita para PRODUCCIÓN aceptada con sello MH.
