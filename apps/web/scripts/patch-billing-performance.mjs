import fs from 'node:fs'
import path from 'node:path'

const file = path.resolve(process.cwd(), 'src/FacturacionLauncher.jsx')
let source = fs.readFileSync(file, 'utf8')

if (source.includes("const FacturacionDte = lazy(() => import('./FacturacionDte.jsx'))")) {
  console.log('Facturación: carga diferida de secciones ya aplicada.')
  process.exit(0)
}

source = source.replace(
  "import { useEffect, useRef, useState } from 'react'",
  "import { lazy, Suspense, useEffect, useRef, useState } from 'react'",
)

const staticImports = `import FacturacionDte from './FacturacionDte.jsx'
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

const lazyImports = `const FacturacionDte = lazy(() => import('./FacturacionDte.jsx'))
const PartialInvoiceFromQuote = lazy(() => import('./PartialInvoiceFromQuote.jsx'))
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

if (!source.includes(staticImports)) {
  throw new Error('No se encontró el bloque de importaciones pesadas de Facturación.')
}
source = source.replace(staticImports, lazyImports)

const headMarker = `        <div className="billing-section-head"><div><span className="billing-section-kicker">{active.helper}</span><h2>{active.label}</h2></div><span className="billing-company-pill">{company.name || company.legal_name || 'Empresa activa'}</span></div>`
if (!source.includes(headMarker)) {
  throw new Error('No se encontró el encabezado de contenido de Facturación.')
}
source = source.replace(
  headMarker,
  `${headMarker}\n        <Suspense fallback={<div className="loading-card"><span className="spinner" /><p>Cargando sección de facturación…</p></div>}>`,
)

const closeMarker = `        {activeSection === 'hacienda' && <section className="billing-section-card billing-hacienda-section"><ProductionPreflightPanel session={session} company={company}/><details className="module-secondary-tools"><summary>Diagnósticos y pruebas técnicas</summary><div className="module-secondary-tools-body"><MhAuthDiagnostic session={session} company={company}/><SignerDiagnostic session={session} company={company}/><DteTestPlan supabase={supabase} company={company} onPrepareCase={prepareMhTestCase}/></div></details></section>}\n      </main>`
if (!source.includes(closeMarker)) {
  throw new Error('No se encontró el cierre del contenido de Facturación.')
}
source = source.replace(
  closeMarker,
  `        {activeSection === 'hacienda' && <section className="billing-section-card billing-hacienda-section"><ProductionPreflightPanel session={session} company={company}/><details className="module-secondary-tools"><summary>Diagnósticos y pruebas técnicas</summary><div className="module-secondary-tools-body"><MhAuthDiagnostic session={session} company={company}/><SignerDiagnostic session={session} company={company}/><DteTestPlan supabase={supabase} company={company} onPrepareCase={prepareMhTestCase}/></div></details></section>}\n        </Suspense>\n      </main>`,
)

fs.writeFileSync(file, source)
console.log('Facturación: secciones pesadas separadas y cargadas solo cuando se abren.')
