import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import FacturacionDte from './FacturacionDte.jsx'
import SignerDiagnostic from './SignerDiagnostic.jsx'
import ProcessedDtePanel from './ProcessedDtePanel.jsx'
import DteTestPlan from './DteTestPlan.jsx'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: true } })
  : null

export default function FacturacionLauncher() {
  const [session, setSession] = useState(null)
  const [company, setCompany] = useState(null)
  const [open, setOpen] = useState(false)

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

  if (!session || !company) return null

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="sidebar-module-access billing" aria-label="Abrir facturación electrónica">
        <span className="module-glyph">▤</span>
        <span className="module-copy"><span>Facturación electrónica</span><small>DTE · Hacienda · Recepciones</small></span>
      </button>
      {open && (
        <div className="erp-modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="erp-modal-panel" role="dialog" aria-modal="true" aria-label="Módulo de facturación" onMouseDown={(event) => event.stopPropagation()}>
            <header className="erp-modal-head">
              <div><strong>Facturación electrónica DTE</strong><small>Factura electrónica · Ambiente TEST 00 · Ministerio de Hacienda</small></div>
              <button type="button" onClick={() => setOpen(false)} className="erp-modal-close" aria-label="Cerrar">×</button>
            </header>
            <div className="erp-modal-body">
              <SignerDiagnostic session={session} company={company} />
              <ProcessedDtePanel supabase={supabase} company={company} />
              <DteTestPlan supabase={supabase} company={company} />
              <FacturacionDte session={session} supabase={supabase} company={company} />
            </div>
          </section>
        </div>
      )}
    </>
  )
}
