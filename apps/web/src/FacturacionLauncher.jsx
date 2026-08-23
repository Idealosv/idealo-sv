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
  { id: 'resumen', label: 'Resumen', helper: 'Indicadores y control diario' },
  { id: 'emitir', label: 'Nueva factura', helper: 'Crear y guardar DTE' },
  { id: 'documentos', label: 'Documentos DTE', helper: 'Estados y respuestas MH' },
  { id: 'hacienda', label: 'Hacienda / DTE', helper: 'Firma y diagnóstico' },
  { id: 'configuracion', label: 'Configuración', helper: 'Pruebas y parámetros' },
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

  useEffect(() => {
    if (!open || activeSection !== 'emitir') return undefined

    let mounted = true
    const cleanups = []
    const timer = window.setTimeout(() => {
      if (!mounted) return
      const fieldsets = [...document.querySelectorAll('.billing-issue-card .invoice-form > fieldset.form-section')]
      fieldsets.forEach((fieldset, index) => {
        const legend = fieldset.querySelector(':scope > legend')
        if (!legend) return

        const initiallyOpen = index === 2 || index === 3 || index === 5
        fieldset.classList.add('billing-collapsible')
        fieldset.dataset.open = initiallyOpen ? 'true' : 'false'
        legend.setAttribute('role', 'button')
        legend.setAttribute('tabindex', '0')
        legend.setAttribute('aria-expanded', initiallyOpen ? 'true' : 'false')
        legend.setAttribute('title', 'Abrir o cerrar sección')

        const toggle = () => {
          const next = fieldset.dataset.open !== 'true'
          fieldset.dataset.open = next ? 'true' : 'false'
          legend.setAttribute('aria-expanded', next ? 'true' : 'false')
        }
        const onKeyDown = (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            toggle()
          }
        }
        legend.addEventListener('click', toggle)
        legend.addEventListener('keydown', onKeyDown)
        cleanups.push(() => {
          legend.removeEventListener('click', toggle)
          legend.removeEventListener('keydown', onKeyDown)
        })
      })

      const history = document.querySelector('.billing-issue-card .invoice-history')
      const historyHeading = history?.querySelector(':scope > .panel-heading')
      if (history && historyHeading) {
        history.classList.add('billing-history-collapsible')
        history.dataset.open = 'false'
        historyHeading.setAttribute('role', 'button')
        historyHeading.setAttribute('tabindex', '0')
        historyHeading.setAttribute('aria-expanded', 'false')
        const toggleHistory = (event) => {
          if (event?.target?.closest('button')) return
          const next = history.dataset.open !== 'true'
          history.dataset.open = next ? 'true' : 'false'
          historyHeading.setAttribute('aria-expanded', next ? 'true' : 'false')
        }
        const onHistoryKeyDown = (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            toggleHistory()
          }
        }
        historyHeading.addEventListener('click', toggleHistory)
        historyHeading.addEventListener('keydown', onHistoryKeyDown)
        cleanups.push(() => {
          historyHeading.removeEventListener('click', toggleHistory)
          historyHeading.removeEventListener('keydown', onHistoryKeyDown)
        })
      }
    }, 0)

    return () => {
      mounted = false
      window.clearTimeout(timer)
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [open, activeSection])

  if (!session || !company) return null

  const openBilling = () => {
    setContextClient({ id: '', name: '' })
    setActiveSection('resumen')
    setOpen(true)
  }

  const active = sections.find((item) => item.id === activeSection) || sections[0]

  return <>
    <button type="button" onClick={openBilling} className="sidebar-module-access billing" aria-label="Abrir facturación">
      <span className="module-glyph">▤</span><span className="module-copy"><span>Facturación</span><small>DTE · Hacienda · Control fiscal</small></span>
    </button>
    {open && <div className="erp-modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <section className="erp-modal-panel billing-modal" role="dialog" aria-modal="true" aria-label="Módulo de facturación" onMouseDown={(event) => event.stopPropagation()}>
        <header className="erp-modal-head billing-module-head">
          <div>
            <span className="billing-eyebrow">IDEALO SV · FACTURACIÓN</span>
            <strong>Facturación</strong>
            <small>Operación comercial y documentos tributarios electrónicos</small>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="erp-modal-close" aria-label="Cerrar">×</button>
        </header>

        <div className="billing-workspace">
          <nav className="billing-nav" aria-label="Secciones de facturación">
            <div className="billing-nav-title">Módulo</div>
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
              <strong>Operación protegida</strong>
              <small>Firma, certificado, credenciales y endpoints de Hacienda permanecen sin cambios.</small>
            </div>
          </nav>

          <main className="billing-content">
            <div className="billing-section-head">
              <div>
                <span className="billing-section-kicker">{active.helper}</span>
                <h2>{active.label}</h2>
              </div>
              <span className="billing-company-pill">{company.name || company.legal_name || 'Empresa activa'}</span>
            </div>

            {contextClient.id && activeSection === 'emitir' && <div className="billing-context-banner">
              Cliente seleccionado: <strong>{contextClient.name || 'receptor seleccionado'}</strong>. Se cargará automáticamente en la factura.
            </div>}

            {activeSection === 'resumen' && <Billing360Dashboard supabase={supabase} company={company}/>} 

            {activeSection === 'emitir' && <section className="billing-section-card billing-issue-card">
              <div className="billing-section-intro"><div><strong>Nueva factura</strong><small>Abre únicamente la sección que necesites: receptor, partidas, resumen, pago o información avanzada.</small></div></div>
              <FacturacionDte session={session} supabase={supabase} company={company}/>
            </section>}

            {activeSection === 'documentos' && <section className="billing-section-card">
              <div className="billing-section-intro"><div><strong>Documentos DTE</strong><small>Consulta estados, sellos, respuestas y documentos registrados por Ministerio de Hacienda.</small></div></div>
              <ProcessedDtePanel supabase={supabase} company={company}/>
            </section>}

            {activeSection === 'hacienda' && <section className="billing-section-card">
              <div className="billing-section-intro"><div><strong>Hacienda / DTE</strong><small>Diagnóstico de firma, certificado y conexión técnica separado de la operación diaria.</small></div></div>
              <SignerDiagnostic session={session} company={company}/>
            </section>}

            {activeSection === 'configuracion' && <section className="billing-section-card">
              <div className="billing-section-intro"><div><strong>Configuración y pruebas</strong><small>Validaciones de ambiente y herramientas de prueba que no deben ocupar la pantalla de facturación normal.</small></div></div>
              <DteTestPlan supabase={supabase} company={company}/>
            </section>}
          </main>
        </div>
      </section>
    </div>}
  </>
}
