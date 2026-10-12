# IDEALO SV — Centro de Certificación de Hacienda (TEST 00)

## Estado de la implementación

Este desarrollo es para pruebas de habilitación de MH y permanece en una rama de revisión.
**No está publicado ni habilita producción por sí solo.** No altera la firma o la emisión
ordinaria de DTE-01/DTE-03 y no envía documentos sin confirmación explícita.

### DTE adicionales

- DTE-04 (Nota de Remisión): schema v4
- DTE-05 (Nota de Crédito): schema v4
- DTE-06 (Nota de Débito): schema v4
- DTE-07 (Comprobante de Retención): schema v2
- DTE-08 (Comprobante de Liquidación): schema v2
- DTE-09 (Documento Contable de Liquidación): schema v2
- DTE-11 (Factura de Exportación): schema v3
- DTE-14 (Factura de Sujeto Excluido): schema v2
- DTE-15 (Comprobante de Donación): schema v2

Los esquemas provienen del paquete v2.0 de MH distribuido mediante
[factura.gob.sv](https://factura.gob.sv/) → Información técnica y funcional → JSON Schemas.
Se tomó la copia nombrada de
[herson/dte-json-schemas](https://github.com/herson/dte-json-schemas) el 12/oct/2026.
Antes de transmitir se debe comparar los archivos con el paquete vigente entregado al
emisor por MH, porque puede cambiar con las versiones y con el estado de autorización.
**V2.0: confirmar aceptación en TEST del emisor.**

### Flujo desde ERP

1. Inicia sesión con rol propietario o administrador y con plan DTE habilitado.
2. Abre **Facturación → Hacienda → Certificación** y elige el tipo DTE pendiente.
3. Presiona **Preparar DTE-xx · TEST** para abrir su editor.
4. Si es nota de crédito o débito, selecciona y vincula el DTE previo aceptado. Si el
   DTE proviene de fuera del ERP, documenta sus datos verdaderos y confirma en MH.
5. Completa receptor, cuerpo, tributos y totales **con operaciones reales**; no generar
   documentos ficticios para subir un contador.
6. **Validar esquema MH** revisa la sintaxis y la estructura en el servidor sin reservar
   correlativo; no implica aceptación de Hacienda.
7. **Crear borrador TEST** reserva número único y genera código UUID v4 nuevo.
8. **Firmar DTE TEST** exige rol permitido y firmador configurado.
9. **Enviar a Hacienda TEST** requiere confirmación expresa, invoca recepción individual
   del MH, registra intento y guarda su respuesta, sin repetición automática.
10. Revisa el estado PROCESSED/REJECTED y el contador del portal oficial de Hacienda.
    El progreso interno de IDEALO es solo evidencia del ERP y no representa el total
    del portal, especialmente cuando se han enviado DTE con otros sistemas.

### Eventos Retorno y Operaciones Especiales

- Se incluyen schemas v1 de EVENT:RETURN / EVENT:SPECIAL_OPERATIONS para validación.
- Se pueden preparar y almacenar borradores; retorno requiere un documento TEST
  aceptado por MH del tipo 01, 11 o 14, vinculado a la empresa y al evento.
- **No se ofrece envío, firma ni aprobación automática** para eventos nuevos porque
  su autorización individual y contrato oficial de recepción deben verificarse.
- Contingencia e invalidación mantienen sus flujos originales en el ERP.
- La migración añade los dos tipos a la bitácora de eventos, con estado DRAFT.

## Condiciones de puesta en marcha

1. Confirmar versiones oficiales de esquemas vigentes y habilitación de los tipos en TEST.
2. Revisar esquema/numeración con contador de la empresa y respaldar datos.
3. Aplicar migraciones de funciones y eventos **solo tras aprobar los cambios**.
4. Publicar la API y el frontend después de aprobar revisión de seguridad y CI completo.
5. Validar autenticación MH, firmador y cada tipo con una operación legítima.
6. Verificar la respuesta procesada y cómo se reflejó en el contador del portal de MH.
7. No activar producción sin autorización explícita del propietario ni habilitación MH.

## Limitaciones conocidas

- El editor adicional es **estructurado por secciones JSON**, no un formulario comercial
  específico por tipo. La persona operadora debe conocer los campos fiscales de su
  operación y el esquema correspondiente.
- La validación local de schema no garantiza recepción por MH.
- No se realizan lotes masivos para intentar completar un número de pruebas.
- Para los dos eventos nuevos falta confirmar servicio oficial y autorización.
- No se sincroniza el contador oficial del portal; la evidencia interna se obtiene
  únicamente de la base de datos del ERP.
