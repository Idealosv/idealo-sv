# Auditoría Clientes

El control runtime revisa expedientes DTE-03 contra el mismo contrato fiscal usado por FacturacionDte, posibles duplicados por NIT/NRC/correo/teléfono/WhatsApp, desalineación entre bloqueo del cliente y perfil de crédito, cuentas por cobrar vencidas y seguimientos atrasados.

Hallazgo adicional: Workspace conserva una validación histórica de DTE-01 más estricta que FacturacionDte. No se relaja automáticamente en esta entrega para evitar alterar reglas de captura sin una migración/decisión fiscal explícita; queda protegido como punto de seguimiento en la siguiente simplificación del formulario de Clientes.
