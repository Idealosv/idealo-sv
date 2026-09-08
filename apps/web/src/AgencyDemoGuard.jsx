import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'

const DEMO_STEPS = [
  ['Clientes', 'Revisá el Cliente 360 y su historial comercial.'],
  ['Productos', 'Explorá trabajos terminados y precios de ejemplo.'],
  ['Cotizaciones', 'Creá o editá una cotización y revisá su PDF.'],
  ['Producción', 'SeguÍ una orden desde diseño hasta entrega.'],
  ['Facturación', 'Probá el flujo comercial; DTE de PRODUCCIÓN permanece bloqueado.'],
]

export default function AgencyDemoGuard() {
  const [demo, setDemo] = useState(null)
  const [guideOpen, setGuideOpen] = useState(false)

  useEffect(() => {
    if (!supabase) return undefined
    let active = true

    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!active || !sessionData.session) {
        setDemo(null)
        return
      }
      const { data: companies } = await supabase.rpc('get_my_companies')
      const companyId = companies?.[0]?.id
      if (!companyId) {
        setDemo(null)
        return
      }
      const { data } = await supabase
        .from('companies')
        .select('id,name,demo_mode,demo_label,demo_expires_at')
        .eq('id', companyId)
        .maybeSingle()
      if (!active) return
      setDemo(data?.demo_mode ? data : null)
    }

    load()
    const { data: listener } = supabase.auth.onAuthStateChange(() => load())
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (demo) document.documentElement.dataset.agencyDemo = 'true'
    else delete document.documentElement.dataset.agencyDemo
    return () => delete document.documentElement.dataset.agencyDemo
  }, [demo])

  const expiry = useMemo(() => {
    if (!demo?.demo_expires_at) return null
    const value = new Date(demo.demo_expires_at)
    return Number.isNaN(value.getTime()) ? null : value.toLocaleDateString('es-SV', { dateStyle: 'medium' })
  }, [demo])

  if (!demo) return null

  return (
    <aside className="agency-demo-shell" aria-label="Entorno demo para agencias">
      <div className="agency-demo-pill">
        <div>
          <strong>ENTORNO DEMO</strong>
          <span>{demo.demo_label || demo.name} · Datos de evaluación</span>
        </div>
        <div className="agency-demo-pill-actions">
          {expiry && <small>Hasta {expiry}</small>}
          <button type="button" onClick={() => setGuideOpen((value) => !value)}>
            {guideOpen ? 'Cerrar guía' : 'Guía de prueba'}
          </button>
        </div>
      </div>
      <div className="agency-demo-safety">DTE PRODUCCIÓN BLOQUEADO · Usá TEST para pruebas fiscales</div>
      {guideOpen && (
        <section className="agency-demo-guide">
          <header>
            <div><small>RECORRIDO RECOMENDADO</small><h2>Probá el flujo completo de una agencia</h2></div>
            <span>≈ 10 min</span>
          </header>
          <ol>
            {DEMO_STEPS.map(([title, text]) => <li key={title}><strong>{title}</strong><p>{text}</p></li>)}
          </ol>
          <p className="agency-demo-note">Todos los registros precargados están identificados como DEMO. El entorno está aislado por empresa y no habilita transmisión fiscal real.</p>
        </section>
      )}
    </aside>
  )
}
