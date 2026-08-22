import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { ProductsModule, QuotesModule, WorkOrdersModule } from './CommercialFlow.jsx'
import ProductionModule from './ProductionModule.jsx'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: true } }) : null

export default function CommercialLauncher() {
  const [session, setSession] = useState(null)
  const [company, setCompany] = useState(null)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('Productos y trabajos')

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
      if (!id) return
      const { data: row } = await supabase.from('companies').select('*').eq('id', id).single()
      setCompany(row || null)
    })
  }, [session])

  if (!session || !company) return null

  const tabs = ['Productos y trabajos', 'Cotizaciones', 'Órdenes de trabajo', 'Producción']

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="sidebar-module-access commercial" aria-label="Abrir gestión comercial">
        <span className="module-glyph">◇</span>
        <span className="module-copy"><span>Operaciones comerciales</span><small>Ventas · Órdenes · Producción</small></span>
      </button>
      {open && (
        <div className="erp-modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="erp-modal-panel" role="dialog" aria-modal="true" aria-label="Gestión comercial y producción" onMouseDown={(event) => event.stopPropagation()}>
            <header className="erp-modal-head">
              <div><strong>Operaciones comerciales</strong><small>Producto terminado → Cotización → Orden de trabajo → Producción → Entrega</small></div>
              <button type="button" className="erp-modal-close" onClick={() => setOpen(false)} aria-label="Cerrar">×</button>
            </header>
            <nav className="erp-module-tabs" aria-label="Secciones comerciales">
              {tabs.map((name) => <button type="button" key={name} onClick={() => setTab(name)} className={`erp-module-tab ${tab === name ? 'active' : ''}`}>{name}</button>)}
            </nav>
            <div className="erp-modal-body commercial-module">
              {tab === 'Productos y trabajos' && <ProductsModule company={company} supabase={supabase} />}
              {tab === 'Cotizaciones' && <QuotesModule company={company} supabase={supabase} />}
              {tab === 'Órdenes de trabajo' && <WorkOrdersModule company={company} supabase={supabase} />}
              {tab === 'Producción' && <ProductionModule company={company} supabase={supabase} />}
            </div>
          </section>
        </div>
      )}
    </>
  )
}
