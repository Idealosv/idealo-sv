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
  ['commercial', 'Clientes'],
  ['demo', 'Demos'],
  ['internal', 'Internas'],
  ['active', 'Activas'],
  ['trial', 'Prueba'],
  ['past_due', 'Vencidas'],
  ['suspended', 'Suspendidas'],
  ['cancelled', 'Canceladas'],
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

function typeFor(row) {
  if (row?.account_type) return row.account_type
  if (row?.demo_mode) return 'demo'
  if (String(row?.subscription?.plan?.code || '').toUpperCase() === 'OWNER_INTERNAL') return 'internal'
  return 'commercial'
}

function typeLabel(type) {
  if (type === 'demo') return 'DEMO'
  if (type === 'internal') return 'INTERNA'
  return 'CLIENTE'
}

function matchesFilter(row, filter) {
  if (filter === 'all') return true
  const type = typeFor(row)
  if (['commercial', 'demo', 'internal'].includes(filter)) return type === filter
  return type === 'commercial' && row.subscription?.status === filter
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
  const [actionFor, setActionFor] = useState('')
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
      const plans = next.commercial_plans?.length
        ? next.commercial_plans
        : (next.plans || []).filter(plan => plan.active !== false && String(plan.code || '').toUpperCase() !== 'OWNER_INTERNAL')
      setData(next)
      setForm(current => ({
        ...current,
        plan_id: plans.some(plan => plan.id === current.plan_id) ? current.plan_id : (plans[0]?.id || ''),
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

  const commercialPlans = useMemo(() => {
    if (data?.commercial_plans?.length) return data.commercial_plans
    return (data?.plans || []).filter(plan => plan.active !== false && String(plan.code || '').toUpperCase() !== 'OWNER_INTERNAL')
  }, [data])

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    const typeOrder = { commercial: 0, demo: 1, internal: 2 }
    return (data?.companies || [])
      .filter(row => matchesFilter(row, statusFilter))
      .filter(row => {
        if (!term) return true
        const haystack = `${row.name} ${row.slug} ${row.owner_email || ''} ${typeFor(row)} ${row.subscription?.plan?.name || ''} ${row.subscription?.vertical?.name || ''}`.toLowerCase()
        return haystack.includes(term)
      })
      .sort((a, b) => {
        const typeDelta = (typeOrder[typeFor(a)] ?? 9) - (typeOrder[typeFor(b)] ?? 9)
        if (typeDelta) return typeDelta
        const aEnd = a.demo_mode ? (a.demo_expires_at || a.subscription?.trial_ends_at) : (a.subscription?.current_period_end || a.subscription?.trial_ends_at || '9999-12-31')
        const bEnd = b.demo_mode ? (b.demo_expires_at || b.subscription?.trial_ends_at) : (b.subscription?.current_period_end || b.subscription?.trial_ends_at || '9999-12-31')
        return new Date(aEnd || '9999-12-31') - new Date(bEnd || '9999-12-31')
      })
  }, [data, search, statusFilter])

  const selectedPlan = commercialPlans.find(x => x.id === form.plan_id) || null

  if (!enabled) return null

  const createCompany = async event => {
    event.preventDefault()
    const demoMode = form.demo_mode
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await request('/api/admin/saas/companies', { method: 'POST', body: JSON.stringify(form) })
      setForm(current => ({ ...current, name: '', owner_email: '' }))
      setNotice(demoMode
        ? 'DEMO comercial creada correctamente. Quedó fuera de la cartera de cobros y con DTE de producción protegido.'
        : 'Empresa y membresía creadas correctamente. La activación queda pendiente hasta registrar su cobro.')
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

  const enterCompany = async row => {
    const key = `${row.id}:enter`
    setActionFor(key)
    setError('')
    setNotice('')
    try {
      const result = await request(`/api/admin/saas/companies/${row.id}/access`, { method: 'POST' })
      window.location.href = result.redirect || `/?company=${encodeURIComponent(row.id)}&master=1`
    } catch (err) {
      setError(err.message)
      setActionFor('')
    }
  }

  const sendAccess = async row => {
    const recipient = row.owner_email || 'el correo del propietario registrado'
    if (!window.confirm(`Se enviará el acceso de ${row.name} a ${recipient}. ¿Continuar?`)) return
    const key = `${row.id}:access`
    setActionFor(key)
    setError('')
    setNotice('')
    try {
      const result = await request(`/api/admin/saas/companies/${row.id}/owner-access`, { method: 'POST' })
      setNotice(result.message || `Acceso enviado a ${recipient}.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setActionFor('')
    }
  }

  const openPayment = (row, chargeType = 'monthly') => {
    if (row.billing_exempt || typeFor(row) !== 'commercial') {
      setError('Esta cuenta es DEMO o interna y no admite cobros comerciales.')
      return
    }
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
      const companyName = paymentFor.name
      const wasActivation = payment.charge_type === 'activation'
      const wasMonthly = payment.charge_type === 'monthly'
      setPaymentFor(null)
      setNotice(wasActivation
        ? `Activación de ${companyName} registrada correctamente.`
        : wasMonthly
          ? `Mensualidad registrada y membresía de ${companyName} renovada por 30 días.`
          : `Cobro de ${companyName} registrado correctamente.`)
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
        <div className="saas-master-heading">
          <span className="saas-master-brand">IDEALO SV · ADMINISTRACIÓN</span>
          <h1>Administrador de Membresías</h1>
          <p>Clientes, demos, cobros, vencimientos y accesos desde un solo panel.</p>
        </div>
        <div className="saas-master-actions">
          <a href="/master/cobros">Cobros</a>
          <a href="/master/finanzas">Finanzas</a>
          <a href="/">Volver al ERP</a>
          <button onClick={reload} disabled={loading}>Actualizar</button>
        </div>
      </header>

      {!session && <section className="saas-master-message">Iniciá sesión con la cuenta administradora y regresá a <strong>/master</strong>.</section>}
      {error && <section className="saas-master-error">{error}</section>}
      {notice && <section className="saas-master-success">{notice}</section>}

      {loading ? <section className="saas-master-message">Cargando membresías…</section> : data && <>
        <section className="saas-master-metrics" aria-label="Resumen comercial">
          <Metric label="Clientes comerciales" value={m.companies || 0} hint={`${m.total_companies || m.companies || 0} registros totales`} />
          <Metric label="Activas" value={m.active || 0} hint="clientes al día" tone="good" />
          <Metric label="En prueba" value={m.trial || 0} hint="prospectos comerciales" tone="warn" />
          <Metric label="Activación pendiente" value={m.activation_pending || 0} hint="clientes por cobrar" tone="warn" />
          <Metric label="MRR estimado" value={money(m.mrr)} hint="solo cuentas comerciales" tone="money" />
          <Metric label="Activaciones cobradas" value={money(m.activation_collected)} hint="acumulado comercial" tone="money" />
          <Metric label="Vencidas" value={m.past_due || 0} hint="requieren seguimiento" tone="danger" />
          <Metric label="Suspendidas" value={m.suspended || 0} hint="sin acceso" tone="danger" />
          <Metric label="Vencen ≤ 7 días" value={m.expiring_soon || 0} hint="próximos cobros" tone="warn" />
          <Metric label="No comerciales" value={`${m.demos || 0} demo · ${m.internal || 0} interna`} hint="fuera de MRR y cobros" />
        </section>

        <section className="saas-master-grid">
          <form className="saas-master-card saas-master-create" onSubmit={createCompany}>
            <div className="saas-master-card-title">
              <small>NUEVA MEMBRESÍA</small>
              <h2>Agregar empresa</h2>
              <p>Creá un cliente o un entorno DEMO. Los planes internos no aparecen en este formulario.</p>
            </div>
            <label>Empresa<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required minLength="2" placeholder="Nombre comercial" /></label>
            <label>Correo del propietario<input type="email" value={form.owner_email} onChange={e => setForm({ ...form, owner_email: e.target.value })} required placeholder="correo@empresa.com" /></label>
            <label>Rubro<select value={form.vertical_id} onChange={e => setForm({ ...form, vertical_id: e.target.value })}>{data.verticals.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <label>Plan<select value={form.plan_id} onChange={e => setForm({ ...form, plan_id: e.target.value })}>{commercialPlans.map(x => <option key={x.id} value={x.id}>{x.name} · activación {money(x.activation_fee)} · {money(x.monthly_price)}/mes</option>)}</select></label>
            {selectedPlan && <div className="saas-payment-plan saas-create-plan-summary">
              <span>Activación</span><strong>{money(selectedPlan.activation_fee)}</strong>
              <span>Mensualidad</span><strong>{money(selectedPlan.monthly_price)}</strong>
              <span>Beneficios</span><strong>{planBenefits(selectedPlan).join(' · ') || 'Plan estándar'}</strong>
            </div>}
            <label>Días de prueba<input type="number" min="0" max="90" value={form.trial_days} onChange={e => setForm({ ...form, trial_days: Number(e.target.value) })} /></label>
            <label className="saas-demo-option"><input type="checkbox" checked={form.demo_mode} onChange={e => setForm({ ...form, demo_mode: e.target.checked })} /><span><strong>Crear como DEMO comercial</strong><small>Precarga datos ficticios, no genera cartera y mantiene DTE de producción protegido.</small></span></label>
            <button disabled={saving}>{saving ? 'Procesando…' : 'Crear membresía'}</button>
          </form>

          <section className="saas-master-card saas-master-list">
            <div className="saas-master-list-head">
              <div><small>CARTERA Y ACCESOS</small><h2>Empresas registradas</h2><p>Los cobros comerciales se separan de DEMOS y cuentas internas.</p></div>
              <input placeholder="Buscar empresa, correo, plan o rubro" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="saas-filter-bar">
              {filters.map(([value, text]) => <button key={value} type="button" className={statusFilter === value ? 'active' : ''} onClick={() => setStatusFilter(value)}>{text}</button>)}
              <span>{rows.length} resultado{rows.length === 1 ? '' : 's'}</span>
            </div>
            <div className="saas-master-table-wrap">
              <table>
                <thead><tr><th>Empresa</th><th>Plan</th><th>Activación</th><th>Estado</th><th>Vencimiento</th><th>Usuarios</th><th>Acciones</th></tr></thead>
                <tbody>{rows.map(row => <CompanyRow key={row.id} row={row} plans={commercialPlans} saving={saving} actionFor={actionFor} onUpdate={updateSubscription} onPayment={openPayment} onEnter={enterCompany} onSendAccess={sendAccess} />)}</tbody>
              </table>
            </div>
            {!rows.length && <p className="saas-master-empty">No hay empresas que coincidan con el filtro.</p>}
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

function CompanyRow({ row, plans, saving, actionFor, onUpdate, onPayment, onEnter, onSendAccess }) {
  const sub = row.subscription
  const plan = sub?.plan
  const type = typeFor(row)
  const isCommercial = type === 'commercial'
  const isDemo = type === 'demo'
  const isInternal = type === 'internal'
  const billingExempt = row.billing_exempt ?? !isCommercial
  const expiry = isInternal ? null : (isDemo ? (row.demo_expires_at || sub?.trial_ends_at) : (sub?.current_period_end || sub?.trial_ends_at))
  const remaining = daysUntil(expiry)
  const expiryLabel = isInternal
    ? 'Sin vencimiento comercial'
    : remaining === null
      ? 'Sin fecha'
      : remaining < 0
        ? `${Math.abs(remaining)} día${Math.abs(remaining) === 1 ? '' : 's'} vencida`
        : remaining === 0
          ? 'Vence hoy'
          : `${remaining} día${remaining === 1 ? '' : 's'}`
  const busy = saving || Boolean(actionFor)
  const activationPending = isCommercial && sub && !sub.activation_paid_at && Number(plan?.activation_fee || 0) > 0

  return <tr className={`saas-company-row type-${type}`}>
    <td className="saas-company-cell">
      <div className="saas-company-name"><strong>{row.name}</strong><span className={`saas-company-type type-${type}`}>{typeLabel(type)}</span></div>
      <small>{row.slug}</small>
      {row.owner_email && <small className="saas-owner-email">{row.owner_email}</small>}
    </td>
    <td>{isCommercial
      ? <select value={sub?.plan_id || ''} disabled={!sub || busy} onChange={e => onUpdate(row.id, { plan_id: e.target.value }, 'Plan actualizado.')}>{!sub && <option value="">Sin plan</option>}{plans.map(x => <option key={x.id} value={x.id}>{x.name} · {money(x.monthly_price)}/mes</option>)}</select>
      : <div className="saas-plan-static"><strong>{plan?.name || 'Sin plan'}</strong><span>{isDemo ? 'Plan de demostración · sin cobro' : 'Plan interno protegido'}</span></div>}
      <small>{billingExempt ? 'Fuera de MRR y cartera' : (plan ? `${money(plan.activation_fee)} activación · ${money(plan.monthly_price)}/mes` : '—')}</small>
      {!billingExempt && <small>{planBenefits(plan).join(' · ')}</small>}
    </td>
    <td>{billingExempt
      ? <><span className="saas-status-pill tone-muted">No aplica</span><small>{isDemo ? 'DEMO sin cobro' : 'Cuenta interna'}</small></>
      : sub?.activation_paid_at
        ? <><span className="saas-status-pill tone-good">Pagada</span><small>{money(sub.activation_paid_amount)} · {formatDate(sub.activation_paid_at)}</small></>
        : <><span className="saas-status-pill tone-warn">Pendiente</span><small>{money(plan?.activation_fee)}</small></>}
    </td>
    <td>{isInternal
      ? <><span className="saas-status-pill tone-muted">Interna</span><small>Protegida</small></>
      : <><span className={`saas-status-pill tone-${statusTone(sub?.status)}`}>{isDemo ? `DEMO · ${labels[sub?.status] || 'Sin suscripción'}` : (labels[sub?.status] || 'Sin suscripción')}</span><select className="saas-status-select" value={sub?.status || ''} disabled={!sub || busy} onChange={e => onUpdate(row.id, { status: e.target.value }, 'Estado actualizado.')}>{!sub && <option value="">Sin suscripción</option>}{statuses.map(x => <option key={x} value={x}>{labels[x]}</option>)}</select></>}
    </td>
    <td><strong>{isInternal ? 'Sin vencimiento' : formatDate(expiry)}</strong><small className={!isInternal && remaining !== null && remaining <= 7 ? 'expiry-alert' : ''}>{expiryLabel}</small></td>
    <td><span className="saas-user-count">{row.users}</span></td>
    <td><div className="saas-master-row-actions">
      <button type="button" className="primary" disabled={busy} onClick={() => onEnter(row)}>{actionFor === `${row.id}:enter` ? 'Entrando…' : 'Entrar'}</button>
      {isCommercial && <button type="button" disabled={!sub || busy} onClick={() => onPayment(row, 'monthly')}>Mensualidad</button>}
      {!isInternal && <button type="button" disabled={busy} title={row.owner_email ? `Enviar a ${row.owner_email}` : 'Enviar al propietario registrado'} onClick={() => onSendAccess(row)}>{actionFor === `${row.id}:access` ? 'Enviando…' : 'Enviar acceso'}</button>}
      {isCommercial && <details className="saas-row-more">
        <summary>Más opciones</summary>
        <div className="saas-row-more-actions">
          {activationPending && <button type="button" disabled={!sub || busy} onClick={() => onPayment(row, 'activation')}>Cobrar activación</button>}
          <button type="button" disabled={!sub || busy} onClick={() => onUpdate(row.id, { status: 'active', renew: true }, 'Membresía renovada por 30 días.')}>Renovar 30 días</button>
          {sub?.status !== 'suspended'
            ? <button type="button" className="danger" disabled={!sub || busy} onClick={() => onUpdate(row.id, { status: 'suspended' }, 'Membresía suspendida.')}>Suspender</button>
            : <button type="button" disabled={!sub || busy} onClick={() => onUpdate(row.id, { status: 'active' }, 'Membresía reactivada.')}>Reactivar</button>}
        </div>
      </details>}
    </div></td>
  </tr>
}