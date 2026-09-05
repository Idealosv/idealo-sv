import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../..')
const launcher = fs.readFileSync(path.join(root, 'apps/web/src/FacturacionLauncher.jsx'), 'utf8')
const receivables = fs.readFileSync(path.join(root, 'supabase/migrations/20260823175500_receivables_cash_safe.sql'), 'utf8')

const requireText = (text, token, label) => { if (!text.includes(token)) throw new Error(`${label}: falta ${token}`) }

requireText(launcher, "table: 'dte_documents'", 'Facturación escucha cambios DTE')
requireText(launcher, "activeSection === 'documentos'", 'Documentos sigue disponible como sección explícita')
requireText(launcher, 'ProcessedDtePanel', 'Documentos conserva trazabilidad DTE')
requireText(launcher, "String(row.status || '').toUpperCase() !== 'PROCESSED'", 'Procesado MH filtra exclusivamente estado PROCESSED')
requireText(launcher, "payload.eventType !== 'UPDATE'", 'Procesado MH solo reacciona a actualización DTE')
requireText(launcher, 'receivablesVersion', 'CxC tiene invalidación por cambio DTE')
requireText(launcher, "setActiveSection('cobros')", 'DTE procesado continúa automáticamente hacia Cobros')
requireText(launcher, 'source_work_order_id', 'Continuación a Cobros conserva contexto de OT')
requireText(launcher, 'source_quote_id', 'Continuación a Cobros conserva contexto de cotización')
requireText(receivables, "new.status <> 'PROCESSED'", 'CxC solo nace con DTE procesado')
requireText(receivables, 'v_condition<>2', 'CxC solo nace para crédito')
requireText(receivables, 'dte_document_id', 'CxC mantiene vínculo con DTE')

if (launcher.includes("payload.eventType === 'INSERT'") && launcher.includes("setActiveSection('documentos')")) {
  throw new Error('Guardar DTE no debe desmontar Nueva factura antes de terminar la respuesta API')
}

console.log('OK trazabilidad Facturación: guardado estable → Documentos explícito → PROCESSED → CxC → Cobros')
