import { createClient } from '@supabase/supabase-js'
import { lazy, Suspense, useEffect, useState } from 'react'

const FacturacionDte = lazy(() => import('./FacturacionDte.jsx'))
const SignerDiagnostic = lazy(() => import('./SignerDiagnostic.jsx'))
const ProcessedDtePanel = lazy(() => import('./ProcessedDtePanel.jsx'))
const DteTestPlan = lazy(() => import('./DteTestPlan.jsx'))
const Billing360Dashboard = lazy(() => import('./Billing360Dashboard.jsx'))

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: true } }) : null

const sections = [
  { id: 'emitir', label: 'Nueva factura', helper: 'Cliente, productos y pago' },
  { id: 'documentos', label: 'Facturas', helper: 'Documentos y estados' },
  { id: 'resumen', label: 'Resumen', helper: 'Control de facturación' },
  { id: 'hacienda', label: 'Hacienda', helper: 'Firma y control técnico' },
]

function SectionLoader() {
  return <div className="billing-section-loader" role="status">Cargando…</div>
}

export default function FacturacionLauncher({ autoOpen = false }) {
  const [session, setSession] = useState(null)
  const [company, setCompany] = useState(null)
  const [open, setOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('emitir')
  const [contextClient, setContextClient] = useState({ id: '', name: '' })

  useEffect(() => {
    if (!supabase) return undefined
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session || !supabase) { setCompany(null); return }
    supabase.rpc('get_my_companies').then(async ({ data }) => {
      const id = data?.[0]?.id
      if (!id) return setCompany(null)
      const { data: row } = await supabase.from('companies').select('id,name,legal_name,nit,nrc,activity_code,business_activity,trade_name,department_code,municipality_code,district_code,address,phone,email,establishment_code,point_of_sale_code').eq('id', id).single()
      setCompany(row || null)
    })
  }, [session])

  useEffect(() => {
    if (!autoOpen || !session || !company) return
    setContextClient({ id: '', name: '' })
    setActiveSection('emitir')
    setOpen(true)
  }, [autoOpen, session, company])

  useEffect(() => {
    const openClientContext = (event) => {
      const detail = event.detail || {}
      if (detail.target !== 'billing') return
      setContextClient({ id: detail.clientId || '', name: detail.clientName || '' })
      setActiveSection('emitir')
      setOpen(true)
    }
    window.addEventListener('idealo-open-client-context', openClientContext)
    return () => window.removeEventListener('idealo-open-client-context', openClientContext)
  }, [])

  if (!session || !company) return null
  const active = sections.find((item) => item.id === activeSection) || sections[0]

  return <>
    <button type="button" onClick={() => { setContextClient({ id: '', name: '' }); setActiveSection('emitir'); setOpen(true) }} className="sidebar-module-access billing" aria-label="Abrir facturación">
      <span className="module-glyph">▤</span><span className="module-copy"><span>Facturación</span><small>Ventas y documentos electrónicos</small></span>
    </button>
    {open && <div className="erp-modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <section className="erp-modal-panel billing-modal" role="dialog" aria-modal="true" aria-label="Módulo de facturación" onMouseDown={(event) => event.stopPropagation()}>
        <header className="erp-modal-head billing-module-head"><div><span className="billing-eyebrow">IDEALO SV</span><strong>Facturación</strong><small>Emisión, consulta y control fiscal</small></div><button type="button" onClick={() => setOpen(false)} className="erp-modal-close" aria-label="Cerrar">×</button></header>
        <div className="billing-workspace">
          <nav className="billing-nav" aria-label="Secciones de facturación">
            <div className="billing-nav-title">Facturación</div>
            {sections.map((section) => <button key={section.id} type="button" className={`billing-nav-item ${activeSection === section.id ? 'active' : ''}`} onClick={() => setActiveSection(section.id)} aria-current={activeSection === section.id ? 'page' : undefined}><span>{section.label}</span><small>{section.helper}</small></button>)}
          </nav>
          <main className="billing-content">
            <div className="billing-section-head"><div><span className="billing-section-kicker">{active.helper}</span><h2>{active.label}</h2></div><span className="billing-company-pill">{company.name || company.legal_name || 'Empresa activa'}</span></div>
            {contextClient.id && activeSection === 'emitir' && <div className="billing-context-banner">Cliente seleccionado: <strong>{contextClient.name || 'receptor seleccionado'}</strong>.</div>}
            <Suspense fallback={<SectionLoader/>}>
              {activeSection === 'emitir' && <section className="billing-section-card billing-issue-card"><FacturacionDte session={session} supabase={supabase} company={company} initialClientId={contextClient.id}/></section>}
              {activeSection === 'documentos' && <section className="billing-section-card"><ProcessedDtePanel supabase={supabase} company={company}/></section>}
              {activeSection === 'resumen' && <Billing360Dashboard supabase={supabase} company={company}/>} 
              {activeSection === 'hacienda' && <section className="billing-section-card billing-hacienda-section"><SignerDiagnostic session={session} company={company}/><details className="billing-admin-tools"><summary>Herramientas administrativas y pruebas</summary><div className="billing-admin-tools-body"><Suspense fallback={<SectionLoader/>}><DteTestPlan supabase={supabase} company={company}/></Suspense></div></details></section>}
            </Suspense>
          </main>
        </div>
      </section>
    </div>}
  </>
}
