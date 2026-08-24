import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../..')
const launcher = fs.readFileSync(path.join(root, 'apps/web/src/FacturacionLauncher.jsx'), 'utf8')
const receivables = fs.readFileSync(path.join(root, 'supabase/migrations/20260823175500_receivables_cash_safe.sql'), 'utf8')

const requireText = (text, token, label) => { if (!text.includes(token)) throw new Error(`${label}: falta ${token}`) }

requireText(launcher, "table: 'dte_documents'", 'Facturación escucha cambios DTE')
requireText(launcher, "payload.eventType === 'INSERT'", 'Factura nueva abre Documentos')
requireText(launcher, "setActiveSection('documentos')", 'Factura nueva se muestra inmediatamente')
requireText(launcher, "row.status || '').toUpperCase() === 'PROCESSED'", 'Procesado MH refresca cobranza')
requireText(launcher, 'receivablesVersion', 'CxC tiene invalidación por cambio DTE')
requireText(receivables, "new.status <> 'PROCESSED'", 'CxC solo nace con DTE procesado')
requireText(receivables, 'v_condition<>2', 'CxC solo nace para crédito')
requireText(receivables, 'dte_document_id', 'CxC mantiene vínculo con DTE')

console.log('OK trazabilidad Facturación: guardar DTE → Documentos → PROCESSED → CxC')
