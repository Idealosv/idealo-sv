import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'
import FacturacionDte from './FacturacionDte.jsx'
import SignerDiagnostic from './SignerDiagnostic.jsx'
import ProductionPreflightPanel from './ProductionPreflightPanel.jsx'
import ProcessedDtePanel from './ProcessedDtePanel.jsx'
import DteTestPlan from './DteTestPlan.jsx'
import Billing360Dashboard from './Billing360Dashboard.jsx'
import BillingReceivablesPanel from './BillingReceivablesPanel.jsx'

const sections = [
  { id: 'resumen', label: 'Resumen', helper: 'Indicadores y control', group: 'Operación diaria' },
  { id: 'emitir', label: 'Nueva factura', helper: 'Cliente, productos y pago', group: 'Operación diaria' },
  { id: 'documentos', label: 'Documentos', helper: 'DTE y estados', group: 'Operación diaria' },
  { id: 'cobros', label: 'Cuentas por cobrar', helper: 'Crédito, vencidos y cobros', group: 'Cobranza' },
  { id: 'hacienda', label: 'Hacienda', helper: 'Firma y control técnico', group: 'Administración fiscal' },
]

export default function FacturacionLauncher() {
  const [session, setSession] = useState(null)
  const [company, setCompany] = useState(null)
  const [open, setOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('resumen')
  const [contextClient, setContextClient] = useState({ id: '', name: '' })
  const [receivablesVersion, setReceivablesVersion] = useState(0)

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
    if (!company?.id || !supabase) return undefined
    const channel = supabase
      .channel(`billing-dte-trace-${company.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dte_documents', filter: `company_id=eq.${company.id}` }, (payload) => {
        const row = payload.new || {}
        if (payload.eventType === 'UPDATE' && String(row.status || '').toUpperCase() === 'PROCESSED') {
          setReceivablesVersion((value) => value + 1)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [company?.id])

  const notifyBillingActive = () => window.dispatchEvent(new CustomEvent('idealo-module-change', { detail: 'Facturación' }))
  const openSection = (id) => {
    if (!sections.some((section) => section.id === id)) return
    setActiveSection(id)
  }
  const openNewInvoice = () => {
    setContextClient({ id: '', name: '' })
    setActiveSection('emitir')
  }
  const openCash = () => {
    setOpen(false)
    window.dispatchEvent(new CustomEvent('idealo-open-module', { detail: { target: 'procurement', tab: 'Caja' } }))
  }

  useEffect(() => {
    const openModule = (event) => {
      const detail = event.detail || {}
      if (detail.target !== 'billing') return
      const nextSection = sections.some((section) => section.id === detail.tab) ? detail.tab : 'resumen'
      setContextClient({ id: '', name: '' })
      setActiveSection(nextSection)
      setOpen(true)
      notifyBillingActive()
    }
    window.addEventListener('idealo-open-module', openModule)
    return () => window.removeEventListener('idealo-open-module', openModule)
  }, [])

  useEffect(() => {
    const openClientContext = (event) => {
      const detail = event.detail || {}
      if (detail.target !== 'billing') return
      setContextClient({ id: detail.clientId || '', name: detail.clientName || '' })
      setActiveSection('emitir')
      setOpen(true)
      notifyBillingActive()
    }
    window.addEventListener('idealo-open-client-context', openClientContext)
    return () => window.removeEventListener('idealo-open-client-context', openClientContext)
  }, [])

  if (!session || !company) return null
  const active = sections.find((item) => item.id === activeSection) || sections[0]
  const groups = [...new Set(sections.map((section) => section.group))]

  return <>
    <button type="button" onClick={() => { setContextClient({ id: '', name: '' }); setActiveSection('resumen'); setOpen(true); notifyBillingActive() }} className="sidebar-module-access billing" aria-label="Abrir facturación">
      <span className="module-glyph">▤</span><span className="module-copy"><span>Facturación</span><small>Ventas y documentos electrónicos</small></span>
    </button>
    {open && <div className="erp-modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <section className="erp-modal-panel billing-modal" role="dialog" aria-modal="true" aria-label="Módulo de facturación" onMouseDown={(event) => event.stopPropagation()}>
        <header className="erp-modal-head billing-module-head"><div><span className="billing-eyebrow">IDEALO SV</span><strong>Facturación</strong><small>Emisión · documentos · cobranza · Hacienda</small></div><button type="button" onClick={() => setOpen(false)} className="erp-modal-close" aria-label="Cerrar">×</button></header>
        <div className="billing-workspace billing-workspace-organized">
          <nav className="billing-nav" aria-label="Secciones de facturación">
            <div className="billing-nav-title">Facturación</div>
            {groups.map((group) => <div className="billing-nav-group" key={group}><span className="billing-nav-group-label">{group}</span>{sections.filter((section) => section.group === group).map((section) => <button key={section.id} type="button" data-billing-section={section.id} className={`billing-nav-item ${activeSection === section.id ? 'active' : ''}`} onClick={() => openSection(section.id)} aria-current={activeSection === section.id ? 'page' : undefined}><span>{section.label}</span><small>{section.helper}</small></button>)}</div>)}
          </nav>
          <main className="billing-content" data-active-billing-section={activeSection}>
            <div className="billing-section-head"><div><span className="billing-section-kicker">{active.group} · {active.helper}</span><h2>{active.label}</h2></div><span className="billing-company-pill">{company.name || company.legal_name || 'Empresa activa'}</span></div>
            {contextClient.id && activeSection === 'emitir' && <div className="billing-context-banner">Cliente seleccionado: <strong>{contextClient.name || 'receptor seleccionado'}</strong>.</div>}
            {activeSection === 'resumen' && <Billing360Dashboard supabase={supabase} company={company} onOpenNewInvoice={openNewInvoice}/>} 
            {activeSection === 'emitir' && <section className="billing-section-card billing-issue-card" data-billing-view="new-invoice"><div className="billing-section-intro"><div><strong>Nueva factura</strong><small>Completa cliente, productos o servicios y condición de pago. El sistema prepara DTE-01 o DTE-03 según corresponda.</small></div></div><FacturacionDte session={session} supabase={supabase} company={company} initialClientId={contextClient.id}/></section>}
            {activeSection === 'documentos' && <section className="billing-section-card"><div className="billing-section-intro"><div><strong>Documentos y estados</strong><small>Historial de DTE-01 y DTE-03 desde borrador hasta respuesta de Hacienda.</small></div></div><ProcessedDtePanel supabase={supabase} company={company} session={session} onOpenHacienda={() => openSection('hacienda')}/></section>}
            {activeSection === 'cobros' && <BillingReceivablesPanel key={`receivables-${receivablesVersion}`} supabase={supabase} company={company} onOpenCash={openCash}/>} 
            {activeSection === 'hacienda' && <section className="billing-section-card billing-hacienda-section"><div className="billing-section-intro"><div><strong>Hacienda y configuración técnica</strong><small>Firma, transmisión, diagnóstico y pruebas separadas de la facturación diaria.</small></div></div><ProductionPreflightPanel/><SignerDiagnostic session={session} company={company}/><details className="billing-admin-tools"><summary>Herramientas administrativas y pruebas</summary><div className="billing-admin-tools-body"><DteTestPlan supabase={supabase} company={company}/></div></details></section>}
          </main>
        </div>
      </section>
    </div>}
  </>
}
