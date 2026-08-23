import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import FacturacionDte from './FacturacionDte.jsx'
import SignerDiagnostic from './SignerDiagnostic.jsx'
import ProcessedDtePanel from './ProcessedDtePanel.jsx'
import DteTestPlan from './DteTestPlan.jsx'
import Billing360Dashboard from './Billing360Dashboard.jsx'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: true } }) : null

const sections = [
  { id: 'resumen', label: 'Resumen', helper: 'KPIs y estado fiscal' },
  { id: 'emitir', label: 'Emitir DTE', helper: 'Factura y CCF' },
  { id: 'documentos', label: 'Documentos MH', helper: 'Procesados y respuestas' },
  { id: 'tecnico', label: 'Herramientas MH', helper: 'Diagnóstico y pruebas' },
]

export default function FacturacionLauncher() {
  const [session, setSession] = useState(null)
  const [company, setCompany] = useState(null)
  const [open, setOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('resumen')
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
      const { data: row } = await supabase.from('companies').select('*').eq('id', id).single()
      setCompany(row || null)
    })
  }, [session])

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

  useEffect(() => {
    if (!open || activeSection !== 'emitir' || !contextClient.id) return undefined
    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      const option = document.querySelector(`.facturacion-dte select option[value="${contextClient.id}"]`)
      const select = option?.parentElement
      if (select) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set
        if (setter) setter.call(select, contextClient.id); else select.value = contextClient.id
        select.dispatchEvent(new Event('change', { bubbles: true }))
        window.clearInterval(timer)
      } else if (attempts >= 30) window.clearInterval(timer)
    }, 100)
    return () => window.clearInterval(timer)
  }, [open, activeSection, contextClient.id])

  if (!session || !company) return null

  const openBilling = () => {
    setContextClient({ id: '', name: '' })
    setActiveSection('resumen')
    setOpen(true)
  }

  return <>
    <button type="button" onClick={openBilling} className="sidebar-module-access billing" aria-label="Abrir facturación">
      <span className="module-glyph">▤</span><span className="module-copy"><span>Facturación</span><small>DTE · Hacienda · Control fiscal</small></span>
    </button>
    {open && <div className="erp-modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <section className="erp-modal-panel billing-modal" role="dialog" aria-modal="true" aria-label="Módulo de facturación" onMouseDown={(event) => event.stopPropagation()}>
        <header className="erp-modal-head billing-module-head">
          <div>
            <span className="billing-eyebrow">IDEALO SV · CONTROL FISCAL</span>
            <strong>Facturación 360</strong>
            <small>Documentos tributarios electrónicos · Ministerio de Hacienda</small>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="erp-modal-close" aria-label="Cerrar">×</button>
        </header>

        <div className="billing-workspace">
          <nav className="billing-nav" aria-label="Secciones de facturación">
            <div className="billing-nav-title">Facturación</div>
            {sections.map((section) => <button
              key={section.id}
              type="button"
              className={`billing-nav-item ${activeSection === section.id ? 'active' : ''}`}
              onClick={() => setActiveSection(section.id)}
              aria-current={activeSection === section.id ? 'page' : undefined}
            >
              <span>{section.label}</span>
              <small>{section.helper}</small>
            </button>)}
            <div className="billing-nav-note">
              <strong>Conexión MH protegida</strong>
              <small>Esta reorganización no modifica firma, certificado, credenciales ni endpoints.</small>
            </div>
          </nav>

          <main className="billing-content">
            <div className="billing-section-head">
              <div>
                <span className="billing-section-kicker">{sections.find((item) => item.id === activeSection)?.helper}</span>
                <h2>{sections.find((item) => item.id === activeSection)?.label}</h2>
              </div>
              <span className="billing-company-pill">{company.name || company.legal_name || 'Empresa activa'}</span>
            </div>

            {contextClient.id && activeSection === 'emitir' && <div className="billing-context-banner">
              Cliente seleccionado: <strong>{contextClient.name || 'receptor seleccionado'}</strong>. Se cargará automáticamente en el DTE.
            </div>}

            {activeSection === 'resumen' && <Billing360Dashboard supabase={supabase} company={company}/>} 

            {activeSection === 'emitir' && <section className="billing-section-card billing-issue-card">
              <div className="billing-section-intro"><div><strong>Nueva emisión</strong><small>Complete primero el receptor y las partidas. Los controles fiscales permanecen integrados al flujo MH.</small></div></div>
              <FacturacionDte session={session} supabase={supabase} company={company}/>
            </section>}

            {activeSection === 'documentos' && <section className="billing-section-card">
              <div className="billing-section-intro"><div><strong>Documentos y respuestas de Hacienda</strong><small>Consulta de DTE procesados, sello, estado y representación registrada.</small></div></div>
              <ProcessedDtePanel supabase={supabase} company={company}/>
            </section>}

            {activeSection === 'tecnico' && <div className="billing-tech-grid">
              <section className="billing-section-card">
                <div className="billing-section-intro"><div><strong>Diagnóstico de firma</strong><small>Certificado, firmador y comprobaciones técnicas.</small></div></div>
                <SignerDiagnostic session={session} company={company}/>
              </section>
              <section className="billing-section-card">
                <div className="billing-section-intro"><div><strong>Plan de pruebas DTE</strong><small>Herramientas de validación separadas de la operación diaria.</small></div></div>
                <DteTestPlan supabase={supabase} company={company}/>
              </section>
            </div>}
          </main>
        </div>
      </section>
    </div>}
  </>
}
