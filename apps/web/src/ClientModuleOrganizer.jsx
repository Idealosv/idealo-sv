import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

const TABS = [
  ['general', 'Datos generales'],
  ['fiscal', 'Fiscal DTE'],
  ['contact', 'Contacto y dirección'],
  ['commercial', 'Comercial'],
]

const normalize = (value = '') => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const sectionFor = (fieldset, index) => {
  const legend = normalize(fieldset.querySelector('legend')?.textContent || '')
  if (/dte|facturacion|tribut|fiscal|identificacion tributaria/.test(legend)) return 'fiscal'
  if (/contact|telefono|correo|whatsapp|domicilio|direccion|ubicacion|departamento|municipio|distrito/.test(legend)) return 'contact'
  if (/credito|comercial|seguimiento|observacion|nota|condicion|clasificacion/.test(legend)) return 'commercial'
  return index === 0 ? 'general' : 'general'
}

const nativeSet = (control, value) => {
  if (!control || String(control.value ?? '') === String(value ?? '')) return
  const prototype = control instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(control, value)
  control.dispatchEvent(new Event('input', { bubbles: true }))
  control.dispatchEvent(new Event('change', { bubbles: true }))
}

const labelOf = (form, name) => form.querySelector(`[name="${name}"]`)?.closest('label') || null

function normalizeVisibleClientFields(form) {
  const clientType = form.querySelector('[name="client_type"]')?.value || 'company'
  const preferredDte = form.querySelector('[name="preferred_dte_type"]')?.value || '01'
  const documentType = form.querySelector('[name="document_type"]')?.value || (clientType === 'person' ? '13' : '36')
  const isCreditFiscal = preferredDte === '03'
  const isNit = documentType === '36'
  const isDui = documentType === '13'

  const taxpayer = form.querySelector('[name="taxpayer_type"]')
  if (taxpayer) nativeSet(taxpayer, clientType === 'person' ? '1' : '2')

  const contactName = labelOf(form, 'contact_name')
  const contactPosition = labelOf(form, 'contact_position')
  if (contactName) contactName.hidden = clientType === 'person'
  if (contactPosition) contactPosition.hidden = clientType === 'person'

  const documentNumber = form.querySelector('[name="document_number"]')
  const taxId = form.querySelector('[name="tax_id"]')
  const dui = form.querySelector('[name="dui"]')
  const documentNumberLabel = labelOf(form, 'document_number')
  const taxIdLabel = labelOf(form, 'tax_id')
  const duiLabel = labelOf(form, 'dui')
  const taxpayerLabel = labelOf(form, 'taxpayer_type')

  if (taxpayerLabel) taxpayerLabel.hidden = true

  if (isNit) {
    if (documentNumberLabel) documentNumberLabel.hidden = true
    if (duiLabel) duiLabel.hidden = true
    if (taxIdLabel) taxIdLabel.hidden = false
    if (taxId?.value) nativeSet(documentNumber, taxId.value)
  } else if (isDui) {
    if (documentNumberLabel) {
      documentNumberLabel.hidden = false
      const title = documentNumberLabel.querySelector('span')
      if (title) title.textContent = 'DUI / NIT homologado *'
    }
    if (taxIdLabel) taxIdLabel.hidden = true
    if (duiLabel) duiLabel.hidden = true
    if (documentNumber?.value) {
      nativeSet(dui, documentNumber.value)
      nativeSet(taxId, documentNumber.value)
    }
  } else {
    if (documentNumberLabel) {
      documentNumberLabel.hidden = false
      const title = documentNumberLabel.querySelector('span')
      if (title) title.textContent = 'Número de identificación *'
    }
    if (taxIdLabel) taxIdLabel.hidden = !isCreditFiscal
    if (duiLabel) duiLabel.hidden = true
  }

  const payment = form.querySelector('[name="payment_terms"]')?.value || 'cash'
  const creditLimitLabel = labelOf(form, 'credit_limit')
  if (creditLimitLabel) creditLimitLabel.hidden = payment === 'cash'
}

function installClientFieldSync(form) {
  const sync = () => window.setTimeout(() => normalizeVisibleClientFields(form), 0)
  normalizeVisibleClientFields(form)
  form.addEventListener('change', sync, true)
  return () => form.removeEventListener('change', sync, true)
}

export default function ClientModuleOrganizer() {
  const [active, setActive] = useState('general')
  const [host, setHost] = useState(null)
  const [module, setModule] = useState(null)
  const [form, setForm] = useState(null)

  useEffect(() => {
    let timers = []
    const refresh = () => {
      const isClients = document.querySelector('.erp-header h1')?.textContent?.trim() === 'Clientes'
      const nextModule = isClients ? document.querySelector('.clients-module') : null
      const nextForm = nextModule?.querySelector('.client-form-full') || null
      setModule(nextModule)
      setHost(nextModule?.querySelector('.clients-titlebar') || null)
      setForm(nextForm)
      nextModule?.classList.toggle('client-form-open', Boolean(nextForm))
    }
    const schedule = () => {
      timers.forEach(window.clearTimeout)
      timers = [0, 60, 180, 400].map(delay => window.setTimeout(refresh, delay))
    }
    const onModule = (event) => {
      if (event.detail === 'Clientes') schedule()
      else refresh()
    }
    const onClick = (event) => {
      if (event.target.closest('.idealo-main-menu-item,.clients-module button,.clients-module [role="tab"]')) schedule()
    }
    schedule()
    window.addEventListener('idealo-module-change', onModule)
    document.addEventListener('click', onClick)
    return () => {
      timers.forEach(window.clearTimeout)
      window.removeEventListener('idealo-module-change', onModule)
      document.removeEventListener('click', onClick)
      module?.classList.remove('client-form-open')
    }
  }, [module])

  useEffect(() => {
    if (!form) {
      setActive('general')
      return undefined
    }
    const fieldsets = [...form.querySelectorAll(':scope > fieldset')]
    if (!fieldsets.length) return undefined

    fieldsets.forEach((fieldset, index) => {
      const section = sectionFor(fieldset, index)
      fieldset.dataset.clientSection = section
      fieldset.hidden = section !== active
    })
    form.classList.add('client-form-organized')
    const cleanupSync = installClientFieldSync(form)

    const handleInvalid = (event) => {
      const fieldset = event.target?.closest?.('fieldset[data-client-section]')
      const section = fieldset?.dataset.clientSection
      if (!section) return
      setActive(section)
      fieldsets.forEach((item) => { item.hidden = item.dataset.clientSection !== section })
      window.setTimeout(() => event.target?.focus?.(), 0)
    }
    form.addEventListener('invalid', handleInvalid, true)
    return () => {
      cleanupSync()
      form.removeEventListener('invalid', handleInvalid, true)
    }
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
          <div><small>EXPEDIENTE DEL CLIENTE</small><strong>Un dato se captura una sola vez</strong></div>
          <span>{currentIndex + 1} de {TABS.length}</span>
        </div>
        <div className="client-organizer-tabs" role="tablist" aria-label="Secciones del cliente">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={active === key} className={active === key ? 'active' : ''} onClick={() => setActive(key)}>{label}</button>
          ))}
        </div>
        <div className="client-organizer-help">
          <p>{active === 'general' ? 'Identidad básica del cliente.' : active === 'fiscal' ? 'Solo los datos fiscales aplicables al tipo de cliente y DTE.' : active === 'contact' ? 'Contacto principal y domicilio fiscal en una sola sección; contactos o ubicaciones adicionales se administran después.' : 'Condición de pago, crédito cuando aplique, origen y notas internas.'}</p>
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
