import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'
import FacturacionDte from './FacturacionDte.jsx'
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
import DteFinancialIntegrityPanel from './DteFinancialIntegrityPanel.jsx'

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
  const [issueMode, setIssueMode] = useState('project')

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
    const channel = supabase.channel(`billing-dte-trace-${company.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'dte_documents', filter: `company_id=eq.${company.id}` }, (payload) => {
      const row = payload.new || {}
      if (payload.eventType === 'UPDATE' && String(row.status || '').toUpperCase() === 'PROCESSED') setReceivablesVersion((value) => value + 1)
    }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [company?.id])

  const notifyBillingActive = () => window.dispatchEvent(new CustomEvent('idealo-module-change', { detail: 'Facturación' }))
  const openSection = (id) => { if (sections.some((section) => section.id === id)) setActiveSection(id) }
  const openNewInvoice = () => { setContextClient({ id: '', name: '' }); setIssueMode('project'); setActiveSection('emitir') }
  const prepareMhTestCase = () => { setContextClient({ id: '', name: '' }); setIssueMode('manual'); setActiveSection('emitir'); notifyBillingActive() }
  const openCash = () => { setOpen(false); window.dispatchEvent(new CustomEvent('idealo-open-module', { detail: { target: 'procurement', tab: 'Caja' } })) }

  useEffect(() => {
    const openModule = (event) => {
      const detail = event.detail || {}; if (detail.target !== 'billing') return
      setContextClient({ id: '', name: '' }); setIssueMode('project'); setActiveSection(sections.some((section) => section.id === detail.tab) ? detail.tab : 'resumen'); setOpen(true); notifyBillingActive()
    }
    window.addEventListener('idealo-open-module', openModule); return () => window.removeEventListener('idealo-open-module', openModule)
  }, [])
  useEffect(() => {
    const openClientContext = (event) => {
      const detail = event.detail || {}; if (detail.target !== 'billing') return
      setContextClient({ id: detail.clientId || '', name: detail.clientName || '' }); setIssueMode('manual'); setActiveSection('emitir'); setOpen(true); notifyBillingActive()
    }
    window.addEventListener('idealo-open-client-context', openClientContext); return () => window.removeEventListener('idealo-open-client-context', openClientContext)
  }, [])

  if (!session || !company) return null
  const active = sections.find((item) => item.id === activeSection) || sections[0]
  const groups = [...new Set(sections.map((section) => section.group))]

  return <>
    <button type="button" onClick={() => { setContextClient({ id: '', name: '' }); setIssueMode('project'); setActiveSection('resumen'); setOpen(true); notifyBillingActive() }} className="sidebar-module-access billing" aria-label="Abrir facturación"><span className="module-glyph">▤</span><span className="module-copy"><span>Facturación</span><small>Ventas y documentos electrónicos</small></span></button>
    {open && <div className="erp-modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}><section className="erp-modal-panel billing-modal" role="dialog" aria-modal="true" aria-label="Módulo de facturación" onMouseDown={(event) => event.stopPropagation()}>
      <header className="erp-modal-head billing-module-head"><div><span className="billing-eyebrow">IDEALO SV</span><strong>Facturación</strong><small>Emisión · documentos · cobranza · Hacienda</small></div><button type="button" onClick={() => setOpen(false)} className="erp-modal-close" aria-label="Cerrar">×</button></header>
      <div className="billing-workspace billing-workspace-organized"><nav className="billing-nav" aria-label="Secciones de facturación"><div className="billing-nav-title">Facturación</div>{groups.map((group) => <div className="billing-nav-group" key={group}><span className="billing-nav-group-label">{group}</span>{sections.filter((section) => section.group === group).map((section) => <button key={section.id} type="button" data-billing-section={section.id} className={`billing-nav-item ${activeSection === section.id ? 'active' : ''}`} onClick={() => openSection(section.id)} aria-current={activeSection === section.id ? 'page' : undefined}><span>{section.label}</span><small>{section.helper}</small></button>)}</div>)}</nav>
      <main className="billing-content" data-active-billing-section={activeSection}>
        <div className="billing-section-head"><div><span className="billing-section-kicker">{active.group} · {active.helper}</span><h2>{active.label}</h2></div><span className="billing-company-pill">{company.name || company.legal_name || 'Empresa activa'}</span></div>
        {contextClient.id && activeSection === 'emitir' && <div className="billing-context-banner">Cliente seleccionado: <strong>{contextClient.name || 'receptor seleccionado'}</strong>.</div>}
        {activeSection === 'resumen' && <><Billing360Dashboard supabase={supabase} company={company} onOpenNewInvoice={openNewInvoice}/><details className="module-secondary-tools"><summary>Revisar integridad financiera</summary><div className="module-secondary-tools-body"><DteFinancialIntegrityPanel supabase={supabase} company={company}/></div></details></>} 
        {activeSection === 'emitir' && <section className="billing-section-card billing-issue-card" data-billing-view="new-invoice">
          <div className="billing-section-intro"><div><strong>Nueva factura</strong><small>Elegí una sola forma de facturar.</small></div></div>
          <div className="billing-document-picker" role="group" aria-label="Origen de la factura" style={{marginBottom:16}}>
            <button type="button" className={issueMode==='project'?'active':''} onClick={()=>{setIssueMode('project');setContextClient({id:'',name:''})}}><strong>Desde proyecto</strong><small>Cotización aprobada, completa o parcial</small></button>
            <button type="button" className={issueMode==='manual'?'active':''} onClick={()=>setIssueMode('manual')}><strong>Factura manual</strong><small>Venta nueva sin cotización</small></button>
          </div>
          {issueMode==='project'
            ? <PartialInvoiceFromQuote session={session} supabase={supabase} company={company}/>
            : <FacturacionDte session={session} supabase={supabase} company={company} initialClientId={contextClient.id}/>
          }
        </section>}
        {activeSection === 'documentos' && <section className="billing-section-card"><div className="billing-section-intro"><div><strong>Documentos y estados</strong><small>Historial y seguimiento de DTE.</small></div></div><ProcessedDtePanelBridge supabase={supabase} company={company} session={session} onOpenHacienda={() => openSection('hacienda')}/><details className="module-secondary-tools"><summary>Contingencia, correo y pruebas de documento</summary><div className="module-secondary-tools-body"><DteContingencyOperationsPanel supabase={supabase} company={company} session={session}/><InvoiceEmailPdfTestPanel supabase={supabase} company={company} session={session}/></div></details></section>}
        {activeSection === 'cobros' && <BillingReceivablesPanel key={`receivables-${receivablesVersion}`} supabase={supabase} company={company} onOpenCash={openCash}/>} 
        {activeSection === 'hacienda' && <section className="billing-section-card billing-hacienda-section"><div className="billing-section-intro"><div><strong>Hacienda</strong><small>Estado técnico y herramientas de soporte.</small></div></div><ProductionPreflightPanel session={session} company={company}/><details className="module-secondary-tools"><summary>Diagnósticos y pruebas técnicas</summary><div className="module-secondary-tools-body"><MhAuthDiagnostic session={session} company={company}/><SignerDiagnostic session={session} company={company}/><DteTestPlan supabase={supabase} company={company} onPrepareCase={prepareMhTestCase}/></div></details></section>}
      </main></div>
    </section></div>}
  </>
}
