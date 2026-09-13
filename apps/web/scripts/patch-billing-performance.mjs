import fs from 'node:fs'
import path from 'node:path'

const file = path.resolve(process.cwd(), 'src/FacturacionLauncher.jsx')
let source = fs.readFileSync(file, 'utf8')

if (source.includes("const Billing360Dashboard = lazy(() => import('./Billing360Dashboard.jsx'))")) {
  console.log('Facturación: carga diferida secundaria ya aplicada.')
  process.exit(0)
}

source = source.replace(
  "import { useEffect, useRef, useState } from 'react'",
  "import { lazy, Suspense, useEffect, useRef, useState } from 'react'",
)

const eagerBlock = `import FacturacionDte from './FacturacionDte.jsx'
import PartialInvoiceFromQuote from './PartialInvoiceFromQuote.jsx'
import SignerDiagnostic from './SignerDiagnostic.jsx'
import ProductionPreflightPanel from './ProductionPreflightPanel.jsx'
import MhAuthDiagnostic from './MhAuthDiagnostic.jsx'
import ProcessedDtePanelBridge from './ProcessedDtePanelBridge.jsx'
import DteContingencyOperationsPanel from './DteContingencyOperationsPanel.jsx'
import InvoiceEmailPdfTestPanel from './InvoiceEmailPdfTestPanel.jsx'
import DteTestPlan from './DteTestPlan.jsx'
import Billing360Dashboard from './Billing360Dashboard.jsx'
import BillingReceivablesPanel from './BillingReceivablesPanel.jsx'
import DteFinancialIntegrityPanel from './DteFinancialIntegrityPanel.jsx'`

const mixedBlock = `import FacturacionDte from './FacturacionDte.jsx'
import PartialInvoiceFromQuote from './PartialInvoiceFromQuote.jsx'
const SignerDiagnostic = lazy(() => import('./SignerDiagnostic.jsx'))
const ProductionPreflightPanel = lazy(() => import('./ProductionPreflightPanel.jsx'))
const MhAuthDiagnostic = lazy(() => import('./MhAuthDiagnostic.jsx'))
const ProcessedDtePanelBridge = lazy(() => import('./ProcessedDtePanelBridge.jsx'))
const DteContingencyOperationsPanel = lazy(() => import('./DteContingencyOperationsPanel.jsx'))
const InvoiceEmailPdfTestPanel = lazy(() => import('./InvoiceEmailPdfTestPanel.jsx'))
const DteTestPlan = lazy(() => import('./DteTestPlan.jsx'))
const Billing360Dashboard = lazy(() => import('./Billing360Dashboard.jsx'))
const BillingReceivablesPanel = lazy(() => import('./BillingReceivablesPanel.jsx'))
const DteFinancialIntegrityPanel = lazy(() => import('./DteFinancialIntegrityPanel.jsx'))`

if (!source.includes(eagerBlock)) throw new Error('No se encontró el bloque esperado de Facturación.')
source = source.replace(eagerBlock, mixedBlock)

const head = `        <div className="billing-section-head"><div><span className="billing-section-kicker">{active.helper}</span><h2>{active.label}</h2></div><span className="billing-company-pill">{company.name || company.legal_name || 'Empresa activa'}</span></div>`
source = source.replace(head, `${head}\n        <Suspense fallback={<div className="loading-card"><span className="spinner" /><p>Cargando sección de facturación…</p></div>}>`)

const tail = `        {activeSection === 'hacienda' && <section className="billing-section-card billing-hacienda-section"><ProductionPreflightPanel session={session} company={company}/><details className="module-secondary-tools"><summary>Diagnósticos y pruebas técnicas</summary><div className="module-secondary-tools-body"><MhAuthDiagnostic session={session} company={company}/><SignerDiagnostic session={session} company={company}/><DteTestPlan supabase={supabase} company={company} onPrepareCase={prepareMhTestCase}/></div></details></section>}\n      </main>`
source = source.replace(tail, `        {activeSection === 'hacienda' && <section className="billing-section-card billing-hacienda-section"><ProductionPreflightPanel session={session} company={company}/><details className="module-secondary-tools"><summary>Diagnósticos y pruebas técnicas</summary><div className="module-secondary-tools-body"><MhAuthDiagnostic session={session} company={company}/><SignerDiagnostic session={session} company={company}/><DteTestPlan supabase={supabase} company={company} onPrepareCase={prepareMhTestCase}/></div></details></section>}\n        </Suspense>\n      </main>`)

fs.writeFileSync(file, source)
console.log('Facturación: formulario de nueva factura inmediato; secciones secundarias bajo demanda.')
