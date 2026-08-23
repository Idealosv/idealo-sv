import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

const TABS = [
  ['general', 'Datos generales'],
  ['fiscal', 'Fiscal DTE'],
  ['contact', 'Contacto'],
  ['address', 'Dirección'],
  ['commercial', 'Comercial'],
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
      nextModule?.classList.toggle('client-form-open', Boolean(nextForm))
    }
    refresh()
    const observer = new MutationObserver(refresh)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      module?.classList.remove('client-form-open')
    }
  }, [module])

  useEffect(() => {
    if (!form) {
      setActive('general')
      setCounts({})
      return undefined
    }
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
      setActive(section)
      fieldsets.forEach((item) => { item.hidden = item.dataset.clientSection !== section })
      window.setTimeout(() => event.target?.focus?.(), 0)
    }
    form.addEventListener('invalid', handleInvalid, true)
    return () => form.removeEventListener('invalid', handleInvalid, true)
  }, [form, active])

  const currentIndex = useMemo(() => Math.max(0, TABS.findIndex(([key]) => key === active)), [active])
  if (!host || !module || !form) return null

  const go = (direction) => {
    const next = Math.min(TABS.length - 1, Math.max(0, currentIndex + direction))
    setActive(TABS[next][0])
    form.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return createPortal(
    <div className="client-organizer">
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
    </div>,
    host,
  )
}
