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
    if (!session || !supabase) {
      setCompany(null)
      return
    }
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
      <button type="button" onClick={() => setOpen(true)} style={styles.launcher}>FACTURAR</button>
      {open && (
        <div style={styles.backdrop} role="presentation" onMouseDown={() => setOpen(false)}>
          <section style={styles.panel} role="dialog" aria-modal="true" aria-label="Módulo de facturación" onMouseDown={(event) => event.stopPropagation()}>
            <div style={styles.topbar}>
              <div><strong>Módulo Facturación DTE</strong><small> · Factura Electrónica DTE-01</small></div>
              <button type="button" onClick={() => setOpen(false)} style={styles.close}>×</button>
            </div>
            <SignerDiagnostic session={session} company={company} />
            <ProcessedDtePanel supabase={supabase} company={company} />
            <DteTestPlan supabase={supabase} company={company} />
            <FacturacionDte session={session} supabase={supabase} company={company} />
          </section>
        </div>
      )}
    </>
  )
}

const styles = {
  launcher: { position: 'fixed', right: 24, bottom: 24, zIndex: 70, border: 0, borderRadius: 16, padding: '15px 19px', background: '#111827', color: 'white', fontWeight: 900, cursor: 'pointer', boxShadow: '0 14px 35px rgba(15,23,42,.25)' },
  backdrop: { position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(15,23,42,.5)', padding: 24, overflow: 'auto' },
  panel: { width: 'min(1180px, 100%)', minHeight: 'calc(100vh - 48px)', margin: '0 auto', background: '#f8fafc', borderRadius: 22, padding: 24, boxSizing: 'border-box', boxShadow: '0 30px 90px rgba(15,23,42,.28)' },
  topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, color: '#334155' },
  close: { border: 0, background: 'transparent', fontSize: 34, cursor: 'pointer', lineHeight: 1 },
}
