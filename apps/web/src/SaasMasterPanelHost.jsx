import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'
import './saas-master-panel.css'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const statuses = ['trial', 'active', 'past_due', 'suspended', 'cancelled']
const labels = {
  trial: 'Prueba',
  active: 'Activa',
  past_due: 'Vencida',
  suspended: 'Suspendida',
  cancelled: 'Cancelada',
}
const filters = [
  ['all', 'Todas'],
  ['active', 'Activas'],
  ['trial', 'Prueba'],
  ['past_due', 'Vencidas'],
  ['suspended', 'Suspendidas'],
]

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-SV', { day: '2-digit', month: 'short', year: 'numeric' })
}

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`
}

function daysUntil(value) {
  if (!value) return null
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000)
}

function statusTone(status) {
  if (status === 'active') return 'good'
  if (status === 'trial') return 'warn'
  if (status === 'past_due' || status === 'suspended') return 'danger'
  return 'muted'
}

function planBenefits(plan) {
  if (!plan) return []
  const benefits = []
  benefits.push(`Hasta ${plan.max_users || '—'} usuarios`)
  if (plan.dte_enabled) benefits.push('Facturación Electrónica DTE')
  if (plan.mobile_apps_enabled) benefits.push('Apps Android + iPhone')
  if (plan.ai_enabled) benefits.push('Funciones con IA')
  return benefits
}

export default function SaasMasterPanelHost() {
  const enabled = window.location.pathname === '/master'
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [data, setData] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [saving, setSaving] = useState(false)
  const [paymentFor, setPaymentFor] = useState(null)
  const [payment, setPayment] = useState({ amount: '', reference: '', charge_type: 'monthly' })
  const [form, setForm] = useState({
    name: '',
    owner_email: '',
    plan_id: '',
    vertical_id: '',
    trial_days: 14,
    demo_mode: false,
  })

  useEffect(() => {
    if (!enabled || !supabase) return
    supabase.auth.getSession().then(({ data: auth }) => setSession(auth.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => listener.subscription.unsubscribe()
  }, [enabled])

  const request = async (path, options = {}) => {
    if (!session?.access_token) throw new Error('Iniciá sesión para entrar al Administrador de Membresías.')
    const response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        ...options.headers,
      },
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.message || 'No se pudo completar la operación.')
    return body
  }

  const reload = async () => {
    if (!session) return
    setLoading(true)
    setError('')
    try {
      const next = await request('/api/admin/saas/dashboard')
      setData(next)
      setForm(current => ({
        ...current,
        plan_id: current.plan_id || next.plans?.[0]?.id || '',
        vertical_id: current.vertical_id || next.verticals?.find(x => x.code === 'ADVERTISING')?.id || next.verticals?.[0]?.id || '',
      }))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (enabled && session) reload()
  }, [enabled, session])

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (data?.companies || [])
      .filter(row => statusFilter === 'all' || row.subscription?.status === statusFilter)
      .filter(row => {
        if (!term) return true
        const haystack = `${row.name} ${row.slug} ${row.demo_mode ? 'demo' : ''} ${row.subscription?.plan?.name || ''} ${row.subscription?.vertical?.name || ''}`.toLowerCase()
        return haystack.includes(term)
      })
      .sort((a, b) => {
        const aEnd = a.subscription?.current_period_end || a.subscription?.trial_ends_at || '9999-12-31'
        const bEnd = b.subscription?.current_period_end || b.subscription?.trial_ends_at || '9999-12-31'
        return new Date(aEnd) - new Date(bEnd)
      })
  }, [data, search, statusFilter])

  const selectedPlan = data?.plans?.find(x => x.id === form.plan_id) || null

  if (!enabled) return null

  const createCompany = async event => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await request('/api/admin/saas/companies', { method: 'POST', body: JSON.stringify(form) })
      setForm(current => ({ ...current, name: '', owner_email: '' }))
      setNotice('Empresa y membresía creadas correctamente. La activación queda pendiente hasta registrar su cobro.')
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const updateSubscription = async (companyId, payload, successMessage = 'Membresía actualizada.') => {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await request(`/api/admin/saas/companies/${companyId}/subscription`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      setNotice(successMessage)
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const openPayment = (row, chargeType = 'monthly') => {
    const plan = row.subscription?.plan
    const suggested = chargeType === 'activation' ? Number(plan?.activation_fee || 0) : Number(plan?.monthly_price || 0)
    setPaymentFor(row)
    setPayment({ amount: suggested ? String(suggested) : '', reference: '', charge_type: chargeType })
    setError('')
  }

  const changeChargeType = chargeType => {
    const plan = paymentFor?.subscription?.plan
    const suggested = chargeType === 'activation' ? Number(plan?.activation_fee || 0) : Number(plan?.monthly_price || 0)
    setPayment(current => ({ ...current, charge_type: chargeType, amount: suggested ? String(suggested) : '' }))
  }

  const recordPayment = async event => {
    event.preventDefault()
    if (!paymentFor) return
    const amount = Number(payment.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Ingresá un monto válido.')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await request(`/api/admin/saas/companies/${paymentFor.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({ amount, reference: payment.reference.trim(), charge_type: payment.charge_type }),
      })
      if (payment.charge_type === 'monthly') {
        await request(`/api/admin/saas/companies/${paymentFor.id}/subscription`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'active', renew: true }),
        })
      }
      const companyName = paymentFor.name
      const wasActivation = payment.charge_type === 'activation'
      setPaymentFor(null)
      setNotice(wasActivation
        ? `Activación de ${companyName} registrada correctamente.`
        : `Mensualidad registrada y membresía de ${companyName} renovada por 30 días.`)
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const m = data?.metrics || {}
  return (
    <div className="saas-master-root">
      <header className="saas-master-header">
        <div>
          <span className="saas-master-brand">IDEALO SV · ADMINISTRACIÓN</span>
          <h1>Administrador de Membresías</h1>
          <p>Control de empresas, activaciones, mensualidades, vencimientos y acceso al sistema.</p>
        </div>
        <div className="saas-master-actions">
          <a href="/">Volver al ERP</a>
          <button onClick={reload} disabled={loading}>Actualizar</button>
        </div>
      </header>

      {!session && <section className="saas-master-message">Iniciá sesión con la cuenta administradora y regresá a <strong>/master</strong>.</section>}
      {error && <section className="saas-master-error">{error}</section>}
      {notice && <section className="saas-master-success">{notice}</section>}

      {loading ? <section className="saas-master-message">Cargando membresías…</section> : data && <>
        <section className="saas-master-metrics">
          <Metric label="Empresas" value={m.companies || 0} hint="registradas" />
          <Metric label="Activas" value={m.active || 0} hint="al día" tone="good" />
          <Metric label="En prueba" value={m.trial || 0} hint="periodo inicial" tone="warn" />
          <Metric label="Activación pendiente" value={m.activation_pending || 0} hint="por cobrar" tone="warn" />
          <Metric label="Activaciones cobradas" value={money(m.activation_collected)} hint="acumulado" tone="money" />
          <Metric label="Vencidas" value={m.past_due || 0} hint="requieren cobro" tone="danger" />
          <Metric label="Suspendidas" value={m.suspended || 0} hint="sin acceso" tone="danger" />
          <Metric label="Vencen ≤ 7 días" value={m.expiring_soon || 0} hint="dar seguimiento" tone="warn" />
          <Metric label="Demos" value={m.demos || 0} hint="comerciales" />
          <Metric label="MRR estimado" value={money(m.mrr)} hint="mensual" tone="money" />
        </section>

        <section className="saas-master-grid">
          <form className="saas-master-card saas-master-create" onSubmit={createCompany}>
            <div>
              <small>NUEVA MEMBRESÍA</small>
              <h2>Agregar empresa</h2>
              <p>Creá la empresa, asignale un plan y definí su periodo inicial.</p>
            </div>
            <label>Empresa<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required minLength="2" placeholder="Nombre comercial" /></label>
            <label>Correo del propietario<input type="email" value={form.owner_email} onChange={e => setForm({ ...form, owner_email: e.target.value })} required placeholder="correo@empresa.com" /></label>
            <label>Rubro<select value={form.vertical_id} onChange={e => setForm({ ...form, vertical_id: e.target.value })}>{data.verticals.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <label>Plan<select value={form.plan_id} onChange={e => setForm({ ...form, plan_id: e.target.value })}>{data.plans.map(x => <option key={x.id} value={x.id}>{x.name} · activación {money(x.activation_fee)} · {money(x.monthly_price)}/mes</option>)}</select></label>
            {selectedPlan && <div className="saas-payment-plan">
              <span>Activación</span><strong>{money(selectedPlan.activation_fee)}</strong>
              <span>Mensualidad</span><strong>{money(selectedPlan.monthly_price)}</strong>
              <span>Beneficios</span><strong>{planBenefits(selectedPlan).join(' · ') || 'Plan estándar'}</strong>
            </div>}
            <label>Días de prueba<input type="number" min="0" max="90" value={form.trial_days} onChange={e => setForm({ ...form, trial_days: Number(e.target.value) })} /></label>
            <label className="saas-demo-option"><input type="checkbox" checked={form.demo_mode} onChange={e => setForm({ ...form, demo_mode: e.target.checked })} /><span><strong>Crear como DEMO comercial</strong><small>Precarga datos ficticios y mantiene DTE de producción protegido.</small></span></label>
            <button disabled={saving}>{saving ? 'Procesando…' : 'Crear membresía'}</button>
          </form>

          <section className="saas-master-card saas-master-list">
            <div className="saas-master-list-head">
              <div><small>CARTERA DE MEMBRESÍAS</small><h2>Empresas suscritas</h2></div>
              <input placeholder="Buscar empresa, plan o rubro" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="saas-filter-bar">
              {filters.map(([value, text]) => <button key={value} type="button" className={statusFilter === value ? 'active' : ''} onClick={() => setStatusFilter(value)}>{text}</button>)}
              <span>{rows.length} resultado{rows.length === 1 ? '' : 's'}</span>
            </div>
            <div className="saas-master-table-wrap">
              <table>
                <thead><tr><th>Empresa</th><th>Plan / cobros</th><th>Activación</th><th>Estado</th><th>Vencimiento</th><th>Usuarios</th><th>Acciones</th></tr></thead>
                <tbody>{rows.map(row => <CompanyRow key={row.id} row={row} plans={data.plans} saving={saving} onUpdate={updateSubscription} onPayment={openPayment} />)}</tbody>
              </table>
            </div>
            {!rows.length && <p className="saas-master-empty">No hay membresías que coincidan con el filtro.</p>}
          </section>
        </section>
      </>}

      {paymentFor && <div className="saas-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && !saving && setPaymentFor(null)}>
        <form className="saas-payment-modal" onSubmit={recordPayment}>
          <div className="saas-payment-modal-head"><div><small>REGISTRAR COBRO</small><h2>{paymentFor.name}</h2></div><button type="button" onClick={() => setPaymentFor(null)} disabled={saving}>×</button></div>
          <label>Tipo de cobro<select value={payment.charge_type} onChange={e => changeChargeType(e.target.value)}><option value="activation">Activación</option><option value="monthly">Mensualidad</option><option value="other">Otro cobro</option></select></label>
          <div className="saas-payment-plan">
            <span>Plan actual</span><strong>{paymentFor.subscription?.plan?.name || 'Sin plan'}</strong>
            <span>Activación</span><strong>{money(paymentFor.subscription?.plan?.activation_fee)}</strong>
            <span>Mensualidad</span><strong>{money(paymentFor.subscription?.plan?.monthly_price)}</strong>
            <span>Estado activación</span><strong>{paymentFor.subscription?.activation_paid_at ? `Pagada · ${formatDate(paymentFor.subscription.activation_paid_at)}` : 'Pendiente'}</strong>
          </div>
          <label>Monto recibido<input type="number" min="0.01" step="0.01" value={payment.amount} onChange={e => setPayment({ ...payment, amount: e.target.value })} autoFocus required /></label>
          <label>Referencia / comprobante<input value={payment.reference} onChange={e => setPayment({ ...payment, reference: e.target.value })} placeholder="Transferencia, recibo, referencia…" /></label>
          <p>{payment.charge_type === 'monthly'
            ? <>Al guardar la mensualidad, la membresía quedará <strong>activa</strong> y se renovará por <strong>30 días</strong>.</>
            : payment.charge_type === 'activation'
              ? <>El pago quedará identificado como <strong>activación</strong> y no modificará por sí solo la fecha de vencimiento.</>
              : <>El cobro quedará registrado sin modificar la vigencia de la membresía.</>}</p>
          <div className="saas-payment-actions"><button type="button" onClick={() => setPaymentFor(null)} disabled={saving}>Cancelar</button><button type="submit" disabled={saving}>{saving ? 'Registrando…' : 'Registrar cobro'}</button></div>
        </form>
      </div>}
    </div>
  )
}

function Metric({ label, value, hint, tone = '' }) {
  return <article className={tone ? `metric-${tone}` : ''}><small>{label}</small><strong>{value}</strong><span>{hint}</span></article>
}

function CompanyRow({ row, plans, saving, onUpdate, onPayment }) {
  const sub = row.subscription
  const plan = sub?.plan
  const expiry = row.demo_mode ? (row.demo_expires_at || sub?.trial_ends_at) : (sub?.current_period_end || sub?.trial_ends_at)
  const remaining = daysUntil(expiry)
  const expiryLabel = remaining === null ? 'Sin fecha' : remaining < 0 ? `${Math.abs(remaining)} día${Math.abs(remaining) === 1 ? '' : 's'} vencida` : remaining === 0 ? 'Vence hoy' : `${remaining} día${remaining === 1 ? '' : 's'}`
  return <tr>
    <td><strong>{row.name}</strong><small>{row.demo_mode ? 'DEMO · ' : ''}{row.slug}</small></td>
    <td><select value={sub?.plan_id || ''} disabled={!sub || saving} onChange={e => onUpdate(row.id, { plan_id: e.target.value }, 'Plan actualizado.')}>{!sub && <option value="">Sin plan</option>}{plans.map(x => <option key={x.id} value={x.id}>{x.name} · {money(x.monthly_price)}/mes</option>)}</select><small>{plan ? `${money(plan.activation_fee)} activación · ${money(plan.monthly_price)}/mes` : '—'}</small><small>{planBenefits(plan).join(' · ')}</small></td>
    <td>{sub?.activation_paid_at ? <><span className="saas-status-pill tone-good">Pagada</span><small>{money(sub.activation_paid_amount)} · {formatDate(sub.activation_paid_at)}</small></> : <><span className="saas-status-pill tone-warn">Pendiente</span><small>{money(plan?.activation_fee)}</small></>}</td>
    <td><span className={`saas-status-pill tone-${statusTone(sub?.status)}`}>{labels[sub?.status] || 'Sin suscripción'}</span><select className="saas-status-select" value={sub?.status || ''} disabled={!sub || saving} onChange={e => onUpdate(row.id, { status: e.target.value }, 'Estado actualizado.')}>{!sub && <option value="">Sin suscripción</option>}{statuses.map(x => <option key={x} value={x}>{labels[x]}</option>)}</select></td>
    <td><strong>{formatDate(expiry)}</strong><small className={remaining !== null && remaining <= 7 ? 'expiry-alert' : ''}>{expiryLabel}</small></td>
    <td>{row.users}</td>
    <td><div className="saas-master-row-actions">
      {!sub?.activation_paid_at && <button type="button" disabled={!sub || saving} onClick={() => onPayment(row, 'activation')}>Cobrar activación</button>}
      <button type="button" disabled={!sub || saving} onClick={() => onPayment(row, 'monthly')}>Cobrar mensualidad</button>
      <button type="button" disabled={!sub || saving} onClick={() => onUpdate(row.id, { status: 'active', renew: true }, 'Membresía renovada por 30 días.')}>Renovar 30 días</button>
      {sub?.status !== 'suspended' ? <button type="button" className="danger" disabled={!sub || saving} onClick={() => onUpdate(row.id, { status: 'suspended' }, 'Membresía suspendida.')}>Suspender</button> : <button type="button" disabled={!sub || saving} onClick={() => onUpdate(row.id, { status: 'active' }, 'Membresía reactivada.')}>Reactivar</button>}
    </div></td>
  </tr>
}
