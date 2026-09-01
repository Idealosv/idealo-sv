import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { DTE_ACTIVITIES } from './dteCatalogs'
import { supabase } from './lib/supabase'

const EMPTY = { activity_code_2: '', business_activity_2: '', activity_code_3: '', business_activity_3: '' }

export default function ClientAdditionalActivitiesHost() {
  const [mount, setMount] = useState(null)
  const [formElement, setFormElement] = useState(null)

  useEffect(() => {
    const locate = () => {
      const forms = [...document.querySelectorAll('.clients-module form.client-form-full')]
      const clientForm = forms.find((form) => /Facturaci[oó]n electr[oó]nica/i.test(form.textContent || ''))
      if (!clientForm) {
        setMount(null)
        setFormElement(null)
        return
      }

      const fiscalFieldset = [...clientForm.querySelectorAll('fieldset')].find((fieldset) => /Facturaci[oó]n electr[oó]nica/i.test(fieldset.querySelector('legend')?.textContent || ''))
      const grid = fiscalFieldset?.querySelector('.form-grid')
      if (!grid) return

      let node = grid.querySelector(':scope > .client-extra-activities-mount')
      if (!node) {
        node = document.createElement('div')
        node.className = 'client-extra-activities-mount form-span-3'
        grid.appendChild(node)
      }
      setMount(node)
      setFormElement(clientForm)
    }

    locate()
    const observer = new MutationObserver(locate)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  return mount && formElement ? createPortal(<AdditionalActivities formElement={formElement} />, mount) : null
}

function AdditionalActivities({ formElement }) {
  const [companyId, setCompanyId] = useState('')
  const [values, setValues] = useState(EMPTY)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const listId = useMemo(() => `activity-options-${Math.random().toString(36).slice(2)}`, [])

  useEffect(() => {
    let active = true
    supabase?.rpc('get_my_companies').then(({ data }) => {
      if (active) setCompanyId(data?.[0]?.id || '')
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    setValues(EMPTY)
    setMessage('')
    if (!companyId || !isEditing(formElement)) return

    const timer = window.setTimeout(async () => {
      const identity = readIdentity(formElement)
      const client = await findClient(companyId, identity)
      if (!client) return
      setValues({
        activity_code_2: client.activity_code_2 || '',
        business_activity_2: client.business_activity_2 || '',
        activity_code_3: client.activity_code_3 || '',
        business_activity_3: client.business_activity_3 || '',
      })
    }, 120)
    return () => window.clearTimeout(timer)
  }, [companyId, formElement])

  useEffect(() => {
    const receive = (event) => {
      const activities = Array.isArray(event.detail?.activities) ? event.detail.activities : []
      setValues((current) => ({
        ...current,
        activity_code_2: activities[0]?.code || current.activity_code_2,
        business_activity_2: activities[0]?.name || current.business_activity_2,
        activity_code_3: activities[1]?.code || current.activity_code_3,
        business_activity_3: activities[1]?.name || current.business_activity_3,
      }))
    }
    window.addEventListener('idealo-vat-additional-activities', receive)
    return () => window.removeEventListener('idealo-vat-additional-activities', receive)
  }, [])

  useEffect(() => {
    if (!companyId || !formElement) return undefined
    const onSubmit = () => {
      const snapshot = { ...values }
      const identity = readIdentity(formElement)
      setSaving(true)
      setMessage('Guardando giros adicionales…')
      persistAfterBaseSave(companyId, identity, snapshot).then((ok) => {
        setSaving(false)
        setMessage(ok ? 'Giros adicionales guardados.' : 'El cliente se guardó, pero no fue posible vincular los giros adicionales. Abra el cliente y vuelva a guardar.')
      })
    }
    formElement.addEventListener('submit', onSubmit)
    return () => formElement.removeEventListener('submit', onSubmit)
  }, [companyId, formElement, values])

  const setActivity = (slot, raw) => {
    const parsed = parseActivity(raw)
    setValues((current) => ({
      ...current,
      [`activity_code_${slot}`]: parsed?.code || '',
      [`business_activity_${slot}`]: parsed?.name || raw,
    }))
  }

  const formatted = (slot) => {
    const code = values[`activity_code_${slot}`]
    const name = values[`business_activity_${slot}`]
    return code ? `${code} - ${name}` : name
  }

  return <section className="client-extra-activities">
    <div className="client-extra-activities-head">
      <div><strong>Actividades económicas adicionales</strong><small>El giro principal de arriba es el que usa el DTE. Aquí puede conservar hasta dos giros adicionales del cliente.</small></div>
      <span>CAT-019</span>
    </div>
    <div className="client-extra-activities-grid">
      <label className="field">
        <span>Giro 2</span>
        <input list={listId} value={formatted(2)} onChange={(event) => setActivity(2, event.target.value)} placeholder="Buscar código o actividad" />
      </label>
      <label className="field">
        <span>Giro 3</span>
        <input list={listId} value={formatted(3)} onChange={(event) => setActivity(3, event.target.value)} placeholder="Buscar código o actividad" />
      </label>
    </div>
    <datalist id={listId}>{DTE_ACTIVITIES.map((item) => <option key={item.code} value={`${item.code} - ${item.name}`} />)}</datalist>
    {message && <small className={message.includes('no fue posible') ? 'client-extra-activities-error' : 'client-extra-activities-status'}>{saving ? 'Guardando…' : message}</small>}
  </section>
}

function parseActivity(raw = '') {
  const text = String(raw || '').trim()
  const code = text.match(/^([0-9]{3,6})\s*[-–:]\s*(.+)$/)
  if (code) {
    const exact = DTE_ACTIVITIES.find((item) => item.code === code[1])
    return exact || { code: code[1], name: code[2].trim() }
  }
  const normalized = normalize(text)
  if (!normalized) return null
  const exact = DTE_ACTIVITIES.find((item) => normalize(item.name) === normalized)
  if (exact) return exact
  const contains = DTE_ACTIVITIES.find((item) => normalize(item.name).includes(normalized) || normalized.includes(normalize(item.name)))
  return contains || null
}

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function isEditing(form) {
  return /EDITAR CLIENTE|Actualizar expediente|Guardar cambios/i.test(form?.textContent || '')
}

function readIdentity(form) {
  const read = (name) => String(form?.querySelector(`[name="${name}"]`)?.value || '').trim()
  return { tax_id: read('tax_id'), document_number: read('document_number'), nrc: read('nrc'), name: read('name') }
}

async function findClient(companyId, identity) {
  const candidates = [
    ['tax_id', identity.tax_id],
    ['document_number', identity.document_number],
    ['nrc', identity.nrc],
    ['name', identity.name],
  ].filter(([, value]) => value)

  for (const [field, value] of candidates) {
    const { data } = await supabase.from('clients').select('id, activity_code_2, business_activity_2, activity_code_3, business_activity_3').eq('company_id', companyId).eq(field, value).order('created_at', { ascending: false }).limit(1)
    if (data?.[0]) return data[0]
  }
  return null
}

async function persistAfterBaseSave(companyId, identity, values) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await wait(attempt === 0 ? 350 : 450)
    const client = await findClient(companyId, identity)
    if (!client) continue
    const payload = {
      activity_code_2: values.activity_code_2 || null,
      business_activity_2: values.business_activity_2 || null,
      activity_code_3: values.activity_code_3 || null,
      business_activity_3: values.business_activity_3 || null,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('clients').update(payload).eq('id', client.id).eq('company_id', companyId)
    return !error
  }
  return false
}

function wait(ms) { return new Promise((resolve) => window.setTimeout(resolve, ms)) }
