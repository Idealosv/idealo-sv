import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { WorkOrdersModule } from './CommercialFlow.jsx'
import Products360Module from './Products360Module.jsx'
import Quotes360Module from './Quotes360Module.jsx'
import ProductionModule from './ProductionModule.jsx'
import { DeliveriesModule, ReceivablesModule } from './DeliveryFinanceModules.jsx'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: true } }) : null

export default function CommercialLauncher() {
  const [session, setSession] = useState(null)
  const [company, setCompany] = useState(null)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('Productos y trabajos')
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
      if (!id) return
      const { data: row } = await supabase.from('companies').select('*').eq('id', id).single()
      setCompany(row || null)
    })
  }, [session])

  useEffect(() => {
    const openClientContext = (event) => {
      const detail = event.detail || {}
      if (detail.target !== 'commercial') return
      const allowed = ['Productos y trabajos', 'Cotizaciones', 'Órdenes de trabajo', 'Producción', 'Entregas', 'Cuentas por cobrar']
      setContextClient({ id: detail.clientId || '', name: detail.clientName || '' })
      setTab(allowed.includes(detail.tab) ? detail.tab : 'Cotizaciones')
      setOpen(true)
    }
    window.addEventListener('idealo-open-client-context', openClientContext)
    return () => window.removeEventListener('idealo-open-client-context', openClientContext)
  }, [])

  if (!session || !company) return null

  const tabs = ['Productos y trabajos', 'Cotizaciones', 'Órdenes de trabajo', 'Producción', 'Entregas', 'Cuentas por cobrar']

  return (
    <>
      <button type="button" onClick={() => { setContextClient({ id: '', name: '' }); setOpen(true) }} className="sidebar-module-access commercial" aria-label="Abrir gestión comercial">
        <span className="module-glyph">◇</span>
        <span className="module-copy"><span>Operaciones comerciales</span><small>Ventas · Producción · Entregas · Cobros</small></span>
      </button>
      {open && (
        <div className="erp-modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="erp-modal-panel" role="dialog" aria-modal="true" aria-label="Gestión comercial y producción" onMouseDown={(event) => event.stopPropagation()}>
            <header className="erp-modal-head">
              <div><strong>Operaciones comerciales</strong><small>Producto terminado → Cotización → Aprobación → Orden → Producción → Entrega → Facturación → Cobro</small></div>
              <button type="button" className="erp-modal-close" onClick={() => setOpen(false)} aria-label="Cerrar">×</button>
            </header>
            <nav className="erp-module-tabs" aria-label="Secciones comerciales">
              {tabs.map((name) => <button type="button" key={name} onClick={() => setTab(name)} className={`erp-module-tab ${tab === name ? 'active' : ''}`}>{name}</button>)}
            </nav>
            <div className="erp-modal-body commercial-module">
              {contextClient.id && <p className="feedback success">Cliente 360 activo: <strong>{contextClient.name || 'cliente seleccionado'}</strong>. El flujo se abrió desde su expediente.</p>}
              {tab === 'Productos y trabajos' && <Products360Module company={company} supabase={supabase} />}
              {tab === 'Cotizaciones' && <Quotes360Module company={company} supabase={supabase} initialClientId={contextClient.id} />}
              {tab === 'Órdenes de trabajo' && <WorkOrdersModule company={company} supabase={supabase} initialClientId={contextClient.id} />}
              {tab === 'Producción' && <ProductionModule company={company} supabase={supabase} initialClientId={contextClient.id} />}
              {tab === 'Entregas' && <DeliveriesModule company={company} supabase={supabase} initialClientId={contextClient.id} />}
              {tab === 'Cuentas por cobrar' && <ReceivablesModule company={company} supabase={supabase} initialClientId={contextClient.id} />}
            </div>
          </section>
        </div>
      )}
    </>
  )
}
