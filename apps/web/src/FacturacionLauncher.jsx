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

export default function FacturacionLauncher() {
  const [session, setSession] = useState(null)
  const [company, setCompany] = useState(null)
  const [open, setOpen] = useState(false)
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
      setContextClient({ id: detail.clientId || '', name: detail.clientName || '' }); setOpen(true)
    }
    window.addEventListener('idealo-open-client-context', openClientContext)
    return () => window.removeEventListener('idealo-open-client-context', openClientContext)
  }, [])

  useEffect(() => {
    if (!open || !contextClient.id) return undefined
    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      const option = document.querySelector(`.facturacion-dte select option[value="${contextClient.id}"]`)
      const select = option?.parentElement
      if (select) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set
        if (setter) setter.call(select, contextClient.id); else select.value = contextClient.id
        select.dispatchEvent(new Event('change', { bubbles: true })); window.clearInterval(timer)
      } else if (attempts >= 30) window.clearInterval(timer)
    }, 100)
    return () => window.clearInterval(timer)
  }, [open, contextClient.id])

  if (!session || !company) return null

  return <>
    <button type="button" onClick={() => { setContextClient({ id: '', name: '' }); setOpen(true) }} className="sidebar-module-access billing" aria-label="Abrir facturación">
      <span className="module-glyph">▤</span><span className="module-copy"><span>Facturación</span><small>DTE · Hacienda · Control fiscal</small></span>
    </button>
    {open && <div className="erp-modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <section className="erp-modal-panel" role="dialog" aria-modal="true" aria-label="Módulo de facturación" onMouseDown={(event) => event.stopPropagation()}>
        <header className="erp-modal-head"><div><strong>Facturación 360</strong><small>DTE · Control fiscal · Ministerio de Hacienda</small></div><button type="button" onClick={() => setOpen(false)} className="erp-modal-close" aria-label="Cerrar">×</button></header>
        <div className="erp-modal-body">
          {contextClient.id && <p className="feedback success">Cliente 360 activo: <strong>{contextClient.name || 'receptor seleccionado'}</strong>. El receptor se seleccionará automáticamente.</p>}
          <Billing360Dashboard supabase={supabase} company={company}/>
          <SignerDiagnostic session={session} company={company}/>
          <ProcessedDtePanel supabase={supabase} company={company}/>
          <DteTestPlan supabase={supabase} company={company}/>
          <FacturacionDte session={session} supabase={supabase} company={company}/>
        </div>
      </section>
    </div>}
  </>
}
