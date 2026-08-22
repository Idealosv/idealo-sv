import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

const TABS = [
  ['general', 'Datos generales'],
  ['fiscal', 'Fiscal DTE'],
  ['contact', 'Contacto'],
  ['address', 'Dirección'],
  ['commercial', 'Comercial'],
]

const VIEWS = [
  ['directory', 'Directorio'],
  ['new', 'Nuevo cliente'],
  ['360', 'Cliente 360'],
  ['crm', 'CRM'],
]

const normalize = (value = '') => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const sectionFor = (fieldset, index) => {
  const legend = normalize(fieldset.querySelector('legend')?.textContent || '')
  if (/dte|facturacion|tribut|fiscal|identificacion tributaria/.test(legend)) return 'fiscal'
  if (/contact|telefono|correo|whatsapp/.test(legend)) return 'contact'
  if (/domicilio|direccion|ubicacion|departamento|municipio|distrito/.test(legend)) return 'address'
  if (/credito|comercial|seguimiento|observacion|nota|condicion|clasificacion/.test(legend)) return 'commercial'
  return index === 0 ? 'general' : 'general'
}

export default function ClientModuleOrganizer() {
  const [active, setActive] = useState('general')
  const [view, setView] = useState('directory')
  const [host, setHost] = useState(null)
  const [module, setModule] = useState(null)
  const [form, setForm] = useState(null)
  const [counts, setCounts] = useState({})

  useEffect(() => {
    const refresh = () => {
      const isClients = document.querySelector('.erp-header h1')?.textContent?.trim() === 'Clientes'
      const nextModule = isClients ? document.querySelector('.clients-module') : null
      const nextForm = nextModule?.querySelector('.client-form-full') || null
      setModule(nextModule)
      setHost(nextModule?.querySelector('.clients-titlebar') || null)
      setForm(nextForm)
    }
    refresh()
    const observer = new MutationObserver(refresh)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!module) return undefined
    const handleClick = (event) => {
      const target = event.target?.closest?.('button')
      if (!target) return
      if (target.matches('.primary-action') || target.closest('.row-actions')?.querySelector('.secondary-button') === target) {
        setView('new')
      }
    }
    module.addEventListener('click', handleClick, true)
    return () => module.removeEventListener('click', handleClick, true)
  }, [module])

  useEffect(() => {
    if (!module) return
    const applyVisibility = () => {
      const stats = module.querySelector('.client-stats')
      const directory = module.querySelector('.clients-directory')
      const currentForm = module.querySelector('.client-form-full')
      const client360 = document.querySelector('.client360')
      const crm360 = document.querySelector('.crm360')

      if (stats) stats.style.display = view === 'directory' ? '' : 'none'
      if (directory) directory.style.display = view === 'directory' ? '' : 'none'
      if (currentForm) currentForm.style.display = view === 'new' ? '' : 'none'
      if (client360) client360.style.display = view === '360' ? '' : 'none'
      if (crm360) crm360.style.display = view === 'crm' ? '' : 'none'
    }
    applyVisibility()
    const observer = new MutationObserver(applyVisibility)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [module, view])

  useEffect(() => {
    if (!form) return undefined
    const fieldsets = [...form.querySelectorAll(':scope > fieldset')]
    if (!fieldsets.length) return undefined

    const nextCounts = {}
    fieldsets.forEach((fieldset, index) => {
      const section = sectionFor(fieldset, index)
      fieldset.dataset.clientSection = section
      nextCounts[section] = (nextCounts[section] || 0) + 1
      fieldset.hidden = section !== active
    })
    setCounts(nextCounts)
    form.classList.add('client-form-organized')

    const handleInvalid = (event) => {
      const fieldset = event.target?.closest?.('fieldset[data-client-section]')
      const section = fieldset?.dataset.clientSection
      if (!section) return
      setView('new')
      setActive(section)
      fieldsets.forEach((item) => { item.hidden = item.dataset.clientSection !== section })
      window.setTimeout(() => event.target?.focus?.(), 0)
    }
    form.addEventListener('invalid', handleInvalid, true)
    return () => form.removeEventListener('invalid', handleInvalid, true)
  }, [form, active])

  const currentIndex = useMemo(() => Math.max(0, TABS.findIndex(([key]) => key === active)), [active])
  if (!host || !module) return null

  const openView = (nextView) => {
    if (nextView === 'new' && !module.querySelector('.client-form-full')) {
      module.querySelector('.primary-action')?.click()
    }
    setView(nextView)
    window.setTimeout(() => module.scrollIntoView({ behavior: 'smooth', block: 'start' }), 20)
  }

  const go = (direction) => {
    const next = Math.min(TABS.length - 1, Math.max(0, currentIndex + direction))
    setActive(TABS[next][0])
    form?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return createPortal(
    <div className="client-organizer">
      <div className="client-view-tabs" role="tablist" aria-label="Áreas del módulo Clientes">
        {VIEWS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={view === key} className={view === key ? 'active' : ''} onClick={() => openView(key)}>
            {label}
          </button>
        ))}
      </div>

      {view === 'new' && form && (
        <div className="client-section-organizer">
          <div className="client-organizer-head">
            <div>
              <small>EXPEDIENTE DEL CLIENTE</small>
              <strong>Completa una sección a la vez</strong>
            </div>
            <span>{currentIndex + 1} de {TABS.length}</span>
          </div>
          <div className="client-organizer-tabs" role="tablist" aria-label="Secciones del cliente">
            {TABS.map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={active === key} className={active === key ? 'active' : ''} onClick={() => setActive(key)}>
                {label}{counts[key] ? <b>{counts[key]}</b> : null}
              </button>
            ))}
          </div>
          <div className="client-organizer-help">
            <p>{active === 'general' ? 'Nombre, tipo de cliente, estado y datos básicos.' : active === 'fiscal' ? 'Datos fiscales y de facturación electrónica según el documento.' : active === 'contact' ? 'Correo, teléfono, WhatsApp y persona de contacto.' : active === 'address' ? 'Domicilio fiscal y ubicación del receptor.' : 'Clasificación, condiciones, notas y datos comerciales.'}</p>
            <div>
              <button type="button" disabled={currentIndex === 0} onClick={() => go(-1)}>← Anterior</button>
              <button type="button" disabled={currentIndex === TABS.length - 1} onClick={() => go(1)}>Siguiente →</button>
            </div>
          </div>
        </div>
      )}
    </div>,
    host,
  )
}
